#Requires -Version 7.2
#Requires -Modules PnP.PowerShell
<#
EMI PAY - V1.9.1 READ-ONLY POST-APPLY VALIDATOR
Use after V1.9 completed 15 PASS APPLY but the final site-ACL signature changed.
- Calls the existing V1.9 -Mode Audit to test 23 list/library ACLs (READ ONLY).
- Compares current site ACL against the pre-Apply signature stored in the original run-manifest.json.
- Distinguishes SharePoint's automatic Guest / Limited Access assignments from substantive ACL changes.
- Writes LOCAL CSV only. NEVER modifies any SharePoint rights.

Run from the original V1.9 package folder with this file copied beside V1.9 and Inventory:
  .\EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1
Or specify the Apply run folder explicitly:
  .\EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1 -ApplyRunDir 'F:\...\EMI_PAY_RBAC_FULL_yyyymmdd-hhmmss_pid'
#>
[CmdletBinding()]
param([string]$ApplyRunDir = '')
$ErrorActionPreference = 'Stop'
$siteUrl = 'https://emicomvn.sharepoint.com/sites/cecm'
$originalScript = Join-Path $PSScriptRoot 'EMI_PAY_RBAC_Full_V1.9.ps1'
if (-not (Test-Path -LiteralPath $originalScript)) {
    throw "Missing original audit script. Place this .ps1 in the same directory as EMI_PAY_RBAC_Full_V1.9.ps1 and EMI_PAY_Inventory_23.csv: $PSScriptRoot"
}
$conn = Get-PnPConnection
if (-not $conn -or $conn.Url.TrimEnd('/') -ine $siteUrl) {
    throw "Connect to $siteUrl before running. No SharePoint changes were made."
}

function Parse-Signature([string]$signature) {
    $map = @{}
    if ([string]::IsNullOrWhiteSpace($signature)) { return $map }
    foreach ($segment in $signature.Split('|')) {
        if ($segment -notmatch '^(\d+):([\d,]*)$') { throw "Unrecognized V1.9 SiteAclSignature segment: $segment" }
        $principalId = $Matches[1]
        if ($map.ContainsKey($principalId)) { throw "Duplicate principal in SiteAclSignature: $principalId" }
        $ids = @()
        if ($Matches[2].Length -gt 0) {
            $ids = @($Matches[2].Split(',') | ForEach-Object { [int]$_ } | Sort-Object -Unique)
        }
        $map[$principalId] = @($ids)
    }
    return $map
}
function Get-LiveWebRoles {
    $web = Get-PnPWeb -Includes RoleAssignments
    $assignmentCollection = Get-PnPProperty -ClientObject $web -Property RoleAssignments
    $rows = @(
        foreach ($a in $assignmentCollection) {
            $principal = Get-PnPProperty -ClientObject $a -Property Member
            Get-PnPProperty -ClientObject $principal -Property Id,Title | Out-Null
            $bindingCollection = Get-PnPProperty -ClientObject $a -Property RoleDefinitionBindings
            $roleIds = @(
                foreach ($r in $bindingCollection) {
                    Get-PnPProperty -ClientObject $r -Property Id,RoleTypeKind,Name | Out-Null
                    [int]$r.Id
                }
            )
            [pscustomobject]@{
                PrincipalId = [string]$principal.Id
                PrincipalName = [string]$principal.Title
                RoleIds = @($roleIds | Sort-Object -Unique)
            }
        }
    )
    return $rows
}

# Resolve the original V1.9 Apply manifest. Nothing is changed on SharePoint.
if ([string]::IsNullOrWhiteSpace($ApplyRunDir)) {
    $roots = @($PSScriptRoot, (Get-Location).Path) | Select-Object -Unique
    $candidates = @(
        foreach ($root in $roots) {
            Get-ChildItem -LiteralPath $root -Directory -Filter 'EMI_PAY_RBAC_FULL_*' -ErrorAction SilentlyContinue |
                Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'run-manifest.json') }
        }
    ) | Sort-Object FullName -Unique | Sort-Object LastWriteTime -Descending
    $qualified = @(
        foreach ($dir in $candidates) {
            try {
                $m = Get-Content -LiteralPath (Join-Path $dir.FullName 'run-manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
                if ($m.Mode -eq 'Apply' -and $m.ScriptVersion -eq '1.9' -and $m.SiteUrl -eq $siteUrl) { $dir }
            } catch { }
        }
    )
    if ($qualified.Count -eq 0) {
        throw 'Cannot auto-find original V1.9 Apply run. Specify -ApplyRunDir pointing to EMI_PAY_RBAC_FULL_<timestamp>_<PID> (contains run-manifest.json).'
    }
    $ApplyRunDir = $qualified[0].FullName
}
$ApplyRunDir = (Resolve-Path -LiteralPath $ApplyRunDir).Path
$manifestPath = Join-Path $ApplyRunDir 'run-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Missing run manifest: $manifestPath" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($manifest.Mode -ne 'Apply' -or $manifest.ScriptVersion -ne '1.9' -or $manifest.SiteUrl -ne $siteUrl) {
    throw 'Manifest is not from a V1.9 CECM Apply run.'
}
if ([string]::IsNullOrWhiteSpace([string]$manifest.SiteAclSignature)) { throw 'Original site ACL signature is missing.' }
Write-Host "Original Apply run: $ApplyRunDir" -ForegroundColor Cyan
Write-Host "Apply manifest: Touched=$(@($manifest.Touched).Count), Completed=$(@($manifest.Completed).Count), Verified=$($manifest.Verified)" -ForegroundColor Cyan

Write-Host 'STEP 1/2: READ-ONLY AUDIT of 23 Lists/Libraries...' -ForegroundColor Yellow
# Original V1.9 -Mode Audit validates all 23 exact GUIDs and role-ID assignments.
& $originalScript -Mode Audit
Write-Host 'PASS: exact static ACL of 23/23 Lists/Libraries (via V1.9 Audit).' -ForegroundColor Green

Write-Host 'STEP 2/2: Analyze site ACL changes since original Apply...' -ForegroundColor Yellow
$before = Parse-Signature ([string]$manifest.SiteAclSignature)
$currentRows = @(Get-LiveWebRoles)
$after = @{}
$names = @{}
foreach ($r in $currentRows) {
    if ($after.ContainsKey($r.PrincipalId)) { throw "Duplicate web principal: $($r.PrincipalId)" }
    $after[$r.PrincipalId] = @($r.RoleIds)
    $names[$r.PrincipalId] = $r.PrincipalName
}
$roleDefs = @(Get-PnPRoleDefinition)
$types = @{}
$roleNames = @{}
foreach ($r in $roleDefs) {
    $types[[string]$r.Id] = [string]$r.RoleTypeKind
    $roleNames[[string]$r.Id] = [string]$r.Name
}
$allPrincipals = @(@($before.Keys) + @($after.Keys) | Sort-Object -Unique)
$changes = @(
    foreach ($principalId in $allPrincipals) {
        $oldIds = if ($before.ContainsKey($principalId)) { @($before[$principalId]) } else { @() }
        $newIds = if ($after.ContainsKey($principalId)) { @($after[$principalId]) } else { @() }
        foreach ($rid in $newIds) {
            if ($rid -notin $oldIds) {
                $key = [string]$rid
                [pscustomobject]@{
                    PrincipalId = $principalId; PrincipalName = $names[$principalId]
                    Change = 'ADDED'; RoleId = $rid
                    RoleName = $roleNames[$key]; RoleTypeKind = $types[$key]
                    ExpectedAutomatic = ($types[$key] -eq 'Guest')
                }
            }
        }
        foreach ($rid in $oldIds) {
            if ($rid -notin $newIds) {
                $key = [string]$rid
                [pscustomobject]@{
                    PrincipalId = $principalId; PrincipalName = $names[$principalId]
                    Change = 'REMOVED'; RoleId = $rid
                    RoleName = $roleNames[$key]; RoleTypeKind = $types[$key]
                    ExpectedAutomatic = $false
                }
            }
        }
    }
)
$outDir = Join-Path $PSScriptRoot ('EMI_PAY_VERIFY_1_9_1_' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '_' + $PID)
New-Item -ItemType Directory -Path $outDir -ErrorAction Stop | Out-Null
$changeFile = Join-Path $outDir 'site-acl-delta.csv'
if ($changes.Count -gt 0) { $changes | Export-Csv -LiteralPath $changeFile -Encoding utf8BOM }
else { 'No site ACL differences.' | Set-Content -LiteralPath (Join-Path $outDir 'site-acl-no-change.txt') -Encoding utf8 }

if ($changes.Count -eq 0) {
    Write-Host 'PASS: Site ACL unchanged.' -ForegroundColor Green
} elseif (@($changes | Where-Object { -not $_.ExpectedAutomatic }).Count -eq 0) {
    Write-Host "PASS: Site ACL changes consist solely of $($changes.Count) ADDED Guest/Limited Access roles (automatic SharePoint behavior)." -ForegroundColor Green
} else {
    Write-Warning 'Site ACL has changes OTHER than ADDED Guest/Limited Access. Review site-acl-delta.csv before declaring site security unchanged.'
    $changes | Format-Table PrincipalId,PrincipalName,Change,RoleName,RoleTypeKind,ExpectedAutomatic -AutoSize
    Write-Host "READ-ONLY verification complete; 23/23 Lists PASS but site ACL NEEDS REVIEW. Report: $outDir" -ForegroundColor Yellow
    return
}
Write-Host '==============================================' -ForegroundColor Green
Write-Host 'PASS: STATIC RBAC 23 / 23 Lists & Libraries + SITE ACL CHECK' -ForegroundColor Green
Write-Host "LOCAL REPORT: $outDir" -ForegroundColor Cyan
Write-Host 'NOTE: Does not certify per-user effective rights or dynamic workflow permissions.' -ForegroundColor Yellow
