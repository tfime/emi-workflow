#requires -Version 7.4
<#
EMI PAY CECM - RBAC READ ONLY AUDIT V1.4.1
- Reads permissions for the CECM site and exactly 23 EMI_PAY Lists/Libraries.
- Exports report files only to LOCAL disk.
- Does not create groups, change permissions, break inheritance, or upload data.
- Report is an inventory snapshot; NOT an automated restore point.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$ClientId,
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$SchemaPath = (Join-Path $PSScriptRoot 'schema.json'),
    [string]$OutputFolder = (Join-Path $PSScriptRoot ('RBAC_Audit_' + (Get-Date -Format 'yyyyMMdd_HHmmss')))
)

$ErrorActionPreference = 'Stop'
$target = 'https://emicomvn.sharepoint.com/sites/cecm'
if ($SiteUrl.TrimEnd('/') -ne $target) { throw "Safety check: only $target can be audited" }
if (!(Test-Path -LiteralPath $SchemaPath)) { throw "Missing schema: $SchemaPath" }
$schema = Get-Content -LiteralPath $SchemaPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($schema.siteUrl -ne $target -or $schema.components.Count -ne 23) {
    throw 'Unexpected schema site or component count; aborting'
}
foreach ($c in $schema.components) {
    if (!([string]$c.name).StartsWith('EMI_PAY_')) { throw "Out-of-scope object: $($c.name)" }
}

$conn = Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive -ForceAuthentication -ReturnConnection
if (!$conn) { throw 'Could not obtain authenticated PnP connection' }

function Read-RoleAssignments {
    param(
        [Parameter(Mandatory=$true)]$Securable,
        [Parameter(Mandatory=$true)][string]$Scope,
        [Parameter(Mandatory=$true)][string]$ObjectName,
        [bool]$UniquePermissions = $false
    )
    $result = @()
    # IMPORTANT: Get-PnPProperty returns a RoleAssignmentCollection object here.
    # Do NOT wrap its return in @(...), or the foreach loop treats the whole
    # collection as one RoleAssignment and fails on its non-existent Member property.
    Get-PnPProperty -ClientObject $Securable -Property RoleAssignments -Connection $conn | Out-Null
    foreach ($ra in $Securable.RoleAssignments) {
        $member = Get-PnPProperty -ClientObject $ra -Property Member -Connection $conn
        $bindings = Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings -Connection $conn
        Get-PnPProperty -ClientObject $member -Property Id,Title,LoginName,PrincipalType -Connection $conn | Out-Null
        $roles = @($bindings | ForEach-Object { [string]$_.Name })
        $result += [pscustomobject]@{
            Scope = $Scope
            ObjectName = $ObjectName
            UniquePermissions = $UniquePermissions
            PrincipalId = [int]$member.Id
            PrincipalTitle = [string]$member.Title
            PrincipalLogin = [string]$member.LoginName
            PrincipalType = [string]$member.PrincipalType
            PermissionLevels = ($roles -join '; ')
        }
    }
    return $result
}

$web = Get-PnPWeb -Includes AssociatedOwnerGroup,RoleAssignments -Connection $conn
$ownerGroup = [string]$web.AssociatedOwnerGroup.Title
if ([string]::IsNullOrWhiteSpace($ownerGroup)) { throw 'Cannot determine the Site Owners group' }

$sitePermissions = @(Read-RoleAssignments -Securable $web -Scope 'Web' -ObjectName $SiteUrl -UniquePermissions $true)
$inventory = @()
$listPermissions = @()
foreach ($component in $schema.components) {
    $name = [string]$component.name
    $relative = if ([string]$component.kind -eq 'DocumentLibrary') { $name } else { "Lists/$name" }
    $list = Get-PnPList -Identity $relative -Includes HasUniqueRoleAssignments -Connection $conn -ThrowExceptionIfListNotFound
    $isUnique = [bool]$list.HasUniqueRoleAssignments
    $inventory += [pscustomobject]@{
        InternalName = $name
        DisplayName = [string]$list.Title
        Kind = [string]$component.kind
        ListId = [string]$list.Id
        HasUniquePermissions = $isUnique
        SourceOfPermissions = $(if ($isUnique) { 'List/Library' } else { 'Inherited from site' })
    }
    # Inherited lists must be interpreted using the Web permissions snapshot.
    # Only export direct assignments when the list has unique permissions.
    if ($isUnique) {
        $listPermissions += @(Read-RoleAssignments -Securable $list -Scope 'List' -ObjectName $name -UniquePermissions $true)
    }
    Write-Host ("AUDIT {0,-36} {1}" -f $name, $(if ($isUnique) { 'UNIQUE' } else { 'INHERITS SITE' }))
}

$groupsToCheck = @('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM','GR-PAY-CHAIR','GR-PAY-TCKT','GR-PAY-USERS','GR-PAY-AUDIT')
$groups = @()
foreach ($g in $groupsToCheck) {
    $group = Get-PnPGroup -Identity $g -Connection $conn -ErrorAction SilentlyContinue
    $groups += [pscustomobject]@{
        GroupName = $g
        Exists = ($null -ne $group)
        GroupId = $(if ($group) { [string]$group.Id } else { '' })
        IsSiteOwnerGroup = ($g -eq $ownerGroup)
    }
}

New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null
$inventory | Export-Csv -LiteralPath (Join-Path $OutputFolder '01-list-inheritance.csv') -NoTypeInformation -Encoding utf8BOM
$sitePermissions | Export-Csv -LiteralPath (Join-Path $OutputFolder '02-site-permissions.csv') -NoTypeInformation -Encoding utf8BOM
if ($listPermissions.Count) {
    $listPermissions | Export-Csv -LiteralPath (Join-Path $OutputFolder '03-unique-list-permissions.csv') -NoTypeInformation -Encoding utf8BOM
} else {
    'No EMI_PAY list or library currently has unique permissions.' | Set-Content -LiteralPath (Join-Path $OutputFolder '03-unique-list-permissions.txt') -Encoding utf8
}
$groups | Export-Csv -LiteralPath (Join-Path $OutputFolder '04-emi-pay-groups.csv') -NoTypeInformation -Encoding utf8BOM
@"
Site: $SiteUrl
Audit time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')
Site Owners group: $ownerGroup
Audited lists/libraries: $($inventory.Count)
Lists/libraries inheriting site rights: $(@($inventory | Where-Object { -not $_.HasUniquePermissions }).Count)
Lists/libraries with unique rights: $(@($inventory | Where-Object { $_.HasUniquePermissions }).Count)
Known EMI PAY groups: $(@($groups | Where-Object {$_.Exists}).Count) / 7
This directory contains a READ-ONLY permission inventory, not a restore script.
It does not inspect individual file/item unique permissions, sharing links or external identities.
"@ | Set-Content -LiteralPath (Join-Path $OutputFolder '00-SUMMARY.txt') -Encoding utf8

Write-Host ""
Write-Host "READ-ONLY RBAC AUDIT COMPLETED" -ForegroundColor Green
Write-Host "Reports: $OutputFolder"
Write-Host "EMI_PAY objects: $($inventory.Count) | Unique rights: $(@($inventory | Where-Object {$_.HasUniquePermissions}).Count)"
Write-Warning 'Do not run the old Baseline script. Next: pilot permission test on ONE list after inspecting this snapshot.'
