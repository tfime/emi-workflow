#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath (Join-Path (Get-DemoRoot) 'config\settings.json')
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

$comps = Get-PnPAvailablePageComponents -Page 'EMI-Hub.aspx'
Write-Host ("Count={0}" -f @($comps).Count)
$comps | Select-Object -First 30 | ForEach-Object {
  Write-Host ("---")
  $_.PSObject.Properties | ForEach-Object { Write-Host ("{0}={1}" -f $_.Name, $_.Value) }
}

Disconnect-PnPOnline
