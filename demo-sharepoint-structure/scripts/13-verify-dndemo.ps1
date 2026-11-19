#Requires -Version 7.0
[CmdletBinding()]
param([string]$ConfigPath = '')
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$projects = Read-DemoJson 'seed\projects.json'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $lines.Add($s); Write-Host $s }
function Check([string]$name, [bool]$pass, [string]$detail = '') {
  $mark = if ($pass) { 'PASS' } else { 'FAIL' }
  L "- [$mark] $name$(if($detail){": $detail"})"
}

L "# Verify DnDemo project libraries"
L "- Time: $((Get-Date).ToString('o'))"
L "- Site: $($cfg.projectSiteUrl)"
L ""

Connect-DemoSite -Url $cfg.projectSiteUrl -ClientId $cfg.clientId
$web = Get-PnPWeb
Check 'Connected DnDemo' ($web.Url.TrimEnd('/') -eq $cfg.projectSiteUrl.TrimEnd('/')) $web.Url

foreach ($lib in $projects.libraries) {
  Check "Library $($lib.urlName)" (Test-ListExists $lib.urlName)
  foreach ($ph in $projects.phases) {
    $folder = Get-PnPFolder -Url "$($lib.urlName)/$($ph.folderUrl)" -ErrorAction SilentlyContinue
    Check "  phase $($ph.folderUrl)" ($null -ne $folder)
  }
  $files = @(Get-PnPListItem -List $lib.urlName -PageSize 200 -ErrorAction SilentlyContinue | Where-Object { $_.FileSystemObjectType -eq 'File' })
  Check "  files >= 4 in $($lib.urlName)" ($files.Count -ge 4) "count=$($files.Count)"
}

Disconnect-PnPOnline
Write-DemoReport -Prefix 'verify-dndemo' -Object ($lines -join "`n") | Out-Null
