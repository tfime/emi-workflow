#Requires -Version 7.0
<#
.SYNOPSIS
  Upload emi-hub-portal.sppkg lên Tenant App Catalog (nếu có quyền),
  rồi gắn web part EMI Hub Portal vào SitePages/EMI-Hub.aspx (thay nội dung text cũ).
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [switch]$SkipAppUpload,
  [switch]$ConfirmDeploy
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$pkg = Join-Path (Get-DemoRoot) 'spfx\sharepoint\solution\emi-hub-portal.sppkg'
if (-not (Test-Path -LiteralPath $pkg)) {
  throw "Chưa có package: $pkg — chạy build trong spfx/ trước."
}

$wpId = '7e4a91c2-3f8b-4d6e-9a1c-2b5d8e0f4a67'
$hub = $cfg.hubSiteUrl.TrimEnd('/')

if (-not $ConfirmDeploy) {
  throw "Cần -ConfirmDeploy. Script sẽ upload .sppkg (nếu không SkipAppUpload) và rebuild EMI-Hub.aspx với SPFx web part."
}

Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

if (-not $SkipAppUpload) {
  try {
    $catalog = Get-PnPTenantAppCatalogUrl -ErrorAction Stop
    Write-Host "App Catalog: $catalog"
    Connect-PnPOnline -Url $catalog -Interactive -ClientId $cfg.clientId
    Add-PnPApp -Path $pkg -Scope Tenant -Publish -Overwrite -ErrorAction Stop | Out-Null
    Write-Host "Uploaded & published: $pkg"
    # đảm bảo app available trên hub site
    Connect-PnPOnline -Url $cfg.hubSiteUrl -Interactive -ClientId $cfg.clientId
    try {
      Install-PnPApp -Identity 'emi-hub-portal-client-side-solution' -Scope Tenant -ErrorAction SilentlyContinue
    } catch {
      Write-Warning "Install-PnPApp: $($_.Exception.Message) — có thể app đã sẵn sàng (skipFeatureDeployment)."
    }
  } catch {
    Write-Warning "App Catalog upload thất bại: $($_.Exception.Message)"
    Write-Warning "Upload thủ công $pkg lên App Catalog, rồi chạy lại với -SkipAppUpload -ConfirmDeploy"
    if (-not $SkipAppUpload) {
      Disconnect-PnPOnline -ErrorAction SilentlyContinue
      throw
    }
  }
}

Connect-PnPOnline -Url $cfg.hubSiteUrl -Interactive -ClientId $cfg.clientId

# Recreate clean Article page then add SPFx web part full width-friendly OneColumn
$existing = Get-PnPPage -Identity 'EMI-Hub.aspx' -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  Remove-PnPPage -Identity 'EMI-Hub.aspx' -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Add-PnPPage -Name 'EMI-Hub' -Title 'EMI Hub' -LayoutType Article -Publish | Out-Null
$page = Get-PnPPage -Identity 'EMI-Hub.aspx'
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 1 | Out-Null

$props = @{
  title           = 'EMI Hub'
  hubSiteUrl      = $cfg.hubSiteUrl
  emiSiteUrl      = $cfg.emiSiteUrl
  projectSiteUrl  = $cfg.projectSiteUrl
} | ConvertTo-Json -Compress

try {
  Add-PnPPageWebPart -Page $page -Section 1 -Column 1 -Order 1 -Component $wpId -WebPartProperties $props -ErrorAction Stop | Out-Null
  Write-Host "ADDED SPFx web part $wpId"
} catch {
  Write-Warning "Add-PnPPageWebPart by Id failed: $($_.Exception.Message)"
  Write-Host 'Thử theo tên hiển thị...'
  Add-PnPPageWebPart -Page $page -Section 1 -Column 1 -Order 1 -DefaultWebPartType ContentRollup -ErrorAction SilentlyContinue | Out-Null
  throw "Không gắn được web part. Kiểm tra app đã deploy Tenant App Catalog. Lỗi: $($_.Exception.Message)"
}

Set-PnPPage -Identity 'EMI-Hub.aspx' -Title 'EMI Hub' -Publish | Out-Null
Set-PnPHomePage -RootFolderRelativeUrl 'SitePages/EMI-Hub.aspx'
Write-Host "DONE: $hub/SitePages/EMI-Hub.aspx (SPFx)"
Disconnect-PnPOnline
