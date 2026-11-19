# EMI PAY — RBAC Verification and staged rollout V1.6

Site: `https://emicomvn.sharepoint.com/sites/cecm`  
Scope: 19 SharePoint Lists + 4 Document Libraries (prefix `EMI_PAY_`).  
Pilot: `EMI_PAY_PaymentTypes` — `60bb23f6-4702-4aed-b36f-b2b20b09e74d`.

## Nội dung bàn giao

- `EMI_PAY_RBAC_VerifyPilot_V1.6.ps1`: audit **chỉ đọc**, không thay đổi quyền hoặc dữ liệu SharePoint. Kiểm tra `HasUniqueRoleAssignments`, toàn bộ direct role assignments trên Pilot, đối chiếu ma trận dự kiến, sự tồn tại/thành viên của 7 nhóm, quyền hiệu lực (nếu cung cấp tài khoản thử) và trạng thái kế thừa của 23 đối tượng. Xuất CSV + JSON.
- `EMI_PAY_RBAC_Inventory_23_V1.6.csv`: danh sách 23 thành phần, GUID xác minh trực tiếp trên SharePoint, tên hiển thị, nhóm triển khai Wave 0–3.
- `EMI_PAY_RBAC_Inventory_23_V1.6.json`: cùng thông tin dạng JSON.

## Bước 1 — Kiểm chứng pilot

1. Mở PowerShell 7 tại thư mục giải nén và kết nối PnP tới site CECM bằng Entra App đã cấu hình thành công trước đó. Không chạy Baseline V1.2.
2. Chạy `./EMI_PAY_RBAC_VerifyPilot_V1.6.ps1`.
3. Muốn đo quyền hiệu lực theo người dùng, chạy `./EMI_PAY_RBAC_VerifyPilot_V1.6.ps1 -TestUserUpns 'UPN-Thuc-Te-1','UPN-Thuc-Te-2'` (thay bằng tên đăng nhập thật; không dùng chuỗi giả).
4. Kiểm tra các báo cáo trong `EMI_PAY_RBAC_Reports`: `-PilotAssignments.csv`, `-PilotExpectations.csv`, `-GroupMembership.csv`, `-EffectiveUsers.csv`, `-Inventory.csv`, `-Snapshot.json`.
5. Kiểm thử trong trình duyệt bằng các tài khoản **không chồng nhóm quyền**: SYSADM, PROCADM và ít nhất một tài khoản chỉ thuộc USERS/AUDIT hoặc TCKT. Dùng cả URL trực tiếp của danh mục.

## Bước 2 — Khống chế phạm vi triển khai

Chưa áp dụng tự động cho 22 thành phần khi chưa duyệt quyền dự kiến (principal, permission level, scope list/library/item/folder, đường đọc/ghi của UI và Flow). Trên CECM, quyền dữ liệu trực tiếp và quyền phê duyệt quy trình phải tách biệt.

Các batch trong Inventory là **lịch triển khai đề xuất**, không phải quyền đã được áp dụng:

- Wave 0: danh mục loại hồ sơ thanh toán — đã pilot.
- Wave 1 (7 Lists): các danh mục/cấu hình còn lại.
- Wave 2 (10 Lists): dữ liệu công việc, điều phối, nhật ký, thông báo.
- Wave 3 (1 List + 4 Libraries): master hồ sơ và tài liệu nghiệp vụ nhạy cảm.

Mỗi list/library cần chu trình: `Snapshot trước` → `Preview quyền kỳ vọng` → `Apply một thành phần` → `Audit` → `UAT tài khoản thật` → `Chốt` → chuyển thành phần tiếp theo.

## Bước 3 — Nguyên tắc áp dụng và rollback

- Giữ `cecm Chủ sở hữu` và quyền quản trị dự phòng phù hợp trước khi loại bất kỳ role assignment kế thừa nào. Không tự xoá toàn bộ role assignments.
- Khi break list permission phải xác định rõ `CopyRoleAssignments` và không dùng `ClearSubScopes` trong pilot/triển khai này; không để thao tác vô tình phá quyền con.
- Lưu JSON/CSV quyền trước và sau thay đổi, đánh dấu List GUID, role name/ID, principal ID, số item và cờ unique.
- Với **một List trước đó đang kế thừa quyền từ site**, nếu cần rollback về mô hình quyền ban đầu và đánh giá thấy việc kế thừa lại là an toàn, `Set-PnPList -Identity ([guid]'GUID-CUA-LIST') -ResetRoleInheritance` đưa list trở về kế thừa quyền site. Lệnh này **không** phải cách khôi phục ma trận quyền riêng của Pilot (vốn đã `HasUniqueRoleAssignments=True`). KHÔNG chạy cho Pilot hoặc master hồ sơ có dữ liệu thật mà không đánh giá rò rỉ quyền.
- Nếu List đã có unique permissions trước thay đổi, phải khôi phục cụ thể principal/role assignments từ snapshot; không dùng reset inheritance để thay thế.
- Lưu ý các unique permissions tại item/folder cần kiểm chứng riêng; rollback list level không tự bảo đảm khôi phục toàn bộ quyền con.

## Lưu ý kỹ thuật

1. `Contribute` mặc định cho phép **xóa item/document**. Nếu không muốn xóa, cần có permission level tùy chỉnh và kiểm tra quyền cộng dồn trước khi cấp đại trà.
2. `GR-PAY-FLOW-SVC` có Full Control trong Pilot không tự bảo đảm Power Automate thực thi với quyền nhóm đó; phải xác nhận tài khoản/kết nối SharePoint mà Flow thực sự sử dụng.
3. Quyền `Limited Access` có thể được SharePoint cấp tự động để người dùng truy cập item/folder được chia sẻ mà không cấp quyền nội dung rộng hơn.
4. Không tự cho `GR-PAY-USERS` quyền `Read` toàn bộ `EMI_PAY_Requests` hoặc các Document Libraries khi hồ sơ còn cần phân quyền theo từng hồ sơ/pháp nhân.
5. Nếu sau này triển khai unique permission mỗi hồ sơ, giới hạn khuyến nghị chung của Microsoft là <5.000 unique scopes trên mỗi list/library (giới hạn hỗ trợ 50.000). Cần theo dõi quy mô.

## Nguồn kỹ thuật

- PnP list permissions: https://pnp.github.io/powershell/cmdlets/Set-PnPListPermission.html
- PnP list inheritance: https://pnp.github.io/powershell/cmdlets/Set-PnPList.html
- SharePoint permission levels: https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels
- CSOM effective permissions: https://learn.microsoft.com/en-us/dotnet/api/microsoft.sharepoint.client.list.getusereffectivepermissions
- SharePoint unique scopes: https://learn.microsoft.com/en-us/sharepoint/dev/apis/migration-perm-guidance
