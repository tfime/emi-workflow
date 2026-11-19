#Requires -Version 7.0
[CmdletBinding()]
param([string]$ConfigPath = '')
$ErrorActionPreference = 'Continue'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

$rel = '/sites/eecm-demo/SitePages/EMI-Hub.aspx'
$encoded = [uri]::EscapeDataString($rel)

Write-Host "=== File lock status ==="
try {
  $info = Invoke-PnPSPRestMethod -Method Get -Url "/_api/web/GetFileByServerRelativeUrl('$rel')?`$select=Name,CheckOutType,Level,LockType,LockId,LockedByUser,TimeLastModified&`$expand=LockedByUser"
  Write-Host ($info | ConvertTo-Json -Depth 4 -Compress)
} catch {
  Write-Host "GetFile: $($_.Exception.Message)"
}

# Release shared/exclusive lock if LockId present
try {
  $info2 = Invoke-PnPSPRestMethod -Method Get -Url "/_api/web/GetFileByServerRelativeUrl('$rel')/ListItemAllFields"
} catch {}

try {
  $ctx = Get-PnPContext
  $web = $ctx.Web
  $f = $web.GetFileByServerRelativeUrl($rel)
  $ctx.Load($f)
  $ctx.Load($f.LockedByUser)
  $ctx.ExecuteQuery()
  Write-Host "CSOM LockType=$($f.LockType) LockId=$($f.LockId) LockedBy=$($f.LockedByUser.LoginName)"
  if ($f.LockId) {
    $f.ReleaseLock($f.LockId)
    $ctx.ExecuteQuery()
    Write-Host 'CSOM ReleaseLock OK'
  } else {
    Write-Host 'No LockId on file object'
  }
} catch {
  Write-Host "CSOM ReleaseLock: $($_.Exception.Message)"
}

# REST ReleaseLock — thử vài dạng
foreach ($lockTry in @()) { }

try {
  $lockProbe = Invoke-PnPSPRestMethod -Method Get -Url "/_api/web/GetFileByServerRelativeUrl('$rel')?`$select=LockId,LockType"
  $lockId = [string]$lockProbe.LockId
  Write-Host "REST LockId='$lockId' LockType=$($lockProbe.LockType)"
  if (-not [string]::IsNullOrWhiteSpace($lockId) -and $lockId -ne '00000000-0000-0000-0000-000000000000') {
    Invoke-PnPSPRestMethod -Method Post -Url "/_api/web/GetFileByServerRelativeUrl('$rel')/ReleaseLock(lockid=guid'$lockId')" | Out-Null
    Write-Host 'REST ReleaseLock OK'
  }
} catch {
  Write-Host "REST ReleaseLock: $($_.Exception.Message)"
}

# Site pages: lấy phiên bản mới nhất meta
$file = Get-PnPFile -Url 'SitePages/EMI-Hub.aspx' -AsListItem
$id = [int]$file.Id
try {
  Invoke-PnPSPRestMethod -Method Post -Url "/_api/sitepages/pages($id)/CheckoutPage" | Out-Null
  Write-Host 'CheckoutPage OK'
  Start-Sleep -Seconds 1
  Invoke-PnPSPRestMethod -Method Post -Url "/_api/sitepages/pages($id)/DiscardCheckout" | Out-Null
  Write-Host 'DiscardCheckout OK'
} catch {
  Write-Host "SitePages checkout cycle: $($_.Exception.Message)"
}

try {
  Set-PnPPage -Identity 'EMI-Hub.aspx' -Publish | Out-Null
  Write-Host 'Publish OK'
} catch {
  Write-Host "Publish: $($_.Exception.Message)"
}

Write-Host ''
Write-Host 'Trang: https://emicomvn.sharepoint.com/sites/eecm-demo/SitePages/EMI-Hub.aspx'
Write-Host 'Debug local (gulp serve):'
Write-Host 'https://emicomvn.sharepoint.com/sites/eecm-demo/SitePages/EMI-Hub.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true'
Write-Host ''
Write-Host 'QUAN TRONG: Neu trinh duyet van mo EMI-Hub o che do Edit, hay Close/Discard thay doi tren tab do — lock thuoc tinh.pt@emi.com.vn.'
Disconnect-PnPOnline
