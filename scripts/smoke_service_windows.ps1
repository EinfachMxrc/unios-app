# SPDX-License-Identifier: AGPL-3.0-or-later
$ErrorActionPreference = 'Stop'
foreach ($File in @('deploy/windows/register-task.ps1', 'deploy/windows/start-uni-os.ps1', 'scripts/windows_env_acl.ps1')) {
    $Tokens = $null
    $Errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $File).Path, [ref]$Tokens, [ref]$Errors)
    if ($Errors.Count -gt 0) { throw "PowerShell-Syntaxfehler in $File`: $($Errors[0])" }
}
& .\.venv\Scripts\unios.exe host acquire
if ($LASTEXITCODE -ne 0) { throw 'Staffelstab konnte nicht eingerichtet werden' }
& .\.venv\Scripts\alembic.exe upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Migration fehlgeschlagen' }
$env:UNIOS_API_PORT = '8186'
$Python = (Resolve-Path '.venv/Scripts/python.exe').Path
$Service = Start-Process -FilePath $Python -ArgumentList 'scripts/run_service.py' -PassThru -NoNewWindow
try {
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 40; $Attempt++) {
        Start-Sleep -Milliseconds 500
        if ($Service.HasExited) { throw "Dienst endete mit Status $($Service.ExitCode)" }
        try {
            $Page = Invoke-WebRequest 'http://127.0.0.1:8186/' -TimeoutSec 2
            $Status = Invoke-RestMethod 'http://127.0.0.1:8186/api/host' -TimeoutSec 2
            $Health = Invoke-RestMethod 'http://127.0.0.1:8186/health' -TimeoutSec 2
            if ($Page.StatusCode -eq 200 -and $Page.Content.Contains('UniOS') -and
                $Status.mode -eq 'host' -and $Health.status -eq 'ok') { $Ready = $true; break }
        } catch { }
    }
    if (-not $Ready) { throw 'React und API wurden nicht bereit' }
    Write-Host 'Windows-Dienststart: React, API und Staffelstab bereit'
} finally {
    taskkill.exe /PID $Service.Id /T /F | Out-Null
}
