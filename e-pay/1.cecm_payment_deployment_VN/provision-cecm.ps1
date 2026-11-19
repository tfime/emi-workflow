# EMI PAY - Khoi tao danh sach/thu vien/cot voi ten hien thi tieng Viet.
# Ma ky thuat va URL giu tieng Anh de Flow/SPFx tham chieu on dinh.
# CHUA thiet lap RBAC / Power Automate / SPFx. Khong dua du lieu that vao truoc khi bao mat.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ClientId,
  [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
  [string]$SchemaPath = (Join-Path $PSScriptRoot 'schema.json'),
  [switch]$Preview
)
$ErrorActionPreference = 'Stop'
$expected = 'https://emicomvn.sharepoint.com/sites/cecm'
if ($SiteUrl.TrimEnd('/') -ne $expected) { throw "Safety check: only $expected may be provisioned." }
if (-not (Test-Path -LiteralPath $SchemaPath)) { throw "Khong tim thay schema: $SchemaPath" }
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) { throw 'Can cai PnP.PowerShell.' }
$schema = Get-Content -LiteralPath $SchemaPath -Raw -Encoding utf8 | ConvertFrom-Json
if ($schema.siteUrl -ne $expected) { throw 'SiteUrl trong schema.json khong khop voi CECM.' }
Write-Host "Target: $SiteUrl | Components: $($schema.components.Count) | Preview: $Preview"
if ($Preview) {
  foreach ($obj in $schema.components) {
    $label = if ([string]::IsNullOrWhiteSpace([string]$obj.displayName)) { [string]$obj.name } else { [string]$obj.displayName }
    Write-Host ('PLAN {0,-18} {1,-33} => {2} ({3} cot)' -f $obj.kind, $obj.name, $label, $obj.fields.Count)
  }
  Write-Host 'PREVIEW ONLY - Khong co thay doi tren SharePoint.'
  return
}

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId
$createdObjects = 0
$createdFields = 0
$renamedObjects = 0
$renamedFields = 0

foreach ($obj in $schema.components) {
  $name = [string]$obj.name
  if (-not $name.StartsWith('EMI_PAY_')) { throw "Tu choi tao doi tuong ngoai pham vi EMI_PAY_: $name" }
  $kind = [string]$obj.kind
  $label = if ([string]::IsNullOrWhiteSpace([string]$obj.displayName)) { $name } else { [string]$obj.displayName }
  $relativeUrl = if ($kind -eq 'DocumentLibrary') { $name } else { "Lists/$name" }
  # Look up by stable URL - display title can be Vietnamese or edited later.
  $list = Get-PnPList -Identity $relativeUrl -ErrorAction SilentlyContinue
  if ($null -eq $list) {
    if ($kind -eq 'DocumentLibrary') {
      New-PnPList -Title $label -Url $relativeUrl -Template DocumentLibrary -EnableVersioning | Out-Null
    } else {
      New-PnPList -Title $label -Url $relativeUrl -Template GenericList -EnableVersioning | Out-Null
    }
    $list = Get-PnPList -Identity $relativeUrl -ErrorAction Stop
    Write-Host "CREATE $name => $label"
    $createdObjects++
  } else {
    Write-Host "EXISTS $name"
    if ([string]$list.Title -ne $label) {
      Set-PnPList -Identity $list.Id -Title $label
      $renamedObjects++
      Write-Host "  RENAME TITLE: $label"
    }
  }
  Set-PnPList -Identity $list.Id -EnableVersioning $true
  if ($kind -eq 'GenericList') { Set-PnPList -Identity $list.Id -EnableAttachments $false }
  foreach ($col in $obj.fields) {
    $n = [string]$col.name
    $colLabel = if ([string]::IsNullOrWhiteSpace([string]$col.displayName)) { $n } else { [string]$col.displayName }
    $present = Get-PnPField -List $list.Id -Identity $n -ErrorAction SilentlyContinue
    if ($null -eq $present) {
      $args = @{ List=$list.Id; InternalName=$n; DisplayName=$colLabel; Type=[string]$col.type; Group='EMI Payment Workflow' }
      if ($null -ne $col.choices -and $col.choices.Count -gt 0) { $args['Choices'] = [string[]]$col.choices }
      if ($col.required -eq $true) { $args['Required'] = $true }
      Add-PnPField @args | Out-Null
      $createdFields++
      Write-Host "  ADD FIELD $n => $colLabel"
    } else {
      if ([string]$present.Title -ne $colLabel) {
        Set-PnPField -List $list.Id -Identity $n -Values @{Title=$colLabel} | Out-Null
        $renamedFields++
        Write-Host "  RENAME FIELD $n => $colLabel"
      }
    }
    if ($col.indexed -eq $true) {
      try { Set-PnPField -List $list.Id -Identity $n -Values @{Indexed=$true} | Out-Null }
      catch { Write-Warning "Khong the danh index $name.$n : $($_.Exception.Message)" }
    }
  }
}
Write-Host ('FINISHED - New objects: {0}; Renamed objects: {1}; New fields: {2}; Renamed fields: {3}' -f $createdObjects,$renamedObjects,$createdFields,$renamedFields)
Write-Warning 'CHUA CO RBAC, Flow, SPFx VA QUYEN TAI LIEU NOI BO. Khong su dung du lieu thanh toan that cho toi khi kiem tra bao mat.'
