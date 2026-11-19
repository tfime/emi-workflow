#Requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Common.psm1') -Force
$dir = Join-Path (Get-DemoRoot) 'sample-files\projects'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$docs = @(
  @{ N = 'CDS-To trinh mo du an.docx'; T = 'Tờ trình mở dự án Cổng thông tin CĐS 2026. DỮ LIỆU DEMO.' },
  @{ N = 'CDS-Ke hoach tong the.docx'; T = 'Kế hoạch tổng thể dự án Cổng thông tin CĐS. DỮ LIỆU DEMO.' },
  @{ N = 'CDS-Bien ban nghiem thu.docx'; T = 'Biên bản nghiệm thu dự án Cổng thông tin CĐS. DỮ LIỆU DEMO.' },
  @{ N = 'ISO-Pham vi danh gia.docx'; T = 'Phạm vi đánh giá nội bộ ISO 2026. DỮ LIỆU DEMO.' },
  @{ N = 'ISO-Ke hoach danh gia.docx'; T = 'Kế hoạch đánh giá nội bộ ISO. DỮ LIỆU DEMO.' },
  @{ N = 'ISO-Bao cao ket thuc.docx'; T = 'Báo cáo kết thúc đánh giá ISO. DỮ LIỆU DEMO.' },
  @{ N = 'WIFI-Yeu cau dau tu.docx'; T = 'Yêu cầu đầu tư hạ tầng Wi-Fi 2026. DỮ LIỆU DEMO.' },
  @{ N = 'WIFI-Ke hoach trien khai.docx'; T = 'Kế hoạch triển khai Wi-Fi. DỮ LIỆU DEMO.' },
  @{ N = 'WIFI-Bien ban ban giao.docx'; T = 'Biên bản bàn giao hệ thống Wi-Fi. DỮ LIỆU DEMO.' }
)
foreach ($d in $docs) {
  New-MinimalDocx -Path (Join-Path $dir $d.N) -BodyText $d.T
  Write-Host "DOCX $($d.N)"
}

New-MinimalXlsx -Path (Join-Path $dir 'CDS-Bao cao tien do.xlsx') `
  -Headers @('Tuan','Hang muc','% HT','Ghi chu') `
  -Rows @(@('1','Thiet ke UI','40','DEMO'), @('2','Tich hop SP','20','DEMO'))
New-MinimalXlsx -Path (Join-Path $dir 'ISO-Checklist thuc hien.xlsx') `
  -Headers @('Muc','Noi dung','Ket qua') `
  -Rows @(@('1','Tai lieu','Pass'), @('2','Dao tao','Pending'))
New-MinimalXlsx -Path (Join-Path $dir 'WIFI-Danh muc thiet bi.xlsx') `
  -Headers @('Ma','Thiet bi','SL','Vi tri') `
  -Rows @(@('AP-01','Access Point','12','Tang 1'), @('SW-01','Switch PoE','2','P.Ky thuat'))

Write-Host "Project samples ready: $dir"
