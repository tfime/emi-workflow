#Requires -Version 7.2
#Requires -Modules PnP.PowerShell
<#
EMI PAY CECM — RBAC Wave 1 V1.7.1
Default = PREVIEW ONLY. No changes unless -Mode Apply.
Uses GUIDs & role definition IDs learned from the already-verified Pilot;
therefore independent of English/Vietnamese role names.

Preview entire wave:  .\EMI_PAY_RBAC_Wave1_V1.7.1.ps1
Apply one list:      .\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Apply -Target EMI_PAY_OrgUnits
Apply all 7 lists:   .\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Apply -AllWave1
Rollback a run:     .\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Rollback -RunDir 'C:\...\EMI_PAY_RBAC_W1_...'

Important: Only runs after manually connecting PnP to https://emicomvn.sharepoint.com/sites/cecm.
Read-only preview and explicit bounded application. NEVER touches the Pilot, Wave 2/3,
items/folders, the site permissions or other sites.
#>
[CmdletBinding()]
param(
    [ValidateSet('Preview','Apply','Rollback')]
    [string]$Mode = 'Preview',
    [ValidateSet('All','EMI_PAY_OrgUnits','EMI_PAY_OrgMembers','EMI_PAY_WorkflowVersions',
                 'EMI_PAY_WorkflowSteps','EMI_PAY_ChecklistTemplates',
                 'EMI_PAY_StepRecipients','EMI_PAY_SystemSettings')]
    [string]$Target = 'All',
    [switch]$AllWave1,
    [string]$RunDir = '',
    [string]$InventoryPath = (Join-Path $PSScriptRoot 'EMI_PAY_Inventory_23.csv')
)

$ErrorActionPreference = 'Stop'
$siteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
$pilotGuid = [guid]'60bb23f6-4702-4aed-b36f-b2b20b09e74d'
$wave1Names = @('EMI_PAY_OrgUnits','EMI_PAY_OrgMembers','EMI_PAY_WorkflowVersions',
    'EMI_PAY_WorkflowSteps','EMI_PAY_ChecklistTemplates','EMI_PAY_StepRecipients',
    'EMI_PAY_SystemSettings')

# This draft follows the Pilot ACL for six Lists. SystemSettings is deliberately
# restricted: PROCADM is not granted access until a business-approved policy exists.
$plan = [ordered]@{}
foreach ($name in $wave1Names) {
    $plan[$name] = @('OWNER:Full','GR-PAY-SYSADM:Full','GR-PAY-FLOW-SVC:Full')
    if ($name -ne 'EMI_PAY_SystemSettings') {
        $plan[$name] += 'GR-PAY-PROCADM:Contribute'
    }
}

function Assert-Site {
    $connection = Get-PnPConnection
    if (-not $connection) { throw 'Please connect PnP to CECM first.' }
    if ($connection.Url.TrimEnd('/') -ine $siteUrl) {
        throw "Wrong PnP connection: $($connection.Url). Expected $siteUrl"
    }
    $script:ctx = Get-PnPContext
    if (-not $script:ctx) { throw 'PnP CSOM context unavailable.' }
}

function Get-Assignments($obj) {
    Get-PnPProperty -ClientObject $obj -Property RoleAssignments | Out-Null
    $rows = @(
        foreach ($ra in $obj.RoleAssignments) {
            $p = Get-PnPProperty -ClientObject $ra -Property Member
            Get-PnPProperty -ClientObject $p -Property Id,Title,PrincipalType | Out-Null

            # V1.7.1: Get-PnPProperty returns ONE RoleDefinitionBindingCollection.
            # Iterate its RoleDefinition elements explicitly; do not read Id on collection.
            $bindings = Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings
            $defs = @(
                foreach ($def in $bindings) {
                    Get-PnPProperty -ClientObject $def -Property Id,Name,RoleTypeKind | Out-Null
                    $def
                }
            )
            [pscustomobject]@{
                PrincipalId = [int]$p.Id
                PrincipalName = [string]$p.Title
                PrincipalType = [string]$p.PrincipalType
                RoleIds = @($defs | ForEach-Object { [int]$_.Id } | Sort-Object)
                RoleNames = @($defs | ForEach-Object { [string]$_.Name })
                PrincipalObject = $p
                RoleAssignmentObject = $ra
            }
        }
    )
    return $rows
}

function Get-ListInfo([guid]$guid) {
    $l = Get-PnPList -Identity $guid -Includes Title,ItemCount,HasUniqueRoleAssignments,RoleAssignments,BaseTemplate
    if (-not $l -or $l.Id -ne $guid) { throw "GUID mismatch for $guid" }
    return $l
}

function Get-Snapshot($l,$name) {
    $rows = @(Get-Assignments $l)
    return [pscustomobject]@{
        Name = $name
        Guid = [string]$l.Id
        DisplayName = [string]$l.Title
        ItemCount = [int]$l.ItemCount
        Unique = [bool]$l.HasUniqueRoleAssignments
        Assignments = @($rows | ForEach-Object {
            [pscustomobject]@{ PrincipalId = $_.PrincipalId; PrincipalName = $_.PrincipalName;
                PrincipalType = $_.PrincipalType; RoleIds = @($_.RoleIds); RoleNames = @($_.RoleNames) }
        })
    }
}

function Get-AclSignature($rows) {
    return ((@($rows | ForEach-Object {
        '{0}:{1}' -f $_.PrincipalId, ((@($_.RoleIds | Sort-Object) -join ','))
    } | Sort-Object) -join '|'))
}

function Get-PilotConfiguration {
    $pilot = Get-ListInfo $pilotGuid
    if (-not $pilot.HasUniqueRoleAssignments) { throw 'Pilot no longer has unique role assignments. STOP.' }
    $entries = @(Get-Assignments $pilot)
    if ($entries.Count -ne 4) { throw 'Pilot does not have exactly four direct ACL entries. STOP.' }
    $owner = @($entries | Where-Object { $_.PrincipalType -eq 'SharePointGroup' -and $_.PrincipalName -notlike 'GR-PAY-*' })
    if ($owner.Count -ne 1) { throw 'Unable to uniquely identify CECM owner group from Pilot.' }
    $map = @{}
    foreach ($row in $entries) { $map[$row.PrincipalName] = $row }
    foreach ($key in @('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM')) {
        if (-not $map.ContainsKey($key)) { throw "Missing Pilot principal $key" }
        if ($map[$key].PrincipalType -ne 'SharePointGroup') { throw "Not a SharePoint group: $key" }
        if (@($map[$key].RoleIds).Count -ne 1) { throw "Unexpected number of Pilot role bindings for $key" }
    }
    if (@($owner[0].RoleIds).Count -ne 1) { throw 'Unexpected owner role bindings on Pilot.' }
    $fullRoleId = [int]$map['GR-PAY-SYSADM'].RoleIds[0]
    $contribRoleId = [int]$map['GR-PAY-PROCADM'].RoleIds[0]
    if ($fullRoleId -eq $contribRoleId -or
        [int]$owner[0].RoleIds[0] -ne $fullRoleId -or
        [int]$map['GR-PAY-FLOW-SVC'].RoleIds[0] -ne $fullRoleId) {
        throw 'Pilot role IDs are inconsistent. STOP.'
    }
    $defs = @(Get-PnPRoleDefinition)
    $full = @($defs | Where-Object { $_.Id -eq $fullRoleId -and [string]$_.RoleTypeKind -eq 'Administrator' })
    $contrib = @($defs | Where-Object { $_.Id -eq $contribRoleId -and [string]$_.RoleTypeKind -eq 'Contributor' })
    if ($full.Count -ne 1 -or $contrib.Count -ne 1) {
        throw 'Role IDs on Pilot are not the built-in Administrator/Contributor kinds. STOP.'
    }
    $groups = @{
        'OWNER' = $owner[0].PrincipalObject
        'GR-PAY-SYSADM' = $map['GR-PAY-SYSADM'].PrincipalObject
        'GR-PAY-FLOW-SVC' = $map['GR-PAY-FLOW-SVC'].PrincipalObject
        'GR-PAY-PROCADM' = $map['GR-PAY-PROCADM'].PrincipalObject
    }
    return [pscustomobject]@{ Roles = @{ Full = $full[0]; Contribute = $contrib[0] }; Groups = $groups }
}

function Get-ExpectedRows($name,$cfg) {
    return @(
        foreach ($spec in $plan[$name]) {
            $parts = $spec.Split(':')
            $group = $cfg.Groups[$parts[0]]
            $role = $cfg.Roles[$parts[1]]
            if (-not $group -or -not $role) { throw "Unresolved ACL component $spec" }
            [pscustomobject]@{ PrincipalId = [int]$group.Id; PrincipalName = [string]$group.Title;
                PrincipalObject = $group; RoleId = [int]$role.Id; RoleObject = $role }
        }
    )
}

function Test-AclEqual($currentRows,$expectedRows) {
    if (@($currentRows).Count -ne @($expectedRows).Count) { return $false }
    foreach ($expected in $expectedRows) {
        $hit = @($currentRows | Where-Object { $_.PrincipalId -eq $expected.PrincipalId })
        if ($hit.Count -ne 1) { return $false }
        if (@($hit[0].RoleIds).Count -ne 1 -or [int]$hit[0].RoleIds[0] -ne $expected.RoleId) { return $false }
    }
    return $true
}

function Add-Role($l,$principal,$role) {
    $collection = [Microsoft.SharePoint.Client.RoleDefinitionBindingCollection]::new($script:ctx)
    $collection.Add($role)
    $l.RoleAssignments.Add($principal,$collection) | Out-Null
    $script:ctx.ExecuteQuery()
}

function Ensure-Role($l,$expected) {
    $rows = @(Get-Assignments $l)
    $matching = @($rows | Where-Object { $_.PrincipalId -eq $expected.PrincipalId })
    if ($matching.Count -gt 1) { throw "Duplicate SharePoint role assignment for $($expected.PrincipalName)" }
    if ($matching.Count -eq 1) {
        if (@($matching[0].RoleIds).Count -eq 1 -and
            [int]$matching[0].RoleIds[0] -eq $expected.RoleId) { return }
        $matching[0].RoleAssignmentObject.DeleteObject()
        $script:ctx.ExecuteQuery()
    }
    Add-Role $l $expected.PrincipalObject $expected.RoleObject
}

function Apply-List($l,$expected) {
    # Keep existing site ACL while making it unique. Never clear child scopes.
    $l.BreakRoleInheritance($true,$false)
    $script:ctx.ExecuteQuery()
    $l = Get-ListInfo ([guid]$l.Id)
    # Secure admin groups first; only afterward remove inherited extra principals.
    foreach ($e in $expected) { Ensure-Role $l $e }
    $rows = @(Get-Assignments $l)
    $allowedIds = @($expected | ForEach-Object { $_.PrincipalId })
    foreach ($r in $rows) {
        if ($r.PrincipalId -notin $allowedIds) {
            $r.RoleAssignmentObject.DeleteObject()
            $script:ctx.ExecuteQuery()
        }
    }
    $confirmed = Get-ListInfo ([guid]$l.Id)
    $confirmedRows = @(Get-Assignments $confirmed)
    if (-not $confirmed.HasUniqueRoleAssignments -or
        -not (Test-AclEqual $confirmedRows $expected)) {
        throw "Post-apply ACL verification FAILED for $($l.Id)"
    }
    return (Get-Snapshot $confirmed 'Verified')
}

function Write-JsonFile($obj,[string]$path) {
    $obj | ConvertTo-Json -Depth 12 | Set-Content -Path $path -Encoding utf8
}

Assert-Site
$inventory = @(Import-Csv -Path $InventoryPath -Encoding utf8)
$w1 = @($inventory | Where-Object { $_.Wave -eq '1' })
if ($w1.Count -ne 7 -or (@($w1 | ForEach-Object { $_.InternalName } | Sort-Object) -join ',') -ne
    (@($wave1Names | Sort-Object) -join ',')) { throw 'Inventory Wave 1 whitelist mismatch. STOP.' }
if (@($inventory | Where-Object { $_.InternalName -eq 'EMI_PAY_PaymentTypes' -and $_.ListGuid -eq [string]$pilotGuid }).Count -ne 1) {
    throw 'Pilot GUID is not consistent with inventory. STOP.'
}

# Rollback applies only to lists actually changed by an earlier Wave 1 run.
if ($Mode -eq 'Rollback') {
    if ([string]::IsNullOrWhiteSpace($RunDir)) { throw 'Rollback requires -RunDir pointing to an Apply run folder.' }
    $manifestPath = Join-Path $RunDir 'run-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Missing run-manifest.json. Nothing will be changed.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($manifest.SiteUrl -ne $siteUrl -or $manifest.Mode -ne 'Apply') { throw 'Rollback manifest is for another site or mode.' }
    $web = Get-PnPWeb -Includes RoleAssignments
    $liveSiteSig = Get-AclSignature @(Get-Assignments $web)
    if ($liveSiteSig -ne $manifest.SiteAclSignature) { throw 'Site ACL differs since Apply: unsafe to restore inherited permissions. STOP.' }
    $progress = @($manifest.Applied)
    if ($progress.Count -eq 0) { throw 'No successfully applied list recorded in this run.' }
    Write-Host "Rollback: $($progress.Count) successfully applied Wave 1 list(s) in reverse order" -ForegroundColor Yellow
    [array]::Reverse($progress)
    foreach ($entry in $progress) {
        if ($entry.InternalName -notin $wave1Names) { throw "Non-wave1 target in rollback manifest: $($entry.InternalName)" }
        $beforePath = Join-Path $RunDir ("before-{0}.json" -f $entry.InternalName)
        if (-not (Test-Path $beforePath)) { throw "Missing snapshot for $($entry.InternalName)" }
        $before = Get-Content $beforePath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($before.Unique -or $before.ItemCount -ne 0 -or $before.Guid -ne $entry.Guid) {
            throw "Cannot safely rollback $($entry.InternalName) with inherited reset; stop."
        }
        $l = Get-ListInfo ([guid]$entry.Guid)
        if ($l.ItemCount -ne 0) { throw "List now contains items: $($entry.InternalName). STOP." }
        if (-not $l.HasUniqueRoleAssignments) {
            Write-Host "Already inherited: $($entry.InternalName)" -ForegroundColor DarkGray
            continue
        }
        $l.ResetRoleInheritance()
        $script:ctx.ExecuteQuery()
        $check = Get-ListInfo ([guid]$entry.Guid)
        if ($check.HasUniqueRoleAssignments) { throw "Rollback verification FAILED: $($entry.InternalName)" }
        Write-Host "ROLLED BACK: $($entry.InternalName)" -ForegroundColor Green
    }
    Write-Host 'Rollback completed. Re-run the V1.6 audit to confirm inventory.' -ForegroundColor Green
    return
}

$cfg = Get-PilotConfiguration
$chosen = if ($Target -eq 'All') { $w1 } else { @($w1 | Where-Object { $_.InternalName -eq $Target }) }
if ($Mode -eq 'Apply' -and $Target -eq 'All' -and -not $AllWave1) {
    throw 'Apply to all 7 requires explicit -AllWave1. For one list, use -Target EMI_PAY_OrgUnits.'
}
if ($chosen.Count -eq 0) { throw 'No listed targets selected.' }

$web = Get-PnPWeb -Includes RoleAssignments
$siteAclSignature = Get-AclSignature @(Get-Assignments $web)
if ([string]::IsNullOrWhiteSpace($RunDir)) {
    $RunDir = Join-Path (Get-Location) ('EMI_PAY_RBAC_W1_' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
$manifestFile = Join-Path $RunDir 'run-manifest.json'
$manifest = [ordered]@{ Mode=$Mode; SiteUrl=$siteUrl; Timestamp=(Get-Date).ToString('o');
    PilotGuid=[string]$pilotGuid; SiteAclSignature=$siteAclSignature; Applied=@(); Skipped=@() }
Write-JsonFile $manifest $manifestFile

foreach ($entry in $chosen) {
    $name = $entry.InternalName
    $guid = [guid]$entry.ListGuid
    if ($guid -eq $pilotGuid -or $name -notin $wave1Names) { throw "Out of scope: $name" }
    $l = Get-ListInfo $guid
    if ($l.BaseTemplate -ne 100 -or [string]$entry.Type -ne 'List') {
        throw "Expected a standard List for $name"
    }
    $before = Get-Snapshot $l $name
    if ($l.Title -ne $entry.DisplayName -or $l.ItemCount -ne 0) {
        throw "Unexpected title or data exists: $name. STOP."
    }
    $expected = @(Get-ExpectedRows $name $cfg)
    $acls = @(Get-Assignments $l)
    if ($before.Unique) {
        if (Test-AclEqual $acls $expected) {
            Write-Host "SKIP (already correct): $name" -ForegroundColor DarkGray
            $manifest.Skipped += [ordered]@{ InternalName=$name; Guid=[string]$guid }
            Write-JsonFile $manifest $manifestFile
            continue
        }
        throw "Existing unique ACL differs from plan: $name. STOP; no overwrite."
    }
    $beforeFile = Join-Path $RunDir ("before-{0}.json" -f $name)
    Write-JsonFile $before $beforeFile
    Write-Host "${name} | Existing: INHERITED | Rows: $($l.ItemCount) | Plan: $(@($expected | ForEach-Object { $_.PrincipalName + '=' + $_.RoleId }) -join '; ')"
    if ($Mode -eq 'Preview') { continue }
    try {
        $after = Apply-List $l $expected
        Write-JsonFile $after (Join-Path $RunDir ("after-{0}.json" -f $name))
        $manifest.Applied += [ordered]@{ InternalName=$name; Guid=[string]$guid }
        Write-JsonFile $manifest $manifestFile
        Write-Host "PASS: $name" -ForegroundColor Green
    } catch {
        Write-Host "FAIL: $name -- $($_.Exception.Message)" -ForegroundColor Red
        # No automatic rollback: prevent re-opening sensitive data without an operator decision.
        # Record partially changed list for explicit rollback, even when apply failed mid-flight.
        $manifest.Applied += [ordered]@{ InternalName=$name; Guid=[string]$guid }
        Write-JsonFile $manifest $manifestFile
        throw "Stopped after failure. Use -Mode Rollback -RunDir '$RunDir' after checking the snapshot."
    }
}
Write-Host "Reports and snapshots: $RunDir" -ForegroundColor Cyan
if ($Mode -eq 'Preview') {
    Write-Host 'PREVIEW ONLY. Nothing changed on SharePoint.' -ForegroundColor Green
} else {
    Write-Host 'Wave 1 apply completed. Review all after-*.json files.' -ForegroundColor Green
}
