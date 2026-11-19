#Requires -Version 7.0
Set-StrictMode -Version Latest

$script:DemoRoot = Split-Path -Parent $PSScriptRoot
$script:DemoMarker = 'EMI_DEMO_OWNED'
$script:DemoMarkerValue = 'EMI-DEMO-2026'

function Get-DemoRoot { $script:DemoRoot }

function Read-DemoJson {
  param([Parameter(Mandatory)][string]$RelativePath)
  $path = Join-Path $script:DemoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing file: $path" }
  return (Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json)
}

function Get-DemoConfig {
  param([string]$ConfigPath)
  if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $script:DemoRoot 'config\settings.json'
  }
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Chưa có config. Sao chép config/settings.example.json → settings.json và điền clientId."
  }
  $cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace([string]$cfg.clientId) -or $cfg.clientId -like 'REPLACE*') {
    throw "settings.json: clientId chưa được thay bằng Entra App Client ID hợp lệ."
  }
  if ($cfg.createNewSites -eq $true) { throw "createNewSites=true bị cấm bởi spec." }
  if ($cfg.changeHubRegistration -eq $true) { throw "changeHubRegistration=true bị cấm bởi spec." }
  if ($cfg.changeHubAssociation -eq $true) { throw "changeHubAssociation=true bị cấm bởi spec." }
  return $cfg
}

function Get-DemoMembers {
  $path = Join-Path $script:DemoRoot 'config\members.json'
  if (-not (Test-Path -LiteralPath $path)) {
    $path = Join-Path $script:DemoRoot 'config\members.example.json'
  }
  return (Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json)
}

function Ensure-ReportsDir {
  $dir = Join-Path $script:DemoRoot 'reports'
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  return $dir
}

function Get-ManifestPath { Join-Path (Ensure-ReportsDir) 'manifest.json' }

function Read-Manifest {
  $p = Get-ManifestPath
  if (-not (Test-Path -LiteralPath $p)) {
    return [pscustomobject]@{
      createdAt = (Get-Date).ToString('o')
      seedPrefix = 'EMI-DEMO-2026'
      resources = @()
    }
  }
  return (Get-Content -LiteralPath $p -Raw -Encoding utf8 | ConvertFrom-Json)
}

function Save-Manifest {
  param($Manifest)
  $Manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Get-ManifestPath) -Encoding utf8
}

function Add-ManifestResource {
  param(
    [Parameter(Mandatory)]$Manifest,
    [Parameter(Mandatory)][string]$SiteUrl,
    [Parameter(Mandatory)][string]$Kind,
    [Parameter(Mandatory)][string]$UrlName,
    [string]$Id = '',
    [string]$Title = '',
    [hashtable]$Extra = @{}
  )
  $existing = @($Manifest.resources | Where-Object { $_.siteUrl -eq $SiteUrl -and $_.urlName -eq $UrlName -and $_.kind -eq $Kind })
  if ($existing.Count -gt 0) { return $Manifest }
  $item = [ordered]@{
    siteUrl   = $SiteUrl
    kind      = $Kind
    urlName   = $UrlName
    id        = $Id
    title     = $Title
    createdAt = (Get-Date).ToString('o')
    ownedBy   = $script:DemoMarker
  }
  foreach ($k in $Extra.Keys) { $item[$k] = $Extra[$k] }
  $Manifest.resources = @($Manifest.resources) + @([pscustomobject]$item)
  return $Manifest
}

function Write-DemoReport {
  param(
    [Parameter(Mandatory)][string]$Prefix,
    [Parameter(Mandatory)]$Object,
    [ValidateSet('md','json','csv')][string]$Ext = 'md'
  )
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $path = Join-Path (Ensure-ReportsDir) "$Prefix-$stamp.$Ext"
  if ($Ext -eq 'json') {
    $Object | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding utf8
  } elseif ($Ext -eq 'csv') {
    $Object | Set-Content -LiteralPath $path -Encoding utf8
  } else {
    Set-Content -LiteralPath $path -Value $Object -Encoding utf8
  }
  Write-Host "REPORT: $path"
  return $path
}

function Connect-DemoSite {
  param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][string]$ClientId
  )
  if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    throw 'Cần cài PnP.PowerShell (Install-Module PnP.PowerShell -Scope CurrentUser).'
  }
  Import-Module PnP.PowerShell -ErrorAction Stop
  Write-Host "Connecting: $Url"
  Connect-PnPOnline -Url $Url -Interactive -ClientId $ClientId
}

function Test-ListExists {
  param([Parameter(Mandatory)][string]$UrlName)
  return [bool](Get-PnPList -Identity $UrlName -ErrorAction SilentlyContinue)
}

function Get-ListSafe {
  param([Parameter(Mandatory)][string]$UrlName)
  return (Get-PnPList -Identity $UrlName -ErrorAction SilentlyContinue)
}

function Ensure-DemoField {
  param(
    [Parameter(Mandatory)]$List,
    [Parameter(Mandatory)]$FieldDef,
    [switch]$DryRun
  )
  $n = [string]$FieldDef.internalName
  $present = Get-PnPField -List $List.Id -Identity $n -ErrorAction SilentlyContinue
  if ($null -ne $present) {
    $wantType = switch ([string]$FieldDef.type) {
      'Text' { 'Text' }
      'Choice' { 'Choice' }
      'Number' { 'Number' }
      'Boolean' { 'Boolean' }
      'URL' { 'URL' }
      default { [string]$FieldDef.type }
    }
    # Soft check — SharePoint TypeAsString varies (Text vs Note etc.)
    Write-Host "  FIELD EXISTS $n ($($present.TypeAsString))"
    if ([string]$present.Title -ne [string]$FieldDef.displayName -and -not $DryRun) {
      Set-PnPField -List $List.Id -Identity $n -Values @{ Title = [string]$FieldDef.displayName } | Out-Null
    }
    return 'Exists'
  }
  if ($DryRun) {
    Write-Host "  PLAN ADD FIELD $n => $($FieldDef.displayName)"
    return 'Plan'
  }
  $args = @{
    List         = $List.Id
    InternalName = $n
    DisplayName  = [string]$FieldDef.displayName
    Type         = [string]$FieldDef.type
    Group        = 'EMI Demo Tong hop'
  }
  $hasChoices = ($FieldDef.PSObject.Properties.Name -contains 'choices') -and $null -ne $FieldDef.choices
  if ($hasChoices) { $args['Choices'] = [string[]]@($FieldDef.choices) }
  Add-PnPField @args | Out-Null
  Write-Host "  ADD FIELD $n => $($FieldDef.displayName)"
  return 'Created'
}

function Ensure-DemoList {
  param(
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][string]$UrlName,
    [Parameter(Mandatory)][ValidateSet('DocumentLibrary','GenericList')]$Kind,
    [switch]$DryRun,
    [switch]$EnableVersioning
  )
  $existing = Get-ListSafe -UrlName $UrlName
  if ($null -ne $existing) {
    # Conflict if exists but not marked / not in manifest — still allow reuse if URL matches demo naming
    Write-Host "EXISTS $UrlName ($($existing.Title))"
    if (-not $DryRun -and [string]$existing.Title -ne $Title) {
      Set-PnPList -Identity $existing.Id -Title $Title
    }
    if (-not $DryRun -and $EnableVersioning) {
      Set-PnPList -Identity $existing.Id -EnableVersioning $true
    }
    return [pscustomobject]@{ Action = 'Exists'; List = $existing; Conflict = $false }
  }
  if ($DryRun) {
    Write-Host "PLAN CREATE $Kind $UrlName => $Title"
    return [pscustomobject]@{ Action = 'Plan'; List = $null; Conflict = $false }
  }
  if ($Kind -eq 'DocumentLibrary') {
    New-PnPList -Title $Title -Url $UrlName -Template DocumentLibrary -EnableVersioning | Out-Null
  } else {
    New-PnPList -Title $Title -Url $UrlName -Template GenericList -EnableVersioning | Out-Null
  }
  $list = Get-PnPList -Identity $UrlName -ErrorAction Stop
  if ($EnableVersioning) { Set-PnPList -Identity $list.Id -EnableVersioning $true }
  Write-Host "CREATE $UrlName => $Title"
  return [pscustomobject]@{ Action = 'Created'; List = $list; Conflict = $false }
}

function Ensure-DemoFolder {
  param(
    [Parameter(Mandatory)][string]$LibraryUrlName,
    [Parameter(Mandatory)][string]$FolderPath,
    [switch]$DryRun
  )
  if ([string]::IsNullOrWhiteSpace($FolderPath)) { return $null }
  $parts = $FolderPath -split '[\\/]' | Where-Object { $_ }
  $current = $LibraryUrlName
  foreach ($p in $parts) {
    $next = "$current/$p"
    $folder = Get-PnPFolder -Url $next -ErrorAction SilentlyContinue
    if ($null -eq $folder) {
      if ($DryRun) {
        Write-Host "PLAN FOLDER $next"
      } else {
        Add-PnPFolder -Name $p -Folder $current | Out-Null
        Write-Host "CREATE FOLDER $next"
      }
    } else {
      Write-Host "EXISTS FOLDER $next"
    }
    $current = $next
  }
  return $current
}

function Ensure-DemoGroup {
  param(
    [Parameter(Mandatory)][string]$Title,
    [string]$Description = '',
    [switch]$DryRun
  )
  $g = Get-PnPGroup -Identity $Title -ErrorAction SilentlyContinue
  if ($null -ne $g) {
    Write-Host "EXISTS GROUP $Title"
    return [pscustomobject]@{ Action = 'Exists'; Group = $g }
  }
  if ($DryRun) {
    Write-Host "PLAN GROUP $Title"
    return [pscustomobject]@{ Action = 'Plan'; Group = $null }
  }
  $g = New-PnPGroup -Title $Title -Description $Description
  Write-Host "CREATE GROUP $Title"
  return [pscustomobject]@{ Action = 'Created'; Group = $g }
}

function Add-MembersToGroup {
  param(
    [Parameter(Mandatory)][string]$GroupTitle,
    $Members,
    [switch]$DryRun
  )
  if ($null -eq $Members) {
    Write-Host "  MEMBERS PENDING (empty) → $GroupTitle"
    return 0
  }
  $list = @()
  if ($Members -is [string]) {
    if (-not [string]::IsNullOrWhiteSpace($Members)) { $list = @($Members) }
  } else {
    try { $list = @(@($Members) | ForEach-Object { "$_" } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }
    catch { $list = @() }
  }
  if (@($list).Length -eq 0) {
    Write-Host "  MEMBERS PENDING (empty) → $GroupTitle"
    return 0
  }
  $added = 0
  foreach ($m in $list) {
    if ($DryRun) {
      Write-Host "  PLAN ADD MEMBER $m → $GroupTitle"
      $added++
      continue
    }
    try {
      Add-PnPGroupMember -Identity $GroupTitle -LoginName $m -ErrorAction Stop
      Write-Host "  ADD MEMBER $m → $GroupTitle"
      $added++
    } catch {
      Write-Warning "  Không thêm được $m vào $GroupTitle : $($_.Exception.Message)"
    }
  }
  return $added
}

function New-MinimalDocx {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$BodyText)
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("docx-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp '_rels') | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp 'word\_rels') -Force | Out-Null
  $escaped = [System.Security.SecurityElement]::Escape($BodyText)
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"@ | Set-Content -LiteralPath (Join-Path $tmp '[Content_Types].xml') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"@ | Set-Content -LiteralPath (Join-Path $tmp '_rels\.rels') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'word\_rels\document.xml.rels') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>DỮ LIỆU DEMO — KHÔNG CÓ HIỆU LỰC ÁP DỤNG</w:t></w:r></w:p>
    <w:p><w:r><w:t>$escaped</w:t></w:r></w:p>
  </w:body>
</w:document>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'word\document.xml') -Encoding utf8
  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
  Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath ($Path + '.zip') -Force
  Move-Item -LiteralPath ($Path + '.zip') -Destination $Path -Force
  Remove-Item -LiteralPath $tmp -Recurse -Force
}

function New-MinimalXlsx {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string[]]$Headers, [Parameter(Mandatory)][string[][]]$Rows)
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("xlsx-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path (Join-Path $tmp '_rels') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp 'xl\_rels') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tmp 'xl\worksheets') -Force | Out-Null
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>
"@ | Set-Content -LiteralPath (Join-Path $tmp '[Content_Types].xml') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"@ | Set-Content -LiteralPath (Join-Path $tmp '_rels\.rels') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Demo" sheetId="1" r:id="rId1"/></sheets>
</workbook>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'xl\workbook.xml') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'xl\_rels\workbook.xml.rels') -Encoding utf8

  $strings = New-Object System.Collections.Generic.List[string]
  function Get-Si([string]$s) {
    $idx = $strings.IndexOf($s)
    if ($idx -lt 0) { $strings.Add($s); return ($strings.Count - 1) }
    return $idx
  }

  $allRows = ,@($Headers) + $Rows
  $sheetRows = New-Object System.Collections.Generic.List[string]
  $rIdx = 1
  foreach ($row in $allRows) {
    $cells = New-Object System.Collections.Generic.List[string]
    $cIdx = 0
    foreach ($cell in $row) {
      $col = ''
      $n = $cIdx
      do { $col = [char](65 + ($n % 26)) + $col; $n = [math]::Floor($n / 26) - 1 } while ($n -ge 0)
      $si = Get-Si ([string]$cell)
      $ref = "$col$rIdx"
      $cells.Add("<c r=`"$ref`" t=`"s`"><v>$si</v></c>")
      $cIdx++
    }
    $sheetRows.Add("<row r=`"$rIdx`">$($cells -join '')</row>")
    $rIdx++
  }
  $siXml = ($strings | ForEach-Object {
    $e = [System.Security.SecurityElement]::Escape($_)
    "<si><t>$e</t></si>"
  }) -join ''
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="$($strings.Count)" uniqueCount="$($strings.Count)">$siXml</sst>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'xl\sharedStrings.xml') -Encoding utf8
  @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>$($sheetRows -join '')</sheetData>
</worksheet>
"@ | Set-Content -LiteralPath (Join-Path $tmp 'xl\worksheets\sheet1.xml') -Encoding utf8

  if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Force }
  Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath ($Path + '.zip') -Force
  Move-Item -LiteralPath ($Path + '.zip') -Destination $Path -Force
  Remove-Item -LiteralPath $tmp -Recurse -Force
}

Export-ModuleMember -Function *
