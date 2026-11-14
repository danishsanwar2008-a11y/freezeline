# Starts the FreezeLine voice agent on Windows with the settings from .env.local.
# The agent reads only environment variables, so this loads .env.local into this window first.
#
#   powershell -ExecutionPolicy Bypass -File voice\start.ps1            # start the agent on :8080
#   powershell -ExecutionPolicy Bypass -File voice\start.ps1 -Check     # check the script + audio cache
#   powershell -ExecutionPolicy Bypass -File voice\start.ps1 -Prerender # render the fixed lines to audio
#
# Setup once (from the repo root):  py -3.12 -m venv voice\.venv
#                                   voice\.venv\Scripts\python -m pip install -r voice\requirements.txt
# and put kokoro-v1.0.onnx + voices-v1.0.bin in voice\models\.
param([switch]$Check, [switch]$Prerender)

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { Write-Error "No voice\.venv yet. See the setup lines at the top of voice\start.ps1."; exit 1 }

$envFile = Join-Path $root ".env.local"
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$' -and $Matches[2] -ne '') {
      $value = $Matches[2].Trim('"').Trim("'")
      Set-Item -Path "Env:$($Matches[1])" -Value $value
    }
  }
}
# Windows consoles default to a legacy code page; the agent prints Spanish lines and arrows.
$env:PYTHONIOENCODING = "utf-8"

if ($Check) { & $python (Join-Path $PSScriptRoot "agent.py") --check; exit $LASTEXITCODE }
if ($Prerender) { & $python (Join-Path $PSScriptRoot "prerender.py") --build; exit $LASTEXITCODE }
& $python (Join-Path $PSScriptRoot "agent.py")
