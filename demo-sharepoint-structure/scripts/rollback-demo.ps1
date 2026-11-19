#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$Config = '',
  [switch]$ConfirmRollback,
  [string]$ConfirmPhrase = ''
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path (Get-DemoRoot) 'config\settings.json'
}
$cfg = Get-DemoConfig -ConfigPath $Config
$manifest = Read-Manifest

if (-not $ConfirmRollback -or $ConfirmPhrase -ne 'DELETE-EMI-DEMO-2026') {
  throw "Rollback bị chặn. Cần -ConfirmRollback -ConfirmPhrase 'DELETE-EMI-DEMO-2026'. Chỉ xóa object trong reports/manifest.json."
}

Write-Warning 'Rollback sẽ cố xóa resources trong manifest (file → folder/docset → lists → groups).'

function Remove-BySite([string]$SiteUrl, $Resources) {
  Connect-DemoSite -Url $SiteUrl -ClientId $cfg.clientId
  # Files first
  foreach ($r in ($Resources | Where-Object { $_.kind -eq 'File' })) {
    try { Remove-PnPFile -SiteRelativeUrl $r.urlName -Force -ErrorAction Stop; Write-Host "DEL FILE $($r.urlName)" }
    catch { Write-Warning "File $($r.urlName): $($_.Exception.Message)" }
  }
  foreach ($r in ($Resources | Where-Object { $_.kind -in @('DocumentSet','Folder') })) {
    try { Remove-PnPFolder -Name ([IO.Path]::GetFileName($r.urlName)) -Folder ([IO.Path]::GetDirectoryName($r.urlName).Replace('\','/')) -ErrorAction Stop; Write-Host "DEL FOLDER $($r.urlName)" }
    catch { Write-Warning "Folder $($r.urlName): $($_.Exception.Message)" }
  }
  foreach ($r in ($Resources | Where-Object { $_.kind -in @('DocumentLibrary','GenericList') })) {
    try { Remove-PnPList -Identity $r.urlName -Force -ErrorAction Stop; Write-Host "DEL LIST $($r.urlName)" }
    catch { Write-Warning "List $($r.urlName): $($_.Exception.Message)" }
  }
  foreach ($r in ($Resources | Where-Object { $_.kind -eq 'SharePointGroup' })) {
    try { Remove-PnPGroup -Identity $r.urlName -ErrorAction Stop; Write-Host "DEL GROUP $($r.urlName)" }
    catch { Write-Warning "Group $($r.urlName): $($_.Exception.Message)" }
  }
  Disconnect-PnPOnline
}

$bySite = $manifest.resources | Group-Object siteUrl
foreach ($g in $bySite) {
  Remove-BySite -SiteUrl $g.Name -Resources $g.Group
}

Write-Host 'Rollback attempt finished. Kiểm tra thủ công trên SharePoint.'
