#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$libs = Read-DemoJson 'seed\libraries.json'
$dry = ($Mode -eq 'DryRun')
$manifest = Read-Manifest
$result = [ordered]@{ site = $cfg.hubSiteUrl; mode = $Mode; actions = @() }

Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

foreach ($lib in $libs.hub) {
  $r = Ensure-DemoList -Title $lib.title -UrlName $lib.urlName -Kind $lib.kind -DryRun:$dry -EnableVersioning
  $result.actions += [pscustomobject]@{ urlName = $lib.urlName; action = $r.Action }
  if (-not $dry -and $r.List) {
    $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.hubSiteUrl -Kind $lib.kind -UrlName $lib.urlName -Id ([string]$r.List.Id) -Title $lib.title
    # Hub metadata (reuse same field set where applicable)
    foreach ($f in $libs.metadataFields) {
      Ensure-DemoField -List $r.List -FieldDef $f -DryRun:$dry | Out-Null
    }
    if ($lib.urlName -eq 'Lists/EMI_DEMO_DanhMucChung') {
      foreach ($f in $libs.listFieldsDanhMucChung) {
        Ensure-DemoField -List $r.List -FieldDef $f -DryRun:$dry | Out-Null
      }
    }
  } elseif ($dry) {
    Write-Host "  (+ metadata fields planned for $($lib.urlName))"
  }
}

# Hub groups (demo)
$perm = Read-DemoJson 'seed\permissions.json'
$members = Get-DemoMembers
foreach ($g in $perm.hubGroups) {
  Ensure-DemoGroup -Title $g.title -Description $g.description -DryRun:$dry | Out-Null
  if (-not $dry) {
    $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.hubSiteUrl -Kind 'SharePointGroup' -UrlName $g.title -Title $g.title
  }
  $key = [string]$g.memberKey
  $m = $null
  if ($key -eq 'emi_all_read_group') {
    # may be string group name or null
    if ($members.emi_all_read_group) { Add-MembersToGroup -GroupTitle $g.title -Members @($members.emi_all_read_group) -DryRun:$dry | Out-Null }
    else { Write-Host "  GR-EMI-ALL-READ: chưa ánh xạ — trạng thái PENDING (không dùng Everyone)" }
  } else {
    $m = $members.$key
    Add-MembersToGroup -GroupTitle $g.title -Members $m -DryRun:$dry | Out-Null
  }
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline
Write-DemoReport -Prefix "provision-hub-$Mode" -Object $result -Ext json | Out-Null
Write-Host "DONE hub $Mode"
