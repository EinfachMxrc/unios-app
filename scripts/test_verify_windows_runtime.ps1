# SPDX-License-Identifier: AGPL-3.0-or-later
# All files and launched programs below are newly created synthetic fixtures.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runtimeVerifier = Join-Path $PSScriptRoot 'verify_windows_runtime.ps1'
$runtimeFixtureParent = Join-Path $PSScriptRoot '..\.tmp\windows-runtime-verifier'
[void](New-Item -ItemType Directory -Path $runtimeFixtureParent -Force)
$runtimeFixtureRoot = Join-Path $runtimeFixtureParent ('fixtures-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffffffZ'))
[void](New-Item -ItemType Directory -Path $runtimeFixtureRoot)
$runtimeFixtureExe = Join-Path $runtimeFixtureRoot 'synthetic-startup.exe'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Threading;
public static class RuntimeVerifierSyntheticStartup {
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    public static extern IntPtr GetStdHandle(int id);
    [System.Runtime.InteropServices.DllImport("kernel32.dll")]
    public static extern uint GetFileType(IntPtr handle);
    public static int Main(string[] args) {
        if (args.Length != 1 || args[0] != "--startup-check") return 23;
        if (!Console.IsInputRedirected || !Console.IsOutputRedirected || !Console.IsErrorRedirected) return 24;
        foreach (int id in new int[] { -10, -11, -12 }) {
            IntPtr handle = GetStdHandle(id);
            if (handle == IntPtr.Zero || handle == new IntPtr(-1) || GetFileType(handle) != 3) return 26;
        }
        if (Console.In.ReadToEnd().Length != 0) return 25;
        string sentinel = Environment.GetEnvironmentVariable("UNIOS_VERIFIER_TEST_SENTINEL");
        if (!String.IsNullOrEmpty(sentinel)) File.WriteAllText(sentinel, "synthetic fixture launched");
        string mode = Environment.GetEnvironmentVariable("UNIOS_VERIFIER_TEST_MODE");
        if (mode == "sleep") Thread.Sleep(10000);
        if (mode == "exit") return 7;
        if (mode == "invalid") { Console.WriteLine("synthetic invalid JSON"); return 0; }
        if (mode == "false") { Console.WriteLine("{\"ok\":false}"); return 0; }
        if (mode == "flood") { Console.WriteLine(new String('x', 20000)); return 0; }
        Console.WriteLine("{\"ok\":true,\"client_seconds\":0.01}");
        return 0;
    }
}
'@ -OutputAssembly $runtimeFixtureExe -OutputType ConsoleApplication

function New-RuntimeFixture {
    param([string]$Name, [string]$Omit = '', [string]$Empty = '')
    $root = Join-Path $runtimeFixtureRoot $Name
    [void](New-Item -ItemType Directory -Path (Join-Path $root '_internal'))
    foreach ($name in @('unios-desktop.exe','uniosd.exe','_internal/python313.dll',
                        '_internal/vcruntime140.dll','_internal/vcruntime140_1.dll','_internal/base_library.zip')) {
        if ($name -eq $Omit) { continue }
        $target = Join-Path $root $name
        if ($name -eq 'uniosd.exe') {
            Copy-Item -LiteralPath $runtimeFixtureExe -Destination $target
        } else {
            [IO.File]::WriteAllText($target, $(if ($name -eq $Empty) { '' } else { 'synthetic program fixture' }))
        }
    }
    return $root
}

$runtimeShell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $runtimeShell)) { $runtimeShell = Join-Path $PSHOME 'pwsh.exe' }
$runtimeRows = New-Object Collections.Generic.List[object]
function Assert-RuntimeProbe {
    param([string]$Name, [string]$Root, [string]$ExpectedError = '', [switch]$Check, [string]$Mode = 'ok')
    $env:UNIOS_VERIFIER_TEST_MODE = $Mode
    $runtimeSentinel = Join-Path $runtimeFixtureRoot ($Name + '-launch.txt')
    $env:UNIOS_VERIFIER_TEST_SENTINEL = $runtimeSentinel
    $arguments = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$runtimeVerifier,'-InstallRoot',$Root)
    if ($Check) { $arguments += @('-StartupCheck','-StartupTimeoutMilliseconds','1000') }
    $raw = & $runtimeShell @arguments
    $code = $LASTEXITCODE
    $report = ($raw -join [Environment]::NewLine) | ConvertFrom-Json
    $expectedCode = $(if ($ExpectedError) { 1 } else { 0 })
    if ($code -ne $expectedCode -or [string]$report.error -cne $ExpectedError -or
        $report.ok -ne (-not [bool]$ExpectedError)) {
        throw ('Unexpected result for ' + $Name + ': ' + ($report | ConvertTo-Json -Compress))
    }
    if ($Check -and $ExpectedError.StartsWith('PROGRAM_FILE_') -and (Test-Path -LiteralPath $runtimeSentinel)) {
        throw ('Invalid runtime launched synthetic probe: ' + $Name)
    }
    if (-not $ExpectedError -and $Check -and -not $report.startup_check_passed) {
        throw ('Startup was not checked: ' + $Name)
    }
    $runtimeRows.Add([ordered]@{name=$Name; exit_code=$code; passed=$true; error=$report.error})
}

$runtimePreviousMode = [Environment]::GetEnvironmentVariable('UNIOS_VERIFIER_TEST_MODE')
$runtimePreviousSentinel = [Environment]::GetEnvironmentVariable('UNIOS_VERIFIER_TEST_SENTINEL')
try {
    $runtimeNormal = New-RuntimeFixture 'normal'
    Assert-RuntimeProbe -Name 'physical-files' -Root $runtimeNormal
    Assert-RuntimeProbe -Name 'startup-three-pipes-empty-stdin' -Root $runtimeNormal -Check
    Assert-RuntimeProbe -Name 'startup-nonzero' -Root $runtimeNormal -Check -Mode 'exit' -ExpectedError 'STARTUP_CHECK_EXIT_FAILED'
    Assert-RuntimeProbe -Name 'startup-json-invalid' -Root $runtimeNormal -Check -Mode 'invalid' -ExpectedError 'STARTUP_CHECK_RESULT_INVALID'
    Assert-RuntimeProbe -Name 'startup-not-ok' -Root $runtimeNormal -Check -Mode 'false' -ExpectedError 'STARTUP_CHECK_RESULT_INVALID'
    Assert-RuntimeProbe -Name 'startup-bounded-output' -Root $runtimeNormal -Check -Mode 'flood' -ExpectedError 'STARTUP_CHECK_OUTPUT_INVALID'
    Assert-RuntimeProbe -Name 'startup-timeout' -Root $runtimeNormal -Check -Mode 'sleep' -ExpectedError 'STARTUP_CHECK_TIMEOUT'
    $runtimeMissing = New-RuntimeFixture 'missing-python' -Omit '_internal/python313.dll'
    Assert-RuntimeProbe -Name 'missing-python-no-launch' -Root $runtimeMissing -Check -ExpectedError 'PROGRAM_FILE_UNAVAILABLE:_internal/python313.dll'
    $runtimeEmpty = New-RuntimeFixture 'empty-library' -Empty '_internal/base_library.zip'
    Assert-RuntimeProbe -Name 'empty-library-no-launch' -Root $runtimeEmpty -Check -ExpectedError 'PROGRAM_FILE_UNAVAILABLE:_internal/base_library.zip'
    $runtimeRedirectTarget = New-RuntimeFixture 'redirect-target'
    $runtimeRedirected = Join-Path $runtimeFixtureRoot 'redirected'
    [void](New-Item -ItemType Directory -Path $runtimeRedirected)
    Copy-Item -LiteralPath (Join-Path $runtimeRedirectTarget 'unios-desktop.exe') -Destination (Join-Path $runtimeRedirected 'unios-desktop.exe')
    Copy-Item -LiteralPath (Join-Path $runtimeRedirectTarget 'uniosd.exe') -Destination (Join-Path $runtimeRedirected 'uniosd.exe')
    [void](New-Item -ItemType Junction -Path (Join-Path $runtimeRedirected '_internal') -Target (Join-Path $runtimeRedirectTarget '_internal'))
    Assert-RuntimeProbe -Name 'redirected-runtime-no-launch' -Root $runtimeRedirected -Check -ExpectedError 'PROGRAM_FILE_REDIRECTED:_internal/python313.dll'
    Assert-RuntimeProbe -Name 'relative-root-rejected' -Root 'synthetic-relative-path' -ExpectedError 'ABSOLUTE_INSTALL_ROOT_REQUIRED'
    [ordered]@{ok=$true; cases=$runtimeRows.Count; fixture_root=$runtimeFixtureRoot; results=$runtimeRows} | ConvertTo-Json -Depth 5
} finally {
    [Environment]::SetEnvironmentVariable('UNIOS_VERIFIER_TEST_MODE', $runtimePreviousMode)
    [Environment]::SetEnvironmentVariable('UNIOS_VERIFIER_TEST_SENTINEL', $runtimePreviousSentinel)
}
