#Requires -Version 7.0
<#
.SYNOPSIS
  Dựng / cập nhật trang EMI-Hub.aspx trên Hub eecm-demo làm cổng truy cập người dùng.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun',
  [switch]$SetAsHomePage
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$dry = ($Mode -eq 'DryRun')

$hub = $cfg.hubSiteUrl.TrimEnd('/')
$cecm = $cfg.emiSiteUrl.TrimEnd('/')
$proj = if ($cfg.projectSiteUrl) { $cfg.projectSiteUrl.TrimEnd('/') } else { 'https://emicomvn.sharepoint.com/sites/DnDemo' }

function New-LinkListHtml {
  param([string]$Heading, [object[]]$Items)
  $lis = ($Items | ForEach-Object {
    "<li style='margin:6px 0'><a href=`"$($_.Url)`"><strong>$($_.Title)</strong></a> — $($_.Desc)</li>"
  }) -join ''
  return "<div><h3>$Heading</h3><ul>$lis</ul></div>"
}

$introHtml = @"
<div>
  <h2>Chào mừng đến EMI Hub</h2>
  <p>Cổng truy cập tài liệu dùng chung, nghiệp vụ <strong>Phòng Tổng hợp</strong> và các <strong>dự án</strong>. Chọn khu vực bên dưới để mở thư viện SharePoint tương ứng.</p>
  <p><em>Dữ liệu gắn nhãn demo chỉ mang tính minh họa — không có hiệu lực áp dụng.</em></p>
</div>
"@

$htmlShared = New-LinkListHtml -Heading '1. Tài liệu dùng chung (Hub)' -Items @(
  @{ Title = 'EMI - Tài liệu dùng chung'; Url = "$hub/EMI-SharedDocs"; Desc = 'Hướng dẫn, bản phát hành toàn hệ thống' },
  @{ Title = 'EMI - Quy trình ISO chuẩn'; Url = "$hub/EMI-ISO-Standards"; Desc = 'Quy trình ISO chuẩn đã phát hành' },
  @{ Title = 'EMI - Biểu mẫu chuẩn'; Url = "$hub/EMI-Templates"; Desc = 'Biểu mẫu thống nhất' },
  @{ Title = 'Danh mục tài liệu chung'; Url = "$hub/Lists/EMI_DEMO_DanhMucChung"; Desc = 'Tra cứu mã / URL phát hành' }
)

$htmlTH = New-LinkListHtml -Heading '2. Phòng Tổng hợp (Site EMI / cecm)' -Items @(
  @{ Title = 'TH - Dùng chung'; Url = "$cecm/TH-Shared"; Desc = 'Kế hoạch / báo cáo phòng' },
  @{ Title = 'TH - Chuyển đổi số'; Url = "$cecm/TH-Digital"; Desc = 'Đào tạo CĐS, hồ sơ đang xử lý' },
  @{ Title = 'TH - ISO thực hiện'; Url = "$cecm/TH-ISO"; Desc = 'Document Set đánh giá nội bộ' },
  @{ Title = 'TH - Pháp lý'; Url = "$cecm/TH-Legal"; Desc = 'Hồ sơ pháp lý demo' },
  @{ Title = 'TH - Công nghệ'; Url = "$cecm/TH-Tech"; Desc = 'Ứng dụng / hạ tầng demo' },
  @{ Title = 'Danh mục hồ sơ'; Url = "$cecm/Lists/EMI_DEMO_DanhMucHoSo"; Desc = 'Đăng ký bộ hồ sơ + liên kết phát hành' }
)

$htmlDA = New-LinkListHtml -Heading '3. Site dự án (DnDemo) — mỗi thư viện = một dự án' -Items @(
  @{ Title = 'DA — Cổng thông tin CĐS 2026'; Url = "$proj/DA-CDS-Portal-2026"; Desc = '4 giai đoạn: Khởi tạo → Kế hoạch → Thực hiện → Nghiệm thu' },
  @{ Title = 'DA — Đánh giá nội bộ ISO 2026'; Url = "$proj/DA-ISO-DGNB-2026"; Desc = 'Cấu trúc 4 giai đoạn chuẩn dự án' },
  @{ Title = 'DA — Hạ tầng Wi-Fi 2026'; Url = "$proj/DA-Infra-Wifi-2026"; Desc = 'Cấu trúc 4 giai đoạn chuẩn dự án' },
  @{ Title = 'Trang chủ Site dự án'; Url = "$proj"; Desc = 'Tổng quan DnDemo' }
)

$htmlGuide = @"
<div>
  <h3>4. Cách dùng nhanh</h3>
  <ol>
    <li><strong>Tài liệu chuẩn / phát hành</strong> → thư viện trên Hub (mục 1).</li>
    <li><strong>Công việc theo bộ phận Tổng hợp</strong> → Site cecm, thư viện TH (mục 2).</li>
    <li><strong>Theo dự án</strong> → Site DnDemo, chọn thư viện dự án và làm việc trong 4 folder giai đoạn (mục 3).</li>
  </ol>
</div>
"@

Write-Host "Target page: $hub/SitePages/EMI-Hub.aspx"
Write-Host "Mode: $Mode | SetAsHomePage: $SetAsHomePage"

if ($dry) {
  Write-Host 'PLAN: recreate EMI-Hub.aspx (Article) + text sections + publish + Top Nav'
  if ($SetAsHomePage) { Write-Host 'PLAN: Set home page → EMI-Hub.aspx' }
  return
}

Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

# Recreate page to avoid leftover FullWidth section that blocks text parts
$existing = Get-PnPPage -Identity 'EMI-Hub.aspx' -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  # Keep URL: remove then add same name
  try {
    Remove-PnPPage -Identity 'EMI-Hub.aspx' -Force -ErrorAction Stop
    Write-Host 'REMOVED old EMI-Hub.aspx'
  } catch {
    Write-Warning "Remove-PnPPage: $($_.Exception.Message) — thử Clear sections"
  }
}

# Wait briefly for recycle
Start-Sleep -Seconds 2

try {
  Add-PnPPage -Name 'EMI-Hub' -Title 'EMI Hub' -LayoutType Article -Publish | Out-Null
  Write-Host 'CREATE EMI-Hub.aspx (Article)'
} catch {
  # May already exist in recycle / soft state — open and continue
  Write-Warning "Add-PnPPage: $($_.Exception.Message)"
}

$page = Get-PnPPage -Identity 'EMI-Hub.aspx' -ErrorAction Stop
Set-PnPPage -Identity $page -Title 'EMI Hub' -LayoutType Article | Out-Null

# If still has FullWidth-only section, add OneColumn sections after
# Remove any remaining controls
$page = Get-PnPPage -Identity 'EMI-Hub.aspx'
foreach ($section in @($page.Sections)) {
  foreach ($col in @($section.Columns)) {
    foreach ($ctrl in @($col.Controls)) {
      if ($ctrl.InstanceId) {
        try { Remove-PnPPageComponent -Page $page -InstanceId ([string]$ctrl.InstanceId) -ErrorAction SilentlyContinue } catch {}
      }
    }
  }
}

$page = Get-PnPPage -Identity 'EMI-Hub.aspx'

# Ensure we have enough OneColumn sections (not FullWidth)
# Clear page sections by re-saving layout if needed
$sectionCount = @($page.Sections).Count
Write-Host "Sections after cleanup: $sectionCount"
# Always append dedicated OneColumn sections for content
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 10 | Out-Null
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 11 | Out-Null
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 12 | Out-Null
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 13 | Out-Null
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 14 | Out-Null

# Map section numbers: PnP uses 1-based index of current sections
$page = Get-PnPPage -Identity 'EMI-Hub.aspx'
$idx = @{}
$i = 1
foreach ($s in $page.Sections) {
  Write-Host ("Section[{0}] Type={1}" -f $i, $s.Type)
  $idx[$i] = [string]$s.Type
  $i++
}

# Find OneColumn section indices
$oneCols = @()
$i = 1
foreach ($s in $page.Sections) {
  if ([string]$s.Type -match 'OneColumn' -and [string]$s.Type -notmatch 'FullWidth') {
    $oneCols += $i
  }
  $i++
}
if ($oneCols.Count -lt 5) {
  throw "Không đủ OneColumn sections (có $($oneCols.Count)). Abort."
}

Add-PnPPageTextPart -Page $page -Section $oneCols[0] -Column 1 -Order 1 -Text $introHtml | Out-Null
Add-PnPPageTextPart -Page $page -Section $oneCols[1] -Column 1 -Order 1 -Text $htmlShared | Out-Null
Add-PnPPageTextPart -Page $page -Section $oneCols[2] -Column 1 -Order 1 -Text $htmlTH | Out-Null
Add-PnPPageTextPart -Page $page -Section $oneCols[3] -Column 1 -Order 1 -Text $htmlDA | Out-Null
Add-PnPPageTextPart -Page $page -Section $oneCols[4] -Column 1 -Order 1 -Text $htmlGuide | Out-Null
Write-Host 'ADDED 5 text parts'

Set-PnPPage -Identity 'EMI-Hub.aspx' -Title 'EMI Hub' -Publish | Out-Null
Write-Host 'PUBLISHED'

# Top navigation
try {
  $nodes = @(Get-PnPNavigationNode -Location TopNavigationBar -ErrorAction SilentlyContinue)
  $exists = $nodes | Where-Object { $_.Title -eq 'EMI Hub' -or ($_.Url -and $_.Url -match 'EMI-Hub.aspx') }
  if (-not $exists) {
    Add-PnPNavigationNode -Location TopNavigationBar -Title 'EMI Hub' -Url "$hub/SitePages/EMI-Hub.aspx" | Out-Null
    Write-Host 'ADD Top Nav: EMI Hub'
  } else {
    Write-Host 'Top Nav EMI Hub already present'
  }
} catch {
  Write-Warning "Top nav: $($_.Exception.Message)"
}

if ($SetAsHomePage) {
  Set-PnPHomePage -RootFolderRelativeUrl 'SitePages/EMI-Hub.aspx'
  Write-Host 'Home page → SitePages/EMI-Hub.aspx'
}

$manifest = Read-Manifest
$manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.hubSiteUrl -Kind 'SitePage' -UrlName 'SitePages/EMI-Hub.aspx' -Title 'EMI Hub'
Save-Manifest $manifest

Disconnect-PnPOnline
Write-Host "DONE: $hub/SitePages/EMI-Hub.aspx"
