#Requires -Version 7.0
$ErrorActionPreference = 'Continue'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath (Join-Path (Get-DemoRoot) 'config\settings.json')
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId

$rel = '/sites/eecm-demo/SitePages/EMI-Hub.aspx'

# 1) CSOM UndoCheckOut + CheckIn
try {
  $ctx = Get-PnPContext
  $f = $ctx.Web.GetFileByServerRelativeUrl($rel)
  $ctx.Load($f)
  $ctx.ExecuteQuery()
  Write-Host "Before: CheckOutType=$($f.CheckOutType) Level=$($f.Level)"
  if ($f.CheckOutType.ToString() -ne 'None') {
    $f.UndoCheckOut()
    $ctx.ExecuteQuery()
    Write-Host 'UndoCheckOut OK'
  }
  $ctx.Load($f)
  $ctx.ExecuteQuery()
  if ($f.Level.ToString() -ne 'Published') {
    $f.CheckIn('Force unlock', [Microsoft.SharePoint.Client.CheckinType]::MajorCheckIn)
    $ctx.ExecuteQuery()
    Write-Host 'CheckIn Major OK'
    $f.Publish('Force unlock publish')
    $ctx.ExecuteQuery()
    Write-Host 'Publish OK'
  }
  $ctx.Load($f)
  $ctx.ExecuteQuery()
  Write-Host "After: CheckOutType=$($f.CheckOutType) Level=$($f.Level)"
} catch {
  Write-Host "CSOM fail: $($_.Exception.Message)"
}

# 2) REST UndoCheckOut
try {
  Invoke-PnPSPRestMethod -Method Post -Url "/_api/web/GetFileByServerRelativeUrl('$rel')/UndoCheckOut" | Out-Null
  Write-Host 'REST UndoCheckOut OK'
} catch {
  Write-Host "REST UndoCheckOut: $($_.Exception.Message)"
}

try {
  Invoke-PnPSPRestMethod -Method Post -Url "/_api/web/GetFileByServerRelativeUrl('$rel')/CheckIn(comment='unlock',checkintype=1)" | Out-Null
  Write-Host 'REST CheckIn OK'
} catch {
  Write-Host "REST CheckIn: $($_.Exception.Message)"
}

# 3) Final status
$select = 'CheckOutType,Level,Name'
$expand = 'CheckedOutByUser,LockedByUser'
$info = Invoke-PnPSPRestMethod -Method Get -Url "/_api/web/GetFileByServerRelativeUrl('$rel')?`$select=$select&`$expand=$expand"
Write-Host ($info | ConvertTo-Json -Depth 5 -Compress)

Disconnect-PnPOnline
Write-Host 'DONE'
