# EMI PAY RBAC – kiểm chứng sau Apply V1.9 (V1.9.1)

V1.9 hiện có thể báo `Site ACL changed during the batch` sau khi đã `PASS APPLY` cho cả 15 Lists/Libraries vì SharePoint tự tạo `Guest/Limited Access` trên site cha. Đây là **một khả năng cần xác minh, không mặc nhiên kết luận**.

## Cách chạy

1. Giải nén, đặt ba tệp `EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1`, `EMI_PAY_RBAC_Full_V1.9.ps1`, `EMI_PAY_Inventory_23.csv` cùng thư mục. Script cũ chỉ được gọi bằng `-Mode Audit` (không ghi quyền).
2. Kết nối PnP tới `https://emicomvn.sharepoint.com/sites/cecm` như trước.
3. Nếu thư mục `EMI_PAY_RBAC_FULL_<timestamp>_<PID>` của lần Apply nằm cùng thư mục, chạy:

```powershell
Unblock-File .\EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1
.\EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1
```

Nếu không tự tìm được manifest, chỉ rõ thư mục Apply có `run-manifest.json`:

```powershell
.\EMI_PAY_RBAC_PostApply_Verify_V1.9.1.ps1 -ApplyRunDir 'F:\...\EMI_PAY_RBAC_FULL_yyyymmdd-hhmmss_PID'
```

## Kiểm tra thực hiện

- Gọi V1.9 `-Mode Audit`: kiểm tra chính xác ACL cấp List/Library của toàn bộ 23 đối tượng; lệnh Audit không thay đổi ACL SharePoint.
- So sánh `SiteAclSignature` được lưu trong manifest trước Apply với các RoleAssignments hiện tại của site. Nếu phần chênh lệch chỉ gồm vai trò `RoleTypeKind=Guest` *được thêm mới*, ghi nhận SharePoint tự phát sinh `Limited Access`; **không** dùng tên quyền tiếng Việt/tiếng Anh.
- Nếu xuất hiện loại quyền khác, hoặc quyền bị xóa, gắn cờ `NEEDS REVIEW` và ghi CSV để kiểm tra, **không tự sửa**.
- Gói này **không thực hiện Apply/ResetRoleInheritance/Rollback** và không sửa `run-manifest.json` của lần trước.

## Kết quả

`PASS: STATIC RBAC 23 / 23 Lists & Libraries + SITE ACL CHECK` chỉ có khi Audit 23/23 PASS và site ACL không có thay đổi bất thường. Nếu báo REVIEW, gửi file `site-acl-delta.csv` để phân tích.

RBAC tĩnh không thay thế RBAC động theo từng hồ sơ, kiểm thử user-level, và kiểm tra thao tác phê duyệt trong Power Automate.
