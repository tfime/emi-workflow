#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$perm = Read-DemoJson 'seed\permissions.json'
$members = Get-DemoMembers
$dry = ($Mode -eq 'DryRun')
$manifest = Read-Manifest
$matrix = New-Object System.Collections.Generic.List[string]
$matrix.Add('Site,Library,Principal,Role,HasUnique,Action')

$script:RoleDefs = $null
function Get-LocalizedRoles {
  if ($null -eq $script:RoleDefs) {
    $script:RoleDefs = @(Get-PnPRoleDefinition)
  }
  return $script:RoleDefs
}
function Resolve-RoleName([string]$Role) {
  # Map English → RoleTypeKind → localized Name (tránh lỗi Unicode Đọc/Đóng góp)
  $kind = switch -Regex ($Role) {
    '^(Read|Reader)$' { 'Reader'; break }
    '^(Contribute|Contributor)$' { 'Contributor'; break }
    '^(Edit|Editor)$' { 'Editor'; break }
    '^(Full Control|FullControl)$' { 'Administrator'; break }
    default { $null }
  }
  if ($null -eq $kind) { return $Role }
  $hit = Get-LocalizedRoles | Where-Object { [string]$_.RoleTypeKind -eq $kind } | Select-Object -First 1
  if ($null -eq $hit) { throw "Không tìm thấy RoleDefinition RoleTypeKind=$kind trên site." }
  return [string]$hit.Name
}

Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId
$script:RoleDefs = $null  # refresh per site

# Groups
foreach ($g in $perm.cecmGroups) {
  Ensure-DemoGroup -Title $g.title -Description $g.description -DryRun:$dry | Out-Null
  if (-not $dry) {
    $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.emiSiteUrl -Kind 'SharePointGroup' -UrlName $g.title -Title $g.title
  }
  Add-MembersToGroup -GroupTitle $g.title -Members $members.($g.memberKey) -DryRun:$dry | Out-Null
}

# ACL on 5 libraries — only if list exists and (created by demo OR named TH-*)
foreach ($libName in @($perm.cecmAcl.PSObject.Properties.Name)) {
  $list = Get-ListSafe -UrlName $libName
  # Safety: only touch demo TH-* libraries
  if ($libName -notlike 'TH-*') {
    Write-Warning "SKIP ACL $libName — ngoài phạm vi TH-*"
    continue
  }

  if ($dry) {
    $state = if ($null -eq $list) { 'MISSING→sẽ tạo trước' } else { "exists HasUnique=$($list.HasUniqueRoleAssignments)" }
    Write-Host "PLAN ACL $libName ($state) — break inheritance + matrix"
    foreach ($ace in $perm.cecmAcl.$libName) {
      $matrix.Add("$($cfg.emiSiteUrl),$libName,$($ace.group),$($ace.role),?,Plan")
      Write-Host "  PLAN $($ace.group) => $($ace.role)"
    }
    continue
  }

  if ($null -eq $list) {
    Write-Warning "SKIP ACL $libName — list chưa tồn tại"
    continue
  }

  Write-Host "ACL $libName (HasUnique=$($list.HasUniqueRoleAssignments))"

  # Break inheritance without copying — then re-add Owners + matrix
  if (-not $list.HasUniqueRoleAssignments) {
    Set-PnPList -Identity $list.Id -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$true
    Write-Host "  BREAK inheritance $libName"
  } else {
    Write-Host "  Already unique $libName — reset demo principals carefully"
  }

  # Ensure Site Owners retain Full Control (tên role bản địa hóa)
  $owners = Get-PnPGroup -AssociatedOwnerGroup
  $full = Resolve-RoleName 'Full Control'
  $read = Resolve-RoleName 'Read'
  $contrib = Resolve-RoleName 'Contribute'
  $edit = Resolve-RoleName 'Edit'
  try {
    Set-PnPListPermission -Identity $list.Id -Group $owners.Title -AddRole $full -ErrorAction Stop
  } catch {
    Write-Warning "  Không gán $full cho Owners: $($_.Exception.Message)"
  }

  # Remove default Members/Visitors if present
  foreach ($assoc in @((Get-PnPGroup -AssociatedMemberGroup -ErrorAction SilentlyContinue), (Get-PnPGroup -AssociatedVisitorGroup -ErrorAction SilentlyContinue))) {
    if ($null -eq $assoc) { continue }
    foreach ($rn in @($read, $contrib, $edit, $full)) {
      try { Set-PnPListPermission -Identity $list.Id -Group $assoc.Title -RemoveRole $rn -ErrorAction SilentlyContinue } catch {}
    }
  }

  foreach ($ace in $perm.cecmAcl.$libName) {
    $role = Resolve-RoleName $ace.role
    try {
      Set-PnPListPermission -Identity $list.Id -Group $ace.group -AddRole $role -ErrorAction Stop
      Write-Host "  GRANT $($ace.group) => $role"
      $matrix.Add("$($cfg.emiSiteUrl),$libName,$($ace.group),$role,True,Granted")
    } catch {
      Write-Warning "  GRANT FAIL $($ace.group)/$role : $($_.Exception.Message)"
      $matrix.Add("$($cfg.emiSiteUrl),$libName,$($ace.group),$role,True,FAIL:$($_.Exception.Message)")
    }
  }

  $list2 = Get-PnPList -Identity $libName -Includes RoleAssignments, HasUniqueRoleAssignments
  $matrix.Add("$($cfg.emiSiteUrl),$libName,__HasUnique__,$($list2.HasUniqueRoleAssignments),$($list2.HasUniqueRoleAssignments),Audit")
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline

# Hub ACL (lighter — optional break)
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId
$script:RoleDefs = $null  # Hub có thể khác localization
foreach ($libName in @($perm.hubAcl.PSObject.Properties.Name)) {
  $list = Get-ListSafe -UrlName $libName
  if ($dry) {
    $state = if ($null -eq $list) { 'MISSING→sẽ tạo trước' } else { 'exists' }
    Write-Host "PLAN Hub ACL $libName ($state)"
    foreach ($ace in $perm.hubAcl.$libName) {
      Write-Host "  PLAN $($ace.group)=>$($ace.role)"
      $matrix.Add("$($cfg.hubSiteUrl),$libName,$($ace.group),$($ace.role),?,Plan")
    }
    continue
  }
  if ($null -eq $list) {
    Write-Warning "SKIP Hub ACL $libName — missing"
    continue
  }
  if (-not $list.HasUniqueRoleAssignments) {
    Set-PnPList -Identity $list.Id -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$true
  }
  $owners = Get-PnPGroup -AssociatedOwnerGroup
  Set-PnPListPermission -Identity $list.Id -Group $owners.Title -AddRole (Resolve-RoleName 'Full Control') -ErrorAction SilentlyContinue
  foreach ($ace in $perm.hubAcl.$libName) {
    $role = Resolve-RoleName $ace.role
    try {
      Set-PnPListPermission -Identity $list.Id -Group $ace.group -AddRole $role -ErrorAction Stop
      $matrix.Add("$($cfg.hubSiteUrl),$libName,$($ace.group),$role,True,Granted")
    } catch {
      $matrix.Add("$($cfg.hubSiteUrl),$libName,$($ace.group),$role,True,FAIL:$($_.Exception.Message)")
    }
  }
}
Disconnect-PnPOnline

Write-DemoReport -Prefix 'permission-matrix' -Object ($matrix -join "`n") -Ext csv | Out-Null
Write-Host "DONE permissions $Mode"
