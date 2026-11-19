#requires -Version 7.4
<#
EMI PAY - RBAC baseline for SharePoint site CECM, v1.2
Modes:
 Preview (default) : read-only inventory and intended rights
 Groups            : create missing SharePoint groups WITHOUT assigning users/permissions
 Baseline          : create groups, isolate ONLY the 23 EMI_PAY lists/libraries,
                     keep site Owners, add system admins & automation roles;
                     no ordinary user gets blanket access to payment data.

Does not provision dynamic per-item/file permissions, SPFx, Power Automate or members.
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ClientId,
 [ValidateSet('Preview','Groups','Baseline')][string]$Mode='Preview',
 [string]$SiteUrl='https://emicomvn.sharepoint.com/sites/cecm',
 [string]$SchemaPath=(Join-Path $PSScriptRoot 'schema.json')
)
$ErrorActionPreference='Stop'
$expected='https://emicomvn.sharepoint.com/sites/cecm'
if ($SiteUrl.TrimEnd('/') -ne $expected) { throw "Chỉ cho phép site $expected" }
if (-not (Test-Path -LiteralPath $SchemaPath)) { throw "Thiếu schema.json: $SchemaPath" }
$schema=Get-Content -LiteralPath $SchemaPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($schema.siteUrl -ne $expected) { throw 'schema siteUrl không khớp CECM' }
if ($schema.components.Count -ne 23) { throw 'Dừng: schema phải gồm đúng 23 thành phần.' }
if ($schema.components.Where({-not $_.name.StartsWith('EMI_PAY_')}).Count -gt 0) { throw 'Phát hiện đối tượng không thuộc EMI_PAY_.' }
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) { throw 'Chưa có PnP.PowerShell' }

$groups=@(
 @{Name='GR-PAY-SYSADM'; Desc='Quản trị kỹ thuật ứng dụng EMI PAY'},
 @{Name='GR-PAY-FLOW-SVC'; Desc='Tài khoản kết nối Power Automate; yêu cầu phân quyền chuyên dụng'},
 @{Name='GR-PAY-PROCADM'; Desc='Quản trị cấu hình quy trình và checklist'},
 @{Name='GR-PAY-CHAIR'; Desc='CT-HĐQT xem hồ sơ và nhật ký; không được chỉnh sửa'},
 @{Name='GR-PAY-TCKT'; Desc='Nhân sự TCKT - phân quyền theo hồ sơ thực tế'},
 @{Name='GR-PAY-USERS'; Desc='Nhân sự sử dụng workflow - phân quyền theo hồ sơ thực tế'},
 @{Name='GR-PAY-AUDIT'; Desc='Kiểm toán: chờ xác nhận chính sách quyền'}
)
$config=@(
 'EMI_PAY_OrgUnits','EMI_PAY_OrgMembers','EMI_PAY_PaymentTypes',
 'EMI_PAY_WorkflowVersions','EMI_PAY_WorkflowSteps','EMI_PAY_StepRecipients',
 'EMI_PAY_ChecklistTemplates','EMI_PAY_SystemSettings'
)
$chairRead=@(
 'EMI_PAY_Requests','EMI_PAY_ChecklistItems','EMI_PAY_WorkItems',
 'EMI_PAY_Assignments','EMI_PAY_StepReviews','EMI_PAY_DocumentIndex',
 'EMI_PAY_ActivityPublic','EMI_PAY_ActivityInternal',
 'EMI_PAY_DocsWorking','EMI_PAY_DocsInternal',
 'EMI_PAY_ArchiveCompleted','EMI_PAY_ArchiveCancelled'
)

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId
$web=Get-PnPWeb -Includes AssociatedOwnerGroup
if ($null -eq $web.AssociatedOwnerGroup -or [string]::IsNullOrWhiteSpace($web.AssociatedOwnerGroup.Title)) {
 throw 'Không xác định được Site Owners group; dừng để tránh mất quyền.'
}
$ownerGroup=[string]$web.AssociatedOwnerGroup.Title
$defs=@(Get-PnPRoleDefinition)
$full=@($defs | Where-Object { [string]$_.RoleTypeKind -eq 'Administrator' }) | Select-Object -First 1
$read=@($defs | Where-Object { [string]$_.RoleTypeKind -eq 'Reader' }) | Select-Object -First 1
$contrib=@($defs | Where-Object { [string]$_.RoleTypeKind -eq 'Contributor' }) | Select-Object -First 1
if (-not $full -or -not $read -or -not $contrib) { throw 'Không xác định được RoleDefinitions Full Control/Read/Contribute' }
Write-Host "Site: $SiteUrl  |  Mode: $Mode"
Write-Host "Owners: $ownerGroup | Roles: $($full.Name), $($read.Name), $($contrib.Name)"

# Preflight all lists - NEVER touch lists outside EMI_PAY_.
$targets=@()
foreach($o in $schema.components) {
 $name=[string]$o.name
 $relative=if($o.kind -eq 'DocumentLibrary'){$name}else{"Lists/$name"}
 $list=Get-PnPList -Identity $relative -Includes HasUniqueRoleAssignments -ErrorAction Stop
 $targets+=@{Name=$name; Id=$list.Id; Display=$o.displayName; Unique=[bool]$list.HasUniqueRoleAssignments}
}

if ($Mode -eq 'Preview') {
 foreach($g in $groups) {
   $old=Get-PnPGroup -Identity $g.Name -ErrorAction SilentlyContinue
   Write-Host ("GROUP {0,-22} {1}" -f $g.Name, $(if($old){'EXISTS'}else{'CREATE'}))
 }
 foreach($x in $targets) {
   $label=if($x.Unique){'ALREADY UNIQUE - review before baseline'}else{'INHERITING - will isolate'}
   Write-Host ("LIST  {0,-33} {1}" -f $x.Name,$label)
 }
 Write-Warning 'PREVIEW: chưa thay đổi site. Khi Baseline, chỉ Site Owners + SYSADM + FLOW-SVC có quyền trên List lõi; PROCADM được Contribute trên 8 List cấu hình, CHAIR chỉ Read trên 12 List/Library hồ sơ.'
 return
}

foreach($g in $groups) {
 if (-not (Get-PnPGroup -Identity $g.Name -ErrorAction SilentlyContinue)) {
   New-PnPGroup -Title $g.Name -Description $g.Desc | Out-Null
   Write-Host "GROUP CREATED: $($g.Name)"
 } else { Write-Host "GROUP EXISTS: $($g.Name)" }
}
if ($Mode -eq 'Groups') {
 Write-Host 'DONE: Chỉ tạo nhóm. Chưa đổi quyền của bất cứ list/library nào.'
 return
}

# FIRST enforce roles for isolated lists; do not reset inheritance on lists already unique.
# Fail closed for previously customized permission configurations.
$unique=@($targets | Where-Object {$_.Unique})
if ($unique.Count -gt 0) {
 throw ("ABORT: đã có $($unique.Count) Lists/Libraries có unique permissions. Không tự ghi đè quyền đã cấu hình. Cần audit trước: " + (($unique | ForEach-Object {$_.Name}) -join ', '))
}
Write-Warning 'BASELINE: Sắp tách kế thừa 23 Lists/Libraries EMI_PAY_. Quyền chung ở Site Members/Visitors sẽ không còn áp dụng trên các thành phần này.'
foreach ($x in $targets) {
 Write-Host "ISOLATE: $($x.Name)"
 # Without -CopyRoleAssignments, SharePoint starts with invoking user only.
 # Immediately restore the associated Site Owners group to avoid access loss.
 Set-PnPList -Identity $x.Id -BreakRoleInheritance
 Set-PnPListPermission -Identity $x.Id -Group $ownerGroup -AddRole $full.Name
 Set-PnPListPermission -Identity $x.Id -Group 'GR-PAY-SYSADM' -AddRole $full.Name
 Set-PnPListPermission -Identity $x.Id -Group 'GR-PAY-FLOW-SVC' -AddRole $full.Name
 if ($x.Name -in $config) {
   Set-PnPListPermission -Identity $x.Id -Group 'GR-PAY-PROCADM' -AddRole $contrib.Name
 }
 if ($x.Name -in $chairRead) {
   Set-PnPListPermission -Identity $x.Id -Group 'GR-PAY-CHAIR' -AddRole $read.Name
 }
 Write-Host "SECURED: $($x.Name)"
}
Write-Host 'BASELINE COMPLETED - 23 EMI_PAY_ objects isolated.'
Write-Warning 'Chưa thêm người vào nhóm, chưa cấp quyền hồ sơ/tài liệu theo RequestKey, chưa có Flow và SPFx. KHÔNG upload dữ liệu thanh toán thật.'
