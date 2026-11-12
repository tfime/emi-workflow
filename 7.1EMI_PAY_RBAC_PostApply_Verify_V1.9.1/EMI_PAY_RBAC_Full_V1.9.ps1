#Requires -Version 7.2
#Requires -Modules PnP.PowerShell
<#
EMI PAY / CECM - RBAC FULL V1.9  |  Static List/Library ACL baseline

ONE-PASS application with preflight, snapshots, per-target validation and final audit:
  .\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Apply

Read-only audit of all 23:
  .\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Audit

Optional read-only preflight:
  .\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Preview

Operator-initiated rollback ONLY of lists changed during this V1.9 run:
  .\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Rollback -RunDir '<FULL PATH OF APPLY RUN FOLDER>'

Connect-PnPOnline to https://emicomvn.sharepoint.com/sites/cecm beforehand.
The already-approved Pilot and Wave1 are audited but NEVER modified.
The 15 remaining objects are modified only if they still inherit from the CECM site,
contain zero items, and pass ALL preflight checks. Existing different unique ACL -> STOP.
This script NEVER modifies site ACL, item/folder ACL, group membership or any other site.
It does NOT implement per-payment-record dynamic security or workflow authorization.
#>

[CmdletBinding()]
param(
    [ValidateSet('Preview','Apply','Audit','Rollback')]
    [string]$Mode = 'Preview',
    [string]$RunDir = '',
    [string]$InventoryPath = (Join-Path $PSScriptRoot 'EMI_PAY_Inventory_23.csv')
)

$ErrorActionPreference = 'Stop'
$siteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
$pilotGuid = [guid]'60bb23f6-4702-4aed-b36f-b2b20b09e74d'
$expectedInventorySha256 = '3C6A20315496DA6137896A39EC1AA476C622EFE2F23EE09CAB5295E4D0AE9A4D'
$expectedWaves = @{ '0' = 1; '1' = 7; '2' = 10; '3' = 5 }
$groupsRequired = @('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM',
    'GR-PAY-CHAIR','GR-PAY-TCKT','GR-PAY-USERS','GR-PAY-AUDIT')

# Exact static container ACL. Rights to view/edit a particular payment record will be
# provisioned separately by authorized workflow code, NOT broadly at list/library root.
# PROCADM on Pilot and 6 Wave1 config lists preserves already-applied V1.7.1 policy.
# SystemSettings excludes PROCADM. AUDIT may read the internal activity log.
# NOTE: USERS/CHAIR/TCKT are deliberately NOT granted global access to all payments.
$configurationNames = @(
    'EMI_PAY_PaymentTypes','EMI_PAY_OrgUnits','EMI_PAY_OrgMembers',
    'EMI_PAY_WorkflowVersions','EMI_PAY_WorkflowSteps',
    'EMI_PAY_ChecklistTemplates','EMI_PAY_StepRecipients'
)
$runtimeNames = @(
    'EMI_PAY_Commands','EMI_PAY_Assignments','EMI_PAY_WorkItems',
    'EMI_PAY_StepReviews','EMI_PAY_ActivityInternal','EMI_PAY_ArchiveJobs',
    'EMI_PAY_DocumentIndex','EMI_PAY_Notifications',
    'EMI_PAY_ChecklistItems','EMI_PAY_ActivityPublic'
)
$protectedNames = @(
    'EMI_PAY_Requests','EMI_PAY_DocsWorking','EMI_PAY_DocsInternal',
    'EMI_PAY_ArchiveCompleted','EMI_PAY_ArchiveCancelled'
)
$allExpectedNames = @($configurationNames + 'EMI_PAY_SystemSettings' + $runtimeNames + $protectedNames)
$plan = @{}
foreach ($name in $allExpectedNames) {
    $grants = @('OWNER:Full','GR-PAY-SYSADM:Full','GR-PAY-FLOW-SVC:Full')
    if ($name -in $configurationNames) { $grants += 'GR-PAY-PROCADM:Contribute' }
    if ($name -eq 'EMI_PAY_ActivityInternal') { $grants += 'GR-PAY-AUDIT:Read' }
    $plan[$name] = @($grants)
}

function Write-Json($value,[string]$path) {
    $tmp = $path + '.tmp'
    $value | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tmp -Encoding utf8
    Move-Item -LiteralPath $tmp -Destination $path -Force
}
function Assert-Site {
    $conn = Get-PnPConnection
    if (-not $conn) { throw 'No PnP connection. Connect to CECM before running.' }
    if ($conn.Url.TrimEnd('/') -ine $siteUrl) {
        throw "WRONG SITE: $($conn.Url). This package accepts CECM only: $siteUrl"
    }
    $script:ctx = Get-PnPContext
    if (-not $script:ctx) { throw 'PnP CSOM context is unavailable.' }
}
function Get-Assignments($securable) {
    Get-PnPProperty -ClientObject $securable -Property RoleAssignments | Out-Null
    return @(
        foreach ($ra in $securable.RoleAssignments) {
            $p = Get-PnPProperty -ClientObject $ra -Property Member
            Get-PnPProperty -ClientObject $p -Property Id,Title,PrincipalType | Out-Null
            # Do NOT request Id on RoleDefinitionBindingCollection (V1.7 defect).
            $bindings = Get-PnPProperty -ClientObject $ra -Property RoleDefinitionBindings
            $roleList = @(
                foreach ($rd in $bindings) {
                    Get-PnPProperty -ClientObject $rd -Property Id,Name,RoleTypeKind | Out-Null
                    $rd
                }
            )
            [pscustomobject]@{
                PrincipalId = [int]$p.Id
                PrincipalName = [string]$p.Title
                PrincipalType = [string]$p.PrincipalType
                RoleIds = @($roleList | ForEach-Object { [int]$_.Id } | Sort-Object)
                RoleNames = @($roleList | ForEach-Object { [string]$_.Name })
                PrincipalObject = $p
                AssignmentObject = $ra
            }
        }
    )
}
function Get-ListInfo([guid]$guid) {
    $l = Get-PnPList -Identity $guid -Includes Title,ItemCount,HasUniqueRoleAssignments,RoleAssignments,BaseTemplate
    if (-not $l -or $l.Id -ne $guid) { throw "List identity mismatch: $guid" }
    return $l
}
function Get-Snapshot($l,[string]$internalName) {
    $assignments = @(Get-Assignments $l)
    return [pscustomobject]@{
        InternalName = $internalName
        Guid = [string]$l.Id
        DisplayName = [string]$l.Title
        BaseTemplate = [int]$l.BaseTemplate
        ItemCount = [int]$l.ItemCount
        Unique = [bool]$l.HasUniqueRoleAssignments
        Assignments = @($assignments | ForEach-Object {
            [pscustomobject]@{
                PrincipalId = $_.PrincipalId
                PrincipalName = $_.PrincipalName
                PrincipalType = $_.PrincipalType
                RoleIds = @($_.RoleIds)
                RoleNames = @($_.RoleNames)
            }
        })
    }
}
function Get-AclSignature($entries) {
    return (@($entries | ForEach-Object {
        '{0}:{1}' -f $_.PrincipalId, ((@($_.RoleIds | Sort-Object)) -join ',')
    } | Sort-Object) -join '|')
}
function Get-PilotConfiguration {
    $pilot = Get-ListInfo $pilotGuid
    if (-not $pilot.HasUniqueRoleAssignments) { throw 'Pilot has lost its unique ACL; STOP.' }
    $rows = @(Get-Assignments $pilot)
    if ($rows.Count -ne 4) { throw "Pilot expected 4 ACL entries; found $($rows.Count). STOP." }
    $ownerCandidates = @($rows | Where-Object { $_.PrincipalType -eq 'SharePointGroup' -and $_.PrincipalName -notlike 'GR-PAY-*' })
    if ($ownerCandidates.Count -ne 1) { throw 'Cannot identify the one CECM Owners group from Pilot.' }
    $map = @{}
    foreach ($r in $rows) { $map[$r.PrincipalName] = $r }
    foreach ($name in @('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM')) {
        if (-not $map.ContainsKey($name) -or $map[$name].PrincipalType -ne 'SharePointGroup' -or @($map[$name].RoleIds).Count -ne 1) {
            throw "Pilot principal missing or malformed: $name"
        }
    }
    if (@($ownerCandidates[0].RoleIds).Count -ne 1) { throw 'Pilot Owners does not have exactly one role.' }
    $fullId = [int]$map['GR-PAY-SYSADM'].RoleIds[0]
    $contribId = [int]$map['GR-PAY-PROCADM'].RoleIds[0]
    if ($fullId -eq $contribId -or $fullId -ne [int]$ownerCandidates[0].RoleIds[0] -or
        $fullId -ne [int]$map['GR-PAY-FLOW-SVC'].RoleIds[0]) { throw 'Inconsistent Pilot ACL role IDs.' }

    $roleDefinitions = @(Get-PnPRoleDefinition)
    $full = @($roleDefinitions | Where-Object { [int]$_.Id -eq $fullId -and [string]$_.RoleTypeKind -eq 'Administrator' })
    $contribute = @($roleDefinitions | Where-Object { [int]$_.Id -eq $contribId -and [string]$_.RoleTypeKind -eq 'Contributor' })
    $read = @($roleDefinitions | Where-Object { [string]$_.RoleTypeKind -eq 'Reader' })
    if ($full.Count -ne 1 -or $contribute.Count -ne 1 -or $read.Count -ne 1) {
        throw 'Unable to resolve unique built-in role types Administrator, Contributor, Reader.'
    }
    $principals = @{ OWNER = $ownerCandidates[0].PrincipalObject }
    $knownIds = @([int]$ownerCandidates[0].PrincipalId)
    foreach ($name in $groupsRequired) {
        $group = Get-PnPGroup -Identity $name -ErrorAction Stop
        if (-not $group -or -not $group.Id -or [string]$group.Title -cne $name) { throw "Group missing/renamed: $name" }
        if ([int]$group.Id -in $knownIds) { throw "Duplicate group principal ID: $name" }
        $knownIds += [int]$group.Id
        $principals[$name] = $group
    }
    foreach ($name in @('GR-PAY-SYSADM','GR-PAY-FLOW-SVC','GR-PAY-PROCADM')) {
        if ([int]$principals[$name].Id -ne [int]$map[$name].PrincipalId) {
            throw "Pilot group ID mismatch: $name"
        }
    }
    return [pscustomobject]@{
        Roles = @{ Full=$full[0]; Contribute=$contribute[0]; Read=$read[0] }
        Principals = $principals
        OwnerGroupName = [string]$ownerCandidates[0].PrincipalName
    }
}
function Get-ExpectedRows([string]$name,$config) {
    return @(
        foreach ($spec in $plan[$name]) {
            $parts = $spec.Split(':')
            if ($parts.Count -ne 2) { throw "Bad plan specification: $spec" }
            $principal = $config.Principals[$parts[0]]
            $role = $config.Roles[$parts[1]]
            if (-not $principal -or -not $role) { throw "Unresolved planned grant: $name/$spec" }
            [pscustomobject]@{
                PrincipalId = [int]$principal.Id
                PrincipalName = [string]$principal.Title
                PrincipalObject = $principal
                RoleId = [int]$role.Id
                RoleObject = $role
                RoleKind = $parts[1]
            }
        }
    )
}
function Test-AclEqual($currentRows,$expectedRows) {
    if (@($currentRows).Count -ne @($expectedRows).Count) { return $false }
    foreach ($expected in $expectedRows) {
        $match = @($currentRows | Where-Object { $_.PrincipalId -eq $expected.PrincipalId })
        if ($match.Count -ne 1) { return $false }
        if (@($match[0].RoleIds).Count -ne 1 -or [int]$match[0].RoleIds[0] -ne $expected.RoleId) { return $false }
    }
    return $true
}
function Add-Role($l,$principal,$role) {
    $bindings = [Microsoft.SharePoint.Client.RoleDefinitionBindingCollection]::new($script:ctx)
    $bindings.Add($role)
    $l.RoleAssignments.Add($principal,$bindings) | Out-Null
    $script:ctx.ExecuteQuery()
}
function Ensure-Role($l,$expected) {
    $existing = @(Get-Assignments $l | Where-Object { $_.PrincipalId -eq $expected.PrincipalId })
    if ($existing.Count -gt 1) { throw "Duplicate ACL principal: $($expected.PrincipalName)" }
    if ($existing.Count -eq 1) {
        if (@($existing[0].RoleIds).Count -eq 1 -and [int]$existing[0].RoleIds[0] -eq $expected.RoleId) { return }
        $existing[0].AssignmentObject.DeleteObject()
        $script:ctx.ExecuteQuery()
    }
    Add-Role $l $expected.PrincipalObject $expected.RoleObject
}
function Apply-List($l,$expected) {
    if ($l.HasUniqueRoleAssignments -or $l.ItemCount -ne 0) { throw 'Unsafe Apply: list already has unique ACL or items.' }
    # Copy existing site ACL initially to retain administrator access during modification.
    $l.BreakRoleInheritance($true,$false)
    $script:ctx.ExecuteQuery()
    $l = Get-ListInfo ([guid]$l.Id)
    foreach ($e in $expected) { Ensure-Role $l $e }
    $allowedIds = @($expected | ForEach-Object { [int]$_.PrincipalId })
    foreach ($row in @(Get-Assignments $l)) {
        if ($row.PrincipalId -notin $allowedIds) {
            $row.AssignmentObject.DeleteObject()
            $script:ctx.ExecuteQuery()
        }
    }
    $verified = Get-ListInfo ([guid]$l.Id)
    if (-not $verified.HasUniqueRoleAssignments -or
        -not (Test-AclEqual @(Get-Assignments $verified) $expected)) {
        throw "Post-Apply ACL mismatch: $($l.Id)"
    }
    return (Get-Snapshot $verified 'verified')
}
function Get-Status($row,$config) {
    $list = Get-ListInfo ([guid]$row.ListGuid)
    if ($list.Title -cne $row.DisplayName) { throw "Title mismatch on $($row.InternalName): $($list.Title)" }
    $template = if ($row.Type -eq 'Library') { 101 } else { 100 }
    if ([int]$list.BaseTemplate -ne $template) {
        throw "List vs Library template mismatch: $($row.InternalName) (got $($list.BaseTemplate))"
    }
    $expected = @(Get-ExpectedRows $row.InternalName $config)
    $assigned = @(Get-Assignments $list)
    $match = ([bool]$list.HasUniqueRoleAssignments -and (Test-AclEqual $assigned $expected))
    $state = if ($match) { 'PASS' } elseif (-not $list.HasUniqueRoleAssignments) { 'INHERITED' } else { 'DRIFT' }
    return [pscustomobject]@{
        InternalName = $row.InternalName
        Guid = $row.ListGuid
        DisplayName = $row.DisplayName
        Type = $row.Type
        Wave = $row.Wave
        State = $state
        Unique = [bool]$list.HasUniqueRoleAssignments
        ItemCount = [int]$list.ItemCount
        Expected = @($expected)
        Actual = @($assigned)
        Object = $list
    }
}
function Export-Report($statuses,[string]$directory,[string]$label) {
    $flat = @(
        foreach ($s in $statuses) {
            [pscustomobject]@{
                InternalName = $s.InternalName
                Guid = $s.Guid
                Type = $s.Type
                Wave = $s.Wave
                ACLStatus = $s.State
                Unique = $s.Unique
                ItemCount = $s.ItemCount
                ExpectedGrants = (@($s.Expected | ForEach-Object { "$($_.PrincipalName):$($_.RoleKind)" }) -join ' | ')
                ActualGrants = (@($s.Actual | ForEach-Object { "$($_.PrincipalName):$(@($_.RoleIds) -join ',')" }) -join ' | ')
            }
        }
    )
    $flat | Export-Csv -LiteralPath (Join-Path $directory "$label-23-objects.csv") -NoTypeInformation -Encoding utf8BOM
    return $flat
}

Assert-Site
if (-not (Test-Path -LiteralPath $InventoryPath)) { throw "Inventory not found: $InventoryPath" }
if ((Get-FileHash -LiteralPath $InventoryPath -Algorithm SHA256).Hash -ne $expectedInventorySha256) {
    throw 'Inventory checksum differs from the verified 23 GUID manifest. STOP.'
}
$inventory = @(Import-Csv -LiteralPath $InventoryPath -Encoding utf8)
if ($inventory.Count -ne 23) { throw "Inventory has $($inventory.Count) rows; expected exactly 23." }
if (@($inventory | Select-Object -ExpandProperty ListGuid -Unique).Count -ne 23 -or
    @($inventory | Select-Object -ExpandProperty InternalName -Unique).Count -ne 23) {
    throw 'Duplicate GUID or InternalName in inventory.'
}
foreach ($wave in $expectedWaves.Keys) {
    if (@($inventory | Where-Object { $_.Wave -eq $wave }).Count -ne $expectedWaves[$wave]) {
        throw "Unexpected count for wave $wave."
    }
}
if ((@($inventory.InternalName | Sort-Object) -join ',') -cne (@($allExpectedNames | Sort-Object) -join ',')) {
    throw 'Inventory includes out-of-scope or missing EMI_PAY objects. STOP.'
}
$pilotRows = @($inventory | Where-Object { $_.InternalName -eq 'EMI_PAY_PaymentTypes' })
if ($pilotRows.Count -ne 1 -or [guid]$pilotRows[0].ListGuid -ne $pilotGuid) {
    throw 'Pilot GUID mismatch. STOP.'
}
foreach ($r in $inventory) {
    $parsed = [guid]::Empty
    if (-not [guid]::TryParse($r.ListGuid,[ref]$parsed)) { throw "Invalid GUID: $($r.InternalName)" }
    if (($r.Wave -eq '3' -and $r.InternalName -ne 'EMI_PAY_Requests') -ne ($r.Type -eq 'Library')) {
        throw "Inventory type/wave mismatch: $($r.InternalName)"
    }
}
$config = Get-PilotConfiguration
$web = Get-PnPWeb -Includes RoleAssignments
$siteSignature = Get-AclSignature @(Get-Assignments $web)

# Rollback restores inheritance ONLY for objects modified by a specific V1.9 Apply run.
# It never resets pre-existing Pilot/Wave1 unique ACLs.
if ($Mode -eq 'Rollback') {
    if ([string]::IsNullOrWhiteSpace($RunDir)) { throw 'Rollback requires -RunDir for the specific V1.9 Apply run.' }
    $manifestPath = Join-Path $RunDir 'run-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { throw "No manifest: $manifestPath" }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($manifest.Mode -ne 'Apply' -or $manifest.SiteUrl -ne $siteUrl -or $manifest.ScriptVersion -ne '1.9') {
        throw 'Manifest is not a V1.9 CECM Apply run.'
    }
    if ($siteSignature -ne $manifest.SiteAclSignature) { throw 'CECM site ACL changed since Apply. Rollback halted.' }
    $touched = @($manifest.Touched)
    if ($touched.Count -eq 0) { throw 'This run has no touched lists.' }
    [array]::Reverse($touched)
    foreach ($item in $touched) {
        $row = @($inventory | Where-Object { $_.InternalName -eq $item.InternalName })
        if ($row.Count -ne 1 -or $row[0].Wave -notin @('2','3') -or $row[0].ListGuid -ne $item.Guid) {
            throw "Out-of-scope rollback item: $($item.InternalName)"
        }
        $beforePath = Join-Path $RunDir "before-$($item.InternalName).json"
        if (-not (Test-Path -LiteralPath $beforePath)) { throw "Snapshot missing: $beforePath" }
        $before = Get-Content -LiteralPath $beforePath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($before.Unique -or $before.ItemCount -ne 0 -or $before.Guid -ne $item.Guid) {
            throw "Refusing to reset a non-inherited/nonempty original: $($item.InternalName)"
        }
        $l = Get-ListInfo ([guid]$item.Guid)
        if ($l.ItemCount -ne 0) { throw "Item count changed: $($item.InternalName). STOP." }
        if ($l.HasUniqueRoleAssignments) {
            $l.ResetRoleInheritance()
            $script:ctx.ExecuteQuery()
        }
        $check = Get-ListInfo ([guid]$item.Guid)
        if ($check.HasUniqueRoleAssignments) { throw "Rollback verification failed: $($item.InternalName)" }
        Write-Host "ROLLED BACK: $($item.InternalName)" -ForegroundColor Green
    }
    Write-Host 'Rollback finished. Pilot and Wave1 were not modified.' -ForegroundColor Green
    return
}

if ([string]::IsNullOrWhiteSpace($RunDir)) {
    $RunDir = Join-Path (Get-Location) ('EMI_PAY_RBAC_FULL_' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '_' + $PID)
}
if (Test-Path -LiteralPath $RunDir) { throw "RunDir already exists, use a fresh folder: $RunDir" }
New-Item -Path $RunDir -ItemType Directory -ErrorAction Stop | Out-Null
$manifestPath = Join-Path $RunDir 'run-manifest.json'
$manifest = [ordered]@{
    ScriptVersion = '1.9'
    Mode = $Mode
    SiteUrl = $siteUrl
    StartedAt = (Get-Date).ToString('o')
    SiteAclSignature = $siteSignature
    Touched = @()
    Completed = @()
    Verified = $false
}
Write-Json $manifest $manifestPath

# Preflight ALL 23 objects before modifying any one of them.
$statuses = @(
    foreach ($row in $inventory) { Get-Status $row $config }
)
$null = Export-Report $statuses $RunDir 'preflight'
foreach ($s in $statuses) {
    Write-Json (Get-Snapshot $s.Object $s.InternalName) (Join-Path $RunDir "before-$($s.InternalName).json")
    Write-Host ("{0,-32} {1,-10} items={2}" -f $s.InternalName,$s.State,$s.ItemCount)
}
$existing = @($statuses | Where-Object { $_.Wave -in @('0','1') })
$pending = @($statuses | Where-Object { $_.Wave -in @('2','3') })
if ($Mode -eq 'Preview') {
    Write-Host "PREVIEW ONLY: $(@($statuses | Where-Object State -eq 'PASS').Count)/23 already PASS." -ForegroundColor Cyan
    Write-Host "Reports: $RunDir" -ForegroundColor Cyan
    return
}
if ($Mode -eq 'Audit') {
    $notPass = @($statuses | Where-Object { $_.State -ne 'PASS' })
    Write-Host "AUDIT: $($statuses.Count-$notPass.Count)/23 PASS | $($notPass.Count) not PASS. Reports: $RunDir" -ForegroundColor Cyan
    if ($notPass.Count -gt 0) { throw 'Audit did not reach 23/23 PASS at List/Library ACL layer.' }
    return
}
if (@($existing | Where-Object State -ne 'PASS').Count -gt 0) {
    throw 'Preflight failed: Pilot/Wave1 is not 8/8 PASS. No changes were applied.'
}
if (@($pending | Where-Object { $_.State -eq 'DRIFT' }).Count -gt 0) {
    throw 'Preflight failed: a remaining object has unexpected UNIQUE ACL. No overwrite.'
}
if (@($pending | Where-Object { $_.State -eq 'INHERITED' -and $_.ItemCount -ne 0 }).Count -gt 0) {
    throw 'Preflight failed: a remaining inherited object contains items. Cannot change ACL safely.'
}
$remaining = @($pending | Where-Object { $_.State -eq 'INHERITED' })
Write-Host "APPLY START: existing=8, remaining-to-change=$($remaining.Count), already-correct=$(@($pending | Where-Object State -eq 'PASS').Count)" -ForegroundColor Yellow
foreach ($s in $remaining) {
    # Mark the object as TOUCHED before executing the first change, so a crash or
    # a partial SharePoint request will still leave an explicit rollback candidate.
    $manifest.Touched += [ordered]@{ InternalName=$s.InternalName; Guid=$s.Guid }
    Write-Json $manifest $manifestPath
    try {
        $current = Get-Status (@($inventory | Where-Object { $_.InternalName -eq $s.InternalName })[0]) $config
        if ($current.State -ne 'INHERITED' -or $current.ItemCount -ne 0) {
            throw "Concurrent change detected before Apply: $($s.InternalName)"
        }
        $verifiedSnapshot = Apply-List $current.Object $current.Expected
        Write-Json $verifiedSnapshot (Join-Path $RunDir "after-$($s.InternalName).json")
        $manifest.Completed += $s.InternalName
        Write-Json $manifest $manifestPath
        Write-Host "PASS APPLY: $($s.InternalName)" -ForegroundColor Green
    } catch {
        Write-Host "STOP $($s.InternalName): $($_.Exception.Message)" -ForegroundColor Red
        throw "Partially applied batch. Review snapshots. Rollback only if appropriate: .\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Rollback -RunDir '$RunDir'"
    }
}
# One consolidated final ACL audit of all 23 Lists/Libraries.
$after = @(
    foreach ($row in $inventory) { Get-Status $row $config }
)
$null = Export-Report $after $RunDir 'final-audit'
$webNow = Get-PnPWeb -Includes RoleAssignments
if ((Get-AclSignature @(Get-Assignments $webNow)) -ne $siteSignature) {
    throw 'Site ACL changed during the batch. Investigate before continuing.'
}
$failed = @($after | Where-Object { $_.State -ne 'PASS' })
if ($failed.Count -gt 0) {
    Write-Host "FINAL AUDIT FAILED: $($failed.Count) objects. See $RunDir" -ForegroundColor Red
    throw 'One or more 23 objects did not match the expected ACL; stop.'
}
$manifest.Verified = $true
$manifest.FinishedAt = (Get-Date).ToString('o')
Write-Json $manifest $manifestPath
Write-Host '==============================================' -ForegroundColor Green
Write-Host 'PASS: STATIC RBAC 23 / 23 Lists & Libraries' -ForegroundColor Green
Write-Host 'Pilot + Wave1: preserved; 15 remaining: applied / already correct.' -ForegroundColor Green
Write-Host "RESULT REPORT: $(Join-Path $RunDir 'final-audit-23-objects.csv')" -ForegroundColor Green
Write-Host 'NOTE: Does not certify per-user effective access, item-level rights or Flow/SPFx authorization.' -ForegroundColor Yellow
