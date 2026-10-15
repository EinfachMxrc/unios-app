# SPDX-License-Identifier: AGPL-3.0-or-later
param(
    [ValidateSet('Host', 'Viewer')]
    [string]$Role,
    [switch]$EnableLegacyAutostart
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

if (-not $Role) {
    $answer = Read-Host 'Soll dieses Gerät Daten abrufen können? [J/n]'
    $Role = if ($answer -match '^(n|nein)$') { 'Viewer' } else { 'Host' }
}

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
    Write-Host 'Installiere uv über den offiziellen Astral-Installer ...'
    Invoke-RestMethod 'https://astral.sh/uv/install.ps1' | Invoke-Expression
    $env:Path = (Join-Path $env:USERPROFILE '.local\bin') + ';' + $env:Path
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
}
if (-not $uvCommand) { throw 'uv wurde nicht gefunden.' }

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeMajor = if ($nodeCommand) { [int]((& node -p 'parseInt(process.versions.node, 10)').Trim()) } else { 0 }
if ($nodeMajor -lt 22) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'Node.js 22 oder neuer fehlt. Installiere Node.js und starte diesen Befehl erneut.'
    }
    Write-Host 'Installiere Node.js über WinGet ...'
    & winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Node.js konnte nicht installiert werden.' }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
        [Environment]::GetEnvironmentVariable('Path', 'User')
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodeMajor = if ($nodeCommand) { [int]((& node -p 'parseInt(process.versions.node, 10)').Trim()) } else { 0 }
}
if ($nodeMajor -lt 22) { throw 'Node.js 22 oder neuer wurde nicht gefunden.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm wurde nicht gefunden.' }

& uv sync --locked --no-dev
if ($LASTEXITCODE -ne 0) { throw 'Python-Installation fehlgeschlagen.' }
Push-Location (Join-Path $projectRoot 'frontend')
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend-Abhängigkeiten konnten nicht installiert werden.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend-Build fehlgeschlagen.' }
} finally {
    Pop-Location
}

$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
New-Item -ItemType Directory -Force -Path 'data', 'local' | Out-Null
$lease = & $python -m app.cli.main host status | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Host-Status konnte nicht geprüft werden.' }
if ($Role -eq 'Host' -and $lease.mode -eq 'unclaimed') {
    & $python -m app.cli.main host acquire
    if ($LASTEXITCODE -ne 0) { throw 'Staffelstab konnte nicht eingerichtet werden.' }
} elseif ($Role -eq 'Viewer' -and $lease.mode -eq 'unclaimed') {
    Write-Host 'Zuschauer-Gerät: Datenordner zuerst von einem Host synchronisieren.'
    return
}
if ($Role -eq 'Viewer' -and -not (Test-Path 'local\uni_os.sqlite3')) {
    Write-Host 'Zuschauer-Gerät: Ein geprüfter lokaler Datenbank-Snapshot fehlt. Zuerst Daten und Snapshot vom Host übernehmen.'
    return
}
if ($Role -eq 'Host' -and $lease.mode -ne 'unclaimed' -and -not (Test-Path 'local\uni_os.sqlite3')) {
    throw 'Ein anderer Staffelstab liegt bereits im Datenordner. Zuerst die geprüfte Geräteübergabe durchführen.'
}

if ($Role -eq 'Host') {
    if (-not (Test-Path 'local\uni_os.sqlite3')) {
        & $python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw 'Datenbank-Einrichtung fehlgeschlagen.' }
    } else {
        Write-Host 'Vorhandene Datenbank bleibt unverändert. Migration erst nach geprüftem Snapshot starten.'
    }
}

if ($Role -eq 'Host' -and -not (Test-Path 'local\setup.json')) {
    $setupPath = Join-Path $projectRoot 'local\setup.json'
    $setupJson = '{"version":1,"institution":null,"notifications":null,"completed":false}'
    [IO.File]::WriteAllText($setupPath, $setupJson, (New-Object Text.UTF8Encoding($false)))
}

if ($Role -eq 'Host') {
    & $python scripts/register_moodle_scheme.py
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Die Moodle-Rückkehr ist nicht automatisch eingerichtet. Im Assistenten ist die manuelle Eingabe möglich.'
    }
}

if (-not $EnableLegacyAutostart) {
    Write-Host 'Quellumgebung eingerichtet. Für den normalen Betrieb die native UniOS-App installieren. Kein lokaler Server-Autostart eingerichtet.'
    exit 0
}
& (Join-Path $projectRoot 'deploy\windows\register-task.ps1') -EnableLegacyAutostart
Start-ScheduledTask -TaskName 'UniOS'
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
        if ($health.status -eq 'ok') { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ready) { throw 'UniOS wurde registriert, antwortet aber noch nicht. Status in der Windows-Aufgabenplanung prüfen.' }
Write-Host 'UniOS ist unter http://127.0.0.1:8000/ erreichbar.'
Start-Process 'http://127.0.0.1:8000/'
