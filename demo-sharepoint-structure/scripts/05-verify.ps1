#Requires -Version 7.0
[CmdletBinding()]
param([string]$ConfigPath = '')
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$libs = Read-DemoJson 'seed\libraries.json'
$perm = Read-DemoJson 'seed\permissions.json'
$lines = New-Object System.Collections.Generic.List[string]
function L([string]$s) { $lines.Add($s); Write-Host $s }
function Check([string]$name, [bool]$pass, [string]$detail = '') {
  $mark = if ($pass) { 'PASS' } else { 'FAIL' }
  L "- [$mark] $name$(if($detail){": $detail"})"
}

L "# Verify EMI SharePoint Demo"
L "- Time: $((Get-Date).ToString('o'))"
L ""

# Hub
L "## Hub"
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId
try {
  $hub = Get-PnPHubSite -Identity $cfg.hubSiteUrl -ErrorAction Stop
  Check 'eecm-demo is Hub Site' ($null -ne $hub)
} catch {
  Check 'eecm-demo is Hub Site' $false $_.Exception.Message
}
foreach ($lib in $libs.hub) {
  $ex = Test-ListExists $lib.urlName
  Check "Hub object $($lib.urlName)" $ex
  if ($ex -and $lib.kind -eq 'DocumentLibrary') {
    $items = @(Get-PnPListItem -List $lib.urlName -PageSize 50 | Where-Object { $_.FileSystemObjectType -eq 'File' })
    Check "  files in $($lib.urlName)" ($items.Count -ge 1) "count=$($items.Count)"
  }
}
$hubListCount = @(Get-PnPListItem -List 'Lists/EMI_DEMO_DanhMucChung' -PageSize 50 -ErrorAction SilentlyContinue).Count
Check 'EMI_DEMO_DanhMucChung >= 3 items' ($hubListCount -ge 3) "count=$hubListCount"
Disconnect-PnPOnline

L ""
L "## cecm"
Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId
$site = Get-PnPSite
Get-PnPProperty -ClientObject $site -Property HubSiteId | Out-Null
Check 'cecm Hub association present' ($site.HubSiteId -and $site.HubSiteId -ne [guid]::Empty) "HubSiteId=$($site.HubSiteId)"

foreach ($lib in $libs.cecm) {
  Check "cecm object $($lib.urlName)" (Test-ListExists $lib.urlName)
}

$folder = Get-PnPFolder -Url 'TH-Digital/Dao tao/Dao tao CDS 2026' -ErrorAction SilentlyContinue
Check 'Folder Dao tao/Dao tao CDS 2026' ($null -ne $folder)

$ds = Get-PnPListItem -List 'TH-ISO' -PageSize 200 -ErrorAction SilentlyContinue |
  Where-Object { $_.FieldValues.FileLeafRef -eq 'ISO-DGNB-2026-01' } |
  Select-Object -First 1
if ($null -eq $ds) {
  Check 'Document Set ISO-DGNB-2026-01' $false 'missing'
} else {
  Get-PnPProperty -ClientObject $ds -Property ContentType | Out-Null
  $ctName = [string]$ds.ContentType.Name
  $ctId = [string]$ds.ContentType.StringId
  $isDs = ($ctId -like '0x0120D520*') -or ($ctName -match 'Document Set|Hồ sơ đánh giá ISO')
  if ($isDs) { Check 'Document Set ISO-DGNB-2026-01' $true "CT=$ctName IdPrefix=$($ctId.Substring(0,[Math]::Min(10,$ctId.Length)))" }
  else { L "- [FAIL] Document Set ISO-DGNB-2026-01: CT='$ctName' Id='$ctId' — BLOCKED/không PASS" }
  $filesInDs = @(Get-PnPFolderItem -FolderSiteRelativeUrl 'TH-ISO/ISO-DGNB-2026-01' -ItemType File -ErrorAction SilentlyContinue)
  Check 'Document Set has >= 3 files' ($filesInDs.Count -ge 3) "count=$($filesInDs.Count)"
}

# Groups
foreach ($g in $perm.cecmGroups) {
  Check "Group $($g.title)" ($null -ne (Get-PnPGroup -Identity $g.title -ErrorAction SilentlyContinue))
}

# Unique ACL
foreach ($libName in @($perm.cecmAcl.PSObject.Properties.Name)) {
  $list = Get-PnPList -Identity $libName -Includes HasUniqueRoleAssignments -ErrorAction SilentlyContinue
  if ($null -eq $list) { Check "ACL unique $libName" $false 'missing list'; continue }
  Check "ACL unique $libName" ([bool]$list.HasUniqueRoleAssignments)
}

$hoSo = @(Get-PnPListItem -List 'Lists/EMI_DEMO_DanhMucHoSo' -PageSize 50 -ErrorAction SilentlyContinue).Count
Check 'EMI_DEMO_DanhMucHoSo >= 5 items' ($hoSo -ge 5) "count=$hoSo"

# File count rough
$totalFiles = 0
foreach ($name in @('TH-Shared','TH-Digital','TH-ISO','TH-Legal','TH-Tech')) {
  $items = @(Get-PnPListItem -List $name -PageSize 200 -ErrorAction SilentlyContinue | Where-Object { $_.FileSystemObjectType -eq 'File' })
  $totalFiles += $items.Count
  L "- files $name = $($items.Count)"
}
Check 'cecm files >= 12' ($totalFiles -ge 12) "count=$totalFiles"

L ""
L "## UAT tài khoản"
L "- [PENDING] Kiểm thử cds_user / iso_user / … — điền config/members.json rồi test thủ công hoặc script riêng."
L "- [PENDING] outside_th_user Denied — chỉ PASS khi có identity thật không phải admin."

Disconnect-PnPOnline
$path = Write-DemoReport -Prefix 'verify' -Object ($lines -join "`n")
Write-Host "Verify report: $path"
