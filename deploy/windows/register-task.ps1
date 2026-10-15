# SPDX-License-Identifier: AGPL-3.0-or-later
param([switch]$EnableLegacyAutostart)
$ErrorActionPreference = 'Stop'
if (-not $EnableLegacyAutostart) {
    throw 'Der alte lokale Server wird nicht mehr automatisch eingerichtet. Native UniOS-App verwenden; Altbetrieb erfordert -EnableLegacyAutostart.'
}
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$Starter = Join-Path $PSScriptRoot 'start-uni-os.ps1'
if (-not (Test-Path (Join-Path $ProjectRoot 'frontend/dist/index.html'))) {
    throw 'React-Build fehlt. Im frontend-Ordner npm ci und npm run build ausführen.'
}
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$Service = New-Object -ComObject 'Schedule.Service'
$Service.Connect()
$Task = $Service.NewTask(0)
$Task.RegistrationInfo.Description = 'UniOS beim Anmelden und nach dem Aufwachen starten'
$Task.Principal.UserId = $Identity
$Task.Principal.LogonType = 3
$Task.Settings.Enabled = $true
$Task.Settings.StartWhenAvailable = $true
$Task.Settings.DisallowStartIfOnBatteries = $false
$Task.Settings.StopIfGoingOnBatteries = $false
$Task.Settings.ExecutionTimeLimit = 'PT0S'
$Task.Settings.MultipleInstances = 2
$Logon = $Task.Triggers.Create(9)
$Logon.UserId = $Identity
$Resume = $Task.Triggers.Create(0)
$Resume.Subscription = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name="Microsoft-Windows-Power-Troubleshooter"] and EventID=1]]</Select></Query></QueryList>'
$Action = $Task.Actions.Create(0)
$Action.Path = (Get-Command powershell.exe).Source
$Action.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Starter + '"'
$Action.WorkingDirectory = $ProjectRoot
$Folder = $Service.GetFolder('\')
$null = $Folder.RegisterTaskDefinition('UniOS', $Task, 6, $Identity, $null, 3)
Write-Host 'Aufgabe UniOS registriert. In der Aufgabenplanung kann sie sofort gestartet werden.'
