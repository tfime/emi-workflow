# Pilot RBAC V1.5 – Chỉ 1 List trên SharePoint CECM

Target: **Danh mục loại hồ sơ thanh toán** (`EMI_PAY_PaymentTypes`) – đã kiểm tra qua kết nối có **0 dòng dữ liệu**.

- `Preview`: chỉ đọc Site roles và in phương án, không sửa quyền.
- `Apply -ConfirmPilot`: ngắt kế thừa quyền trên đúng List mục tiêu, sao lưu quyền **site-level** vào CSV cục bộ, giữ lại `cecm Chủ sở hữu`, cấp `GR-PAY-SYSADM` và `GR-PAY-FLOW-SVC` quyền Full Control, cấp `GR-PAY-PROCADM` quyền Contribute, rồi gỡ các nhóm/người dùng không nằm trong whitelist trên List đó. Tự động rollback nếu phát hiện lỗi trong quá trình thực thi (nỗ lực tốt nhất).
- `Rollback -ConfirmPilot`: đưa List về **kế thừa quyền của site** (chỉ dùng nếu List chưa được cấu hình quyền thủ công sau bước pilot).

**Chú ý:** đây là kiểm thử *một List*, chưa triển khai RBAC cho 22 thành phần còn lại; không triển khai quyền từng hồ sơ, chưa kiểm thử bằng tài khoản nghiệp vụ. Không lưu dữ liệu thanh toán thật trước khi RBAC hoàn chỉnh.

## Lệnh

```powershell
$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5'
Unblock-File .\pilot-rbac-cecm.ps1
.\pilot-rbac-cecm.ps1 -ClientId $ClientId -Mode Preview
# Sau khi kiểm tra đúng nhóm quyền trên console:
.\pilot-rbac-cecm.ps1 -ClientId $ClientId -Mode Apply -ConfirmPilot
# Nếu cần phục hồi kế thừa quyền:
.\pilot-rbac-cecm.ps1 -ClientId $ClientId -Mode Rollback -ConfirmPilot
```

## Kiểm thử sau Apply

- Site Admin vẫn vào được danh mục.
- `GR-PAY-PROCADM` có quyền sửa danh mục **khi nhóm có người được gán**; kiểm thử bằng tài khoản riêng.
- Nhóm site Members/Visitors và `GR-PAY-USERS` **không** được truy cập List qua quyền kế thừa (trừ khi họ cũng thuộc nhóm đã được cấp phép hoặc có quyền cao hơn).
- Lập Audit V1.4.1 lại để xác minh: **1 List có unique permissions, 22 còn lại vẫn inherited**.

Không chạy `-Mode Baseline` trong RBAC V1.2 hoặc V1.3.
