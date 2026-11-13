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
    # PnP thường để Id trên object, không phải FieldValues['ID']. Bỏ sót Id khiến seed luôn Add và đụng CfgKey unique.
    try {
        $direct = $Item.Id
        if ($direct) { return [int]$direct }
    }
    catch { }
    if ($Item.FieldValues) {
        foreach ($key in @('ID', 'Id')) {
            if ($Item.FieldValues.ContainsKey($key) -and $Item.FieldValues[$key]) {
                return [int]$Item.FieldValues[$key]
            }
        }
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

$script:CfgKeyReady = @{}

function Has-CfgKeyField([string]$ListName) {
    if ($script:CfgKeyReady.ContainsKey($ListName)) {
        return [bool]$script:CfgKeyReady[$ListName]
    }
    $listId = Get-ListId $ListName
    $f = Get-PnPField -List $listId -Identity 'CfgKey' -ErrorAction SilentlyContinue -Connection $connection
    $script:CfgKeyReady[$ListName] = ($null -ne $f)
    return [bool]$script:CfgKeyReady[$ListName]
}

function Values-ForWrite {
    param([string]$ListName, [hashtable]$Values)
    if (Has-CfgKeyField $ListName) { return $Values }
    $copy = @{}
    foreach ($k in $Values.Keys) {
        if ($k -eq 'CfgKey') { continue }
        $copy[$k] = $Values[$k]
    }
    return $copy
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
        $writeValues = Values-ForWrite -ListName $ListName -Values $Values
        # @() bắt buộc: 1 item PnP bị unwrap → .Count không còn = 1 → nhầm sang Add → đụng CfgKey unique.
        $existing = @(Find-ItemsByEq -ListId $listId -Field $KeyField -Value $KeyValue)
        if ($existing.Count -eq 0 -and $writeValues.ContainsKey('CfgKey') -and $writeValues['CfgKey']) {
            $existing = @(Find-ItemsByEq -ListId $listId -Field 'CfgKey' -Value ([string]$writeValues['CfgKey']))
        }
        if ($MatchExtra) {
            $existing = @($existing | Where-Object { & $MatchExtra $_ })
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
                    Add-PnPListItem -List $listId -Values $writeValues -Connection $connection | Out-Null
                    $status = 'Created'
                }
            }
            else {
                $status = 'WouldUpdate'
                if ($Mode -eq 'Apply') {
                    $patch = @{}
                    foreach ($k in $writeValues.Keys) { $patch[$k] = $writeValues[$k] }
                    $currentKey = ''
                    if ($existing[0].FieldValues -and $existing[0].FieldValues.ContainsKey('CfgKey')) {
                        $currentKey = [string]$existing[0].FieldValues['CfgKey']
                    }
                    if ($patch.ContainsKey('CfgKey') -and $currentKey -eq [string]$patch['CfgKey']) {
                        $patch.Remove('CfgKey')
                    }
                    Set-PnPListItem -List $listId -Identity $itemId -Values $patch -Connection $connection | Out-Null
                    $status = 'Updated'
                }
            }
        }
        else {
            if ($Mode -eq 'Apply') {
                Add-PnPListItem -List $listId -Values $writeValues -Connection $connection | Out-Null
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

function CfgKey([string[]]$Parts) {
    return (($Parts | ForEach-Object { if ($null -eq $_) { '' } else { $_.ToString().Trim().ToLowerInvariant() } } | Where-Object { $_ }) -join '|')
}

if ($seed.PSObject.Properties.Name -contains 'orgMembers') {
    foreach ($m in @($seed.orgMembers)) {
        Upsert-ByKey -ListName 'EMI_PAY_OrgMembers' -KeyField 'MemberUPN' -KeyValue $m.MemberUPN -Values @{
            Title      = $m.Title
            OUCode     = $m.OUCode
            MemberUPN  = $m.MemberUPN
            MemberRole = $m.MemberRole
            IsActive   = [bool]$m.IsActive
            CfgKey     = (CfgKey @($m.OUCode, $m.MemberUPN))
        } -MatchExtra {
            param($item)
            $item.FieldValues['OUCode'] -eq $m.OUCode
        }
    }
}

foreach ($ou in @($seed.orgUnits)) {
    Upsert-ByKey -ListName 'EMI_PAY_OrgUnits' -KeyField 'OUCode' -KeyValue $ou.OUCode -Values @{
        Title        = $ou.OUCode
        OUCode       = $ou.OUCode
        OUName       = $ou.OUName
        HomeLECode   = $ou.HomeLECode
        ManagerUPN   = $ou.ManagerUPN
        EntraGroupId = $ou.EntraGroupId
        IsActive     = [bool]$ou.IsActive
        CfgKey       = (CfgKey @($ou.OUCode))
    }
}

foreach ($pt in @($seed.paymentTypes)) {
    Upsert-ByKey -ListName 'EMI_PAY_PaymentTypes' -KeyField 'PaymentTypeCode' -KeyValue $pt.PaymentTypeCode -Values @{
        Title            = $pt.Title
        PaymentTypeCode  = $pt.PaymentTypeCode
        ChecklistVersion = [double]$pt.ChecklistVersion
        WorkflowCode     = $pt.WorkflowCode
        IsActive         = [bool]$pt.IsActive
        CfgKey           = (CfgKey @($pt.PaymentTypeCode))
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
        CfgKey       = (CfgKey @($wv.WorkflowCode, [string]$wv.VersionNo))
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
        CfgKey       = (CfgKey @($st.WorkflowCode, [string]$st.VersionNo, $st.StepKey))
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
        CfgKey       = (CfgKey @($sr.WorkflowCode, [string]$sr.VersionNo, $sr.StepKey, $sr.OUCode))
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
        CfgKey           = (CfgKey @($ct.PaymentTypeCode, [string]$ct.VersionNo, $ct.ItemCode))
    } -MatchExtra {
        param($item)
        ($item.FieldValues['PaymentTypeCode'] -eq $ct.PaymentTypeCode) -and
        ([int]$item.FieldValues['VersionNo'] -eq [int]$ct.VersionNo)
    }
}

if ($seed.PSObject.Properties.Name -contains 'systemSettings') {
    foreach ($ss in @($seed.systemSettings)) {
        Upsert-ByKey -ListName 'EMI_PAY_SystemSettings' -KeyField 'SettingKey' -KeyValue $ss.SettingKey -Values @{
            Title              = $ss.Title
            SettingKey         = $ss.SettingKey
            SettingValue       = [string]$ss.SettingValue
            SettingDescription = $ss.SettingDescription
        }
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
