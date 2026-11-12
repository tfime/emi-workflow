# EMI PAY Core V1 — Validate/Apply seed cấu hình (idempotent)
# Yêu cầu: đã Connect-PnPOnline tới CECM. Không sửa RBAC / schema.
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$SeedPath = (Join-Path $PSScriptRoot 'config\seed-config.json'),
    [string]$GuidPath = (Join-Path $PSScriptRoot 'config\list-guids.json'),
    [ValidateSet('Validate', 'Apply')]
    [string]$Mode = 'Validate'
)

$ErrorActionPreference = 'Stop'
# Avoid StrictMode + PnP ListItem property quirks during seed upserts.
Set-StrictMode -Off

Import-Module PnP.PowerShell -ErrorAction Stop
$connection = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$seed = Get-Content -LiteralPath $SeedPath -Raw -Encoding UTF8 | ConvertFrom-Json
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$report = [System.Collections.Generic.List[object]]::new()

function Get-ListId([string]$Name) {
    return [Guid]$guids.$Name
}

function Get-ListItemId {
    param($Item)
    if ($null -eq $Item) { return $null }
    if ($Item.FieldValues -and $Item.FieldValues.ContainsKey('ID')) {
        return [int]$Item.FieldValues['ID']
    }
    $prop = $Item.PSObject.Properties['Id']
    if ($null -ne $prop -and $null -ne $prop.Value) {
        return [int]$prop.Value
    }
    return $null
}

function Find-ItemsByEq {
    param([Guid]$ListId, [string]$Field, [string]$Value)
    $escaped = [System.Security.SecurityElement]::Escape($Value)
    $query = @"
<View>
  <Query>
    <Where>
      <Eq><FieldRef Name='$Field' /><Value Type='Text'>$escaped</Value></Eq>
    </Where>
  </Query>
  <RowLimit>100</RowLimit>
</View>
"@
    $bag = [System.Collections.Generic.List[object]]::new()
    $page = Get-PnPListItem -List $ListId -Query $query -Connection $connection -ErrorAction Stop
    if ($null -eq $page) {
        return $bag
    }
    foreach ($row in @($page)) {
        if ($null -eq $row) { continue }
        if ($null -eq $row.FieldValues) { continue }
        if ($null -eq (Get-ListItemId -Item $row)) { continue }
        $bag.Add($row)
    }
    return $bag
}

function Upsert-ByKey {
    param(
        [string]$ListName,
        [string]$KeyField,
        [string]$KeyValue,
        [hashtable]$Values,
        [scriptblock]$MatchExtra = $null
    )
    try {
        $listId = Get-ListId $ListName
        $existing = Find-ItemsByEq -ListId $listId -Field $KeyField -Value $KeyValue
        if ($MatchExtra) {
            $filtered = [System.Collections.Generic.List[object]]::new()
            foreach ($row in $existing) {
                if (& $MatchExtra $row) { $filtered.Add($row) }
            }
            $existing = $filtered
        }

        $status = 'WouldCreate'
        if ($existing.Count -gt 1) {
            $status = 'Ambiguous'
        }
        elseif ($existing.Count -eq 1) {
            $itemId = Get-ListItemId -Item $existing[0]
            if ($null -eq $itemId) {
                $status = 'WouldCreate'
                if ($Mode -eq 'Apply') {
                    Add-PnPListItem -List $listId -Values $Values -Connection $connection | Out-Null
                    $status = 'Created'
                }
            }
            else {
                $status = 'WouldUpdate'
                if ($Mode -eq 'Apply') {
                    Set-PnPListItem -List $listId -Identity $itemId -Values $Values -Connection $connection | Out-Null
                    $status = 'Updated'
                }
            }
        }
        else {
            if ($Mode -eq 'Apply') {
                Add-PnPListItem -List $listId -Values $Values -Connection $connection | Out-Null
                $status = 'Created'
            }
        }
        $report.Add([pscustomobject]@{ List = $ListName; Key = "$KeyField=$KeyValue"; Mode = $Mode; Status = $status })
    }
    catch {
        throw "Upsert failed [$ListName] $KeyField=$KeyValue : $($_.Exception.Message)"
    }
}

Write-Host "Seed Mode=$Mode" -ForegroundColor Cyan

foreach ($ou in @($seed.orgUnits)) {
    Upsert-ByKey -ListName 'EMI_PAY_OrgUnits' -KeyField 'OUCode' -KeyValue $ou.OUCode -Values @{
        Title        = $ou.OUCode
        OUCode       = $ou.OUCode
        OUName       = $ou.OUName
        HomeLECode   = $ou.HomeLECode
        ManagerUPN   = $ou.ManagerUPN
        EntraGroupId = $ou.EntraGroupId
        IsActive     = [bool]$ou.IsActive
    }
}

foreach ($pt in @($seed.paymentTypes)) {
    Upsert-ByKey -ListName 'EMI_PAY_PaymentTypes' -KeyField 'PaymentTypeCode' -KeyValue $pt.PaymentTypeCode -Values @{
        Title            = $pt.Title
        PaymentTypeCode  = $pt.PaymentTypeCode
        ChecklistVersion = [double]$pt.ChecklistVersion
        WorkflowCode     = $pt.WorkflowCode
        IsActive         = [bool]$pt.IsActive
    }
}

foreach ($wv in @($seed.workflowVersions)) {
    Upsert-ByKey -ListName 'EMI_PAY_WorkflowVersions' -KeyField 'WorkflowCode' -KeyValue $wv.WorkflowCode -Values @{
        Title        = $wv.Title
        WorkflowCode = $wv.WorkflowCode
        VersionNo    = [double]$wv.VersionNo
        Lifecycle    = $wv.Lifecycle
        PublishedAt  = (Get-Date).ToUniversalTime()
        EffectiveAt  = (Get-Date).ToUniversalTime()
    } -MatchExtra {
        param($item)
        [int]$item.FieldValues['VersionNo'] -eq [int]$wv.VersionNo
    }
}

foreach ($st in @($seed.workflowSteps)) {
    Upsert-ByKey -ListName 'EMI_PAY_WorkflowSteps' -KeyField 'StepKey' -KeyValue $st.StepKey -Values @{
        Title        = "$($st.WorkflowCode)-$($st.StepKey)"
        WorkflowCode = $st.WorkflowCode
        VersionNo    = [double]$st.VersionNo
        StepKey      = $st.StepKey
        StepOrder    = [double]$st.StepOrder
        StepName     = $st.StepName
        StepKind     = $st.StepKind
        IsActive     = [bool]$st.IsActive
    } -MatchExtra {
        param($item)
        ($item.FieldValues['WorkflowCode'] -eq $st.WorkflowCode) -and
        ([int]$item.FieldValues['VersionNo'] -eq [int]$st.VersionNo)
    }
}

foreach ($sr in @($seed.stepRecipients)) {
    Upsert-ByKey -ListName 'EMI_PAY_StepRecipients' -KeyField 'StepKey' -KeyValue $sr.StepKey -Values @{
        Title        = "$($sr.StepKey)-$($sr.OUCode)"
        WorkflowCode = $sr.WorkflowCode
        VersionNo    = [double]$sr.VersionNo
        StepKey      = $sr.StepKey
        OUCode       = $sr.OUCode
        IsDefault    = [bool]$sr.IsDefault
    } -MatchExtra {
        param($item)
        ($item.FieldValues['WorkflowCode'] -eq $sr.WorkflowCode) -and
        ([int]$item.FieldValues['VersionNo'] -eq [int]$sr.VersionNo) -and
        ($item.FieldValues['OUCode'] -eq $sr.OUCode)
    }
}

foreach ($ct in @($seed.checklistTemplates)) {
    Upsert-ByKey -ListName 'EMI_PAY_ChecklistTemplates' -KeyField 'ItemCode' -KeyValue $ct.ItemCode -Values @{
        Title            = "$($ct.PaymentTypeCode)-$($ct.ItemCode)"
        PaymentTypeCode  = $ct.PaymentTypeCode
        VersionNo        = [double]$ct.VersionNo
        ItemCode         = $ct.ItemCode
        ItemLabel        = $ct.ItemLabel
        IsRequired       = [bool]$ct.IsRequired
        MinFileCount     = [double]$ct.MinFileCount
        DisplayOrder     = [double]$ct.DisplayOrder
    } -MatchExtra {
        param($item)
        ($item.FieldValues['PaymentTypeCode'] -eq $ct.PaymentTypeCode) -and
        ([int]$item.FieldValues['VersionNo'] -eq [int]$ct.VersionNo)
    }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $PSScriptRoot "seed-report-$Mode-$stamp.csv"
$report | Export-Csv -LiteralPath $out -Encoding UTF8
Write-Host "Report: $out" -ForegroundColor Green
$report | Format-Table -AutoSize
$ambiguous = @($report | Where-Object { $_.Status -eq 'Ambiguous' })
if ($ambiguous.Count -gt 0) {
    throw 'Ambiguous matches found — resolve duplicates before Apply.'
}

Write-Host "Seed $Mode done. Rows=$($report.Count)" -ForegroundColor Green
