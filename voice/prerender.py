"""Pre-renders FreezeLine's call lines to audio, so the agent speaks from disk.

Why: the caller's words are already written in data/messages.json, so most of what the
agent says never changes. Kokoro turns those lines into 24 kHz WAVs once, at build time,
and the agent then plays a file instead of waiting on text-to-speech. Lines that carry a
number ("19F, 6 hours", a crew name) are rendered on first use and cached, so even those
are fast from the second home onward.

Voice and speed matter here: a hard-of-hearing caller gets the same lines slightly slower.

Usage:
  python voice/prerender.py --list     # what is fixed vs templated (no model needed)
  python voice/prerender.py --build    # render the fixed lines (needs the Kokoro files)
  python voice/prerender.py --stats    # what is already on disk

The Kokoro files are not committed: kokoro-v1.0.onnx and voices-v1.0.bin, either in
voice/models/ or wherever KOKORO_MODEL / KOKORO_VOICES point.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
AUDIO = HERE / "audio"
MODELS = HERE / "models"

LANGS = ("en", "es")
LANG_WORD = {"en": "English", "es": "Spanish"}

# Kokoro voice per language. `--voice` overrides; if a name is missing from the voices
# file we fall back to the first voice whose language prefix matches, so a newer voice
# pack does not break the build.
VOICE = {"en": "af_heart", "es": "ef_dora"}
SPEED = 1.0

SLOT = re.compile(r"\{(\w+)\}")


def messages() -> dict:
    return json.loads((ROOT / "data" / "messages.json").read_text(encoding="utf-8"))


def call_lines() -> dict[str, dict[str, str]]:
    return messages()["call"]


def fill(template: str, params: dict[str, object] | None = None) -> str:
    """Same contract as fill() in src/lib/pregenerated.ts: unknown slots stay visible."""
    params = params or {}
    return SLOT.sub(lambda m: str(params[m.group(1)]) if m.group(1) in params else m.group(0), template)


def placeholders(template: str) -> list[str]:
    return sorted(set(SLOT.findall(template)))


def cache_key(text: str, lang: str, speed: float) -> str:
    return hashlib.sha1(f"{lang}|{speed}|{text}".encode("utf-8")).hexdigest()[:16]


def cache_path(text: str, lang: str, speed: float) -> Path:
    return AUDIO / "cache" / f"{cache_key(text, lang, speed)}.wav"


_kokoro = None
_voice_cache: dict[str, str] = {}
_unavailable: str | None = None   # set once, so a build prints one reason instead of 68


def model_file(name: str, env: str) -> Path | None:
    p = Path(os.environ.get(env, "")) if os.environ.get(env) else MODELS / name
    return p if p.is_file() else None


def voices_file() -> Path | None:
    return model_file("voices-v1.0.bin", "KOKORO_VOICES")


def load_kokoro():
    """Lazy, so --list works on a machine that has never downloaded a model."""
    global _kokoro
    if _kokoro is not None:
        return _kokoro
    try:
        from kokoro_onnx import Kokoro  # type: ignore
    except ImportError as e:  # pragma: no cover - depends on the machine
        raise SystemExit("kokoro-onnx is not installed. Run: pip install -r voice/requirements.txt") from e
    model = model_file("kokoro-v1.0.onnx", "KOKORO_MODEL")
    voices = voices_file()
    if not model or not voices:
        raise SystemExit(
            "Kokoro model files are missing. Put kokoro-v1.0.onnx and voices-v1.0.bin in voice/models/, "
            "or set KOKORO_MODEL and KOKORO_VOICES."
        )
    _kokoro = Kokoro(str(model), str(voices))
    return _kokoro


def voice_for(lang: str) -> str:
    """Prefer the configured voice; otherwise the first one that speaks this language."""
    if lang in _voice_cache:
        return _voice_cache[lang]
    kokoro = load_kokoro()
    wanted = VOICE.get(lang, "af_heart")
    try:
        available = list(kokoro.get_voices())
    except Exception:  # pragma: no cover - older kokoro-onnx
        available = []
    if not available or wanted in available:
        _voice_cache[lang] = wanted
        return wanted
    prefix = {"en": "a", "es": "e"}.get(lang, "a")
    fallback = next((v for v in available if v.startswith(prefix)), wanted)
    print(f"[prerender] voice {wanted!r} not found for {lang}; using {fallback!r}", file=sys.stderr)
    _voice_cache[lang] = fallback
    return fallback


def synthesize(text: str, lang: str, speed: float = SPEED) -> tuple[bytes, int]:
    """Return little-endian int16 mono PCM and its sample rate."""
    kokoro = load_kokoro()
    samples, rate = kokoro.create(text, voice=voice_for(lang), speed=speed, lang=lang)
    pcm = b"".join(
        struct.pack("<h", max(-32768, min(32767, int(round(float(s) * 32767.0))))) for s in samples
    )
    return pcm, int(rate)


def write_wav(path: Path, pcm: bytes, rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def read_pcm(path: Path) -> bytes:
    with wave.open(str(path), "rb") as w:
        return w.readframes(w.getnframes())


def pcm_for(text: str, lang: str, speed: float = SPEED) -> bytes | None:
    """PCM for one line, from cache when possible. None means "no audio available".

    Callers treat None as "synthesize at runtime through the TTS service" - the agent
    still speaks, it just pays the latency.
    """
    global _unavailable
    path = cache_path(text, lang, speed)
    if path.is_file():
        return read_pcm(path)
    if _unavailable:
        return None
    try:
        pcm, rate = synthesize(text, lang, speed)
    except (SystemExit, Exception) as e:  # missing model, bad voice, OOM on a small box
        _unavailable = str(e)
        print(f"[prerender] cannot synthesize ({e}); falling back to live TTS", file=sys.stderr)
        return None
    write_wav(path, pcm, rate)
    return pcm


def line_pcm(key_or_text: str, lang: str, params: dict[str, object] | None = None, speed: float = SPEED) -> bytes | None:
    """PCM for a data/messages.json call key (or literal text), filled and cached."""
    text = call_lines().get(key_or_text, {}).get(lang)
    if text is not None:
        text = fill(text, params)
    else:
        text = key_or_text
    return pcm_for(text, lang, speed)


def static_lines() -> list[tuple[str, str, str]]:
    """(key, lang, text) for every call line with no slots - these belong in the build."""
    out = []
    for key, by_lang in call_lines().items():
        for lang in LANGS:
            text = by_lang.get(lang)
            if text and not placeholders(text):
                out.append((key, lang, text))
    return out


def templated_lines() -> list[tuple[str, list[str]]]:
    out = []
    for key, by_lang in call_lines().items():
        ph = placeholders(by_lang.get("en", ""))
        if ph:
            out.append((key, ph))
    return out


def build(force: bool = False, speed: float = SPEED) -> int:
    try:
        load_kokoro()
    except SystemExit as e:
        print(f"cannot build: {e}", file=sys.stderr)
        return 2
    lines = static_lines()
    AUDIO.mkdir(parents=True, exist_ok=True)
    rendered = skipped = failed = 0
    manifest: dict[str, dict[str, dict[str, object]]] = {}
    for key, lang, text in lines:
        path = cache_path(text, lang, speed)
        if path.is_file() and not force:
            skipped += 1
        else:
            pcm = pcm_for(text, lang, speed)
            if pcm is None:
                failed += 1
                continue
            rendered += 1
        with wave.open(str(path), "rb") as w:
            seconds = w.getnframes() / float(w.getframerate() or 1)
        manifest.setdefault(lang, {})[key] = {
            "file": str(path.relative_to(HERE)),
            "chars": len(text),
            "seconds": round(seconds, 2),
        }
    (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    total = sum(v["seconds"] for lang in manifest.values() for v in lang.values())
    print(f"static lines: {len(lines)}  rendered: {rendered}  already cached: {skipped}  failed: {failed}")
    print(f"audio: {total:.1f}s across {len(manifest)} languages -> {AUDIO / 'manifest.json'}")
    return 0 if failed == 0 else 1


def stats() -> int:
    cache = AUDIO / "cache"
    files = sorted(cache.glob("*.wav")) if cache.is_dir() else []
    if not files:
        print("nothing rendered yet - run: python voice/prerender.py --build")
        return 0
    seconds = 0.0
    for f in files:
        with wave.open(str(f), "rb") as w:
            seconds += w.getnframes() / float(w.getframerate() or 1)
    size = sum(f.stat().st_size for f in files)
    print(f"{len(files)} cached lines, {seconds:.1f}s of audio, {size / 1e6:.1f} MB")
    return 0


def show() -> int:
    static = static_lines()
    templated = templated_lines()
    print(f"data/messages.json -> call: {len(call_lines())} keys, {len(LANGS)} languages\n")
    print(f"FIXED ({len(static)}) - rendered once at build time:")
    for key, lang, text in static:
        print(f"  [{lang}] {key:22s} {text[:64]}{'...' if len(text) > 64 else ''}")
    print(f"\nTEMPLATED ({len(templated)}) - rendered on first use, then cached:")
    for key, ph in templated:
        print(f"  {key:22s} {{{', '.join(ph)}}}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Pre-render FreezeLine's fixed call lines.")
    ap.add_argument("--list", action="store_true", help="show fixed vs templated lines (no model needed)")
    ap.add_argument("--build", action="store_true", help="render the fixed lines")
    ap.add_argument("--force", action="store_true", help="re-render lines that are already cached")
    ap.add_argument("--stats", action="store_true", help="report what is on disk")
    ap.add_argument("--lang", choices=LANGS, help="only this language")
    ap.add_argument("--voice", help="override the Kokoro voice for --lang")
    ap.add_argument("--speed", type=float, default=SPEED, help="0.7-1.2 (0.9 for hard-of-hearing callers)")
    a = ap.parse_args(argv)

    if a.voice and a.lang:
        VOICE[a.lang] = a.voice

    if a.list:
        return show()
    if a.stats:
        return stats()
    if a.build:
        return build(force=a.force, speed=a.speed)
    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
