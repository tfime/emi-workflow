#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
if (-not $cfg.projectSiteUrl) { throw 'settings.json thiếu projectSiteUrl (vd. https://emicomvn.sharepoint.com/sites/DnDemo).' }

$projects = Read-DemoJson 'seed\projects.json'
$dry = ($Mode -eq 'DryRun')
$manifest = Read-Manifest
$result = [ordered]@{ site = $cfg.projectSiteUrl; mode = $Mode; libraries = @() }

Connect-DemoSite -Url $cfg.projectSiteUrl -ClientId $cfg.clientId
$web = Get-PnPWeb
Write-Host "Connected project site: $($web.Url) ($($web.Title))"

foreach ($lib in $projects.libraries) {
  $r = Ensure-DemoList -Title $lib.title -UrlName $lib.urlName -Kind DocumentLibrary -DryRun:$dry -EnableVersioning
  $entry = [ordered]@{ urlName = $lib.urlName; action = $r.Action; phases = @() }
  if (-not $dry -and $r.List) {
    $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.projectSiteUrl -Kind 'DocumentLibrary' -UrlName $lib.urlName -Id ([string]$r.List.Id) -Title $lib.title
    foreach ($f in $projects.metadataFields) {
      Ensure-DemoField -List $r.List -FieldDef $f -DryRun:$dry | Out-Null
    }
    # Views
    $views = Get-PnPView -List $r.List.Id
    if (-not ($views | Where-Object { $_.Title -eq 'Tất cả tài liệu' })) {
      Add-PnPView -List $r.List.Id -Title 'Tất cả tài liệu' -Fields 'FileLeafRef','EMI_ProjectCode','EMI_Phase','EMI_DocCategory','EMI_DocStatus','EMI_Year','Modified' -ErrorAction SilentlyContinue | Out-Null
    }
    if (-not ($views | Where-Object { $_.Title -eq 'Theo giai đoạn' })) {
      Add-PnPView -List $r.List.Id -Title 'Theo giai đoạn' -Fields 'FileLeafRef','EMI_Phase','EMI_DocCategory','EMI_DocStatus','EMI_Year' -ErrorAction SilentlyContinue | Out-Null
    }
  }

  foreach ($ph in ($projects.phases | Sort-Object order)) {
    $path = Ensure-DemoFolder -LibraryUrlName $lib.urlName -FolderPath $ph.folderUrl -DryRun:$dry
    $entry.phases += $ph.folderUrl
    if (-not $dry) {
      $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.projectSiteUrl -Kind 'Folder' -UrlName "$($lib.urlName)/$($ph.folderUrl)" -Title $ph.displayName
    }
  }
  $result.libraries += [pscustomobject]$entry
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline
Write-DemoReport -Prefix "provision-dndemo-$Mode" -Object $result -Ext json | Out-Null
Write-Host "DONE DnDemo provision $Mode"
