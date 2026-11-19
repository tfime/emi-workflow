# EMI PAY — Schema: Requests.RoutePlanJson + Status choice AwaitingManager
# Yêu cầu: Connect-PnPOnline tới CECM. Idempotent.
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
$listId = [Guid]$guids.EMI_PAY_Requests

# --- RoutePlanJson (Note / multi-line text) ---
$rpName = 'RoutePlanJson'
$rp = Get-PnPField -List $listId -Identity $rpName -ErrorAction SilentlyContinue -Connection $connection
if ($null -eq $rp) {
    Write-Host "MISSING: EMI_PAY_Requests.$rpName" -ForegroundColor Yellow
    if ($Mode -eq 'Apply') {
        Add-PnPField -List $listId -InternalName $rpName -DisplayName 'Route plan (JSON)' `
            -Type Note -Group 'EMI PAY' -AddToDefaultView -Connection $connection | Out-Null
        Set-PnPField -List $listId -Identity $rpName -Values @{
            Description = 'Pin StepKey→OUCode lúc tạo/trình duyệt. Ví dụ {"BPCM2_TECH":"OU_KYTHUAT","BPCM3_PRICE":"OU_KINHTE",...}'
        } -Connection $connection | Out-Null
        Write-Host "ADDED: EMI_PAY_Requests.$rpName" -ForegroundColor Green
    }
} else {
    Write-Host "EXISTS: EMI_PAY_Requests.$rpName" -ForegroundColor DarkGray
}

# --- Status choice AwaitingManager ---
$statusName = 'Status'
$status = Get-PnPField -List $listId -Identity $statusName -ErrorAction SilentlyContinue -Connection $connection
if ($null -eq $status) {
    Write-Host "MISSING: EMI_PAY_Requests.$statusName — không tạo mới Status; kiểm tra schema." -ForegroundColor Red
    if ($Mode -eq 'Apply') { throw "EMI_PAY_Requests.Status không tồn tại" }
} else {
    Get-PnPProperty -ClientObject $status -Property Choices -Connection $connection | Out-Null
    $old = @($status.Choices)
    $need = 'AwaitingManager'
    if ($need -in $old) {
        Write-Host "EXISTS: Status already has $need" -ForegroundColor DarkGray
    } else {
        Write-Host ("Status choices=[{0}] — will add {1}" -f ($old -join ','), $need) -ForegroundColor Yellow
        if ($Mode -eq 'Apply') {
            $newChoices = [string[]](@($old) + $need)
            $status.Choices = $newChoices
            $status.Update()
            Invoke-PnPQuery -Connection $connection
            Write-Host "EXTENDED: Status += $need" -ForegroundColor Green
        }
    }
}

if ($Mode -eq 'Validate') {
    Write-Host 'VALIDATE DONE. Run -Mode Apply to add RoutePlanJson / AwaitingManager.' -ForegroundColor Cyan
} else {
    Write-Host 'APPLY DONE.' -ForegroundColor Cyan
}
