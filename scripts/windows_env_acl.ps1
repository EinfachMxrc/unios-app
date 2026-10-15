# SPDX-License-Identifier: AGPL-3.0-or-later
param(
    [Parameter(Mandatory = $true)][ValidateSet('check', 'secure')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
if (-not [System.IO.File]::Exists($Path) -or
    ([System.IO.File]::GetAttributes($Path) -band [System.IO.FileAttributes]::ReparsePoint)) {
    [Console]::Error.WriteLine('not-a-regular-file')
    exit 2
}

$File = [System.IO.FileInfo]::new($Path)
$Sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$Acl = $File.GetAccessControl()
if ($Mode -eq 'secure') {
    $Owner = $Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    $AdministratorOwner = 'S-1-5-32-544'
    $Principal = [System.Security.Principal.WindowsPrincipal]::new(
        [System.Security.Principal.WindowsIdentity]::GetCurrent()
    )
    $IsAdministrator = $Principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($Owner -ne $Sid.Value -and ($Owner -ne $AdministratorOwner -or -not $IsAdministrator)) {
        [Console]::Error.WriteLine('owner-mismatch-before-secure')
        exit 2
    }
    $Acl.SetOwner($Sid)
    $Acl.SetAccessRuleProtection($true, $false)
    foreach ($Rule in @($Acl.Access)) {
        $Acl.RemoveAccessRuleAll($Rule)
    }
    $OwnRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $Sid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($OwnRule)
    $File.SetAccessControl($Acl)
    $Acl = $File.GetAccessControl()
}

if (-not $Acl.AreAccessRulesProtected -or
    $Acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $Sid.Value) {
    [Console]::Error.WriteLine('inheritance-or-owner-mismatch')
    exit 2
}
$Rules = @($Acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ($Rules.Count -eq 0) {
    [Console]::Error.WriteLine('no-access-rules')
    exit 2
}
$CanReadAndWrite = $false
foreach ($Rule in $Rules) {
    if ($Rule.IsInherited -or $Rule.IdentityReference.Value -ne $Sid.Value -or
        $Rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
        [Console]::Error.WriteLine('unexpected-access-rule')
        exit 2
    }
    if (($Rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::ReadData) -and
        ($Rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::WriteData)) {
        $CanReadAndWrite = $true
    }
}
if (-not $CanReadAndWrite) {
    [Console]::Error.WriteLine('owner-cannot-read-and-write')
    exit 2
}
