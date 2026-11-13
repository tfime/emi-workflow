# Build PaymentTypes + ChecklistTemplates from EMI_Checklist Excel (2-level).
# Leaf types only; nav groups (Nhóm chọn nghiệp vụ con = Có*) excluded.
# Does not Apply to SharePoint — merges into seed-config.json.
[CmdletBinding()]
param(
    [string]$ExcelPath = 'c:\Users\tinhp\Downloads\EMI_Checklist_Ho_so_Chung_tu_2_cap.xlsx',
    [string]$SeedPath = (Join-Path $PSScriptRoot '..\config\seed-config.json'),
    [string]$WorkflowCode = 'EMI_PAY_SPV',
    [int]$ChecklistVersion = 1
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ExcelPath)) {
    throw "Excel not found: $ExcelPath"
}

$work = Join-Path $env:TEMP ("emi_nhx_seed_{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null

function Export-SheetCsv {
    param([string]$SheetName, [string]$OutCsv)
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try {
        $wb = $excel.Workbooks.Open($ExcelPath)
        $ws = $null
        foreach ($s in $wb.Worksheets) {
            if ($s.Name -eq $SheetName) { $ws = $s; break }
        }
        if (-not $ws) { throw "Sheet not found: $SheetName" }
        $rows = $ws.UsedRange.Rows.Count
        $cols = $ws.UsedRange.Columns.Count
        $sb = New-Object System.Text.StringBuilder
        for ($r = 1; $r -le $rows; $r++) {
            $line = New-Object System.Collections.Generic.List[string]
            for ($c = 1; $c -le $cols; $c++) {
                $val = [string]$ws.Cells.Item($r, $c).Text
                if ($null -eq $val) { $val = '' }
                $val = $val -replace '"', '""'
                if ($val -match '[,"\r\n]') { $val = '"' + $val + '"' }
                [void]$line.Add($val)
            }
            [void]$sb.AppendLine(($line -join ','))
        }
        [System.IO.File]::WriteAllText($OutCsv, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
        $wb.Close($false)
    }
    finally {
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
}

Write-Host "Exporting Excel sheets..."
$loaiCsv = Join-Path $work 'loai.csv'
$chkCsv = Join-Path $work 'checklist.csv'
Export-SheetCsv -SheetName 'Loai ho so' -OutCsv $loaiCsv
Export-SheetCsv -SheetName 'Checklist' -OutCsv $chkCsv

function Read-CsvFromHeader {
    param([string]$Path, [string]$HeaderPrefix)
    $lines = Get-Content -LiteralPath $Path -Encoding UTF8
    $idx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith($HeaderPrefix)) { $idx = $i; break }
    }
    if ($idx -lt 0) { throw "Header not found ($HeaderPrefix) in $Path" }
    return ($lines[$idx..($lines.Count - 1)] -join "`n") | ConvertFrom-Csv
}

$loai = @(Read-CsvFromHeader -Path $loaiCsv -HeaderPrefix 'Mã loại hồ sơ,')
$chk = @(Read-CsvFromHeader -Path $chkCsv -HeaderPrefix 'Mã loại hồ sơ,')

function Test-IsNavGroup([string]$flag) {
    if ([string]::IsNullOrWhiteSpace($flag)) { return $false }
    return $flag.Trim().StartsWith('Có')
}

$leaf = @($loai | Where-Object {
    -not (Test-IsNavGroup $_.'Nhóm chọn nghiệp vụ con') -and
    [int]$_.'Số tài liệu đầy đủ' -gt 0
})

$leafCodes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($row in $leaf) { [void]$leafCodes.Add([string]$row.'Mã loại hồ sơ') }

$paymentTypes = [System.Collections.Generic.List[object]]::new()
$paymentTypes.Add([ordered]@{
    PaymentTypeCode  = 'SPV_PAYMENT'
    ChecklistVersion = $ChecklistVersion
    WorkflowCode     = $WorkflowCode
    IsActive         = $true
    Title            = 'Hồ sơ thanh toán SPV'
})

foreach ($row in ($leaf | Sort-Object { $_.'Mã loại hồ sơ' })) {
    $code = [string]$row.'Mã loại hồ sơ'
    $title = ([string]$row.'Loại hồ sơ') -replace '\s+', ' '
    $title = $title.Trim()
    # Title SharePoint thường ngắn; cắt gọn nếu quá dài
    if ($title.Length -gt 240) { $title = $title.Substring(0, 237) + '...' }
    $paymentTypes.Add([ordered]@{
        PaymentTypeCode  = $code
        ChecklistVersion = $ChecklistVersion
        WorkflowCode     = $WorkflowCode
        IsActive         = $true
        Title            = $title
    })
}

$checklistTemplates = [System.Collections.Generic.List[object]]::new()
$checklistTemplates.Add([ordered]@{
    PaymentTypeCode = 'SPV_PAYMENT'
    VersionNo       = $ChecklistVersion
    ItemCode        = 'DOC_REQUEST'
    ItemLabel       = 'Đề nghị thanh toán'
    IsRequired      = $true
    MinFileCount    = 1
    DisplayOrder    = 1
})
$checklistTemplates.Add([ordered]@{
    PaymentTypeCode = 'SPV_PAYMENT'
    VersionNo       = $ChecklistVersion
    ItemCode        = 'DOC_INVOICE'
    ItemLabel       = 'Hóa đơn / chứng từ'
    IsRequired      = $true
    MinFileCount    = 1
    DisplayOrder    = 2
})
$checklistTemplates.Add([ordered]@{
    PaymentTypeCode = 'SPV_PAYMENT'
    VersionNo       = $ChecklistVersion
    ItemCode        = 'DOC_CONTRACT'
    ItemLabel       = 'Hợp đồng liên quan'
    IsRequired      = $false
    MinFileCount    = 0
    DisplayOrder    = 3
})

# Stable ItemCode: {CODE}_NN — unique across types for Upsert KeyField=ItemCode + MatchExtra
function Get-ItemCodePrefix([string]$paymentTypeCode) {
    $p = $paymentTypeCode.ToUpperInvariant() -replace '[^A-Z0-9]+', '_'
    $p = $p.Trim('_')
    if ($p.Length -gt 32) { $p = $p.Substring(0, 32).TrimEnd('_') }
    return $p
}

$byType = $chk | Where-Object { $leafCodes.Contains([string]$_.'Mã loại hồ sơ') } | Group-Object 'Mã loại hồ sơ'
foreach ($g in ($byType | Sort-Object Name)) {
    $order = 0
    foreach ($doc in $g.Group) {
        $order++
        $label = ([string]$doc.'Checklist tài liệu cần') -replace '\s+', ' '
        $label = $label.Trim()
        if ([string]::IsNullOrWhiteSpace($label)) { continue }
        if ($label.Length -gt 240) { $label = $label.Substring(0, 237) + '...' }
        $tt = [string]$doc.TT
        $required = ($tt -eq 'B')
        $prefix = Get-ItemCodePrefix $g.Name
        $itemCode = '{0}_{1:D2}' -f $prefix, $order
        $checklistTemplates.Add([ordered]@{
            PaymentTypeCode = $g.Name
            VersionNo       = $ChecklistVersion
            ItemCode        = $itemCode
            ItemLabel       = $label
            IsRequired      = $required
            MinFileCount    = $(if ($required) { 1 } else { 0 })
            DisplayOrder    = $order
        })
    }
}

$seed = Get-Content -LiteralPath $SeedPath -Raw -Encoding UTF8 | ConvertFrom-Json
# Rebuild as hashtable-friendly JSON via PowerShell objects
$seed.paymentTypes = @($paymentTypes)
$seed.checklistTemplates = @($checklistTemplates)
$seed | Add-Member -NotePropertyName '_nhxChecklistComment' -NotePropertyValue 'NHX Phụ lục 01: loại lá only (bỏ nhóm điều hướng VH-10/TH-03/DT-02/DT-02.2/DT-02.3). TT=B→IsRequired. Giữ SPV_PAYMENT. Nguồn: EMI_Checklist_Ho_so_Chung_tu_2_cap.xlsx' -Force

$json = $seed | ConvertTo-Json -Depth 8
# ConvertTo-Json may produce ASCII-escaped unicode; keep readable UTF8
[System.IO.File]::WriteAllText((Resolve-Path $SeedPath), $json, [System.Text.UTF8Encoding]::new($false))

$navSkipped = @($loai | Where-Object { Test-IsNavGroup $_.'Nhóm chọn nghiệp vụ con' } | ForEach-Object { $_.'Mã loại hồ sơ' })
Write-Host ("Leaf PaymentTypes (excl SPV): {0}" -f ($paymentTypes.Count - 1))
Write-Host ("Checklist rows (excl SPV 3): {0}" -f ($checklistTemplates.Count - 3))
Write-Host ("Nav skipped: {0}" -f ($navSkipped -join ', '))
Write-Host ("Required TT=B: {0}" -f @($checklistTemplates | Where-Object { $_.IsRequired -eq $true -and $_.PaymentTypeCode -ne 'SPV_PAYMENT' }).Count)
Write-Host ("Updated: $SeedPath")

Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
