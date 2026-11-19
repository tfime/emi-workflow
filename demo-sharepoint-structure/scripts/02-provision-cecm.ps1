#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$libs = Read-DemoJson 'seed\libraries.json'
$dry = ($Mode -eq 'DryRun')
$manifest = Read-Manifest
$result = [ordered]@{ site = $cfg.emiSiteUrl; mode = $Mode; actions = @(); documentSet = $null }

Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId

$docLibs = @()
foreach ($lib in $libs.cecm) {
  $r = Ensure-DemoList -Title $lib.title -UrlName $lib.urlName -Kind $lib.kind -DryRun:$dry -EnableVersioning
  $result.actions += [pscustomobject]@{ urlName = $lib.urlName; action = $r.Action }
  if (-not $dry -and $r.List) {
    $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.emiSiteUrl -Kind $lib.kind -UrlName $lib.urlName -Id ([string]$r.List.Id) -Title $lib.title
    if ($lib.kind -eq 'DocumentLibrary') {
      foreach ($f in $libs.metadataFields) {
        Ensure-DemoField -List $r.List -FieldDef $f -DryRun:$dry | Out-Null
      }
      $docLibs += $r.List
      # Views
      $views = Get-PnPView -List $r.List.Id
      if (-not ($views | Where-Object { $_.Title -eq 'Tất cả hồ sơ' })) {
        Add-PnPView -List $r.List.Id -Title 'Tất cả hồ sơ' -Fields 'FileLeafRef','EMI_DemoCode','EMI_Function','EMI_DocCategory','EMI_DocStatus','EMI_Year','Modified' -ErrorAction SilentlyContinue | Out-Null
      }
      if (-not ($views | Where-Object { $_.Title -eq 'Theo loại hồ sơ' })) {
        Add-PnPView -List $r.List.Id -Title 'Theo loại hồ sơ' -Fields 'FileLeafRef','EMI_DemoCode','EMI_DocCategory','EMI_DocStatus','EMI_Year' -ErrorAction SilentlyContinue | Out-Null
        try {
          Set-PnPView -List $r.List.Id -Identity 'Theo loại hồ sơ' -Values @{ ViewData = '<FieldRef Name="EMI_DocCategory" Type="GroupBy"/>' } -ErrorAction SilentlyContinue
        } catch {}
      }
    }
    if ($lib.urlName -eq 'Lists/EMI_DEMO_DanhMucHoSo') {
      foreach ($f in $libs.listFieldsDanhMucHoSo) {
        Ensure-DemoField -List $r.List -FieldDef $f -DryRun:$dry | Out-Null
      }
    }
  }
}

# Folders CĐS
Ensure-DemoFolder -LibraryUrlName 'TH-Digital' -FolderPath 'Dao tao/Dao tao CDS 2026' -DryRun:$dry | Out-Null
if (-not $dry) {
  $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.emiSiteUrl -Kind 'Folder' -UrlName 'TH-Digital/Dao tao/Dao tao CDS 2026' -Title 'Dao tao CDS 2026'
}

# Document Set on TH-ISO
$result.documentSet = [ordered]@{ status = 'SKIPPED'; detail = '' }
if ($dry) {
  Write-Host 'PLAN Document Set content type EMI - Ho so danh gia ISO + ISO-DGNB-2026-01'
  $result.documentSet.status = 'Plan'
} else {
  try {
    # Enable Document Set feature (site)
    Enable-PnPFeature -Identity '3bae86a2-776d-499d-9db8-fa4cdbda7260' -Scope Site -ErrorAction SilentlyContinue | Out-Null
    $ctName = 'EMI - Hồ sơ đánh giá ISO'
    $ct = Get-PnPContentType -Identity $ctName -ErrorAction SilentlyContinue
    if ($null -eq $ct) {
      # Parent Document Set content type id 0x0120D520
      Add-PnPContentType -Name $ctName -ContentTypeId '0x0120D520' -Group 'EMI Demo' -ErrorAction Stop | Out-Null
      $ct = Get-PnPContentType -Identity $ctName -ErrorAction Stop
      Write-Host "CREATE CT $ctName"
    } else {
      Write-Host "EXISTS CT $ctName"
    }
    # Add fields as shared columns where possible
    foreach ($fn in @('EMI_DemoCode','EMI_Year','EMI_Department','EMI_Function','EMI_DocCategory','EMI_DocStatus','EMI_IsDemo')) {
      try { Add-PnPFieldToContentType -Field $fn -ContentType $ctName -ErrorAction SilentlyContinue | Out-Null } catch {}
    }
    Add-PnPContentTypeToList -List 'TH-ISO' -ContentType $ctName -DefaultContentType -ErrorAction SilentlyContinue | Out-Null

    $dsPath = 'TH-ISO/ISO-DGNB-2026-01'
    $existingFolder = Get-PnPFolder -Url $dsPath -ErrorAction SilentlyContinue
    if ($null -eq $existingFolder) {
      # Create Document Set via REST
      $list = Get-PnPList -Identity 'TH-ISO'
      $body = @{
        __metadata           = @{ type = 'SP.DocumentSet' } # may not work; use folder + content type
      }
      # Prefer Add-PnPDocumentSet if available
      if (Get-Command Add-PnPDocumentSet -ErrorAction SilentlyContinue) {
        Add-PnPDocumentSet -List 'TH-ISO' -ContentType $ctName -Name 'ISO-DGNB-2026-01' -ErrorAction Stop | Out-Null
        Write-Host 'CREATE DocumentSet ISO-DGNB-2026-01'
      } else {
        # Fallback REST
        $web = Get-PnPWeb
        $payload = @{
          Title = 'ISO-DGNB-2026-01'
          Path  = @{
            DecodedUrl = "$(($web.ServerRelativeUrl.TrimEnd('/')))/TH-ISO"
          }
          ContentTypeId = $ct.StringId
        } | ConvertTo-Json -Depth 5
        Invoke-PnPSPRestMethod -Method Post -Url '/_api/web/GetListUsingPath(DecodedUrl=@a1)/RootFolder/Folders/Add(url=@a2)?@a1=%27$([uri]::EscapeDataString(($web.ServerRelativeUrl.TrimEnd("/"))+"/TH-ISO"))%27&@a2=%27ISO-DGNB-2026-01%27' -ErrorAction SilentlyContinue | Out-Null
        # Set content type on list item
        $item = Get-PnPListItem -List 'TH-ISO' -PageSize 500 | Where-Object { $_.FieldValues.FileLeafRef -eq 'ISO-DGNB-2026-01' } | Select-Object -First 1
        if ($null -eq $item) {
          # Try creating as folder then set CT
          Add-PnPFolder -Name 'ISO-DGNB-2026-01' -Folder 'TH-ISO' | Out-Null
          $item = Get-PnPListItem -List 'TH-ISO' -PageSize 500 | Where-Object { $_.FieldValues.FileLeafRef -eq 'ISO-DGNB-2026-01' } | Select-Object -First 1
        }
        if ($item) {
          Set-PnPListItem -List 'TH-ISO' -Identity $item.Id -ContentType $ctName -Values @{
            EMI_DemoCode    = 'ISO-DGNB-2026-01'
            EMI_Department  = 'Tổng hợp'
            EMI_Function    = 'ISO'
            EMI_DocCategory = 'Đánh giá nội bộ'
            EMI_Year        = 2026
            EMI_DocStatus   = 'Đang xử lý'
            EMI_IsDemo      = $true
          } | Out-Null
          # Verify CT
          $check = Get-PnPListItem -List 'TH-ISO' -Id $item.Id
          $ctLabel = [string]$check.FieldValues.ContentType
          if ($ctLabel -notmatch 'Document Set|Hồ sơ đánh giá ISO|0x0120D520') {
            $result.documentSet.status = 'BLOCKED'
            $result.documentSet.detail = "Created folder-like item but Content Type='$ctLabel' — cần bật Document Set / quyền CT. Không coi là PASS."
            Write-Warning $result.documentSet.detail
          } else {
            $result.documentSet.status = 'Created'
            Write-Host "Document Set OK CT=$ctLabel"
          }
        } else {
          $result.documentSet.status = 'BLOCKED'
          $result.documentSet.detail = 'Không tạo được Document Set ISO-DGNB-2026-01'
          Write-Warning $result.documentSet.detail
        }
      }
    } else {
      Write-Host 'EXISTS ISO-DGNB-2026-01'
      $result.documentSet.status = 'Exists'
    }

    if ($result.documentSet.status -in @('Created','Exists')) {
      $item = Get-PnPListItem -List 'TH-ISO' -PageSize 500 | Where-Object { $_.FieldValues.FileLeafRef -eq 'ISO-DGNB-2026-01' } | Select-Object -First 1
      if ($item) {
        Set-PnPListItem -List 'TH-ISO' -Identity $item.Id -Values @{
          EMI_DemoCode    = 'ISO-DGNB-2026-01'
          EMI_Department  = 'Tổng hợp'
          EMI_Function    = 'ISO'
          EMI_DocCategory = 'Đánh giá nội bộ'
          EMI_Year        = 2026
          EMI_DocStatus   = 'Đang xử lý'
          EMI_IsDemo      = $true
        } | Out-Null
        $manifest = Add-ManifestResource -Manifest $manifest -SiteUrl $cfg.emiSiteUrl -Kind 'DocumentSet' -UrlName $dsPath -Id ([string]$item.Id) -Title 'ISO-DGNB-2026-01'
      }
    }
  } catch {
    $result.documentSet.status = 'BLOCKED'
    $result.documentSet.detail = $_.Exception.Message
    Write-Warning "Document Set BLOCKED: $($_.Exception.Message)"
  }
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline
Write-DemoReport -Prefix "provision-cecm-$Mode" -Object $result -Ext json | Out-Null
Write-Host "DONE cecm $Mode"
