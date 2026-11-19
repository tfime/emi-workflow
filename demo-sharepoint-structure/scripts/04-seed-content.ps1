#Requires -Version 7.0
[CmdletBinding()]
param(
  [string]$ConfigPath = '',
  [ValidateSet('DryRun','Apply')][string]$Mode = 'DryRun'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$cfg = Get-DemoConfig -ConfigPath $ConfigPath
$files = Read-DemoJson 'seed\files.json'
$lists = Read-DemoJson 'seed\lists.json'
$dry = ($Mode -eq 'DryRun')
$root = Get-DemoRoot
$manifest = Read-Manifest
$uploaded = @()

function Convert-Values($values) {
  $ht = @{}
  foreach ($p in $values.PSObject.Properties) {
    $ht[$p.Name] = $p.Value
  }
  return $ht
}

function Ensure-FileUpload {
  param(
    [Parameter(Mandatory)][string]$Library,
    [string]$Folder = '',
    [string]$DocumentSet = '',
    [Parameter(Mandatory)][string]$LocalRelative,
    [Parameter(Mandatory)][string]$RemoteName,
    $Values
  )
  $local = Join-Path $root "sample-files\$LocalRelative"
  if (-not (Test-Path -LiteralPath $local)) { throw "Missing sample file: $local — chạy 00-Generate-SampleFiles.ps1" }
  $folderUrl = $Library
  if ($DocumentSet) { $folderUrl = "$Library/$DocumentSet" }
  elseif ($Folder) { $folderUrl = "$Library/$($Folder.Trim('/'))" }

  $target = "$folderUrl/$RemoteName"
  if ($dry) {
    Write-Host "PLAN UPLOAD $local → $target"
    return
  }
  $existing = Get-PnPFile -Url $target -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "SKIP EXISTS $target"
    return
  }
  $vals = Convert-Values $Values
  Add-PnPFile -Path $local -Folder $folderUrl -NewFileName $RemoteName -Values $vals | Out-Null
  Write-Host "UPLOAD $target"
  $script:uploaded += $target
  $script:manifest = Add-ManifestResource -Manifest $script:manifest -SiteUrl (Get-PnPConnection).Url -Kind 'File' -UrlName $target -Title $RemoteName
}

# Hub files
Connect-DemoSite -Url $cfg.hubSiteUrl -ClientId $cfg.clientId
foreach ($f in $files.hub) {
  Ensure-FileUpload -Library $f.library -LocalRelative $f.localFile -RemoteName $f.remoteName -Values $f.values
}
# List hub items
$listUrl = 'Lists/EMI_DEMO_DanhMucChung'
if (-not $dry -and (Test-ListExists $listUrl)) {
  foreach ($it in $lists.danhMucChung) {
    $code = [string]$it.EMI_DemoCode
    $found = Get-PnPListItem -List $listUrl -PageSize 200 | Where-Object { $_.FieldValues.EMI_DemoCode -eq $code } | Select-Object -First 1
    $fileHint = [string]$it.EMI_OfficialUrl.Description
    $fileUrl = ''
    if ($fileHint) {
      $cand = Get-PnPFile -Url "EMI-SharedDocs/$fileHint" -AsListItem -ErrorAction SilentlyContinue
      if (-not $cand) { $cand = Get-PnPFile -Url "EMI-ISO-Standards/$fileHint" -AsListItem -ErrorAction SilentlyContinue }
      if (-not $cand) { $cand = Get-PnPFile -Url "EMI-Templates/$fileHint" -AsListItem -ErrorAction SilentlyContinue }
      if ($cand) { $fileUrl = $cand.FieldValues.FileRef }
    }
    $vals = @{
      Title           = [string]$it.Title
      EMI_DemoCode    = $code
      EMI_DocCategory = [string]$it.EMI_DocCategory
      EMI_Library     = [string]$it.EMI_Library
      EMI_Year        = [int]$it.EMI_Year
      EMI_IsDemo      = $true
    }
    if ($fileUrl) { $vals['EMI_OfficialUrl'] = $fileUrl }
    if ($found) {
      Set-PnPListItem -List $listUrl -Identity $found.Id -Values $vals | Out-Null
      Write-Host "UPDATE list item $code"
    } else {
      Add-PnPListItem -List $listUrl -Values $vals | Out-Null
      Write-Host "ADD list item $code"
    }
  }
}
Disconnect-PnPOnline

# cecm files
Connect-DemoSite -Url $cfg.emiSiteUrl -ClientId $cfg.clientId
foreach ($f in $files.cecm) {
  $ds = if ($f.PSObject.Properties.Name -contains 'documentSet') { [string]$f.documentSet } else { '' }
  $folder = if ($f.PSObject.Properties.Name -contains 'folder') { [string]$f.folder } else { '' }
  Ensure-FileUpload -Library $f.library -Folder $folder -DocumentSet $ds -LocalRelative $f.localFile -RemoteName $f.remoteName -Values $f.values
}

$listUrl = 'Lists/EMI_DEMO_DanhMucHoSo'
if (-not $dry -and (Test-ListExists $listUrl)) {
  $web = Get-PnPWeb
  $base = $web.Url.TrimEnd('/')
  foreach ($it in $lists.danhMucHoSo) {
    $code = [string]$it.EMI_DemoCode
    $found = Get-PnPListItem -List $listUrl -PageSize 200 | Where-Object { $_.FieldValues.EMI_DemoCode -eq $code } | Select-Object -First 1
    $source = ''
    $published = ''
    switch ($code) {
      'CDS-DT-2026-01' {
        $source = "$base/TH-Digital/Dao%20tao/Dao%20tao%20CDS%202026"
        $published = "$($cfg.hubSiteUrl.TrimEnd('/'))/EMI-SharedDocs/Tai%20lieu%20dao%20tao%20CDS%202026%20-%20Ban%20phat%20hanh.docx"
      }
      'ISO-DGNB-2026-01' { $source = "$base/TH-ISO/ISO-DGNB-2026-01" }
      'TH-KH-2026' { $source = "$base/TH-Shared/Ke%20hoach%20cong%20tac%20phong%20Tong%20hop%202026.docx" }
      'PL-HD-2026-01' { $source = "$base/TH-Legal/Phieu%20ra%20soat%20hop%20dong%20DEMO.docx" }
      'CN-BT-2026' { $source = "$base/TH-Tech/Ke%20hoach%20bao%20tri%20he%20thong%20DEMO.docx" }
    }
    $vals = @{
      Title         = [string]$it.Title
      EMI_DemoCode  = $code
      EMI_Function  = [string]$it.EMI_Function
      EMI_Year      = [int]$it.EMI_Year
      EMI_DocStatus = [string]$it.EMI_DocStatus
      EMI_IsDemo    = $true
    }
    if ($source) { $vals['EMI_SourceUrl'] = $source }
    if ($published) { $vals['EMI_PublishedUrl'] = $published }
    if ($found) {
      Set-PnPListItem -List $listUrl -Identity $found.Id -Values $vals | Out-Null
      Write-Host "UPDATE ho so $code"
    } else {
      Add-PnPListItem -List $listUrl -Values $vals | Out-Null
      Write-Host "ADD ho so $code"
    }
  }
}

if (-not $dry) { Save-Manifest $manifest }
Disconnect-PnPOnline
Write-DemoReport -Prefix "seed-$Mode" -Object ([pscustomobject]@{ mode = $Mode; uploaded = $uploaded }) -Ext json | Out-Null
Write-Host "DONE seed $Mode"
