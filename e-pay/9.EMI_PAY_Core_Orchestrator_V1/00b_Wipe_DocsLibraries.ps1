# EMI PAY — Xóa folder/file test trong DocsWorking + DocsInternal (giữ thư viện)
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [ValidateSet('Validate', 'Apply')]
    [string]$Mode = 'Validate',
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
    throw 'Apply requires -ConfirmApply'
}

$libs = @('EMI_PAY_DocsWorking', 'EMI_PAY_DocsInternal')
$report = [System.Collections.Generic.List[object]]::new()

foreach ($lib in $libs) {
    $list = Get-PnPList -Identity $lib -Connection $connection -ErrorAction Stop
    # Mọi item trừ Forms/system — xóa file + folder (FSObjType 0=file, 1=folder)
    $items = @(Get-PnPListItem -List $list -PageSize 2000 -Fields 'ID','FileRef','FileLeafRef','FSObjType' -Connection $connection)
    $usable = @($items | Where-Object {
            $ref = [string]$_.FieldValues['FileRef']
            $leaf = [string]$_.FieldValues['FileLeafRef']
            if ([string]::IsNullOrWhiteSpace($ref)) { return $false }
            if ($ref -match '/Forms/') { return $false }
            if ($leaf -eq 'Forms') { return $false }
            return $true
        })

    Write-Host "$lib  items=$($usable.Count)  $Mode" -ForegroundColor $(if ($usable.Count -gt 0) { 'Yellow' } else { 'DarkGray' })
    foreach ($it in $usable | Select-Object -First 40) {
        Write-Host ("  [{0}] {1}" -f $it.FieldValues['FSObjType'], $it.FieldValues['FileRef']) -ForegroundColor DarkGray
    }
    if ($usable.Count -gt 40) {
        Write-Host "  ... +$($usable.Count - 40) more" -ForegroundColor DarkGray
    }

    $deleted = 0
    if ($Mode -eq 'Apply' -and $usable.Count -gt 0) {
        # Folder trước khi file? Xóa từ sâu → nông theo độ dài FileRef giảm dần
        $ordered = @($usable | Sort-Object { ([string]$_.FieldValues['FileRef']).Length } -Descending)
        foreach ($it in $ordered) {
            Remove-PnPListItem -List $list -Identity $it.Id -Force -Recycle -Connection $connection | Out-Null
            $deleted++
            if (($deleted % 25) -eq 0) {
                Write-Host "  ... deleted $deleted / $($usable.Count)" -ForegroundColor DarkGray
            }
        }
    }

    $report.Add([pscustomobject]@{
            Library   = $lib
            ItemCount = $usable.Count
            Status    = if ($Mode -eq 'Validate') { "WouldDelete:$($usable.Count)" } else { "Deleted:$deleted" }
        })
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $PSScriptRoot "wipe-docs-report-$Mode-$stamp.csv"
$report | Export-Csv -LiteralPath $out -Encoding UTF8
Write-Host "Report: $out" -ForegroundColor Cyan
$report | Format-Table -AutoSize

if ($Mode -eq 'Validate') {
    Write-Host 'VALIDATE DONE. Chạy: .\00b_Wipe_DocsLibraries.ps1 -Mode Apply -ConfirmApply' -ForegroundColor Cyan
} else {
    Write-Host 'APPLY DONE — Docs libraries cleaned.' -ForegroundColor Green
}
