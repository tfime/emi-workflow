#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = ''
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force

$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$libs = Read-DemoJson 'seed\libraries.json'
$lines = New-Object System.Collections.Generic.List[string]
$ok = $true
function Add-Line([string]$s) { $lines.Add($s); Write-Host $s }

Add-Line "# Preflight EMI SharePoint Demo"
Add-Line ""
Add-Line "- Time: $((Get-Date).ToString('o'))"
Add-Line "- Hub URL (config): $($cfg.hubSiteUrl)"
Add-Line "- EMI URL (config): $($cfg.emiSiteUrl)"
Add-Line "- ClientId: $($cfg.clientId.Substring(0,[Math]::Min(8,$cfg.clientId.Length)))…"
Add-Line "- createNewSites=$($cfg.createNewSites) changeHubRegistration=$($cfg.changeHubRegistration) changeHubAssociation=$($cfg.changeHubAssociation)"
Add-Line "- enableFolderShareDemo=$($cfg.enableFolderShareDemo)"
Add-Line ""

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Add-Line '## FAIL'
  Add-Line '- PnP.PowerShell chưa cài.'
  Write-DemoReport -Prefix 'preflight' -Object ($lines -join "`n") | Out-Null
  throw 'PnP.PowerShell missing'
}

# --- Hub ---
Add-Line '## Hub site'
try {
  Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId
  $web = Get-PnPWeb -Includes Title, Url
  Add-Line "- Connected: $($web.Url) ($($web.Title))"
  try {
    $hub = Get-PnPHubSite -Identity $cfg.hubSiteUrl -ErrorAction Stop
    Add-Line "- Hub registration: YES (SiteId=$($hub.SiteId))"
  } catch {
    Add-Line "- Hub registration: **NOT CONFIRMED** — $($_.Exception.Message)"
    Add-Line "- Spec yêu cầu eecm-demo ĐÃ là Hub. Không tự đăng ký."
    $ok = $false
  }
  foreach ($lib in $libs.hub) {
    $exists = Test-ListExists -UrlName $lib.urlName
    Add-Line "- Object $($lib.urlName): $(if($exists){'EXISTS'}else{'MISSING (sẽ tạo khi Apply)'})"
  }
  Disconnect-PnPOnline
} catch {
  Add-Line "- **CONNECT FAIL Hub**: $($_.Exception.Message)"
  $ok = $false
}

Add-Line ''
Add-Line '## EMI site (cecm)'
try {
  Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId
  $web = Get-PnPWeb -Includes Title, Url
  Add-Line "- Connected: $($web.Url) ($($web.Title))"
  if ($web.Url.TrimEnd('/') -ne $cfg.emiSiteUrl.TrimEnd('/')) {
    Add-Line "- **URL MISMATCH** config=$($cfg.emiSiteUrl) actual=$($web.Url) — dừng theo spec."
    $ok = $false
  }
  try {
    # PnP 3.x: đọc HubSiteId qua property load / REST (không dùng -Includes trên Get-PnPSite)
    $site = Get-PnPSite
    Get-PnPProperty -ClientObject $site -Property HubSiteId | Out-Null
    $hubId = [guid]$site.HubSiteId
    if ($hubId -and $hubId -ne [guid]::Empty) {
      Add-Line "- Hub association: YES (HubSiteId=$hubId)"
      try {
        $hubMeta = Get-PnPHubSite -Identity $cfg.hubSiteUrl -ErrorAction SilentlyContinue
        if ($hubMeta -and [string]$hubMeta.SiteId -and [string]$hubMeta.SiteId -ne [string]$hubId) {
          Add-Line "- Cảnh báo: HubSiteId của cecm ($hubId) khác SiteId Hub config ($($hubMeta.SiteId)) — kiểm tra thủ công."
        }
      } catch {}
    } else {
      # Fallback REST
      $rest = Invoke-PnPSPRestMethod -Url '/_api/site?$select=HubSiteId' -Method Get
      $hubId2 = [guid]$rest.HubSiteId
      if ($hubId2 -and $hubId2 -ne [guid]::Empty) {
        Add-Line "- Hub association: YES via REST (HubSiteId=$hubId2)"
      } else {
        Add-Line "- Hub association: **NOT FOUND / EMPTY** — không Apply trước khi xác minh."
        $ok = $false
      }
    }
  } catch {
    Add-Line "- Hub association check error: $($_.Exception.Message)"
    $ok = $false
  }

  # Site groups baseline
  $owners = Get-PnPGroup -AssociatedOwnerGroup -ErrorAction SilentlyContinue
  $members = Get-PnPGroup -AssociatedMemberGroup -ErrorAction SilentlyContinue
  $visitors = Get-PnPGroup -AssociatedVisitorGroup -ErrorAction SilentlyContinue
  Add-Line "- Owners: $($owners.Title)"
  Add-Line "- Members: $($members.Title)"
  Add-Line "- Visitors: $($visitors.Title)"

  foreach ($lib in $libs.cecm) {
    $exists = Test-ListExists -UrlName $lib.urlName
    Add-Line "- Object $($lib.urlName): $(if($exists){'EXISTS'}else{'MISSING (sẽ tạo khi Apply)'})"
  }

  # Document Set feature probe
  try {
    $feat = Get-PnPFeature -Scope Site -Identity '3bae86a2-776d-499d-9db8-fa4cdbda7260' -ErrorAction SilentlyContinue
    if ($feat) { Add-Line '- Document Set site feature: Active/available' }
    else { Add-Line '- Document Set site feature: not active yet (script sẽ bật khi Apply ISO nếu được phép)' }
  } catch {
    Add-Line "- Document Set feature probe: $($_.Exception.Message)"
  }

  Disconnect-PnPOnline
} catch {
  Add-Line "- **CONNECT FAIL cecm**: $($_.Exception.Message)"
  $ok = $false
}

Add-Line ''
$members = Get-DemoMembers
$pending = @()
foreach ($k in @('th_lead','shared_edit','cds_user','iso_user','legal_user','tech_user','outside_th_user','hub_publisher')) {
  $v = $members.$k
  $count = if ($null -eq $v) { 0 } else { @($v).Count }
  if ($count -eq 0) { $pending += $k }
}
Add-Line '## Members mapping'
if ($pending.Count -gt 0) {
  Add-Line "- PENDING member keys (UAT quyền sẽ PENDING): $($pending -join ', ')"
} else {
  Add-Line '- All member keys populated'
}

Add-Line ''
if ($ok) {
  Add-Line '## RESULT: PREFLIGHT PASS (có thể chạy DryRun / Apply với -ConfirmApply)'
} else {
  Add-Line '## RESULT: PREFLIGHT FAIL — sửa cấu hình/quyền trước khi Apply'
}

$path = Write-DemoReport -Prefix 'preflight' -Object ($lines -join "`n")
if (-not $ok) { throw "Preflight FAIL. Xem $path" }
