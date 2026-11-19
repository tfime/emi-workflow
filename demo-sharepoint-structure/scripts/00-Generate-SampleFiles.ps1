#Requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$root = Get-DemoRoot
$hub = Join-Path $root 'sample-files\hub'
$cecm = Join-Path $root 'sample-files\cecm'
New-Item -ItemType Directory -Force -Path $hub, $cecm | Out-Null

$docs = @(
  @{ Path = (Join-Path $hub 'Huong dan su dung SharePoint EMI.docx'); Text = 'Hướng dẫn dùng SharePoint EMI — thư viện Hub, quyền, tìm tài liệu. DỮ LIỆU DEMO.' },
  @{ Path = (Join-Path $hub 'Tai lieu dao tao CDS 2026 - Ban phat hanh.docx'); Text = 'Bản phát hành chính thức tài liệu đào tạo CĐS 2026. Nguồn soạn tại Site cecm / TH-Digital.' },
  @{ Path = (Join-Path $hub 'Quy trinh quan ly tai lieu DEMO.docx'); Text = 'Quy trình quản lý tài liệu ISO chuẩn (DEMO — không hiệu lực áp dụng).' },
  @{ Path = (Join-Path $hub 'Bieu mau bien ban hop DEMO.docx'); Text = 'Biểu mẫu biên bản họp chuẩn EMI (DEMO).' },
  @{ Path = (Join-Path $cecm 'Ke hoach cong tac phong Tong hop 2026.docx'); Text = 'Kế hoạch công tác Phòng Tổng hợp 2026 (DEMO).' },
  @{ Path = (Join-Path $cecm 'Bao cao tong hop thang 11-2026.docx'); Text = 'Báo cáo tổng hợp tháng 11/2026 — số liệu giả lập.' },
  @{ Path = (Join-Path $cecm 'Ke hoach dao tao CDS 2026.docx'); Text = 'Kế hoạch đào tạo Chuyển đổi số 2026 — đang soạn tại bộ phận CĐS.' },
  @{ Path = (Join-Path $cecm 'Tai lieu huong dan noi bo.docx'); Text = 'Tài liệu hướng dẫn nội bộ CĐS (dự thảo).' },
  @{ Path = (Join-Path $cecm 'Ke hoach danh gia noi bo.docx'); Text = 'Kế hoạch đánh giá nội bộ ISO-DGNB-2026-01.' },
  @{ Path = (Join-Path $cecm 'Bao cao danh gia.docx'); Text = 'Báo cáo đánh giá nội bộ (DEMO).' },
  @{ Path = (Join-Path $cecm 'Phieu ra soat hop dong DEMO.docx'); Text = 'Phiếu rà soát hợp đồng — dữ liệu pháp lý giả lập, không dùng hồ sơ thật.' },
  @{ Path = (Join-Path $cecm 'Ke hoach bao tri he thong DEMO.docx'); Text = 'Kế hoạch bảo trì hệ thống — DEMO Công nghệ.' }
)
foreach ($d in $docs) {
  New-MinimalDocx -Path $d.Path -BodyText $d.Text
  Write-Host "DOCX $($d.Path)"
}

New-MinimalXlsx -Path (Join-Path $cecm 'Danh sach tham du DEMO.xlsx') `
  -Headers @('STT','Ho ten','Email (gia)','Bo phan','Ghi chu') `
  -Rows @(
    @('1','Nguyen Van A','a.demo@example.local','CĐS','DEMO'),
    @('2','Tran Thi B','b.demo@example.local','ISO','DEMO'),
    @('3','Le Van C','c.demo@example.local','Cong nghe','DEMO')
  )
New-MinimalXlsx -Path (Join-Path $cecm 'Danh muc sang kien CDS.xlsx') `
  -Headers @('Ma','Ten sang kien','Trang thai','Nam') `
  -Rows @(
    @('SK-01','So hoa quy trinh phe duyet','Dang xu ly','2026'),
    @('SK-02','Kho tai lieu dung chung Hub','Hoan thanh','2026')
  )
New-MinimalXlsx -Path (Join-Path $cecm 'Checklist danh gia.xlsx') `
  -Headers @('Muc','Noi dung','Ket qua','Ghi chu') `
  -Rows @(
    @('1','Tai lieu quy trinh','Pass','DEMO'),
    @('2','Luu tru ban ghi','Fail','Can bo sung'),
    @('3','Dao tao nhan su','Pass','DEMO')
  )
New-MinimalXlsx -Path (Join-Path $cecm 'Danh muc van ban phap ly DEMO.xlsx') `
  -Headers @('Ma','Loai','Tieu de','Trang thai') `
  -Rows @(
    @('PL-01','Hop dong','Hop dong mau DEMO','Du thao'),
    @('PL-02','Van ban','Thong bao noi bo DEMO','Dang xu ly')
  )
New-MinimalXlsx -Path (Join-Path $cecm 'Danh muc ung dung DEMO.xlsx') `
  -Headers @('Ma','Ung dung','Owner (gia)','Moi truong') `
  -Rows @(
    @('UD-01','SharePoint EMI','tp.tonghop.demo','Prod'),
    @('UD-02','Power Automate EMI PAY','admin.demo','Prod')
  )

Write-Host 'Sample files ready under sample-files/'
