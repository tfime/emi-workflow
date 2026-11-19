#Requires -Version 7.0
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Preflight','DryRun','Apply','Verify')]
  [string]$Mode,
  [string]$Config = '',
  [switch]$ConfirmApply,
  [switch]$SkipSampleGenerate
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Common.psm1') -Force
if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path (Get-DemoRoot) 'config\settings.json'
}
Write-Host "=== DnDemo Project Libraries :: $Mode ==="

switch ($Mode) {
  'Preflight' {
    $cfg = Get-DemoConfig -ConfigPath $Config
    if (-not $cfg.projectSiteUrl) { throw 'Thiếu projectSiteUrl trong settings.json' }
    Connect-DemoSite -Url $cfg.projectSiteUrl -ClientId $cfg.clientId
    $web = Get-PnPWeb
    Write-Host "PASS connect: $($web.Url) ($($web.Title))"
    $projects = Read-DemoJson 'seed\projects.json'
    foreach ($lib in $projects.libraries) {
      $ex = Test-ListExists $lib.urlName
      Write-Host "$(if($ex){'EXISTS'}else{'MISSING'}) $($lib.urlName)"
    }
    Disconnect-PnPOnline
  }
  'DryRun' {
    if (-not $SkipSampleGenerate) { & (Join-Path $here '10-Generate-ProjectSamples.ps1') }
    & (Join-Path $here '11-provision-dndemo.ps1') -ConfigPath $Config -Mode DryRun
    & (Join-Path $here '12-seed-dndemo.ps1') -ConfigPath $Config -Mode DryRun
  }
  'Apply' {
    if (-not $ConfirmApply) { throw 'Cần -ConfirmApply để Apply DnDemo.' }
    if (-not $SkipSampleGenerate) { & (Join-Path $here '10-Generate-ProjectSamples.ps1') }
    & (Join-Path $here '11-provision-dndemo.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '12-seed-dndemo.ps1') -ConfigPath $Config -Mode Apply
    & (Join-Path $here '13-verify-dndemo.ps1') -ConfigPath $Config
  }
  'Verify' {
    & (Join-Path $here '13-verify-dndemo.ps1') -ConfigPath $Config
  }
}
