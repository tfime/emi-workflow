# EMI PAY / Core V1 -- read-only SharePoint schema inventory
# Requires PowerShell 7, PnP.PowerShell, and an existing PnP connection to CECM.
# Does NOT create/update/delete SharePoint data or permissions.
[CmdletBinding()]
param(
    [string]$SiteUrl = 'https://emicomvn.sharepoint.com/sites/cecm',
    [string]$InventoryCsv = (Join-Path $PSScriptRoot '05_RBAC_23_Objects_Reference.csv'),
    [string]$OutputParent = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $InventoryCsv -PathType Leaf)) {
    throw "Inventory CSV not found: $InventoryCsv"
}
if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
    throw 'PnP.PowerShell is not installed in this PowerShell session.'
}
Import-Module PnP.PowerShell -ErrorAction Stop
$connection = Get-PnPConnection -ErrorAction Stop
if ($null -eq $connection) {
    throw 'Connect-PnPOnline to https://emicomvn.sharepoint.com/sites/cecm first.'
}

$web = Get-PnPWeb -Connection $connection -Includes Url -ErrorAction Stop
if ($web.Url.TrimEnd('/') -ine $SiteUrl.TrimEnd('/')) {
    throw "Safety stop: Connected site [$($web.Url)] is not expected [$SiteUrl]."
}

$inventory = @(Import-Csv -LiteralPath $InventoryCsv -Encoding UTF8)
if ($inventory.Count -ne 23) {
    throw "Safety stop: Expected 23 objects in reference CSV, got $($inventory.Count)."
}
$uniqueGuids = @($inventory | Select-Object -ExpandProperty GUID -Unique)
if ($uniqueGuids.Count -ne 23) {
    throw 'Safety stop: 23 unique GUIDs required.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputFolder = Join-Path $OutputParent "EMI_PAY_CORE_SCHEMA_$stamp"
New-Item -Path $outputFolder -ItemType Directory -Force | Out-Null
$fieldsOut = [System.Collections.Generic.List[object]]::new()
$objectsOut = [System.Collections.Generic.List[object]]::new()

foreach ($ref in $inventory) {
    $guid = [Guid]::Parse($ref.GUID)
    Write-Host "READ: $($ref.InternalName) [$guid]" -ForegroundColor Cyan
    $list = Get-PnPList -Identity $guid -Connection $connection -ErrorAction Stop
    Get-PnPProperty -ClientObject $list -Property Id,Title,ItemCount,HasUniqueRoleAssignments -Connection $connection | Out-Null
    if ($list.Id -ne $guid) {
        throw "Safety stop: GUID mismatch for $($ref.InternalName)."
    }

    $fields = @(Get-PnPField -List $guid -Connection $connection -ErrorAction Stop)
    foreach ($field in $fields) {
        # The object below is a singular Field; never pass a collection to Get-PnPProperty.
        Get-PnPProperty -ClientObject $field -Property Id,InternalName,Title,TypeAsString,Required,Hidden,ReadOnlyField -Connection $connection | Out-Null
        $fieldsOut.Add([pscustomobject]@{
            ListInternalName = $ref.InternalName
            ListGuid = $ref.GUID
            ListDisplayName = $ref.DisplayName
            FieldGuid = [string]$field.Id
            InternalName = [string]$field.InternalName
            Title = [string]$field.Title
            TypeAsString = [string]$field.TypeAsString
            Required = [bool]$field.Required
            Hidden = [bool]$field.Hidden
            ReadOnlyField = [bool]$field.ReadOnlyField
        })
    }
    $objectsOut.Add([pscustomobject]@{
        InternalName = $ref.InternalName
        Guid = $ref.GUID
        DisplayNameInRBAC = $ref.DisplayName
        LiveTitle = [string]$list.Title
        Type = $ref.Type
        ItemCount = [int]$list.ItemCount
        UniqueACL = [bool]$list.HasUniqueRoleAssignments
        FieldCountIncludingSystem = $fields.Count
    })
}

$fieldsCsv = Join-Path $outputFolder 'fields_all_23.csv'
$objectsCsv = Join-Path $outputFolder 'objects_all_23.csv'
$fieldsOut | Export-Csv -LiteralPath $fieldsCsv -Encoding UTF8
$objectsOut | Export-Csv -LiteralPath $objectsCsv -Encoding UTF8
$fieldsOut | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputFolder 'fields_all_23.json') -Encoding UTF8
$objectsOut | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputFolder 'objects_all_23.json') -Encoding UTF8

$manifest = [ordered]@{
    Project = 'EMI PAY Core V1'
    Mode = 'READ_ONLY'
    SiteUrl = $web.Url
    GeneratedAtLocal = (Get-Date).ToString('o')
    ListsAndLibraries = $objectsOut.Count
    ExportedFieldsIncludingSystem = $fieldsOut.Count
    RBACChanges = 0
    DataChanges = 0
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputFolder 'export_manifest.json') -Encoding UTF8
$zipPath = "$outputFolder.zip"
Compress-Archive -LiteralPath $outputFolder -DestinationPath $zipPath -Force
Write-Host ''
Write-Host "SUCCESS: 23/23 objects inspected; $($fieldsOut.Count) fields exported (includes system fields)." -ForegroundColor Green
Write-Host "READ ONLY: No SharePoint changes." -ForegroundColor Green
Write-Host "OUTPUT ZIP: $zipPath" -ForegroundColor Yellow
