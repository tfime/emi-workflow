# EMI PAY — Schema: thêm cột MemberRole trên EMI_PAY_OrgMembers (BA: Trưởng phòng / Thành viên)
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
$listId = [Guid]$guids.EMI_PAY_OrgMembers
$fieldName = 'MemberRole'
$choices = @('Manager', 'Member')

$existing = Get-PnPField -List $listId -Identity $fieldName -ErrorAction SilentlyContinue -Connection $connection
if ($null -eq $existing) {
    Write-Host "MISSING: EMI_PAY_OrgMembers.$fieldName (Choice)" -ForegroundColor Yellow
    if ($Mode -eq 'Apply') {
        Add-PnPField -List $listId -InternalName $fieldName -DisplayName 'Vai trò tổ chức' `
            -Type Choice -Choices $choices -Group 'EMI PAY' -AddToDefaultView `
            -Connection $connection | Out-Null
        Set-PnPField -List $listId -Identity $fieldName -Values @{
            DefaultValue = 'Member'
            Description  = 'BA: Manager = Trưởng phòng; Member = Thành viên. Manager đồng bộ ManagerUPN trên OrgUnits.'
        } -Connection $connection | Out-Null
        Write-Host "ADDED: EMI_PAY_OrgMembers.$fieldName" -ForegroundColor Green
    }
} else {
    Get-PnPProperty -ClientObject $existing -Property Choices -Connection $connection | Out-Null
    $old = @($existing.Choices)
    $miss = @($choices | Where-Object { $_ -notin $old })
    Write-Host ("EXISTS: EMI_PAY_OrgMembers.$fieldName choices=[{0}] missing=[{1}]" -f ($old -join ','), ($miss -join ','))
    if ($miss.Count -gt 0 -and $Mode -eq 'Apply') {
        Set-PnPField -List $listId -Identity $fieldName -Values @{ Choices = @($old + $miss) } -Connection $connection | Out-Null
        Write-Host "EXTENDED CHOICE: $fieldName" -ForegroundColor Yellow
    }
}

if ($Mode -eq 'Validate') {
    Write-Host 'VALIDATE DONE. Run -Mode Apply to add MemberRole if missing.' -ForegroundColor Cyan
} else {
    Write-Host 'APPLY DONE.' -ForegroundColor Cyan
}
