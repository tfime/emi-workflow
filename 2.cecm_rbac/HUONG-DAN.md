# EMI PAY – RBAC V1.3 (sửa lỗi kết nối PnP)

## Lý do cập nhật
Lệnh `New-PnPGroup -Connection $conn` đã chạy thành công trực tiếp trên CECM.
V1.3 dùng `Connect-PnPOnline -ForceAuthentication -ReturnConnection` và truyền `-Connection $conn` cho tất cả cmdlet liên quan, tránh dùng kết nối ngầm khác.

## Chạy trên PowerShell 7
Giải nén các file vào cùng thư mục.
```powershell
$ClientId = '<CLIENT_ID_CUA_EMI>'
Unblock-File .\rbac-cecm-v1.3.ps1
.\rbac-cecm-v1.3.ps1 -ClientId $ClientId -Mode Preview
.\rbac-cecm-v1.3.ps1 -ClientId $ClientId -Mode Groups
```
Nhóm `GR-PAY-SYSADM` đã tồn tại nên kết quả sẽ hiện `GROUP EXISTS`; sáu nhóm còn lại dự kiến được tạo.

**Không chạy Baseline** với gói này: mode Baseline được chủ động khóa để bảo vệ 23 Lists/Libraries cho đến khi có bản có audit/backup quyền và xác minh an toàn.
