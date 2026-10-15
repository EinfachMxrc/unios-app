# SPDX-License-Identifier: AGPL-3.0-or-later
<#
.SYNOPSIS
Checks explicit UniOS program files without reading profiles or repairing files.
.DESCRIPTION
The kernel's final file path must match the requested installation path. MSIX
redirection is a failure, even if the redirected file exists. StartupCheck runs
only the installed service's isolated --startup-check mode, never serve or mcp.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,
    [switch]$StartupCheck,
    [ValidateRange(1000, 120000)]
    [int]$StartupTimeoutMilliseconds = 45000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not ('UniOSWindowsRuntimeVerifier.NativeMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace UniOSWindowsRuntimeVerifier {
    public sealed class CapturedOutput {
        public string Text = "";
        public bool Truncated;
        public bool Failed;
    }

    public sealed class ProbeResult {
        public int ExitCode = -1;
        public bool TimedOut;
        public bool OutputTimedOut;
        public CapturedOutput Output;
        public CapturedOutput Error;
    }

    public static class NativeMethods {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern uint GetFinalPathNameByHandleW(
            SafeFileHandle file, StringBuilder path, uint length, uint flags);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetCurrentPackageFullName(
            ref uint length, StringBuilder packageName);

        private static Task<CapturedOutput> Capture(StreamReader reader) {
            return Task.Factory.StartNew(delegate {
                var result = new CapturedOutput();
                var text = new StringBuilder();
                var buffer = new char[4096];
                try {
                    int count;
                    while ((count = reader.Read(buffer, 0, buffer.Length)) > 0) {
                        int available = Math.Max(0, 16384 - text.Length);
                        text.Append(buffer, 0, Math.Min(available, count));
                        if (count > available) result.Truncated = true;
                    }
                } catch (IOException) { result.Failed = true; }
                  catch (ObjectDisposedException) { result.Failed = true; }
                result.Text = text.ToString();
                return result;
            });
        }

        public static ProbeResult RunStartupProbe(string executable, int timeout) {
            var result = new ProbeResult();
            using (var process = new Process()) {
                process.StartInfo = new ProcessStartInfo {
                    FileName = executable,
                    Arguments = "--startup-check",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WorkingDirectory = Path.GetDirectoryName(executable)
                };
                if (!process.Start()) throw new InvalidOperationException("PROBE_START_FAILED");
                // The frozen windowed backend attaches all three inherited pipes.
                // Supply stdin, then close our writer to provide EOF without input.
                process.StandardInput.Close();
                var output = Capture(process.StandardOutput);
                var error = Capture(process.StandardError);
                if (!process.WaitForExit(timeout)) {
                    result.TimedOut = true;
                    // Only this newly created, isolated probe is terminated.
                    // Existing application or service processes are never touched.
                    try { process.Kill(); } catch (InvalidOperationException) { }
                    if (!process.WaitForExit(5000)) return result;
                }
                result.ExitCode = process.ExitCode;
                if (!Task.WaitAll(new Task[] { output, error }, 5000)) {
                    result.OutputTimedOut = true;
                    return result;
                }
                result.Output = output.Result;
                result.Error = error.Result;
                return result;
            }
        }
    }
}
'@
}

function ConvertTo-RuntimeNormalPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    if ($Path.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
        $Path = '\\' + $Path.Substring(8)
    } elseif ($Path.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
        $Path = $Path.Substring(4)
    }
    return [IO.Path]::GetFullPath($Path)
}

function Get-RuntimeKernelFilePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $runtimeStream = [IO.File]::Open(
        $Path, [IO.FileMode]::Open, [IO.FileAccess]::Read,
        ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try {
        $runtimeCapacity = 512
        while ($runtimeCapacity -le 32768) {
            $runtimeBuffer = New-Object Text.StringBuilder $runtimeCapacity
            $runtimeLength = [UniOSWindowsRuntimeVerifier.NativeMethods]::GetFinalPathNameByHandleW(
                $runtimeStream.SafeFileHandle, $runtimeBuffer, [uint32]$runtimeCapacity, 0)
            if ($runtimeLength -eq 0) { throw 'KERNEL_PATH_FAILED' }
            if ($runtimeLength -lt $runtimeCapacity) {
                return ConvertTo-RuntimeNormalPath $runtimeBuffer.ToString()
            }
            $runtimeCapacity = [int]$runtimeLength + 1
        }
        throw 'KERNEL_PATH_TOO_LONG'
    } finally {
        $runtimeStream.Dispose()
    }
}

$runtimeNames = @(
    'unios-desktop.exe',
    'uniosd.exe',
    '_internal/python313.dll',
    '_internal/vcruntime140.dll',
    '_internal/vcruntime140_1.dll',
    '_internal/base_library.zip'
)
$runtimeReport = [ordered]@{
    ok = $false
    install_root = $null
    files_checked = 0
    physical_paths_exact = $false
    process_packaged = $null
    startup_check_requested = [bool]$StartupCheck
    startup_check_passed = $false
    private_state_accessed = $false
    error = $null
}

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'WINDOWS_REQUIRED'
    }
    $runtimeInput = $InstallRoot.Replace('/', '\')
    if ($runtimeInput.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) {
        $runtimeInput = '\\' + $runtimeInput.Substring(8)
    } elseif ($runtimeInput.StartsWith('\\?\', [StringComparison]::OrdinalIgnoreCase)) {
        $runtimeInput = $runtimeInput.Substring(4)
    }
    # IsPathRooted alone also accepts C:relative and \drive-relative on Windows.
    if ($runtimeInput -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))') {
        throw 'ABSOLUTE_INSTALL_ROOT_REQUIRED'
    }
    $runtimeRoot = ConvertTo-RuntimeNormalPath $runtimeInput
    $runtimeReport.install_root = $runtimeRoot

    [uint32]$runtimePackageLength = 0
    $runtimePackageResult = [UniOSWindowsRuntimeVerifier.NativeMethods]::GetCurrentPackageFullName(
        [ref]$runtimePackageLength, $null)
    if ($runtimePackageResult -eq 15700) {
        $runtimeReport.process_packaged = $false
    } elseif ($runtimePackageResult -eq 122 -or $runtimePackageResult -eq 0) {
        $runtimeReport.process_packaged = $true
    } else {
        throw 'PACKAGE_IDENTITY_CHECK_FAILED'
    }

    foreach ($runtimeName in $runtimeNames) {
        $runtimeExpected = ConvertTo-RuntimeNormalPath (Join-Path $runtimeRoot $runtimeName)
        try {
            $runtimeItem = Get-Item -LiteralPath $runtimeExpected -Force
            if ($runtimeItem.PSIsContainer -or $runtimeItem.Length -le 0) {
                throw 'INVALID_PROGRAM_FILE'
            }
            $runtimePhysical = Get-RuntimeKernelFilePath $runtimeExpected
        } catch {
            throw ('PROGRAM_FILE_UNAVAILABLE:' + $runtimeName)
        }
        if (-not [string]::Equals($runtimePhysical, $runtimeExpected, [StringComparison]::OrdinalIgnoreCase)) {
            throw ('PROGRAM_FILE_REDIRECTED:' + $runtimeName)
        }
        $runtimeReport.files_checked++
    }
    $runtimeReport.physical_paths_exact = $true

    if ($StartupCheck) {
        if ($runtimeReport.process_packaged) { throw 'STARTUP_CHECK_REQUIRES_UNPACKAGED_PROCESS' }
        $runtimeProbe = [UniOSWindowsRuntimeVerifier.NativeMethods]::RunStartupProbe(
            (Join-Path $runtimeRoot 'uniosd.exe'), $StartupTimeoutMilliseconds)
        if ($runtimeProbe.TimedOut) { throw 'STARTUP_CHECK_TIMEOUT' }
        if ($runtimeProbe.OutputTimedOut) { throw 'STARTUP_CHECK_OUTPUT_TIMEOUT' }
        if ($runtimeProbe.ExitCode -ne 0) { throw 'STARTUP_CHECK_EXIT_FAILED' }
        if ($null -eq $runtimeProbe.Output -or $null -eq $runtimeProbe.Error -or
            $runtimeProbe.Output.Failed -or $runtimeProbe.Error.Failed -or
            $runtimeProbe.Output.Truncated -or $runtimeProbe.Error.Truncated) {
            throw 'STARTUP_CHECK_OUTPUT_INVALID'
        }
        try {
            $runtimeProbeJson = $runtimeProbe.Output.Text | ConvertFrom-Json
            if ($runtimeProbeJson.ok -isnot [bool] -or -not $runtimeProbeJson.ok) {
                throw 'STARTUP_CHECK_NOT_OK'
            }
        } catch {
            throw 'STARTUP_CHECK_RESULT_INVALID'
        }
        $runtimeReport.startup_check_passed = $true
    }
    $runtimeReport.ok = $true
} catch {
    # Only fixed program-file names and controlled errors are emitted. Child
    # stdout/stderr and arbitrary filesystem exception details remain private.
    $runtimeError = [string]$_.Exception.Message
    if ($runtimeError -notmatch '^[A-Z_]+(?::(?:unios-desktop\.exe|uniosd\.exe|_internal/[a-zA-Z0-9_.]+))?$') {
        $runtimeError = 'RUNTIME_CHECK_FAILED'
    }
    $runtimeReport.error = $runtimeError
}

$runtimeReport | ConvertTo-Json -Depth 3
if (-not $runtimeReport.ok) { exit 1 }
exit 0
