# SPDX-License-Identifier: AGPL-3.0-or-later
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$Python = Join-Path $ProjectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path $Python)) { throw 'Python-Umgebung fehlt. Zuerst uv sync --locked ausführen.' }
Set-Location $ProjectRoot
$Service = Start-Process -FilePath $Python -ArgumentList ('"' + (Join-Path $ProjectRoot 'scripts/run_service.py') + '"') -WindowStyle Hidden -PassThru -Wait
exit $Service.ExitCode
