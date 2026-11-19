#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
if (-not $cfg.projectSiteUrl) { throw 'settings.json thiếu projectSiteUrl.' }
$projects = Read-DemoJson 'seed\projects.json'
$dry = ($Mode -eq 'DryRun')
$root = Get-DemoRoot
$manifest = Read-Manifest
$uploaded = @()

function Convert-Values($values) {
  $ht = @{}
  foreach ($p in $values.PSObject.Properties) { $ht[$p.Name] = $p.Value }
  return $ht
}

Connect-DemoSite -Url $cfg.projectSiteUrl -ClientId $cfg.clientId

foreach ($f in $projects.files) {
  $local = Join-Path $root "sample-files\$($f.localFile)"
  if (-not (Test-Path -LiteralPath $local)) { throw "Missing sample: $local — chạy 10-Generate-ProjectSamples.ps1" }
  $folderUrl = "$($f.library)/$($f.phaseFolder)"
  $target = "$folderUrl/$($f.remoteName)"
  if ($dry) {
    Write-Host "PLAN UPLOAD $target"
    continue
  }
  $existing = Get-PnPFile -Url $target -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "SKIP EXISTS $target"
    continue
  }
  Add-PnPFile -Path $local -Folder $folderUrl -NewFileName $f.remoteName -Values (Convert-Values $f.values) | Out-Null
  Write-Host "UPLOAD $target"
  $uploaded += $target
  $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.projectSiteUrl -Kind 'File' -UrlName $target -Title $f.remoteName
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline
Write-DemoReport -Prefix "seed-dndemo-$Mode" -Object ([pscustomobject]@{ mode = $Mode; uploaded = $uploaded }) -Ext json | Out-Null
Write-Host "DONE DnDemo seed $Mode"
