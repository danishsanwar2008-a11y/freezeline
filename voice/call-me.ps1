# Places one demo call to your own phone through the running voice agent (voice\start.ps1)
# and tunnel (voice\tunnel.ps1). Nothing is saved: the answers print in the agent's window.
#
#   powershell -ExecutionPolicy Bypass -File voice\call-me.ps1                 # English storm call
#   powershell -ExecutionPolicy Bypass -File voice\call-me.ps1 -Lang es        # Spanish
#   powershell -ExecutionPolicy Bypass -File voice\call-me.ps1 -Crew "Crew 3"  # crew-assigned ending
#   powershell -ExecutionPolicy Bypass -File voice\call-me.ps1 -Survey         # pre-storm survey
#
# Reads from .env.local: DEMO_CALL_TO (your phone, +1...), DEMO_CALL_NAME (greeting, optional),
# TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, PUBLIC_HOSTNAME, and TWILIO_PHONE_NUMBER + VOICE_SHARED_SECRET.
# Trial mode: leave TWILIO_PHONE_NUMBER empty. Trial accounts own no number; Twilio then calls from
# a shared trial number, to the phone you signed up with (the only one a trial may call).
param(
  [string]$To = "",
  [ValidateSet("en", "es")][string]$Lang = "en",
  # Greeting name: -Name, else DEMO_CALL_NAME in .env.local, else the unnamed greeting.
  [string]$Name = "",
  [string]$Street = "Harvard St",
  [string]$Crew = "",
  [switch]$Survey,
  # Build the request and rehearse the call's opening against the local agent; Twilio is never contacted.
  [switch]$DryRun
)

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
function EnvValue([string]$key) {
  $m = (Select-String -Path $envFile -Pattern "^$key=(.*)$" -ErrorAction SilentlyContinue).Matches | Select-Object -First 1
  if ($m) { return $m.Groups[1].Value.Trim().Trim('"') } else { return "" }
}

if (-not $To) { $To = EnvValue "DEMO_CALL_TO" }
if (-not $Name) { $Name = EnvValue "DEMO_CALL_NAME" }
if ($To -notmatch '^\+1\d{10}$') { Write-Error "Set DEMO_CALL_TO=+1XXXXXXXXXX (your phone) in .env.local, or pass -To."; exit 1 }
# No TWILIO_PHONE_NUMBER = trial mode: Twilio places the call from one of its shared trial numbers.
$trial = -not (EnvValue "TWILIO_PHONE_NUMBER")
try { Invoke-RestMethod -Uri http://localhost:8080/health -TimeoutSec 5 | Out-Null }
catch { Write-Error "The voice agent isn't running. Start it: powershell -ExecutionPolicy Bypass -File voice\start.ps1"; exit 1 }

$household = @{ engine = "gather"; lang = $Lang; first_name = $Name; street = $Street }
if ($Survey) {
  $household.mode = "survey"
} else {
  $household += @{
    home_id = "heights-w589054579"; level = "High"; temp = 19; hours = 6; faucet = $true
    steps = if ($Lang -eq "es") {
      @("Busque la llave de paso principal del agua.", "Cubra la llave de agua exterior.", "Deje gotear solo la llave de la cocina.")
    } else {
      @("Find your main water shutoff.", "Cover your outdoor faucet.", "Drip only your kitchen tap.")
    }
  }
  if ($Crew) { $household.crew = $Crew }
}
$body = @{ to = $To; home = $household } | ConvertTo-Json -Depth 4

if ($DryRun) {
  # What Twilio would fetch when you answer: the agent's first lines for this household.
  $json = $household | ConvertTo-Json -Depth 4 -Compress
  $encoded = [uri]::EscapeDataString([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
  $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://localhost:8080/voice/start?home=$encoded" -Body "CallSid=CAdryrun" -ContentType "application/x-www-form-urlencoded"
  # Windows PowerShell guesses Latin-1 for this response; the agent sends UTF-8 (Twilio reads it correctly).
  $xml = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
  "Dry run (no call placed). The call would open with:"
  ([regex]::Matches($xml, '<Say[^>]*>([^<]*)</Say>') | ForEach-Object { "  agent: " + [Net.WebUtility]::HtmlDecode($_.Groups[1].Value) })
  exit 0
}

try {
  if ($trial) {
    # Trial accounts own no number, so the agent's /make-call (which always sends From) can't be used.
    # Ask Twilio directly with only To + Url; the call then runs the agent's turn-by-turn script.
    $sid = EnvValue "TWILIO_ACCOUNT_SID"; $token = EnvValue "TWILIO_AUTH_TOKEN"; $public = EnvValue "PUBLIC_HOSTNAME"
    if (-not $sid -or -not $token -or -not $public) { Write-Error "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and PUBLIC_HOSTNAME in .env.local."; exit 1 }
    $json = $household | ConvertTo-Json -Depth 4 -Compress
    $encoded = [uri]::EscapeDataString([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
    $auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${sid}:${token}"))
    $r = Invoke-RestMethod -Method Post -Uri "https://api.twilio.com/2010-04-01/Accounts/$sid/Calls.json" `
      -Headers @{ Authorization = "Basic $auth" } -ContentType "application/x-www-form-urlencoded" `
      -Body @{ To = $To; Url = "https://$public/voice/start?home=$encoded" }
  } else {
    $r = Invoke-RestMethod -Method Post -Uri http://localhost:8080/make-call -ContentType "application/json" `
      -Headers @{ "x-voice-secret" = (EnvValue "VOICE_SHARED_SECRET") } -Body $body
  }
  "Calling $($To.Substring(0, 5))...$($To.Substring($To.Length - 4)) - call $($r.sid), status $($r.status). Answer your phone."
} catch {
  $detail = $_.ErrorDetails.Message
  Write-Error "Twilio didn't place the call: $detail"
  if ($detail -match '21219|21608') { "Twilio says this phone isn't verified for your trial account." }
  if ($detail -match '21606|21212|21210') { "TWILIO_PHONE_NUMBER isn't a number on your Twilio account." }
  if ($detail -match '20003') { "The Twilio Account SID or Auth Token is wrong." }
  exit 1
}
