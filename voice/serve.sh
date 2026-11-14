#!/usr/bin/env bash
# Start the voice agent with a tunnel that Twilio can reach, in one command.
#
# Why a script: a cloudflared quick tunnel gets a brand-new hostname every time it starts, and
# the agent needs that hostname before it can build the <Gather> action URL. Doing it by hand in
# two tabs is how the hostname ends up stale, which looks exactly like a broken call.
#
# Usage:  ./voice/serve.sh
# Stop:   Ctrl+C (stops the agent and the tunnel together)
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
TUNNEL_LOG="${TMPDIR:-/tmp}/freezeline-tunnel.log"
AGENT_LOG="${VOICE_LOG:-/tmp/freezeline-agent.log}"

# Credentials: use the shell's if they are exported, otherwise read them from .env. A new tab has
# neither, and the first sign of that was a KeyError 500 halfway through placing a call.
if [ -f .env ] && command -v python3 >/dev/null 2>&1; then
  eval "$(python3 - <<'PY'
import shlex, sys
from pathlib import Path
want = {
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
    "VOICE_CALL_TIMEOUT", "VOICE_SHARED_SECRET", "VOICE_RESULT_URL",
    "WHISPER_MODEL", "OPENAI_API_KEY",
}
try:
    lines = Path(".env").read_text().splitlines()
except OSError:
    sys.exit(0)
for line in lines:
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    if key.startswith("export "):
        key = key[len("export "):].strip()
    if key in want:
        print(f"export {key}={shlex.quote(value.strip().strip(chr(34)).strip(chr(39)))}")
PY
)"
fi

for k in TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER; do
  [ -n "${!k:-}" ] || echo "Warning: $k is not set (no .env value either) - calls will fail." >&2
done

command -v cloudflared >/dev/null 2>&1 || {
  echo "cloudflared is not installed. Install it with:  brew install cloudflared" >&2
  exit 1
}

: >"$TUNNEL_LOG"
: >"$AGENT_LOG"

echo "Opening a tunnel to localhost:$PORT ..."
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

AGENT_PID=""
cleanup() {
  echo
  echo "Shutting down ..."
  [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# The hostname appears in cloudflared's output a second or two after it starts.
HOST=""
for _ in $(seq 1 60); do
  HOST="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$HOST" ] && break
  sleep 0.5
done

if [ -z "$HOST" ]; then
  echo "The tunnel did not come up. Its log:" >&2
  cat "$TUNNEL_LOG" >&2
  exit 1
fi

export PUBLIC_HOSTNAME="${HOST#https://}"
echo "Tunnel:  $HOST"
echo "Host:    $PUBLIC_HOSTNAME"
echo "Log:     $AGENT_LOG"
echo

# Find an interpreter that has the agent's dependencies. The venv does not need activating in
# this shell, and macOS ships python3 rather than python.
PY=""
for cand in ".venv/bin/python" "voice/.venv/bin/python" "$(command -v python3 || true)" "$(command -v python || true)"; do
  if [ -n "$cand" ] && [ -x "$cand" ]; then
    PY="$cand"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "No Python found. Create the environment first:" >&2
  echo "  python3 -m venv .venv && .venv/bin/pip install -r voice/requirements.txt" >&2
  exit 1
fi

echo "Python:  $PY"

# Keep the console for reading and the file for grepping: we hold python's own PID, so Ctrl+C
# stops the agent rather than leaving it running behind a dead pipe.
"$PY" voice/agent.py > >(tee "$AGENT_LOG") 2>&1 &
AGENT_PID=$!

# Wait until the app answers before telling anyone to call: a green light is not readiness.
READY=""
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://localhost:$PORT/health" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ -z "$READY" ]; then
  echo "The agent did not answer on port $PORT. Last lines of its log:" >&2
  tail -20 "$AGENT_LOG" >&2
  if grep -qi "ModuleNotFoundError\|No module named" "$AGENT_LOG"; then
    echo >&2
    echo "Its dependencies are missing from $PY. Install them with:" >&2
    echo "  $PY -m pip install -r voice/requirements.txt" >&2
  fi
  exit 1
fi

cat <<EOF

Ready. In another tab, start a call with your own number:

  curl -s -X POST localhost:$PORT/make-call -H 'content-type: application/json' \\
    -d '{"to":"+1XXXXXXXXXX","home":{"mode":"survey","engine":"gather","first_name":"Danish","street":"Harvard St","lang":"en"}}'

Press 1 when Twilio's trial message plays, then answer out loud.
Watch what it hears:   tail -f $AGENT_LOG
EOF

wait "$AGENT_PID"
