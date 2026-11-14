# EMI PAY — ngoại lệ CREATE mở (cách 2): cấp PnP cho GR-PAY-USERS ghi lệnh + đọc CFG.
# Không wipe ACL; chỉ Ensure thêm role. Không đụng ActivityInternal / SystemSettings.
#
#   pwsh -File .\12_Grant_Users_CreateEnqueue.ps1 -Connect
#
# Sau khi chạy: Import Core 1.0.0.23. Dyn ACL hồ sơ vẫn cần Apply riêng để xem/sửa item.
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5',
    [switch]$Connect,
    [string]$UsersGroup = 'GR-PAY-USERS',
    [string]$GuidPath = '',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell -ErrorAction Stop

$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($GuidPath)) {
    $GuidPath = Join-Path (Split-Path $here -Parent) 'config\list-guids.json'
}
$guids = Get-Content -LiteralPath $GuidPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($Connect) {
    Write-Host "Connect-PnPOnline $SiteUrl (ClientId=$ClientId, Interactive)..." -ForegroundColor Cyan
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive
}

$web = Get-PnPWeb -Includes Url
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: connected [$($web.Url)] != expected [$SiteUrl]"
}

$group = Get-PnPGroup -Identity $UsersGroup -ErrorAction Stop
Write-Host "Group: $($group.Title) (Id=$($group.Id))" -ForegroundColor Cyan

# Đọc danh mục để form tạo / RoutePlan (theo GUID — Title SP là tiếng Việt).
$readKeys = @(
    'EMI_PAY_PaymentTypes',
    'EMI_PAY_OrgUnits',
    'EMI_PAY_ChecklistTemplates',
    'EMI_PAY_StepRecipients',
    'EMI_PAY_WorkflowSteps'
)
# Enqueue 5 lệnh Core (CREATE/SUBMIT…). Flow vẫn AUTH.
$contributeKeys = @(
    'EMI_PAY_Commands'
)

# Site tiếng Việt: Reader = «Đọc», Contributor = «Đóng góp» — resolve theo RoleTypeKind.
$allRoles = @(Get-PnPRoleDefinition)
$roleRead = $allRoles | Where-Object { $_.RoleTypeKind -eq 'Reader' } | Select-Object -First 1
$roleContribute = $allRoles | Where-Object { $_.RoleTypeKind -eq 'Contributor' } | Select-Object -First 1
if (-not $roleRead -or -not $roleContribute) {
    throw "Missing Reader/Contributor role definitions on site."
}
Write-Host "Roles: Read='$($roleRead.Name)' Contribute='$($roleContribute.Name)'" -ForegroundColor DarkGray

function Get-ListByKey([string]$Key) {
    $id = [string]$guids.$Key
    if ([string]::IsNullOrWhiteSpace($id)) { throw "Missing GUID for $Key in $GuidPath" }
    return Get-PnPList -Identity ([guid]$id) -ErrorAction Stop
}

function Get-RoleNameOnList {
    param($List, [int]$PrincipalId)
    $full = Get-PnPList -Identity $List.Id -Includes RoleAssignments
    $ra = @($full.RoleAssignments | Where-Object { $_.Member.Id -eq $PrincipalId })
    if ($ra.Count -lt 1) { return '' }
    $bindings = Get-PnPProperty -ClientObject $ra[0] -Property RoleDefinitionBindings
    return (@($bindings | ForEach-Object { $_.Name }) -join ',')
}

function Ensure-ListRole {
    param(
        [string]$Key,
        $RoleDef
    )
    $list = Get-ListByKey $Key
    $label = "$Key ($($list.Title))"
    $roleName = [string]$RoleDef.Name
    $current = Get-RoleNameOnList -List $list -PrincipalId $group.Id
    if ($current -eq $roleName -or ($current -split ',' -contains $roleName)) {
        Write-Host "SKIP  $label :: $UsersGroup already has [$current]" -ForegroundColor DarkGray
        return
    }
    Write-Host "GRANT $label :: $UsersGroup += $roleName (was [$current])" -ForegroundColor Yellow
    if ($WhatIf) { return }
    $listId = [guid]$list.Id
    if ($current) {
        foreach ($rn in ($current -split ',' | Where-Object { $_ })) {
            try {
                Set-PnPListPermission -Identity $listId -Group $UsersGroup -RemoveRole $rn -ErrorAction Stop
            }
            catch {
                Write-Host "  warn remove $rn : $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }
    Set-PnPListPermission -Identity $listId -Group $UsersGroup -AddRole $roleName
    $after = Get-RoleNameOnList -List (Get-ListByKey $Key) -PrincipalId $group.Id
    Write-Host "  OK   now [$after]" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Read (CFG) ===" -ForegroundColor Cyan
foreach ($k in $readKeys) {
    Ensure-ListRole -Key $k -RoleDef $roleRead
}

Write-Host ""
Write-Host "=== Contribute (Commands enqueue) ===" -ForegroundColor Cyan
foreach ($k in $contributeKeys) {
    Ensure-ListRole -Key $k -RoleDef $roleContribute
}

Write-Host ""
Write-Host "Done. Nhắc: user vẫn cần Dyn ACL theo RequestKey để xem/sửa hồ sơ & checklist (không cấp Read rộng Requests)." -ForegroundColor Cyan
