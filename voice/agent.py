"""One FreezeLine call, self-hosted: Twilio Media Streams in, Silero for turn-taking,
local Whisper for hearing, Kokoro for speaking, and the pre-rendered lines from
voice/prerender.py played straight from disk.

There is no language model in this path. The call is a scripted form with seven
questions, so the "brain" is voice/script.py - which means no per-turn inference, no
token budget, and no way for a model to invent a crew arrival time.

Run:
  python voice/agent.py                 # FastAPI on :8080 (/twiml, /ws, /make-call)
  curl -X POST localhost:8080/make-call -H 'content-type: application/json' \\
       -d '{"to":"+15125550123","home":{"home_id":"heights-0001","lang":"en","level":"High","temp":19,"hours":6,"steps":["a","b","c"],"faucet":true}}'

Requires the model files (see voice/prerender.py) and TWILIO_* env vars. Not exercised in
the build that wrote it: it needs audio, model downloads and a real call, so treat the
first run as a test, not as verified behaviour.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import importlib
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import prerender  # noqa: E402  (same directory)
from script import Call, check as check_script  # noqa: E402

# FastAPI is optional at import time: --check and the script tooling must run on a machine
# with no web server installed. The import has to be at module level even so, because
# `from __future__ import annotations` makes the route annotations strings, and FastAPI
# resolves those against *module* globals. A function-local import is invisible to it, so
# `request: Request` degraded into a required query parameter and /twiml answered 422.
try:  # pragma: no cover - depends on the install
    from fastapi import Request, WebSocket
    from fastapi.responses import JSONResponse, Response
    from fastapi import FastAPI
    from uvicorn import run as uvicorn_run
    HAVE_WEB = True
except Exception:  # noqa: BLE001 - no fastapi means no web app, not a broken script
    Request = WebSocket = Any  # type: ignore[assignment,misc]
    HAVE_WEB = False


IDLE_SECONDS = float(os.environ.get("VOICE_IDLE_SECONDS", "12"))
SAMPLE_RATE = 24_000          # Kokoro's output; the transport resamples to 8 kHz for the phone
MAX_UTTERANCE_ATTEMPTS = 2


def _need(module_variants: list[tuple[str, str]]) -> Any:
    """Import the first available (module, attribute) pair.

    Pipecat moves things between releases; trying a few paths turns a version bump into a
    non-event instead of an ImportError at the worst moment.
    """
    import importlib

    errors: list[str] = []
    for module, name in module_variants:
        try:
            return getattr(importlib.import_module(module), name)
        except Exception as e:  # noqa: BLE001 - any import failure means "try the next path"
            errors.append(f"{module}.{name}: {e}")
    raise SystemExit(
        "cannot import the Pipecat pieces this agent needs. Install them with "
        "`pip install -r voice/requirements.txt`. Tried:\n  " + "\n  ".join(errors)
    )


# ---------- the conversation driver ----------

def make_driver(call: Call, on_done: Callable[[dict], None], speed: float):
    FrameProcessor = _need([("pipecat.processors.frame_processor", "FrameProcessor")])
    # The frame classes all live in this one module; import it rather than asking it for an
    # attribute called "frames" (which no release ever had).
    frames = importlib.import_module("pipecat.frames.frames")
    StartFrame, EndFrame = frames.StartFrame, frames.EndFrame
    TranscriptionFrame = frames.TranscriptionFrame
    OutputAudioRawFrame = frames.OutputAudioRawFrame
    TTSSpeakFrame = frames.TTSSpeakFrame
    # pipecat 1.x keeps this beside FrameProcessor; older releases had it in frames.frames.
    FrameDirection = _need([
        ("pipecat.processors.frame_processor", "FrameDirection"),
        ("pipecat.frames.frames", "FrameDirection"),
    ])

    class ScriptAgent(FrameProcessor):  # type: ignore[misc, valid-type]
        """Speaks the next line, waits for the caller, records the answer, repeats on "sorry?".

        Deterministic by construction: the only state is the Call object from script.py.
        """

        def __init__(self) -> None:
            super().__init__()
            self._inbox: asyncio.Queue[str] = asyncio.Queue()
            self._driver: asyncio.Task | None = None
            self._timed_out = False
            self._done = False

        async def process_frame(self, frame: Any, direction: Any) -> None:
            await super().process_frame(frame, direction)
            if isinstance(frame, StartFrame):
                await self.push_frame(frame, direction)
                self._driver = asyncio.create_task(self._run())
                return
            if isinstance(frame, EndFrame):
                await self.push_frame(frame, direction)
                return
            if isinstance(frame, TranscriptionFrame):
                # Consume it: nothing downstream needs the transcript, and letting it
                # through would make the TTS read the caller's words back to them.
                await self._inbox.put(frame.text)
                return
            await self.push_frame(frame, direction)

        async def say(self, text: str) -> None:
            """Play pre-rendered audio when we have it; otherwise let Kokoro speak it."""
            pcm = await asyncio.to_thread(prerender.pcm_for, text, call.lang, speed)
            if pcm:
                await self.push_frame(
                    OutputAudioRawFrame(audio=pcm, sample_rate=SAMPLE_RATE, num_channels=1),
                    FrameDirection.DOWNSTREAM,
                )
            else:
                # Keyword: on newer releases the frame's own positional fields start after the
                # base ones, so a bare `text` would land in `id`.
                await self.push_frame(TTSSpeakFrame(text=text), FrameDirection.DOWNSTREAM)

        async def _run(self) -> None:
            try:
                while True:
                    turn = call.current
                    if turn is None:
                        break
                    text = call.next_speech()
                    if text:
                        await self.say(text)
                    if turn.kind != "ask":
                        continue
                    try:
                        said = await asyncio.wait_for(self._inbox.get(), timeout=IDLE_SECONDS)
                    except asyncio.TimeoutError:
                        # Say nothing we cannot back up: end the call and let the server
                        # queue the retry ladder (call again, text, door check).
                        self._timed_out = True
                        break
                    outcome = call.hear(said)
                    if outcome == "repeat":
                        again = call.repeat_last()
                        if again:
                            await self.say(again)
                    # "unclear" needs no special handling: the loop re-speaks the same
                    # question because hear() did not advance the turn.
            finally:
                await self._finish()

        async def _finish(self) -> None:
            if self._done:
                return
            self._done = True
            result = call.result()
            result["timed_out"] = self._timed_out
            await asyncio.to_thread(on_done, result)
            await self.push_frame(EndFrame(), FrameDirection.DOWNSTREAM)

    return ScriptAgent


# ---------- pipeline ----------

def _language(lang: str) -> Any:
    """pipecat 1.x takes a Language enum; older releases took a code string."""
    try:
        Language = _need([("pipecat.transcriptions.language", "Language")])
    except SystemExit:
        return lang
    return getattr(Language, lang.upper(), lang)


def make_stt(lang: str):
    WhisperSTTService = _need([
        ("pipecat.services.whisper.stt", "WhisperSTTService"),
        ("pipecat.services.whisper", "WhisperSTTService"),
    ])
    kwargs: dict[str, Any] = dict(
        model=os.environ.get("WHISPER_MODEL", "large-v3-turbo"),
        device=os.environ.get("WHISPER_DEVICE", "auto"),
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        language=_language(lang),
    )
    try:
        return WhisperSTTService(**kwargs)
    except TypeError:
        # Older releases took a settings object or lacked compute_type.
        kwargs.pop("compute_type", None)
        kwargs.pop("device", None)
        return WhisperSTTService(**kwargs)


def make_tts(lang: str):
    KokoroTTSService = _need([
        ("pipecat.services.kokoro.tts", "KokoroTTSService"),
        ("pipecat.services.kokoro", "KokoroTTSService"),
    ])
    model = os.environ.get("KOKORO_MODEL") or str(HERE / "models" / "kokoro-v1.0.onnx")
    voices = os.environ.get("KOKORO_VOICES") or str(HERE / "models" / "voices-v1.0.bin")
    voice = prerender.VOICE.get(lang, "af_heart")
    attempts = (
        dict(model_path=model, voices_path=voices, voice_id=voice, sample_rate=SAMPLE_RATE),
        dict(model_path=model, voices_path=voices, voice=voice, sample_rate=SAMPLE_RATE),
        dict(voice=voice, sample_rate=SAMPLE_RATE),
    )
    last: Exception | None = None
    for kw in attempts:
        try:
            return KokoroTTSService(**kw)
        except TypeError as e:
            last = e
    raise SystemExit(f"cannot construct KokoroTTSService: {last}")


def build_pipeline(transport: Any, call: Call, speed: float, on_done: Callable[[dict], None]):
    Pipeline = _need([("pipecat.pipeline.pipeline", "Pipeline")])
    agent_cls = make_driver(call, on_done, speed)
    return Pipeline([
        transport.input(),
        make_stt(call.lang),
        agent_cls(),
        make_tts(call.lang),
        transport.output(),
    ])


def call_from_params(params: dict[str, Any]) -> Call:
    """Everything the script needs, from the TwiML <Parameter> the server put on the call."""
    steps = params.get("steps") or []
    steps = tuple((list(steps) + ["", "", ""])[:3])
    return Call(
        lang=params.get("lang", "en"),
        level=params.get("level", "High"),
        temp=int(params.get("temp", 19)),
        hours_below_20=int(params.get("hours", 0)),
        steps=steps,  # type: ignore[arg-type]
        has_outdoor_faucet=bool(params.get("faucet", True)),
        replied_text=bool(params.get("replied_text", False)),
        assigned_crew=params.get("crew") or None,
        hard_of_hearing=bool(params.get("hard_of_hearing", False)),
    )


# ---------- http ----------

def report(result: dict, home_id: str | None) -> None:
    """Hand the answers back to the Next.js app. Best-effort: a failed post must not
    keep the call open, so it is logged and dropped."""
    url = os.environ.get("VOICE_RESULT_URL")
    if not url:
        print("[agent] result (no VOICE_RESULT_URL set):", json.dumps(result, ensure_ascii=False), file=sys.stderr)
        return
    body = json.dumps({"home_id": home_id, **result}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("content-type", "application/json")
    secret = os.environ.get("VOICE_SHARED_SECRET")
    if secret:
        req.add_header("x-voice-secret", secret)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f"[agent] posted result: {r.status}", file=sys.stderr)
    except Exception as e:  # noqa: BLE001 - never break the call over reporting
        print(f"[agent] could not post result: {e}", file=sys.stderr)


def twiml(host: str, params: dict[str, Any]) -> str:
    """Inline TwiML: stream the call to us, and carry the home's facts as one parameter.

    The facts travel base64-encoded: JSON full of quotes would otherwise have to survive
    both XML attribute escaping and Twilio's own parameter handling, and one bad character
    would silently drop the call's context.
    """
    payload = base64.b64encode(json.dumps(params).encode("utf-8")).decode("ascii")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f'<Stream url="wss://{host}/ws"><Parameter name="home" value="{payload}"/></Stream>'
        "</Connect></Response>"
    )


def home_from_parameter(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(base64.b64decode(value).decode("utf-8"))
    except Exception:  # noqa: BLE001 - a malformed parameter must not kill the call
        return {}


def make_app():
    if not HAVE_WEB:
        raise SystemExit("fastapi and uvicorn are not installed. Run: pip install -r voice/requirements.txt")

    app = FastAPI(title="FreezeLine voice agent")
    store: dict[str, Any] = {}

    @app.get("/health")
    async def health() -> Any:
        return JSONResponse({
            "ok": True,
            "cached_lines": len(list((HERE / "audio" / "cache").glob("*.wav"))) if (HERE / "audio" / "cache").is_dir() else 0,
            "idle_seconds": IDLE_SECONDS,
        })

    @app.post("/twiml")
    async def twiml_route(request: Request) -> Any:
        """Twilio asks what to do with an answered call. The home's facts arrive in the query
        string because Twilio does not forward arbitrary form fields to this URL."""
        raw = await request.body()
        form: dict[str, str] = {}
        if raw:
            try:
                form = {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode("utf-8", "replace")).items()}
            except Exception:  # noqa: BLE001 - a body we cannot read is the same as no body
                form = {}
        host = os.environ.get("PUBLIC_HOSTNAME") or request.headers.get("host", "")
        encoded = request.query_params.get("home") or form.get("home")
        return Response(twiml(host, home_from_parameter(encoded)), media_type="application/xml")

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        await websocket.accept()
        stream_sid = call_sid = None
        home: dict[str, Any] = {}
        # Twilio sends "connected", then "start" with the stream and our custom parameters.
        for _ in range(4):
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            if msg.get("event") == "start":
                start = msg["start"]
                stream_sid = start["streamSid"]
                call_sid = start.get("callSid")
                params = start.get("customParameters") or {}
                home = home_from_parameter(params.get("home")) if "home" in params else dict(params)
                break
            if msg.get("event") == "stop":
                await websocket.close()
                return
        if not stream_sid:
            await websocket.close()
            return

        FastAPIWebsocketTransport = _need([("pipecat.transports.websocket.fastapi", "FastAPIWebsocketTransport")])
        FastAPIWebsocketParams = _need([("pipecat.transports.websocket.fastapi", "FastAPIWebsocketParams")])
        TwilioFrameSerializer = _need([("pipecat.serializers.twilio", "TwilioFrameSerializer")])

        serializer = TwilioFrameSerializer(
            stream_sid=stream_sid,
            call_sid=call_sid,
            account_sid=os.environ.get("TWILIO_ACCOUNT_SID", ""),
            auth_token=os.environ.get("TWILIO_AUTH_TOKEN", ""),
        )
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                add_wav_header=False,
                audio_in_sample_rate=8000,
                audio_out_sample_rate=8000,
                serializer=serializer,
            ),
        )

        call = call_from_params(home)
        speed = call.speech_speed()
        pipeline = build_pipeline(transport, call, speed, lambda r: report(r, home.get("home_id")))

        PipelineTask = _need([("pipecat.pipeline.task", "PipelineTask")])
        PipelineRunner = _need([("pipecat.pipeline.runner", "PipelineRunner")])
        PipelineParams = _need([("pipecat.pipeline.task", "PipelineParams")])
        task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
        store[stream_sid] = task
        try:
            await PipelineRunner().run(task)
        finally:
            store.pop(stream_sid, None)

    @app.api_route("/test-twiml", methods=["GET", "POST"])
    async def test_twiml() -> Any:
        """Plain TwiML, no media stream.

        Answers one question: does an API-placed call reach the phone at all? If this speaks
        and the /twiml stream route stays silent, the carrier is fine and only the WebSocket
        leg needs work.
        """
        return Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response>'
            '<Say voice="alice">FreezeLine test. If you can hear this, the call reaches your '
            'phone and only the audio stream needs work.</Say></Response>',
            media_type="application/xml",
        )

    @app.post("/make-call")
    async def make_call(request: Request) -> Any:
        """Place the call with Twilio's REST API - no twilio package, no extra dependency."""
        body = await request.json()
        secret = os.environ.get("VOICE_SHARED_SECRET")
        if secret and request.headers.get("x-voice-secret") != secret:
            return JSONResponse({"error": "forbidden"}, status_code=403)
        to = body.get("to")
        if not to:
            return JSONResponse({"error": "to is required (E.164)"}, status_code=400)
        host = os.environ.get("PUBLIC_HOSTNAME", "")
        sid = os.environ["TWILIO_ACCOUNT_SID"]
        form = {
            "To": to,
            "From": os.environ["TWILIO_PHONE_NUMBER"],
            # The home's facts ride in the query string; Twilio echoes the URL back to us.
            "Url": f"https://{host}/twiml?home={base64.b64encode(json.dumps(body.get('home') or {}).encode()).decode()}",
            "Timeout": "25",
        }
        # Answering-machine detection is off by default: it misfires on a real person saying
        # "hello" and hangs up, which is the worst possible first test. Turn it on with
        # VOICE_AMD=1 once you trust the audio path and are calling homes at scale.
        if os.environ.get("VOICE_AMD") == "1":
            form["MachineDetection"] = "Enable"
        data = urllib.parse.urlencode(form).encode()
        req = urllib.request.Request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json", data=data, method="POST")
        req.add_header("content-type", "application/x-www-form-urlencoded")
        token = base64.b64encode(f"{sid}:{os.environ['TWILIO_AUTH_TOKEN']}".encode()).decode()
        req.add_header("authorization", f"Basic {token}")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                created = json.loads(r.read().decode())
        except Exception as e:  # noqa: BLE001 - surface Twilio's message to the caller
            # urllib collapses Twilio's 400 into a bare "Bad Request". The JSON body names the
            # parameter that was wrong (21606: From is not a number on this account,
            # 21219: To is not a verified number on a trial), so read it before answering.
            detail = ""
            reader = getattr(e, "read", None)
            if callable(reader):
                try:
                    detail = reader().decode("utf-8", "replace")
                except Exception:  # noqa: BLE001
                    detail = ""
            payload: dict[str, Any] = {"error": str(e)}
            if detail:
                try:
                    twilio_body = json.loads(detail)
                    payload["twilio_code"] = twilio_body.get("code")
                    payload["twilio_message"] = twilio_body.get("message")
                except Exception:  # noqa: BLE001
                    payload["twilio"] = detail[:400]
            return JSONResponse(payload, status_code=502)
        return JSONResponse({"sid": created.get("sid"), "status": created.get("status")})

    return app


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FreezeLine self-hosted voice agent.")
    ap.add_argument("--check", action="store_true", help="verify the script and the audio cache, then exit")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    a = ap.parse_args(argv)

    if a.check:
        rc = check_script()
        prerender.stats()
        return rc

    if not HAVE_WEB:
        raise SystemExit("fastapi and uvicorn are not installed. Run: pip install -r voice/requirements.txt")
    uvicorn_run(make_app(), host=a.host, port=a.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
