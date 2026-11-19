# EMI PAY – RBAC Audit V1.4.1 (sửa lỗi đọc RoleAssignments)

**Site đích duy nhất:** `https://emicomvn.sharepoint.com/sites/cecm`.

## Lỗi đã sửa

V1.4 dùng `@(Get-PnPProperty ... -Property RoleAssignments)` làm cho `RoleAssignmentCollection` bị xử lý như một đối tượng phân quyền (`RoleAssignment`) riêng lẻ, gây lỗi `Member is not a member of type RoleAssignmentCollection` tại dòng 42. V1.4.1 nạp tập hợp vào `$Securable.RoleAssignments` và duyệt từng `RoleAssignment`, sau đó lấy `Member` và `RoleDefinitionBindings` của đối tượng đó.

## Chạy lại (chỉ đọc)

Trong PowerShell 7.7+, giải nén đủ `schema.json` và `audit-rbac-cecm.ps1` cùng thư mục, rồi chạy:

```powershell
$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5'
Unblock-File .\audit-rbac-cecm.ps1
.\audit-rbac-cecm.ps1 -ClientId $ClientId
```

Kết quả: thư mục `RBAC_Audit_<timestamp>` chứa `00-SUMMARY.txt`, `01-list-inheritance.csv`, `02-site-permissions.csv`, `03-unique-list-permissions.csv` hoặc `.txt`, `04-emi-pay-groups.csv`.

## An toàn

- Script **chỉ đọc SharePoint**, không thêm/xóa nhóm, không ngắt kế thừa, không cấp/thu hồi quyền.
- Báo cáo tạo **cục bộ trên máy người chạy**. Đây là bản kiểm kê, không phải backup khôi phục tự động.
- Không chạy `-Mode Baseline` ở bộ RBAC V1.2.
- Nếu phát sinh lỗi tiếp theo, gửi toàn bộ thông báo và dòng lỗi PowerShell, không gửi access token hay secret.
