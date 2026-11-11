# EMI PAY – RBAC Wave 1 V1.7.1 – Hotfix

**Sửa lỗi so với V1.7**: Trong `Get-Assignments`, `Get-PnPProperty -Property RoleDefinitionBindings` trả về một `RoleDefinitionBindingCollection`. Script cũ bọc kết quả bằng `@(...)`, khiến tập hợp bị xử lý như một quyền đơn và gây lỗi `Id is not a member of RoleDefinitionBindingCollection`. Bản V1.7.1 duyệt từng `RoleDefinition` bằng `foreach`, lấy `Id`, `Name`, `RoleTypeKind` trên từng phần tử. Đồng thời tải rõ `Id`, `Title`, `PrincipalType` của principal.

## Phạm vi không thay đổi
- Site duy nhất: `https://emicomvn.sharepoint.com/sites/cecm`.
- 7 Lists Wave 1 (GUID cố định từ inventory); `EMI_PAY_PaymentTypes` vẫn nguyên trạng.
- 6 Lists theo ma trận Pilot; `EMI_PAY_SystemSettings` không cấp `GR-PAY-PROCADM`.
- Preview mặc định; `-Mode Apply` mới có thay đổi; snapshot JSON và rollback theo từng run; không sửa nhóm hay dữ liệu.

## Chạy trên máy đã kết nối PnP
Đặt `.ps1` và `.csv` cùng thư mục, mở PowerShell 7 và giữ kết nối PnP hiện hành.

```powershell
Unblock-File .\EMI_PAY_RBAC_Wave1_V1.7.1.ps1
.\EMI_PAY_RBAC_Wave1_V1.7.1.ps1
.\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Apply -Target EMI_PAY_OrgUnits
```

Nếu dòng Apply hiện `PASS: EMI_PAY_OrgUnits`, có thể làm toàn Wave 1:

```powershell
.\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Apply -AllWave1
```

**Nếu báo lỗi**: không chạy tiếp `-AllWave1`. Kiểm tra thư mục `EMI_PAY_RBAC_W1_yyyyMMdd-HHmmss` sinh trong terminal; gửi dòng lỗi và `run-manifest.json` (ẩn thông tin cá nhân nếu có). Với lỗi trước ở dòng 65, V1.7 chưa vào vòng Apply nên chưa thay đổi ACL.

## Hoàn tác (nếu có Apply thành công/thay đổi một phần)

```powershell
.\EMI_PAY_RBAC_Wave1_V1.7.1.ps1 -Mode Rollback -RunDir '.\EMI_PAY_RBAC_W1_yyyyMMdd-HHmmss'
```

Chỉ rollback sau khi kiểm tra snapshot và hiểu tác động: quay lại quyền kế thừa có thể mở rộng quyền truy cập.

**Giới hạn**: Script chưa được thực thi trên PnP session của tenant; chỉ kiểm tra tĩnh. Giữ bản snapshot khi chạy thật và kiểm chứng kết quả trên CECM.
