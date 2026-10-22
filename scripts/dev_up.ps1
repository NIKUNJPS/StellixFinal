<#
.SYNOPSIS
  Start the whole Stellix Labs stack locally, each service in its own window.

.DESCRIPTION
  1. Preflight: Python venv, Node, Postgres (5433), Redis (6379), and a check of
     backend\.env that NEVER prints a secret (it reports names and problems only).
  2. Applies database migrations (alembic upgrade head).
  3. Opens one PowerShell window per service: API, default worker, realtime worker,
     scheduler (beat), frontend, and - if Alpaca keys are set - the live ETF streamer.
  4. Waits for the API health check and prints the URLs.

  Run from the repo root (first-time setup + start: use .\run.ps1 instead):
    powershell -ExecutionPolicy Bypass -File .\scripts\dev_up.ps1

  Switches:
    -CheckOnly      run the preflight only; start nothing
    -NoStreamer     never start the Alpaca ETF streamer
    -ExtraWorker    also start a second default-queue worker (so a long Agent Desk
                    run does not block backtests/validation)
    -Stop           stop every window this launcher opened ("Stellix ..."), then exit.
                    Only windows whose title starts with "Stellix" are touched - never
                    other projects, and never your own terminals.
    -Restart        -Stop, wait a few seconds, then start everything again (use this
                    after editing backend\.env so the services re-read it).
    -FrontendPort N serve the web app on port N (default 3000). The API only trusts the
                    origin it is told about, so for N other than 3000 the launcher sets
                    BACKEND_CORS_ORIGINS / FRONTEND_URL for the API window only (your
                    .env is not touched). Use it when another project holds port 3000.

  Stop everything: close the windows (or Ctrl+C in each).
#>
param(
    [switch]$CheckOnly,
    [switch]$NoStreamer,
    [switch]$ExtraWorker,
    [switch]$Stop,
    [switch]$Restart,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = 'Stop'
$root     = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$py       = Join-Path $backend '.venv\Scripts\python.exe'
$envFile  = Join-Path $backend '.env'

$problems = 0
function Ok($m)   { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Info($m) { Write-Host "  [info] $m" -ForegroundColor Gray }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [FAIL] $m" -ForegroundColor Red; $script:problems++ }

function Test-Port([int]$port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect('127.0.0.1', $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false) -and $c.Connected
        return $ok
    } catch { return $false } finally { $c.Close() }
}

function Read-EnvFile([string]$path) {
    # Same rule as python-dotenv: the LAST assignment of a key wins.
    $values = @{}; $counts = @{}
    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $k = $Matches[1]
            $v = $Matches[2].Trim().Trim('"').Trim("'")
            $values[$k] = $v
            $counts[$k] = 1 + [int]$counts[$k]
        }
    }
    return @{ Values = $values; Counts = $counts }
}

function Get-StellixWindows {
    # The launcher starts each service as: powershell -NoExit -Command "$Host.UI.RawUI.WindowTitle = 'Stellix ...'; ..."
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like "*WindowTitle = 'Stellix *" -and $_.ProcessId -ne $PID }
}

if ($Stop -or $Restart) {
    $windows = @(Get-StellixWindows)
    if ($windows.Count -eq 0) { Write-Host "No 'Stellix ...' windows are running." -ForegroundColor Gray }
    foreach ($w in $windows) {
        $title = if ($w.CommandLine -match "WindowTitle = '([^']+)'") { $Matches[1] } else { "pid $($w.ProcessId)" }
        & taskkill /T /F /PID $w.ProcessId | Out-Null     # /T = the window AND the service it started
        Write-Host "  stopped: $title" -ForegroundColor Yellow
    }
    # Second sweep: Stellix services whose window was closed by hand can survive it. Match ONLY
    # processes launched from THIS project's virtualenv / frontend folder, and never one-off
    # commands (agent desk CLI, tests, migrations).
    $strays = @(Get-CimInstance Win32_Process | Where-Object {
        $c = [string]$_.CommandLine
        $_.ProcessId -ne $PID -and (
            ($c -like "*$backend\.venv\Scripts\python.exe*" -and $c -match '(-m uvicorn|-m celery|-m app\.streaming\.etf_stream)') -or
            ($c -like "*$frontend\node_modules*" -and $c -match 'next')
        )
    })
    foreach ($s in $strays) {
        & taskkill /T /F /PID $s.ProcessId 2>$null | Out-Null
        $what = if ([string]$s.CommandLine -match 'uvicorn') { 'API' } elseif ([string]$s.CommandLine -match 'celery') { 'Celery' } elseif ([string]$s.CommandLine -match 'etf_stream') { 'ETF streamer' } else { 'frontend' }
        Write-Host "  stopped stray $what process (pid $($s.ProcessId))" -ForegroundColor Yellow
    }
    if ($Stop) {
        Start-Sleep -Seconds 2
        $left = @(8000, $FrontendPort | Where-Object { Test-Port $_ })
        if ($left.Count -gt 0) { Write-Host "  note: port(s) $($left -join ', ') still answer - another program may own them." -ForegroundColor Yellow }
        else { Write-Host "All Stellix services are stopped." -ForegroundColor Green }
        exit 0
    }
    Start-Sleep -Seconds 4   # let ports (and Alpaca's single streaming connection) free up
}

Write-Host ""
Write-Host "Stellix Labs - preflight" -ForegroundColor Cyan

# ---- tools ---------------------------------------------------------------------
if (Test-Path $py) { Ok "Backend virtualenv found" } else { Bad "Missing $py - create it: python -m venv backend\.venv, then pip install -r backend\requirements.txt" }
if (Get-Command node -ErrorAction SilentlyContinue) { Ok "Node $(node --version)" } else { Bad "Node.js is not installed (need 20+)" }
if (Test-Path (Join-Path $frontend 'node_modules')) { Ok "Frontend dependencies installed" } else { Warn "frontend\node_modules missing - will run npm install" }

# ---- data services -------------------------------------------------------------
if (Test-Port 5433) { Ok "Postgres is listening on 5433" } else { Bad "Postgres is not listening on 5433 - start the PostgreSQL service" }
if (Test-Port 6379) { Ok "Redis is listening on 6379" }    else { Bad "Redis is not listening on 6379 - start Redis" }
function Describe-PortOwner([int]$port) {
    try {
        $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
        $cmd = [string]$p.CommandLine
        return "pid $($c.OwningProcess): " + $cmd.Substring(0, [Math]::Min(100, $cmd.Length))
    } catch { return "unknown process" }
}
if (Test-Port 8000) { Bad "Port 8000 is already in use by [$(Describe-PortOwner 8000)] - stop it, or it may already be a Stellix API" }
if (Test-Port $FrontendPort) {
    Bad "Port $FrontendPort is already in use by [$(Describe-PortOwner $FrontendPort)]. Stop it, or rerun with -FrontendPort <free port> (e.g. 3001)."
}

# ---- backend\.env (names and problems only; never values) ----------------------
if (-not (Test-Path $envFile)) {
    Bad "backend\.env not found - copy backend\.env.example to backend\.env and fill it in"
    $cfg = @{ Values = @{}; Counts = @{} }
} else {
    Ok "backend\.env found"
    $cfg = Read-EnvFile $envFile
}
$v = $cfg.Values
foreach ($k in $cfg.Counts.Keys) {
    if ($cfg.Counts[$k] -gt 1) { Warn "$k appears $($cfg.Counts[$k]) times in .env - the LAST one wins; delete the extras" }
}
if (-not $v['DATABASE_URL']) { Bad "DATABASE_URL is empty" }
if (-not $v['JWT_SECRET_KEY'] -or $v['JWT_SECRET_KEY'] -like 'CHANGE_ME*') { Bad "JWT_SECRET_KEY is empty or still the placeholder" }

# ---- AI provider (the checks follow whichever provider the Agent Desk is set to) ----
$provider = if ($v['AGENTS_LLM_PROVIDER']) { $v['AGENTS_LLM_PROVIDER'].ToLower() } else { 'google' }
$gem = $v['GEMINI_API_KEY']
$ant = $v['ANTHROPIC_API_KEY']
if ($ant) { Ok "ANTHROPIC_API_KEY is set" } else { Info "ANTHROPIC_API_KEY is empty" }
if ($gem -and $gem -notmatch '^AIza[0-9A-Za-z_\-]{35}$') {
    # Format alone cannot say whether a key works (non-AIza keys can be valid), so this is a note, not a warning.
    Info "GEMINI_API_KEY is not in the usual AI Studio form ('AIza...', 39 chars). If Gemini calls fail, run: backend\.venv\Scripts\python.exe scripts\llm_setup.py"
}
switch ($provider) {
    'anthropic' {
        if ($ant) { Ok "Agent Desk provider: Anthropic (deep=$($v['AGENTS_DEEP_MODEL']), quick=$($v['AGENTS_QUICK_MODEL']))" }
        else      { Warn "Agent Desk provider is 'anthropic' but ANTHROPIC_API_KEY is empty - desk runs will fail" }
    }
    'google' {
        if (-not $gem) { Warn "Agent Desk provider is 'google' (default) but GEMINI_API_KEY is empty - desk runs will fail. Set AGENTS_LLM_PROVIDER=anthropic to use Claude." }
        else           { Ok "Agent Desk provider: Google (key present)" }
    }
    default { Info "Agent Desk provider: $provider (needs AGENTS_LLM_API_KEY unless it is a local server)" }
}
if (-not $gem -and $ant) { Info "No Gemini key: the Research Assistant uses Claude for every request (set ANTHROPIC_MODEL to pick the model)" }
if (-not $v['FRED_API_KEY'])      { Info "FRED_API_KEY is empty - economic calendar and yield curve disabled" }
elseif ($v['FRED_API_KEY'].Length -ne 32) { Warn "FRED_API_KEY should be 32 characters (yours is $($v['FRED_API_KEY'].Length))" } else { Ok "FRED_API_KEY format looks right" }
if (-not $v['SEC_EDGAR_USER_AGENT']) { Info "SEC_EDGAR_USER_AGENT is empty - insider data and market-cap sizing disabled" }
elseif ($v['SEC_EDGAR_USER_AGENT'] -notmatch '@') { Warn "SEC_EDGAR_USER_AGENT has no email - SEC returns 403. Use: Your Name you@example.com" } else { Ok "SEC_EDGAR_USER_AGENT includes a contact email" }
$alpaca = [bool]($v['ALPACA_API_KEY_ID'] -and $v['ALPACA_API_SECRET_KEY'])
if ($alpaca) { Ok "Alpaca keys present (live ETF streamer available)" } else { Info "Alpaca keys not set - the live ETF streamer will not start" }

if ($problems -gt 0) {
    Write-Host ""
    Write-Host "$problems blocking problem(s) above. Fix them and run again." -ForegroundColor Red
    exit 1
}
if ($CheckOnly) { Write-Host ""; Write-Host "Preflight passed (-CheckOnly: nothing started)." -ForegroundColor Green; exit 0 }

# ---- install / migrate ---------------------------------------------------------
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host ""; Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location $frontend; try { npm install } finally { Pop-Location }
}
Write-Host ""; Write-Host "Applying database migrations..." -ForegroundColor Cyan
Push-Location $backend
try { & $py -m alembic upgrade head; if ($LASTEXITCODE -ne 0) { throw "alembic failed" } } finally { Pop-Location }

# ---- start services ------------------------------------------------------------
function Start-Service-Window([string]$title, [string]$workdir, [string]$command) {
    $inner = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workdir'; $command"
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $inner) | Out-Null
    Write-Host "  started: $title" -ForegroundColor Green
}

$celery = ".venv\Scripts\python.exe -m celery -A app.worker.celery_app.celery_app"
Write-Host ""; Write-Host "Starting services..." -ForegroundColor Cyan
# No --reload on the API: an auto-restart in the middle of a demo would drop live connections.
$apiEnv = ""
if ($FrontendPort -ne 3000) {
    # Process-level environment variables override .env, so .env stays untouched.
    $apiEnv = "`$env:BACKEND_CORS_ORIGINS='http://localhost:$FrontendPort'; `$env:FRONTEND_URL='http://localhost:$FrontendPort'; "
}
Start-Service-Window 'Stellix API (8000)'        $backend  "$apiEnv.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
Start-Sleep -Seconds 2
Start-Service-Window 'Stellix worker (default)'  $backend  "$celery worker --loglevel=INFO --pool=solo"
Start-Service-Window 'Stellix worker (realtime)' $backend  "$celery worker -Q realtime -n realtime@%h --loglevel=INFO --pool=solo"
Start-Service-Window 'Stellix beat (scheduler)'  $backend  "$celery beat --loglevel=INFO"
if ($ExtraWorker) {
    Start-Service-Window 'Stellix worker (agents)' $backend "$celery worker -n agents@%h --loglevel=INFO --pool=solo"
}
Start-Service-Window "Stellix frontend ($FrontendPort)" $frontend "npm run dev -- -p $FrontendPort"
if ($alpaca -and -not $NoStreamer) {
    # Alpaca's free plan allows ONE streaming connection - never start two.
    Start-Service-Window 'Stellix ETF streamer' $backend ".venv\Scripts\python.exe -m app.streaming.etf_stream"
}

# ---- wait for the API ----------------------------------------------------------
Write-Host ""; Write-Host "Waiting for the API..." -ForegroundColor Cyan
$healthy = $false
for ($i = 0; $i -lt 45; $i++) {
    # /health/ready = 200 only when Postgres AND Redis are reachable (503 otherwise).
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8000/health/ready' -TimeoutSec 10; if ($r.StatusCode -eq 200) { $healthy = $true; break } } catch { }
    Start-Sleep -Seconds 2
}
if ($healthy) { Ok "API is up and ready (Postgres + Redis reachable)" } else { Warn "API did not become ready within 90 s - read the 'Stellix API' window for the error" }

Write-Host ""
Write-Host "  App:       http://localhost:$FrontendPort   (first page load takes 10-30 s while it compiles)" -ForegroundColor Cyan
Write-Host "  API docs:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Health:    http://localhost:8000/health/ready" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop: close the 'Stellix ...' windows." -ForegroundColor Gray
