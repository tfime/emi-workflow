# EMI PAY — Chống trùng list CFG: cột CfgKey (Text, Indexed, EnforceUniqueValues)
# Chặn trùng từ Site Contents lẫn SPFx. Idempotent.
# Trước Apply: xóa/gộp bản ghi trùng khóa nghiệp vụ (Validate sẽ liệt kê).
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$GuidPath = (Join-Path $PSScriptRoot 'config\list-guids.json'),
    [ValidateSet('Validate', 'Apply')]
    [string]$Mode = 'Validate'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Off
Import-Module PnP.PowerShell -ErrorAction Stop

$connection = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Norm([string]$s) {
    if ($null -eq $s) { return '' }
    return $s.Trim().ToLowerInvariant()
}

function Build-CfgKey {
    param([string[]]$Parts)
    return (($Parts | ForEach-Object { Norm $_ } | Where-Object { $_ }) -join '|')
}

$defs = @(
    @{
        List = 'EMI_PAY_PaymentTypes'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['PaymentTypeCode'])
        }
    }
    @{
        List = 'EMI_PAY_OrgUnits'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['OUCode'])
        }
    }
    @{
        List = 'EMI_PAY_OrgMembers'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['OUCode'], [string]$fv['MemberUPN'])
        }
    }
    @{
        List = 'EMI_PAY_WorkflowVersions'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['WorkflowCode'], [string]$fv['VersionNo'])
        }
    }
    @{
        List = 'EMI_PAY_WorkflowSteps'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['WorkflowCode'], [string]$fv['VersionNo'], [string]$fv['StepKey'])
        }
    }
    @{
        List = 'EMI_PAY_ChecklistTemplates'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['PaymentTypeCode'], [string]$fv['VersionNo'], [string]$fv['ItemCode'])
        }
    }
    @{
        List = 'EMI_PAY_StepRecipients'
        KeyOf = {
            param($fv)
            Build-CfgKey @([string]$fv['WorkflowCode'], [string]$fv['VersionNo'], [string]$fv['StepKey'], [string]$fv['OUCode'])
        }
    }
)

$report = [System.Collections.Generic.List[object]]::new()
$blocking = $false

foreach ($d in $defs) {
    $listId = [Guid]$guids.($d.List)
    $items = @(Get-PnPListItem -List $listId -PageSize 500 -Connection $connection)
    $byKey = @{}
    foreach ($it in $items) {
        $fv = $it.FieldValues
        $k = & $d.KeyOf $fv
        if ([string]::IsNullOrWhiteSpace($k)) { continue }
        if (-not $byKey.ContainsKey($k)) { $byKey[$k] = [System.Collections.Generic.List[int]]::new() }
        $byKey[$k].Add([int]$it.Id)
    }

    $dupKeys = @($byKey.Keys | Where-Object { $byKey[$_].Count -gt 1 })
    foreach ($dk in $dupKeys) {
        $blocking = $true
        $ids = ($byKey[$dk] -join ',')
        Write-Host "DUPLICATE $($d.List) CfgKey=$dk Ids=$ids" -ForegroundColor Red
        $report.Add([pscustomobject]@{ List = $d.List; CfgKey = $dk; ItemIds = $ids; Status = 'Duplicate' })
    }

    $field = Get-PnPField -List $listId -Identity 'CfgKey' -ErrorAction SilentlyContinue -Connection $connection
    if ($null -eq $field) {
        Write-Host "MISSING: $($d.List).CfgKey" -ForegroundColor Yellow
        $report.Add([pscustomobject]@{ List = $d.List; CfgKey = ''; ItemIds = ''; Status = 'MissingField' })
        if ($Mode -eq 'Apply') {
            if ($dupKeys.Count -gt 0) {
                throw "Cannot add unique CfgKey on $($d.List): resolve duplicates first."
            }
            Add-PnPField -List $listId -InternalName 'CfgKey' -DisplayName 'Khóa cấu hình (unique)' `
                -Type Text -Group 'EMI PAY' -AddToDefaultView -Connection $connection | Out-Null
            Write-Host "ADDED field $($d.List).CfgKey" -ForegroundColor Green
            $field = Get-PnPField -List $listId -Identity 'CfgKey' -Connection $connection
        }
    }

    if ($Mode -eq 'Apply' -and $null -ne $field) {
        if ($dupKeys.Count -gt 0) {
            throw "Cannot enforce unique on $($d.List): duplicates remain."
        }
        foreach ($it in $items) {
            $k = & $d.KeyOf $it.FieldValues
            if ([string]::IsNullOrWhiteSpace($k)) { continue }
            $cur = [string]$it.FieldValues['CfgKey']
            if ($cur -ne $k) {
                Set-PnPListItem -List $listId -Identity $it.Id -Values @{ CfgKey = $k } -Connection $connection | Out-Null
            }
        }
        # Index then EnforceUniqueValues (SharePoint yêu cầu Indexed trước)
        Set-PnPField -List $listId -Identity 'CfgKey' -Values @{ Indexed = $true } -Connection $connection | Out-Null
        try {
            Set-PnPField -List $listId -Identity 'CfgKey' -Values @{ EnforceUniqueValues = $true } -Connection $connection | Out-Null
            Write-Host "UNIQUE ON: $($d.List).CfgKey" -ForegroundColor Green
            $report.Add([pscustomobject]@{ List = $d.List; CfgKey = 'CfgKey'; ItemIds = ''; Status = 'UniqueEnforced' })
        }
        catch {
            Write-Warning "EnforceUniqueValues failed on $($d.List).CfgKey: $($_.Exception.Message)"
            $report.Add([pscustomobject]@{ List = $d.List; CfgKey = 'CfgKey'; ItemIds = ''; Status = 'UniqueFailed' })
            $blocking = $true
        }
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $PSScriptRoot "cfg-unique-report-$Mode-$stamp.csv"
$report | Export-Csv -LiteralPath $out -Encoding UTF8 -NoTypeInformation
Write-Host "Report: $out" -ForegroundColor Cyan

if ($Mode -eq 'Validate') {
    Write-Host 'VALIDATE DONE. Xóa trùng rồi chạy -Mode Apply.' -ForegroundColor Cyan
}
if ($blocking -and $Mode -eq 'Apply') {
    throw 'Blocking issues remain — see report.'
}
