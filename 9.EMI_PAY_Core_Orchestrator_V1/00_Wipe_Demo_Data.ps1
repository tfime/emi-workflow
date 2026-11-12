# EMI PAY — Xóa toàn bộ item demo trên CECM (giữ schema + RBAC)
# Mặc định xóa list vận hành + CFG. SystemSettings: chỉ đếm, không xóa trừ khi -IncludeSystemSettings.
# DocsWorking: không xóa file thư viện (xử lý tay nếu cần).
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$GuidPath = (Join-Path $PSScriptRoot 'config\list-guids.json'),
    [ValidateSet('Validate', 'Apply')]
    [string]$Mode = 'Validate',
    [switch]$IncludeSystemSettings,
    [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Off
Import-Module PnP.PowerShell -ErrorAction Stop

$connection = Get-PnPConnection -ErrorAction Stop
$web = Get-PnPWeb -Connection $connection -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

if ($Mode -eq 'Apply' -and -not $ConfirmApply) {
    throw 'Apply requires -ConfirmApply (demo wipe is destructive).'
}

$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Thứ tự: con trước, master sau
$wipeOrder = @(
    'EMI_PAY_Commands',
    'EMI_PAY_Assignments',
    'EMI_PAY_StepReviews',
    'EMI_PAY_ChecklistItems',
    'EMI_PAY_DocumentIndex',
    'EMI_PAY_WorkItems',
    'EMI_PAY_ActivityPublic',
    'EMI_PAY_ActivityInternal',
    'EMI_PAY_Notifications',
    'EMI_PAY_ArchiveJobs',
    'EMI_PAY_Requests',
    'EMI_PAY_StepRecipients',
    'EMI_PAY_ChecklistTemplates',
    'EMI_PAY_OrgMembers',
    'EMI_PAY_OrgUnits',
    'EMI_PAY_WorkflowSteps',
    'EMI_PAY_WorkflowVersions',
    'EMI_PAY_PaymentTypes'
)

if ($IncludeSystemSettings) {
    $wipeOrder += 'EMI_PAY_SystemSettings'
}

$report = [System.Collections.Generic.List[object]]::new()

foreach ($name in $wipeOrder) {
    $listId = [Guid]$guids.$name
    $items = @(Get-PnPListItem -List $listId -PageSize 2000 -Fields 'ID' -Connection $connection)
    $count = $items.Count
    $status = if ($Mode -eq 'Validate') { "WouldDelete:$count" } else { "Deleting:$count" }
    Write-Host "$name  items=$count  $Mode" -ForegroundColor $(if ($count -gt 0) { 'Yellow' } else { 'DarkGray' })

    if ($Mode -eq 'Apply' -and $count -gt 0) {
        $batch = 0
        foreach ($it in $items) {
            Remove-PnPListItem -List $listId -Identity $it.Id -Force -Connection $connection | Out-Null
            $batch++
            if (($batch % 50) -eq 0) {
                Write-Host "  ... deleted $batch / $count" -ForegroundColor DarkGray
            }
        }
        $status = "Deleted:$count"
    }
    $report.Add([pscustomobject]@{ List = $name; ItemCount = $count; Status = $status })
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $PSScriptRoot "wipe-report-$Mode-$stamp.csv"
$report | Export-Csv -LiteralPath $out -Encoding UTF8 -NoTypeInformation
Write-Host "Report: $out" -ForegroundColor Cyan
$report | Format-Table -AutoSize

if ($Mode -eq 'Validate') {
    Write-Host 'VALIDATE DONE. Chạy: .\00_Wipe_Demo_Data.ps1 -Mode Apply -ConfirmApply' -ForegroundColor Cyan
} else {
    Write-Host 'APPLY DONE. Tiếp: 02 MemberRole → 03 CfgKey → 01 Seed.' -ForegroundColor Green
}
