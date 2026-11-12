# EMI PAY Core — Preflight: kết nối + đọc list/cột (KHÔNG ghi dữ liệu)
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$GuidPath = (Join-Path $PSScriptRoot 'config\list-guids.json'),
    [string]$SeedPath = (Join-Path $PSScriptRoot 'config\seed-config.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$results = [System.Collections.Generic.List[object]]::new()
function Add-Result {
    param([string]$Check, [string]$Status, [string]$Detail)
    $results.Add([pscustomobject]@{ Check = $Check; Status = $Status; Detail = $Detail })
    $color = switch ($Status) { 'PASS' { 'Green' } 'WARN' { 'Yellow' } default { 'Red' } }
    Write-Host ("[{0}] {1} — {2}" -f $Status, $Check, $Detail) -ForegroundColor $color
}

Write-Host "=== EMI PAY Preflight (read-only) ===" -ForegroundColor Cyan
Write-Host "Site: $SiteUrl"
Write-Host ""

# 1) Module + connection
try {
    if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
        throw 'PnP.PowerShell chưa cài trong session này.'
    }
    Import-Module PnP.PowerShell -ErrorAction Stop
    Add-Result 'PnP.PowerShell module' 'PASS' 'Available'
}
catch {
    Add-Result 'PnP.PowerShell module' 'FAIL' $_.Exception.Message
    throw
}

try {
    $connection = Get-PnPConnection -ErrorAction Stop
    if ($null -eq $connection) { throw 'Chưa Connect-PnPOnline.' }
    Add-Result 'PnP connection object' 'PASS' 'Get-PnPConnection OK'
}
catch {
    Add-Result 'PnP connection object' 'FAIL' $_.Exception.Message
    Write-Host @"

Chạy trước:
  Connect-PnPOnline -Url '$SiteUrl' ``
    -ClientId '5c1a7c4d-3b40-4938-821d-12f44ee316e5' -Interactive

"@ -ForegroundColor Yellow
    throw
}

try {
    $web = Get-PnPWeb -Connection $connection -Includes Url, Title -ErrorAction Stop
    $url = $web.Url.TrimEnd('/')
    if ($url -ine $SiteUrl.TrimEnd('/')) {
        Add-Result 'Site URL match' 'FAIL' "Connected=$url Expected=$SiteUrl"
        throw 'Wrong site.'
    }
    Add-Result 'Site URL match' 'PASS' "$url ($($web.Title))"
}
catch {
    if ($results[-1].Check -ne 'Site URL match') {
        Add-Result 'Get-PnPWeb' 'FAIL' $_.Exception.Message
    }
    throw
}

# 2) Local config files
foreach ($path in @($GuidPath, $SeedPath)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        Add-Result "Config file $(Split-Path $path -Leaf)" 'PASS' $path
    }
    else {
        Add-Result "Config file $(Split-Path $path -Leaf)" 'FAIL' "Missing: $path"
        throw 'Missing config.'
    }
}

$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json
$seed = Get-Content -LiteralPath $SeedPath -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Result 'Parse seed-config.json' 'PASS' "workflow=$($seed.workflowCode) steps=$(@($seed.workflowSteps).Count)"

# 3) Lists by GUID + item count
$requiredLists = @(
    'EMI_PAY_OrgUnits',
    'EMI_PAY_OrgMembers',
    'EMI_PAY_PaymentTypes',
    'EMI_PAY_WorkflowVersions',
    'EMI_PAY_WorkflowSteps',
    'EMI_PAY_StepRecipients',
    'EMI_PAY_ChecklistTemplates',
    'EMI_PAY_Commands',
    'EMI_PAY_Requests',
    'EMI_PAY_WorkItems',
    'EMI_PAY_ChecklistItems',
    'EMI_PAY_ActivityPublic',
    'EMI_PAY_ActivityInternal',
    'EMI_PAY_Assignments',
    'EMI_PAY_StepReviews'
)

$listMap = @{}
foreach ($name in $requiredLists) {
    try {
        $id = [Guid]$guids.$name
        $list = Get-PnPList -Identity $id -Connection $connection -ErrorAction Stop
        Get-PnPProperty -ClientObject $list -Property Id, Title, ItemCount -Connection $connection | Out-Null
        if ($list.Id -ne $id) { throw "GUID mismatch live=$($list.Id)" }
        $listMap[$name] = $list
        Add-Result "List $name" 'PASS' "Title='$($list.Title)' Items=$($list.ItemCount)"
    }
    catch {
        Add-Result "List $name" 'FAIL' $_.Exception.Message
    }
}

# 4) Field presence (orchestrator-critical)
$fieldChecks = @{
    'EMI_PAY_Commands'          = @('CommandKey', 'CommandType', 'PayloadJson', 'State', 'DedupeKey', 'RequestKey', 'StepInstanceKey', 'ProcessedAt', 'ErrorMessage')
    'EMI_PAY_Requests'          = @('RequestKey', 'RequestCode', 'Status', 'CurrentStepKey', 'CurrentOUCode', 'WorkflowCode', 'WorkflowVersion', 'ReviewRound', 'CreatorUPN', 'PaidAt', 'IsLocked', 'ArchiveStatus')
    'EMI_PAY_WorkItems'         = @('RequestKey', 'StepInstanceKey', 'StepKey', 'StepOrder', 'StepKind', 'ResponsibleOUCode', 'ManagerUPN', 'State', 'Decision', 'DecisionNote', 'ClosedAt')
    'EMI_PAY_ChecklistItems'    = @('RequestKey', 'ChecklistItemKey', 'ItemCode', 'IsRequired', 'MinFileCount', 'UploadedCount', 'ItemStatus', 'IsLocked')
    'EMI_PAY_OrgUnits'          = @('OUCode', 'OUName', 'ManagerUPN', 'IsActive')
    'EMI_PAY_OrgMembers'        = @('OUCode', 'MemberUPN', 'IsActive')
    'EMI_PAY_PaymentTypes'      = @('PaymentTypeCode', 'ChecklistVersion', 'WorkflowCode', 'IsActive')
    'EMI_PAY_WorkflowVersions'  = @('WorkflowCode', 'VersionNo', 'Lifecycle')
    'EMI_PAY_WorkflowSteps'     = @('WorkflowCode', 'VersionNo', 'StepKey', 'StepOrder', 'StepName', 'StepKind', 'IsActive')
    'EMI_PAY_StepRecipients'    = @('WorkflowCode', 'VersionNo', 'StepKey', 'OUCode', 'IsDefault')
    'EMI_PAY_ChecklistTemplates'= @('PaymentTypeCode', 'VersionNo', 'ItemCode', 'ItemLabel', 'IsRequired', 'MinFileCount', 'DisplayOrder')
    'EMI_PAY_ActivityPublic'    = @('RequestKey', 'ActivityKey', 'EventType', 'EventTime', 'ActorUPN', 'FromState', 'ToState', 'Note', 'DetailsJson')
    'EMI_PAY_ActivityInternal'  = @('RequestKey', 'ActivityKey', 'EventType', 'EventTime', 'ActorUPN', 'OUCode', 'FieldName', 'OldValue', 'NewValue', 'Reason')
}

foreach ($listName in $fieldChecks.Keys) {
    if (-not $listMap.ContainsKey($listName)) { continue }
    try {
        $fields = @(Get-PnPField -List $listMap[$listName].Id -Connection $connection -ErrorAction Stop)
        $names = @($fields | ForEach-Object { $_.InternalName })
        $missing = @($fieldChecks[$listName] | Where-Object { $_ -notin $names })
        $unexpectedPublicOnInternal = @()
        if ($listName -eq 'EMI_PAY_ActivityInternal') {
            foreach ($bad in @('DetailsJson', 'FromState', 'ToState', 'Note')) {
                if ($bad -in $names) { $unexpectedPublicOnInternal += $bad }
            }
        }
        if ($missing.Count -gt 0) {
            Add-Result "Fields $listName" 'FAIL' ("Missing: " + ($missing -join ', '))
        }
        else {
            $extra = if ($unexpectedPublicOnInternal.Count -gt 0) { " (also has $($unexpectedPublicOnInternal -join ', '))"} else { '' }
            Add-Result "Fields $listName" 'PASS' ("OK $($fieldChecks[$listName].Count) critical fields$extra")
        }
        # Explicit schema reminder
        if ($listName -eq 'EMI_PAY_ActivityInternal' -and ('DetailsJson' -in $names)) {
            Add-Result 'Schema ActivityInternal.DetailsJson' 'WARN' 'Live có DetailsJson — khác giả định code-first map sang NewValue'
        }
        elseif ($listName -eq 'EMI_PAY_ActivityInternal' -and ('DetailsJson' -notin $names)) {
            Add-Result 'Schema ActivityInternal vs Public' 'PASS' 'Internal không có DetailsJson (đúng với module đã sửa)'
        }
        if ($listName -eq 'EMI_PAY_ActivityPublic' -and ('DetailsJson' -notin $names)) {
            Add-Result 'Schema ActivityPublic.DetailsJson' 'FAIL' 'Public thiếu DetailsJson'
        }
    }
    catch {
        Add-Result "Fields $listName" 'FAIL' $_.Exception.Message
    }
}

# 5) Sample CAML reads (empty-safe)
function Test-CamLRead {
    param([string]$ListName, [string]$Field, [string]$Value)
    if (-not $listMap.ContainsKey($ListName)) { return }
    try {
        $escaped = [System.Security.SecurityElement]::Escape($Value)
        $query = "<View><Query><Where><Eq><FieldRef Name='$Field' /><Value Type='Text'>$escaped</Value></Eq></Where></Query><RowLimit>5</RowLimit></View>"
        $items = @(Get-PnPListItem -List $listMap[$ListName].Id -Query $query -Connection $connection -ErrorAction Stop)
        Add-Result "CAML read $ListName.$Field" 'PASS' "rows=$(@($items).Count) filter=$Value"
    }
    catch {
        Add-Result "CAML read $ListName.$Field" 'FAIL' $_.Exception.Message
    }
}

Test-CamLRead -ListName 'EMI_PAY_OrgUnits' -Field 'OUCode' -Value 'OU_PBCM'
Test-CamLRead -ListName 'EMI_PAY_Commands' -Field 'State' -Value 'Pending'
Test-CamLRead -ListName 'EMI_PAY_PaymentTypes' -Field 'PaymentTypeCode' -Value 'SPV_PAYMENT'
Test-CamLRead -ListName 'EMI_PAY_WorkflowSteps' -Field 'StepKey' -Value 'PBCM'

# Choice query for Commands.State (Type=Choice)
try {
    $q = "<View><Query><Where><Eq><FieldRef Name='State' /><Value Type='Choice'>Pending</Value></Eq></Where></Query><RowLimit>5</RowLimit></View>"
    $pending = @(Get-PnPListItem -List $listMap['EMI_PAY_Commands'].Id -Query $q -Connection $connection -ErrorAction Stop)
    Add-Result 'CAML Commands State=Pending (Choice)' 'PASS' "rows=$(@($pending).Count)"
}
catch {
    Add-Result 'CAML Commands State=Pending (Choice)' 'FAIL' $_.Exception.Message
}

# 6) Summary
Write-Host ""
$pass = @($results | Where-Object Status -eq 'PASS').Count
$warn = @($results | Where-Object Status -eq 'WARN').Count
$fail = @($results | Where-Object Status -eq 'FAIL').Count
Write-Host "=== Summary: PASS=$pass  WARN=$warn  FAIL=$fail ===" -ForegroundColor $(if ($fail -gt 0) { 'Red' } else { 'Green' })

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $PSScriptRoot "preflight-report-$stamp.csv"
$results | Export-Csv -LiteralPath $out -NoTypeInformation -Encoding UTF8
Write-Host "Report: $out" -ForegroundColor Cyan

if ($fail -gt 0) {
    Write-Host "Preflight FAIL — chưa chạy Seed Apply / Orchestrator." -ForegroundColor Red
    exit 1
}

Write-Host @"

Preflight PASS. Bước tiếp:
  .\01_Seed_Config.ps1 -Mode Validate
  .\01_Seed_Config.ps1 -Mode Apply
  .\03_Enqueue_Demo_Commands.ps1 -Scenario CreateOnly
  .\02_Run_Orchestrator.ps1

"@ -ForegroundColor Green
exit 0
