# EMI PAY — Core V1 Starter Pack

**Cập nhật Core V1:** runtime **code-first PnP** tại `../9.EMI_PAY_Core_Orchestrator_V1` (không dựng Cloud Flow designer cho logic nghiệp vụ). Gói này giữ schema export + blueprint/UAT. RBAC tĩnh 23/23 đã PASS. Không tạo lại Lists/Libraries/nhóm quyền.

## Chúng ta đã chuẩn bị gì trong gói này?

- `01_Export_CECM_Schema.ps1`: Một lần chạy, **chỉ đọc** SharePoint, xuất danh sách tên cột kỹ thuật và kiểu dữ liệu của toàn bộ 23 Lists/Libraries qua GUID đã kiểm chứng. Không ghi dữ liệu, không sửa quyền.
- `02_Workflow_7_Steps_Logical.csv`: Danh sách 7 bước, quan hệ trước/sau và vai trò logic. Hai cột đơn vị/người phụ trách **để trống có chủ ý**, chưa có dữ liệu định danh chính thức.
- `03_Core_Flow_Blueprint.json`: Định nghĩa logic máy đọc được (KHÔNG phải Flow import JSON).
- `04_Core_UAT_TestCases.csv`: 14 kịch bản kiểm thử.
- `05_RBAC_23_Objects_Reference.csv`: Danh sách GUID và ma trận quyền đã PASS V1.9.1, chỉ tham chiếu.
- `06_Core_Flow_Designer_Runbook.md`: Bản thiết kế để xây dựng trên Power Automate new designer.

## Bước duy nhất anh cần chạy bây giờ

Mở **PowerShell 7** trong thư mục giải nén, kết nối PnP CECM (dùng Client ID của Entra App đã sử dụng thành công):

```powershell
Connect-PnPOnline -Url 'https://emicomvn.sharepoint.com/sites/cecm' `
  -ClientId '5c1a7c4d-3b40-4938-821d-12f44ee316e5' -Interactive

Unblock-File .\01_Export_CECM_Schema.ps1
.\01_Export_CECM_Schema.ps1
```

Nếu máy chặn execution policy thì chỉ khi **tin cậy script**, có thể dùng `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force` rồi chạy lại; không sửa execution policy toàn máy.

Chương trình tạo `EMI_PAY_CORE_SCHEMA_YYYYMMDD-HHMMSS.zip` tại thư mục gói. **Gửi đúng tệp ZIP đó** để đối chiếu các cột SharePoint thực tế trước khi nạp cấu hình.

## Sau một lần xuất schema

Bước tiếp theo là phát hành **một script Seed/Validate/Apply duy nhất** cho các Lists cấu hình, kết hợp bản hướng dẫn xây dựng Flow đã ánh xạ đúng cột. Không đoán tên trường (các Lists dùng tên hiển thị tiếng Việt và internal field names không trùng). Không nạp dữ liệu thử trước khi map được 100% cột bắt buộc.

## Ràng buộc kỹ thuật

- Đây **không phải** solution ZIP importable. Không thể xuất một flow thực sự có Connection References và trường SharePoint chính xác khi chưa có schema/environment.
- Gói này **không sửa tenant**. Đã tạo các tệp thiết kế và script chỉ đọc tại máy người dùng.
- Không đọc/tạo danh tính người thực từ các cột trống trong mẫu.
- Bảo mật: không mở rộng quyền của `Commands/Requests`, không thay RBAC đã PASS.
