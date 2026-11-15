# Opens the public ngrok tunnel on the hostname in .env.local.
#   powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1             # to the Python voice agent (port 8080, Twilio path)
#   powershell -ExecutionPolicy Bypass -File voice\tunnel.ps1 -Port 3000  # to the web app (CALL_VIA=photon: ElevenLabs posts the answers there)
# Needs ngrok (ngrok.com/download) and, once, `ngrok config add-authtoken <token>`. PUBLIC_HOSTNAME is
# your ngrok domain without https://.
param([int]$Port = 8080)

$root = Split-Path -Parent $PSScriptRoot
$hostname = (Select-String -Path (Join-Path $root ".env.local") -Pattern '^PUBLIC_HOSTNAME=(.+)$' -ErrorAction SilentlyContinue).Matches |
  Select-Object -First 1 | ForEach-Object { $_.Groups[1].Value.Trim() }
if (-not $hostname) { Write-Error "Set PUBLIC_HOSTNAME in .env.local (e.g. your-name.ngrok-free.dev)."; exit 1 }

# A regular install first (winget, or the zip in %LOCALAPPDATA%\ngrok), then whatever is on PATH. The
# Microsoft Store copy runs in a sandbox with its own settings, so it never sees a token saved by
# another copy; it is used only when nothing else is installed.
$ngrok = $null
$winget = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages") -Recurse -Filter ngrok.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($winget) { $ngrok = $winget.FullName }
if (-not $ngrok -and (Test-Path (Join-Path $env:LOCALAPPDATA "ngrok\ngrok.exe"))) { $ngrok = Join-Path $env:LOCALAPPDATA "ngrok\ngrok.exe" }
if (-not $ngrok) { $ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source }
if (-not $ngrok -or -not (Test-Path $ngrok)) { Write-Error "ngrok not found. Install it from ngrok.com/download."; exit 1 }

& $ngrok http $Port --url "https://$hostname"
