#requires -Version 7.4
<#
EMI PAY CECM - RBAC PILOT V1.5
One-list pilot ONLY: EMI_PAY_PaymentTypes.
Preview: read only. Apply: unique permissions for this list ONLY, store prior snapshot locally.
Rollback: reset list to inherit from site (only suitable for pilot previously inherited).
NO other lists/libraries are modified.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ClientId,
    [ValidateSet('Preview','Apply','Rollback')][string]$Mode = 'Preview',
    [switch]$ConfirmPilot
)
$ErrorActionPreference='Stop'
$SiteUrl='https://emicomvn.sharepoint.com/sites/cecm'
$Target='Lists/EMI_PAY_PaymentTypes'
$AllowedNames=@('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM')
$OutputDir=Join-Path $PSScriptRoot 'RBAC_Pilot_Reports'

if ($Mode -ne 'Preview' -and -not $ConfirmPilot) {
    throw 'For Apply/Rollback, add -ConfirmPilot only after reviewing Preview output.'
}
$conn=Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId -ForceAuthentication -ReturnConnection
if ($null -eq $conn) { throw 'Authentication did not return a PnP connection' }
$web=Get-PnPWeb -Includes CurrentUser,AssociatedOwnerGroup -Connection $conn
$who=$web.CurrentUser
$owners=[string]$web.AssociatedOwnerGroup.Title
if (-not $who.IsSiteAdmin) { throw 'Current user is not a Site Collection Administrator. Abort.' }
if ([string]::IsNullOrWhiteSpace($owners)) { throw 'Owner group cannot be resolved. Abort.' }
foreach ($name in $AllowedNames) {
    if (-not (Get-PnPGroup -Identity $name -Connection $conn -ErrorAction SilentlyContinue)) {
        throw "Required group missing: $name"
    }
}
$roles=@(Get-PnPRoleDefinition -Connection $conn)
$full=@($roles | Where-Object { [string]$_.RoleTypeKind -eq 'Administrator' }) | Select-Object -First 1
$contrib=@($roles | Where-Object { [string]$_.RoleTypeKind -eq 'Contributor' }) | Select-Object -First 1
if (-not $full -or -not $contrib) { throw 'Full Control or Contribute role not found' }
$list=Get-PnPList -Identity $Target -Includes HasUniqueRoleAssignments,ItemCount -Connection $conn -ThrowExceptionIfListNotFound
if ($null -eq $list) { throw 'Target list not found. Abort.' }
if ([string]$list.Title -ne 'Danh mục loại hồ sơ thanh toán') {
    throw "Unexpected target list title: $($list.Title)"
}
if ($list.ItemCount -gt 0) {
    throw "Pilot list has $($list.ItemCount) items. Refuse to modify access until reviewed."
}
function Read-PilotAssignments {
    param([object]$Securable)
    Get-PnPProperty -ClientObject $Securable -Property RoleAssignments -Connection $conn | Out-Null
    $rows=@()
    foreach($ra in $Securable.RoleAssignments){
        $pr=Get-PnPProperty -ClientObject $ra -Property Member -Connection $conn
        $roleBindings=Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings -Connection $conn
        $rows+= [pscustomobject]@{
            Principal=[string]$pr.Title
            PrincipalType=[string]$pr.PrincipalType
            RoleNames=(@($roleBindings | ForEach-Object { [string]$_.Name }) -join '; ')
            RoleAssignment=$ra
        }
    }
    return $rows
}
function Display-PilotAssignments {
    param([object]$Securable)
    $rows=@(Read-PilotAssignments -Securable $Securable)
    $rows | Select-Object Principal,PrincipalType,RoleNames | Format-Table -AutoSize | Out-Host
}
Write-Host "Site: $SiteUrl" -ForegroundColor Cyan
Write-Host "Pilot list: $Target | Mode: $Mode"
Write-Host "Current: $($who.Title) | SiteAdmin=$($who.IsSiteAdmin) | Owners: $owners"
Write-Host "Role definitions: $($full.Name) / $($contrib.Name)"
Write-Host "ItemCount=$($list.ItemCount) | HasUniqueRoleAssignments=$($list.HasUniqueRoleAssignments)"

if ($Mode -eq 'Preview') {
    if ($list.HasUniqueRoleAssignments) { Write-Warning 'List already has unique permissions. Do NOT apply again blindly.' }
    Write-Host 'Site permissions (currently inherited by the list):' -ForegroundColor Yellow
    Display-PilotAssignments -Securable $web
    Write-Host 'PROPOSED for this ONE list only:'
    Write-Host "  $owners : $($full.Name)"
    Write-Host "  GR-PAY-SYSADM : $($full.Name)"
    Write-Host "  GR-PAY-FLOW-SVC : $($full.Name)"
    Write-Host "  GR-PAY-PROCADM : $($contrib.Name)"
    Write-Host '  Other inherited groups/direct grants: removed from this one list during Apply.'
    Write-Host 'PREVIEW ONLY - no SharePoint changes.' -ForegroundColor Green
    return
}

if ($Mode -eq 'Rollback') {
    if (-not $list.HasUniqueRoleAssignments) {
        Write-Host 'Already inheriting site permissions. Nothing to roll back.' -ForegroundColor Green
        return
    }
    # Restore original inheritance. This does not change site rights or any other list.
    $list.ResetRoleInheritance()
    Invoke-PnPQuery -Connection $conn
    $check=Get-PnPList -Identity $Target -Includes HasUniqueRoleAssignments -Connection $conn
    if ($check.HasUniqueRoleAssignments) { throw 'Rollback validation failed: list remains unique.' }
    Write-Host 'ROLLBACK SUCCESS: pilot list once again inherits site permissions.' -ForegroundColor Green
    return
}

# Apply: starting state must be inherited (as confirmed in audit), empty list.
if ($list.HasUniqueRoleAssignments) { throw 'Pilot already has unique permissions. Stop and inspect or use Rollback.' }
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$before=@(Read-PilotAssignments -Securable $web)
$report=Join-Path $OutputDir ('payment-types-before-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.csv')
$before | Select-Object Principal,PrincipalType,RoleNames | Export-Csv -LiteralPath $report -NoTypeInformation -Encoding utf8BOM
Write-Host "Saved current site assignment snapshot: $report"
$changed=$false
try {
    # Copy existing assignments first; do not lock out anyone before Owner/SYSADM are secured.
    Set-PnPList -Identity $list.Id -BreakRoleInheritance -CopyRoleAssignments -Connection $conn
    $changed=$true
    Write-Host 'Broke inheritance (copied site grants temporarily).'
    Set-PnPListPermission -Identity $list.Id -Group $owners -AddRole $full.Name -Connection $conn
    Set-PnPListPermission -Identity $list.Id -Group 'GR-PAY-SYSADM' -AddRole $full.Name -Connection $conn
    Set-PnPListPermission -Identity $list.Id -Group 'GR-PAY-FLOW-SVC' -AddRole $full.Name -Connection $conn
    Set-PnPListPermission -Identity $list.Id -Group 'GR-PAY-PROCADM' -AddRole $contrib.Name -Connection $conn

    # Remove ALL prior site-level principals not among the FOUR explicitly allowed groups.
    $allowed=@($owners)+$AllowedNames
    $fresh=Get-PnPList -Identity $Target -Includes HasUniqueRoleAssignments -Connection $conn
    foreach($r in @(Read-PilotAssignments -Securable $fresh)) {
        if ($r.Principal -notin $allowed) {
            Write-Host "  REMOVE inherited grant: $($r.Principal) ($($r.RoleNames))"
            $r.RoleAssignment.DeleteObject()
            Invoke-PnPQuery -Connection $conn
        }
    }
    $final=Get-PnPList -Identity $Target -Includes HasUniqueRoleAssignments -Connection $conn
    $finalAssignments=@(Read-PilotAssignments -Securable $final)
    $names=@($finalAssignments | ForEach-Object { $_.Principal })
    foreach($need in $allowed) {
        if ($need -notin $names) { throw "Validation failed: expected group missing: $need" }
    }
    $extras=@($names | Where-Object { $_ -notin $allowed })
    if ($extras.Count -gt 0) { throw "Validation failed; extra permissions: $($extras -join ', ')" }
    if (-not $final.HasUniqueRoleAssignments) { throw 'Validation failed: list still inherits site permissions' }
    Write-Host 'PILOT APPLIED to EMI_PAY_PaymentTypes ONLY.' -ForegroundColor Green
    $finalAssignments | Select-Object Principal,PrincipalType,RoleNames | Format-Table -AutoSize | Out-Host
} catch {
    Write-Warning "Apply failed: $($_.Exception.Message)"
    if ($changed) {
        Write-Warning 'Attempting rollback to inherited site permissions.'
        try {
            $restore=Get-PnPList -Identity $Target -Connection $conn
            $restore.ResetRoleInheritance()
            Invoke-PnPQuery -Connection $conn
            Write-Warning 'Rolled back to inherited site permissions.'
        } catch {
            Write-Error "ROLLBACK FAILED. List requires manual review: $($_.Exception.Message)"
        }
    }
    throw
}
