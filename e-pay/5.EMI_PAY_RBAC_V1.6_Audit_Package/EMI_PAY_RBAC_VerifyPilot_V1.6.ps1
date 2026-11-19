#Requires -Modules PnP.PowerShell
<#
EMI PAY - Read-only RBAC audit V1.6
- Never changes any site/list/item permissions, group membership or data.
- Uses the PnP connection ALREADY established by the operator.
- Exports actual list role assignments, members of 7 GR-PAY groups,
  effective rights for optional test accounts, and a 23-component inventory.

Usage (after Connect-PnPOnline -Url https://emicomvn.sharepoint.com/sites/cecm ...):
  .\EMI_PAY_RBAC_VerifyPilot_V1.6.ps1
  .\EMI_PAY_RBAC_VerifyPilot_V1.6.ps1 -TestUserUpns 'pilot.user@emicom.vn','pilot.audit@emicom.vn'
Replace example users with ACTUAL UPNs; do not use guessed emails.
#>
[CmdletBinding()]
param(
    [string[]]$TestUserUpns = @(),
    [string]$OutputDirectory = (Join-Path (Get-Location) 'EMI_PAY_RBAC_Reports'),
    [string]$InventoryCsvPath = (Join-Path $PSScriptRoot 'EMI_PAY_RBAC_Inventory_23_V1.6.csv')
)
$ErrorActionPreference = 'Stop'
$siteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
$pilotGuid = [guid]'60bb23f6-4702-4aed-b36f-b2b20b09e74d'
$roleExpected = [ordered]@{
    'cecm Chủ sở hữu' = 'Full Control'
    'GR-PAY-SYSADM' = 'Full Control'
    'GR-PAY-FLOW-SVC' = 'Full Control'
    'GR-PAY-PROCADM' = 'Contribute'
    'GR-PAY-CHAIR' = '(no direct assignment)'
    'GR-PAY-TCKT' = '(no direct assignment)'
    'GR-PAY-USERS' = '(no direct assignment)'
    'GR-PAY-AUDIT' = '(no direct assignment)'
}
$groupNames = @(
    'GR-PAY-SYSADM', 'GR-PAY-FLOW-SVC', 'GR-PAY-PROCADM',
    'GR-PAY-CHAIR', 'GR-PAY-TCKT', 'GR-PAY-USERS', 'GR-PAY-AUDIT'
)

# Safety gate: never silently read a different tenant/site.
$connection = Get-PnPConnection
if (-not $connection) { throw 'No active PnP connection. Connect to CECM first.' }
if ($connection.Url.TrimEnd('/') -ine $siteUrl.TrimEnd('/')) {
    throw "Wrong site connection: $($connection.Url). Expected $siteUrl"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$list = Get-PnPList -Identity $pilotGuid -Includes HasUniqueRoleAssignments,RoleAssignments,Title,ItemCount
if (-not $list -or $list.Id -ne $pilotGuid) { throw 'Pilot list GUID mismatch.' }
Get-PnPProperty -ClientObject $list -Property RoleAssignments,HasUniqueRoleAssignments | Out-Null

$assignments = @(
    foreach ($ra in $list.RoleAssignments) {
        $principal = Get-PnPProperty -ClientObject $ra -Property Member
        $bindings = Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings
        [pscustomobject]@{
            ListGuid       = [string]$list.Id
            ListTitle      = $list.Title
            PrincipalId    = $principal.Id
            PrincipalName  = $principal.Title
            PrincipalLogin = $principal.LoginName
            PrincipalType  = [string]$principal.PrincipalType
            Roles          = (@($bindings | ForEach-Object { $_.Name }) -join '; ')
        }
    }
)

$validation = @(
    foreach ($name in $roleExpected.Keys) {
        $matches = @($assignments | Where-Object { $_.PrincipalName -eq $name })
        $actual = if ($matches.Count) { (@($matches | ForEach-Object { $_.Roles }) -join '; ') } else { '(no direct assignment)' }
        $expected = $roleExpected[$name]
        [pscustomobject]@{
            Principal = $name; Expected = $expected; Actual = $actual;
            Match = ($actual -eq $expected)
        }
    }
)

$unexpected = @($assignments | Where-Object { $_.PrincipalName -notin @($roleExpected.Keys) })
$membership = @(
    foreach ($name in $groupNames) {
        try {
            $group = Get-PnPGroup -Identity $name
            $people = @(Get-PnPGroupMember -Group $group)
            if ($people.Count -eq 0) {
                [pscustomobject]@{ Group = $name; GroupId = $group.Id; User = ''; LoginName = ''; Count = 0; Note = 'Empty group' }
            } else {
                foreach ($p in $people) {
                    [pscustomobject]@{ Group = $name; GroupId = $group.Id; User = $p.Title; LoginName = $p.LoginName; Count = $people.Count; Note = '' }
                }
            }
        } catch {
            [pscustomobject]@{ Group = $name; GroupId = ''; User = ''; LoginName = ''; Count = -1; Note = "ERROR: $($_.Exception.Message)" }
        }
    }
)

# This tests effective access, including indirect group memberships. It does not
# certify a business action (Approve, Return, Sign etc.).
$effective = @(
    foreach ($upn in $TestUserUpns) {
        if ([string]::IsNullOrWhiteSpace($upn)) { continue }
        try {
            $user = @(Get-PnPUser | Where-Object { $_.Email -ieq $upn -or $_.LoginName -ieq $upn }) | Select-Object -First 1
            if (-not $user) { throw 'User not in the site User Information List; test with a known account or perform browser UAT.' }
            $permissionResult = $list.GetUserEffectivePermissions($user.LoginName)
            (Get-PnPContext).ExecuteQuery()
            $p = $permissionResult.Value
            [pscustomobject]@{
                UPN = $upn; LoginName = $user.LoginName
                View = $p.Has([Microsoft.SharePoint.Client.PermissionKind]::ViewListItems)
                Add = $p.Has([Microsoft.SharePoint.Client.PermissionKind]::AddListItems)
                Edit = $p.Has([Microsoft.SharePoint.Client.PermissionKind]::EditListItems)
                Delete = $p.Has([Microsoft.SharePoint.Client.PermissionKind]::DeleteListItems)
                ManagePermissions = $p.Has([Microsoft.SharePoint.Client.PermissionKind]::ManagePermissions)
                Error = ''
            }
        } catch {
            [pscustomobject]@{
                UPN = $upn; LoginName = ''; View = $null; Add = $null; Edit = $null
                Delete = $null; ManagePermissions = $null; Error = $_.Exception.Message
            }
        }
    }
)

$inventory = @()
if (Test-Path -LiteralPath $InventoryCsvPath) {
    foreach ($entry in @(Import-Csv -Path $InventoryCsvPath -Encoding UTF8)) {
        try {
            $target = Get-PnPList -Identity ([guid]$entry.ListGuid) -Includes HasUniqueRoleAssignments,ItemCount,Title
            $inventory += [pscustomobject]@{
                InternalName = $entry.InternalName; Guid = $entry.ListGuid;
                ExpectedDisplayName = $entry.DisplayName; ActualTitle = $target.Title;
                Wave = $entry.Wave; ItemCount = $target.ItemCount;
                UniquePermission = [bool]$target.HasUniqueRoleAssignments;
                Error = ''
            }
        } catch {
            $inventory += [pscustomobject]@{
                InternalName = $entry.InternalName; Guid = $entry.ListGuid;
                ExpectedDisplayName = $entry.DisplayName; ActualTitle = '';
                Wave = $entry.Wave; ItemCount = $null;
                UniquePermission = $null; Error = $_.Exception.Message
            }
        }
    }
}
$prefix = Join-Path $OutputDirectory "EMI_PAY_RBAC_V1.6_$stamp"
$assignments | Export-Csv "$prefix-PilotAssignments.csv" -NoTypeInformation -Encoding utf8BOM
$validation | Export-Csv "$prefix-PilotExpectations.csv" -NoTypeInformation -Encoding utf8BOM
$membership | Export-Csv "$prefix-GroupMembership.csv" -NoTypeInformation -Encoding utf8BOM
$effective | Export-Csv "$prefix-EffectiveUsers.csv" -NoTypeInformation -Encoding utf8BOM
$inventory | Export-Csv "$prefix-Inventory.csv" -NoTypeInformation -Encoding utf8BOM

$summary = [ordered]@{
    AuditTimestamp = (Get-Date).ToString('o')
    SiteUrl = $siteUrl
    PilotListGuid = [string]$list.Id
    PilotListName = $list.Title
    HasUniqueRoleAssignments = [bool]$list.HasUniqueRoleAssignments
    PilotItemCount = $list.ItemCount
    ExpectedDirectAssignmentsMatch = (@($validation | Where-Object { -not $_.Match }).Count -eq 0)
    UnexpectedDirectAssignmentsCount = $unexpected.Count
    UnexpectedDirectAssignments = $unexpected
    ExpectedRoles = $validation
    DirectAssignments = $assignments
    TestAccounts = $effective
    Inventory = $inventory
    Note = 'Read-only snapshot. Does not validate browser/API access or workflow authorizations.'
}
$summary | ConvertTo-Json -Depth 9 | Set-Content -Path "$prefix-Snapshot.json" -Encoding utf8

Write-Host "Pilot: $($list.Title) | GUID: $($list.Id) | Unique: $($list.HasUniqueRoleAssignments)" -ForegroundColor Cyan
$validation | Format-Table -AutoSize
if ($unexpected.Count) {
    Write-Warning 'Unexpected DIRECT role assignments detected. Inspect PilotAssignments.csv; Limited Access may be automatic.'
    $unexpected | Format-Table -AutoSize
}
if ($effective.Count) { $effective | Format-Table -AutoSize }
Write-Host "Reports saved to: $OutputDirectory" -ForegroundColor Green
Write-Host 'Nothing has been changed on SharePoint.' -ForegroundColor Green
