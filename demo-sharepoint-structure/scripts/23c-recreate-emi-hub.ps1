#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath (Join-Path (Get-DemoRoot) 'config\settings.json')
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

$rel = '/sites/eecm-demo/SitePages/EMI-Hub.aspx'
$wpId = '7e4a91c2-3f8b-4d6e-9a1c-2b5d8e0f4a67'

# Force undo via CSOM even if REST reports locked
$ctx = Get-PnPContext
$f = $ctx.Web.GetFileByServerRelativeUrl($rel)
$ctx.Load($f)
try {
  $ctx.ExecuteQuery()
  Write-Host "CheckOutType=$($f.CheckOutType) Level=$($f.Level)"
  try { $f.UndoCheckOut(); $ctx.ExecuteQuery(); Write-Host 'Undo OK' } catch { Write-Host "Undo: $($_.Exception.Message)" }
  try { $f.CheckIn('unlock', [Microsoft.SharePoint.Client.CheckinType]::OverwriteCheckIn); $ctx.ExecuteQuery(); Write-Host 'OverwriteCheckIn OK' } catch { Write-Host "CheckIn: $($_.Exception.Message)" }
} catch {
  Write-Host "Load file: $($_.Exception.Message)"
}

# Try delete
$deleted = $false
try {
  Remove-PnPFile -ServerRelativeUrl $rel -Force -ErrorAction Stop
  Write-Host 'Removed file'
  $deleted = $true
} catch {
  Write-Host "Remove-PnPFile: $($_.Exception.Message)"
}
try {
  Remove-PnPPage -Identity 'EMI-Hub.aspx' -Force -ErrorAction Stop
  Write-Host 'Removed page'
  $deleted = $true
} catch {
  Write-Host "Remove-PnPPage: $($_.Exception.Message)"
}

if (-not $deleted) {
  Write-Host ''
  Write-Host 'KHONG XOA DUOC — lock dang giu boi tinh.pt@emi.com.vn (tab Edit tren browser).'
  Write-Host 'Anh can: mo EMI-Hub → neu dang Edit thì bấm Cancel/Discard → đóng tab.'
  Write-Host 'Roi chay lai script nay, hoac chi can mo URL view (khong Edit).'
  Disconnect-PnPOnline
  exit 2
}

Start-Sleep -Seconds 2
Add-PnPPage -Name 'EMI-Hub' -Title 'EMI Hub' -LayoutType Article -Publish | Out-Null
$page = Get-PnPPage -Identity 'EMI-Hub.aspx'
Add-PnPPageSection -Page $page -SectionTemplate OneColumn -Order 1 | Out-Null
$props = @{
  title          = 'EMI Hub'
  hubSiteUrl     = [string]$cfg.hubSiteUrl
  emiSiteUrl     = [string]$cfg.emiSiteUrl
  projectSiteUrl = [string]$cfg.projectSiteUrl
} | ConvertTo-Json -Compress
Add-PnPPageWebPart -Page $page -Section 1 -Column 1 -Order 1 -Component $wpId -WebPartProperties $props | Out-Null
Set-PnPPage -Identity 'EMI-Hub.aspx' -Publish | Out-Null
Set-PnPHomePage -RootFolderRelativeUrl 'SitePages/EMI-Hub.aspx'
Write-Host 'Recreated + published EMI-Hub.aspx with SPFx web part'
Disconnect-PnPOnline
