# Opens the public ngrok tunnel to the voice agent (port 8080) on the hostname in .env.local.
#   powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1
# Needs ngrok (ngrok.com/download; this looks on PATH, then in %LOCALAPPDATA%\ngrok) and, once,
# `ngrok config add-authtoken <token>`. PUBLIC_HOSTNAME is your ngrok domain without https://.
$root = Split-Path -Parent $PSScriptRoot
$hostname = (Select-String -Path (Join-Path $root ".env.local") -Pattern '^PUBLIC_HOSTNAME=(.+)$' -ErrorAction SilentlyContinue).Matches |
  Select-Object -First 1 | ForEach-Object { $_.Groups[1].Value.Trim() }
if (-not $hostname) { Write-Error "Set PUBLIC_HOSTNAME in .env.local (e.g. your-name.ngrok-free.dev)."; exit 1 }

$ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $ngrok) { $ngrok = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.exe" }
if (-not (Test-Path $ngrok)) { Write-Error "ngrok not found. Install it from ngrok.com/download."; exit 1 }

& $ngrok http 8080 --url "https://$hostname"
