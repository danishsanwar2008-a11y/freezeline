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
import queue
import sys
import threading
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


def call_from_params(params: dict[str, Any]) -> Any:
    """Everything the script needs, from the TwiML <Parameter> the server put on the call."""
    if str(params.get("mode") or "").lower() == "survey":
        # The pre-survey call (the research doc's 7 questions): questions first, then the
        # home's priority from its answers and the forecast (`temp`, F), then the text.
        from survey import Survey

        temp = params.get("temp")
        call_id = str(params.get("call_id") or "")
        return Survey(
            lang=params.get("lang", "en"),
            first_name=str(params.get("first_name") or ""),
            street=str(params.get("street") or ""),
            text_sent=bool(params.get("text_sent", False)),
            temp=float(temp) if isinstance(temp, (int, float)) else None,
            emergency_name=str(params.get("emergency_name") or ""),
            # Only a call the web app placed can get a crew: it is the app that assigns one.
            assign_crew=(lambda reasons: ask_app_for_crew(call_id, reasons)) if call_id else None,
        )
    if str(params.get("mode") or "").lower() == "contact":
        # The household's emergency contact, called right after a pre-survey call that needs help.
        from contact import ContactCall

        return ContactCall(
            lang=params.get("lang", "en"),
            contact_name=str(params.get("contact_name") or ""),
            homeowner=str(params.get("homeowner") or ""),
            reasons=list(params.get("reasons") or []),
        )
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
        # From the sign-up row: "Hi Maria, ... about Harvard St". Empty when unknown, and the
        # script falls back to the unnamed greeting rather than speaking a blank.
        first_name=str(params.get("first_name") or ""),
        street=str(params.get("street") or ""),
        # Set by the Next route once the checklist SMS is accepted; the agent never claims a
        # text it did not send.
        text_sent=bool(params.get("text_sent", False)),
    )


# ---------- http ----------

def answered_fields(call: Any) -> list[str]:
    """Which answer fields the household actually answered (the rest are defaults, not answers)."""
    answers = getattr(call, "answers", None)
    if hasattr(answers, "answered"):
        return list(answers.answered)
    if isinstance(answers, dict):
        return list(answers.keys())
    return []


def report(
    result: dict,
    home_id: str | None,
    call_id: str | None = None,
    call_sid: str | None = None,
    final: bool = True,
    answered: list[str] | None = None,
) -> None:
    """Hand the answers back to the Next.js app (/api/voice/result, saved in Supabase voice_calls).
    Best-effort: a failed post must not keep the call open, so it is logged and dropped.
    Calls placed by the web app carry `call_id` (our row); the app ignores reports without one."""
    url = os.environ.get("VOICE_RESULT_URL")
    if not url:
        print("[agent] result (no VOICE_RESULT_URL set):", json.dumps(result, ensure_ascii=False), file=sys.stderr)
        return
    payload: dict[str, Any] = {"home_id": home_id, **result, "final": final}
    if call_id:
        payload["call_id"] = call_id
    if call_sid:
        payload["call_sid"] = call_sid
    if answered is not None:
        payload["answered"] = answered
    body = json.dumps(payload).encode("utf-8")
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


def app_url(path: str) -> str | None:
    """Another route on the web app that VOICE_RESULT_URL points at (same host, same secret)."""
    url = os.environ.get("VOICE_RESULT_URL") or ""
    return url.replace("/api/voice/result", path) if "/api/voice/result" in url else None


def post_app(path: str, payload: dict[str, Any], timeout: float = 8) -> dict[str, Any] | None:
    url = app_url(path)
    if not url:
        return None
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("content-type", "application/json")
    if os.environ.get("VOICE_SHARED_SECRET"):
        req.add_header("x-voice-secret", os.environ["VOICE_SHARED_SECRET"])
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except Exception as e:  # noqa: BLE001 - the caller decides what "no answer" means
        print(f"[agent] {path} failed: {e}", file=sys.stderr, flush=True)
        return None


def ask_app_for_crew(call_id: str, reasons: list[str] | None = None) -> str | None:
    """Ask the web app to assign the nearest free crew in the home's area, mid-call. Returns the
    crew's name only when one was really assigned; the call then says it is on the way."""
    reply = post_app("/api/voice/crew", {"call_id": call_id, "reasons": reasons or []})
    crew = (reply or {}).get("crew")
    print(f"[agent] crew for {call_id}: {crew or 'none free (requested)'}", flush=True)
    return crew if isinstance(crew, str) and crew else None


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
        f'<Stream name="freezeline" url="wss://{host}/ws">'
        f'<Parameter name="home" value="{payload}"/></Stream>'
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

    @app.on_event("startup")
    async def check_tunnel() -> None:
        """Say whether Twilio can reach this process, before a call is wasted proving it.

        A cloudflared quick tunnel gets a new hostname every time it restarts, so the commonest
        broken state is an agent still advertising the last one: the phone rings, then Twilio
        hangs up because the URL it was handed answers nothing.
        """
        host = os.environ.get("PUBLIC_HOSTNAME", "")
        if not host:
            print("[agent] PUBLIC_HOSTNAME is not set - Twilio has no URL to call back to.", file=sys.stderr, flush=True)
            return
        url = f"https://{host}/health"

        def probe() -> None:
            # Wait until uvicorn is actually serving. Probing inside the startup event asks
            # cloudflared to reach a port that is not open yet, and reports a false 502 on a
            # perfectly healthy tunnel.
            import threading  # noqa: F401 - imported here so the module needs nothing new
            import time

            time.sleep(4)
            try:
                with urllib.request.urlopen(url, timeout=8) as r:
                    print(f"[agent] tunnel reachable: {url} -> {r.status}", flush=True)
            except Exception as e:  # noqa: BLE001 - a warning, not a reason to stop
                print(
                    f"[agent] TUNNEL NOT REACHABLE: {url} -> {e}\n"
                    f"[agent] Calls will ring and then hang up before reaching us. Restart\n"
                    f"[agent] cloudflared, copy the new hostname into PUBLIC_HOSTNAME, restart.",
                    file=sys.stderr,
                    flush=True,
                )

        import threading

        threading.Thread(target=probe, daemon=True).start()

    @app.get("/health")
    async def health() -> Any:
        return JSONResponse({
            "ok": True,
            "cached_lines": len(list((HERE / "audio" / "cache").glob("*.wav"))) if (HERE / "audio" / "cache").is_dir() else 0,
            "idle_seconds": IDLE_SECONDS,
        })

    # ---------- turn-by-turn calls (works on a trial account) ----------
    #
    # Trial accounts strip <Stream> from TwiML, so a media-stream call can only ever say
    # "not available on trial accounts" and hang up. <Say> and <Gather> are allowed, so this
    # path does the conversation in turns: Twilio speaks the line and transcribes the answer,
    # and the same script decides what comes next. It needs no WebSocket at all.

    sessions: dict[str, Any] = {}
    homes: dict[str, dict[str, Any]] = {}   # CallSid -> the household payload (carries our call_id)

    # Reports go out from one background thread, in the order they were made (Twilio waits on our
    # replies, so posting can't happen inline; separate threads per report could arrive out of order).
    report_queue: queue.Queue[tuple[Any, ...]] = queue.Queue()

    def _report_worker() -> None:
        while True:
            args = report_queue.get()
            try:
                report(*args)
            finally:
                report_queue.task_done()

    threading.Thread(target=_report_worker, daemon=True).start()

    # Words these five questions expect. Twilio's recognizer leans on them in a noisy room,
    # which is the difference between "insulated" and "installed" on a phone line.
    HINTS = (
        "yes, no, yeah, nope, correct, speaking, garage, basement, crawlspace, slab, concrete, "
        "interior, walls, heated, attic, insulated, mostly, wrapped, none, shutoff, valve, "
        "turn, reach, frozen, burst, away, home, traveling, work, alone, neighbor, "
        "PEX, PVC, CPVC, copper, plastic, flexible, years, years old, built"
    )

    def _xml(inner: str) -> Any:
        return Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + "</Response>",
            media_type="application/xml",
        )

    def _voice_for(lang: str) -> str:
        return "Polly.Lupe" if lang == "es" else "Polly.Joanna"

    def _say_xml(text: str, lang: str) -> str:
        from xml.sax.saxutils import escape

        return f'<Say voice="{_voice_for(lang)}">{escape(text)}</Say>'

    def _host(request: Request) -> str:
        return os.environ.get("PUBLIC_HOSTNAME") or request.headers.get("host", "")

    def _gather_xml(call: Any, host: str) -> Any:
        """Everything to say, then the next question with an open microphone."""
        lang = getattr(call, "lang", "en")
        spoken: list[str] = []
        while (turn := call.current) is not None:
            if turn.kind == "say":
                spoken.append(call.next_speech() or "")
                continue
            question = call.next_speech() or ""
            inner = "".join(_say_xml(s, lang) for s in spoken)
            inner += (
                f'<Gather input="speech" language="{"es-US" if lang == "es" else "en-US"}"'
                # 4 seconds of silence before it decides they are done: "auto" hangs up on
                # a thinking pause mid-sentence, which is what cut the household off.
                f' speechTimeout="4" timeout="10" enhanced="true" hints="{HINTS}"'
                f' method="POST" action="https://{host}/voice/step">'
                + _say_xml(question, lang)
                + "</Gather>"
                # Nothing heard at all: end the call rather than leave the line open.
                + "<Hangup/>"
            )
            return _xml(inner)
        return _xml("".join(_say_xml(s, lang) for s in spoken) + "<Hangup/>")

    async def _form(request: Request) -> dict[str, str]:
        raw = await request.body()
        if not raw:
            return {}
        try:
            return {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode("utf-8", "replace")).items()}
        except Exception:  # noqa: BLE001 - an unreadable body is the same as no body
            return {}

    @app.api_route("/voice/start", methods=["GET", "POST"])
    async def voice_start(request: Request) -> Any:
        form = await _form(request)
        sid = form.get("CallSid") or request.query_params.get("CallSid") or ""
        home = home_from_parameter(request.query_params.get("home"))
        sessions[sid] = call_from_params(home)
        homes[sid] = home
        print(f"[agent] gather call started mode={home.get('mode') or 'storm'}", flush=True)
        return _gather_xml(sessions[sid], _host(request))

    def _report_turn(sid: str, call: Any, final: bool) -> None:
        """After every answer: post what was heard so far, so a hang-up still keeps it. In a
        thread, because Twilio waits on this response (and gives up after a few seconds)."""
        home = homes.get(sid) or {}
        if not home.get("call_id"):
            return  # not placed by the web app: nothing to save it against
        # One sender, first in first out, so the app receives a call's reports in order.
        report_queue.put((call.result(), home.get("home_id"), home.get("call_id"), sid, final, answered_fields(call)))

    @app.api_route("/voice/step", methods=["GET", "POST"])
    async def voice_step(request: Request) -> Any:
        form = await _form(request)
        sid = form.get("CallSid") or ""
        call = sessions.get(sid)
        if call is None:
            return _xml('<Say>Sorry, this call lost its place. Goodbye.</Say><Hangup/>')
        said = (form.get("SpeechResult") or "").strip()
        print(f"[agent] heard: {said!r}", flush=True)
        if said:
            outcome = call.hear(said)
            print(f"[agent] -> {outcome}", flush=True)
        # Build the reply first: it speaks every remaining line (the closing included) and hangs up
        # once the script has nothing left to ask. Only then is the call known to be finished, and
        # Twilio won't come back after <Hangup/>, so the final report goes out with this reply.
        reply = _gather_xml(call, _host(request))
        finished = call.current is None
        if said or finished:
            _report_turn(sid, call, finished)
        if finished:
            print(f"[agent] call finished: {json.dumps(call.result(), ensure_ascii=False)[:400]}", flush=True)
            sessions.pop(sid, None)
            homes.pop(sid, None)
        return reply

    @app.api_route("/voice/status", methods=["POST"])
    async def voice_status(request: Request) -> Any:
        """Twilio's "call ended" notice for an emergency-contact call (StatusCallback). Passed on to
        the web app, which decides: they said they'd help, or a crew goes instead (no answer, busy,
        a no, a hang-up). Waits for this call's reports to be posted first, so the app sees the
        final answer before the outcome."""
        form = await _form(request)
        call_id = request.query_params.get("call_id") or ""
        status = form.get("CallStatus") or ""
        print(f"[agent] contact call {call_id} ended: {status}", flush=True)
        if call_id:
            def forward() -> None:
                report_queue.join()
                post_app("/api/voice/status", {"call_id": call_id, "call_status": status}, timeout=20)

            threading.Thread(target=forward, daemon=True).start()
        return Response("", status_code=204)

    @app.post("/twiml")
    async def twiml_route(request: Request) -> Any:
        # The first evidence that Twilio reached us at all. If a call never prints this line,
        # the call died before our code - the tunnel, or the trial keypress.
        print(f"[agent] POST /twiml (home={'yes' if request.query_params.get('home') else 'no'})", flush=True)
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
        # Cloudflared stalls the upgrade for clients that do not send Accept-Encoding (Twilio's
        # media-stream client does not), and the call dies with no traffic on our side at all.
        # Cloudflare's issue #1465 documents the fix: turn compression off for this response.
        try:
            await websocket.accept(headers=[(b"content-encoding", b"identity")])
        except TypeError:  # older starlette without accept(headers=...)
            await websocket.accept()
        print("[agent] audio stream connected", flush=True)
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
        print(f"[agent] call mode={home.get('mode') or 'storm'} first_name={home.get('first_name') or '-'} lang={home.get('lang') or '-'}", flush=True)
        speed = call.speech_speed()
        pipeline = build_pipeline(
            transport, call, speed,
            lambda r: report(r, home.get("home_id"), home.get("call_id"), call_sid, True, answered_fields(call)),
        )

        PipelineTask = _need([("pipecat.pipeline.task", "PipelineTask")])
        PipelineRunner = _need([("pipecat.pipeline.runner", "PipelineRunner")])
        PipelineParams = _need([("pipecat.pipeline.task", "PipelineParams")])
        task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
        store[stream_sid] = task
        try:
            await PipelineRunner().run(task)
        except Exception:  # noqa: BLE001 - the traceback is the only clue why a call drops
            import traceback

            traceback.print_exc()
            raise
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
        # Say which credential is missing instead of dying on a KeyError and returning a 500
        # with a stack trace: the caller sees "Internal Server Error" and learns nothing.
        required = ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER")
        missing = [k for k in required if not os.environ.get(k)]
        if missing:
            return JSONResponse(
                {
                    "error": f"Missing {', '.join(missing)}.",
                    "fix": "Put them in .env (the repo root) or export them before starting the agent.",
                },
                status_code=503,
            )
        if not host:
            return JSONResponse(
                {"error": "PUBLIC_HOSTNAME is not set, so Twilio has no URL to call back to.",
                 "fix": "Run ./voice/serve.sh, which sets it from the tunnel it starts."},
                status_code=503,
            )
        sid = os.environ["TWILIO_ACCOUNT_SID"]
        form = {
            "To": to,
            "From": os.environ["TWILIO_PHONE_NUMBER"],
            # The home's facts ride in the query string; Twilio echoes the URL back to us.
            # The payload is URL-encoded: base64 contains +, / and =, and a bare + in a query
            # string decodes to a space, which corrupts the JSON before we ever read it.
            # engine "gather" rides the turn-by-turn path, which a trial account allows.
            "Url": (
                f"https://{host}/{'voice/start' if str((body.get('home') or {}).get('engine')) == 'gather' else 'twiml'}"
                f"?home={urllib.parse.quote(base64.b64encode(json.dumps(body.get('home') or {}).encode()).decode(), safe='')}"
            ),
        }
        # Twilio trial accounts only accept To and the TwiML Url: any other parameter is refused
        # with "trial accounts have limited parameter access", which reads like our bug but is
        # their gate. A full account can raise this, and the default is 60s anyway.
        if os.environ.get("VOICE_CALL_TIMEOUT"):
            form["Timeout"] = os.environ["VOICE_CALL_TIMEOUT"]
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
            # Name the parameters we sent, so a rejection points at the culprit instead of
            # needing another round trip. Values stay out: one of them is a phone number.
            payload: dict[str, Any] = {"error": str(e), "sent_parameters": sorted(form)}
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
