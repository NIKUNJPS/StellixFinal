<#
.SYNOPSIS
  One command to set up and run Stellix Labs on Windows.

.DESCRIPTION
  First run: creates backend\.venv (Python 3.11), installs backend + frontend
  dependencies, and creates backend\.env from the example with a fresh random
  JWT secret. Every run: hands over to scripts\dev_up.ps1, which checks Postgres
  and Redis, applies database migrations and opens one window per service
  (API, workers, scheduler, frontend).

  Usage (from the repo root):
    .\run.ps1                 set up if needed, then start everything
    .\run.ps1 -Seed           ...and load the Meridian demo data afterwards
    .\run.ps1 -Stop           stop every Stellix window
    .\run.ps1 -FrontendPort 3001   serve the web app on another port

  If PowerShell blocks scripts, run instead:
    powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
param(
    [switch]$Stop,
    [switch]$Seed,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPy   = Join-Path $backend '.venv\Scripts\python.exe'
$envFile  = Join-Path $backend '.env'
$launcher = Join-Path $root 'scripts\dev_up.ps1'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red; exit 1 }

if ($Stop) {
    & $launcher -Stop -FrontendPort $FrontendPort
    exit $LASTEXITCODE
}

# ---- 1. Python 3.11 virtualenv + backend dependencies -------------------------------
if (-not (Test-Path $venvPy)) {
    Step "Creating backend virtualenv (Python 3.11)"
    $pyExe = $null
    $pyArgs = @()
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.11 -c "import sys" 2>$null
        if ($LASTEXITCODE -eq 0) { $pyExe = 'py'; $pyArgs = @('-3.11') }
    }
    if (-not $pyExe -and (Get-Command python -ErrorAction SilentlyContinue)) {
        $ver = & python -c "import sys; print('%d.%d' % sys.version_info[:2])"
        if ($ver -eq '3.11') { $pyExe = 'python' }
    }
    if (-not $pyExe) { Fail "Python 3.11 not found. Install Python 3.11.9 from python.org, then run .\run.ps1 again." }
    & $pyExe @pyArgs -m venv (Join-Path $backend '.venv')
    if ($LASTEXITCODE -ne 0) { Fail "Could not create backend\.venv" }
}

$reqFile = Join-Path $backend 'requirements.txt'
$marker  = Join-Path $backend '.venv\.stellix-deps-installed'
if (-not (Test-Path $marker) -or (Get-Item $reqFile).LastWriteTime -gt (Get-Item $marker).LastWriteTime) {
    Step "Installing backend dependencies (first run takes a few minutes)"
    & $venvPy -m pip install --upgrade pip --quiet
    & $venvPy -m pip install -r $reqFile
    if ($LASTEXITCODE -ne 0) { Fail "pip install failed - see the error above" }
    Set-Content -Path $marker -Value (Get-Date -Format o)
}

# ---- 2. Frontend dependencies --------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js is not installed (need 20+): https://nodejs.org" }
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Step "Installing frontend dependencies"
    Push-Location $frontend
    try { & npm ci; if ($LASTEXITCODE -ne 0) { & npm install } } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed - see the error above" }
}

# ---- 3. backend\.env -----------------------------------------------------------------
if (-not (Test-Path $envFile)) {
    Step "Creating backend\.env from backend\.env.example"
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    (Get-Content (Join-Path $backend '.env.example')) -replace 'CHANGE_ME_generate_a_long_random_secret', $secret |
        Set-Content -Path $envFile -Encoding utf8
}
if ((Get-Content $envFile -Raw) -match 'YOUR_PASSWORD') {
    Write-Host ""
    Write-Host "  backend\.env still has the placeholder database password." -ForegroundColor Yellow
    Write-Host "  Open backend\.env, set DATABASE_URL and DATABASE_URL_SYNC to your PostgreSQL user/password" -ForegroundColor Yellow
    Write-Host "  (Postgres on port 5433, database stellix_labs_dev), then run .\run.ps1 again." -ForegroundColor Yellow
    exit 1
}

# ---- 4. Start everything ---------------------------------------------------------------
Step "Starting Stellix Labs"
& $launcher -FrontendPort $FrontendPort
$code = $LASTEXITCODE

if ($Seed -and ($code -eq 0 -or $null -eq $code)) {
    Step "Loading the Meridian demo data"
    Push-Location $backend
    try { & $venvPy (Join-Path $root 'scripts\seed_demo_data.py') } finally { Pop-Location }
}
exit $code
