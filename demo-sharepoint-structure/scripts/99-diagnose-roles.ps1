#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath (Join-Path (Get-DemoRoot) 'config\settings.json')
Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId
Write-Host '=== Role definitions ==='
Get-PnPRoleDefinition | Select-Object Name, RoleTypeKind, Id | Format-Table -AutoSize
Write-Host '=== ISO-DGNB item ==='
$item = Get-PnPListItem -List 'TH-ISO' -PageSize 200 | Where-Object { $_.FieldValues.FileLeafRef -eq 'ISO-DGNB-2026-01' } | Select-Object -First 1
if ($null -eq $item) { Write-Host 'missing'; Disconnect-PnPOnline; return }
Get-PnPProperty -ClientObject $item -Property ContentType | Out-Null
Write-Host "ItemId=$($item.Id)"
Write-Host "ContentType.Name=$($item.ContentType.Name)"
Write-Host "ContentType.Id=$($item.ContentType.StringId)"
Write-Host "FSObjType=$($item.FieldValues.FSObjType)"
# ACL sample
$list = Get-PnPList -Identity 'TH-Shared' -Includes HasUniqueRoleAssignments, RoleAssignments
Get-PnPProperty -ClientObject $list -Property RoleAssignments | Out-Null
Write-Host "TH-Shared HasUnique=$($list.HasUniqueRoleAssignments) RoleAssignments=$($list.RoleAssignments.Count)"
foreach ($ra in $list.RoleAssignments) {
  Get-PnPProperty -ClientObject $ra -Property Member, RoleDefinitionBindings | Out-Null
  $roles = ($ra.RoleDefinitionBindings | ForEach-Object { $_.Name }) -join ','
  Write-Host "  $($ra.Member.Title) => $roles"
}
Disconnect-PnPOnline
