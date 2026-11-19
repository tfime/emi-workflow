# EMI PAY / CECM — RBAC tổng thể V1.9

**Phạm vi:** `https://emicomvn.sharepoint.com/sites/cecm`, đúng **19 Lists + 4 Document Libraries** đã triển khai. Không tạo lại đối tượng nào.

**Mục đích:** Thay vì chạy Wave 2 rồi Wave 3 riêng, chạy **một lệnh Apply duy nhất**: kiểm tra trước toàn bộ 23 đối tượng; giữ nguyên Pilot V1.5 và Wave 1 V1.7.1 (8 đối tượng); chỉ cấu hình 15 đối tượng còn lại nếu đang kế thừa và trống; kiểm chứng từng đối tượng sau sửa, cuối cùng xuất **một báo cáo ACL tổng hợp 23/23**.

## Cách thực hiện — chỉ một lần

Mở **PowerShell 7.2+** tại thư mục giải nén, dùng cách `Connect-PnPOnline` với Entra App hiện có để kết nối site CECM như ở các lần chạy trước, sau đó:

```powershell
Unblock-File .\EMI_PAY_RBAC_Full_V1.9.ps1
.\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Apply
```

Lệnh Apply tự bao gồm **preflight + snapshot + apply + verify + final audit**. **Không bắt buộc chạy Preview/Audit riêng.** Nếu cuối log hiển thị `PASS: STATIC RBAC 23 / 23 Lists & Libraries`, tìm file `final-audit-23-objects.csv` trong thư mục `EMI_PAY_RBAC_FULL_<timestamp>_<PID>`.

Tuỳ chọn nếu chỉ muốn xem trước / kiểm tra lại (không thay đổi quyền):

```powershell
.\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Preview
.\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Audit
```

## Chính sách ACL cấp List/Library

- **Pilot** `EMI_PAY_PaymentTypes`: giữ nguyên Owners + SYSADM + FLOW-SVC = Full Control; PROCADM = Contribute.
- **6 Lists cấu hình Wave 1:** giữ nguyên chính sách Pilot; không chạm vào ACL đã cấu hình.
- **SystemSettings:** Owners + SYSADM + FLOW-SVC = Full Control; PROCADM không có quyền trực tiếp.
- **9 Lists điều phối nghiệp vụ:** Owners + SYSADM + FLOW-SVC = Full Control; không cấp quyền trực tiếp toàn List cho USERS/TCKT/CHAIR.
- **ActivityInternal:** giống các Lists điều phối, thêm `GR-PAY-AUDIT = Read`.
- **Master `EMI_PAY_Requests` và 4 Libraries:** Owners + SYSADM + FLOW-SVC = Full Control; không cấp quyền truy cập toàn bộ hồ sơ cho nhóm chức năng.

File `EMI_PAY_RBAC_Policy_23.csv` hiển thị đủ **23 đối tượng x 7 nhóm**, phục vụ đối chiếu. Các mức quyền được nhận diện bằng ID và `RoleTypeKind` từ site, không phụ thuộc tiếng Việt/tiếng Anh.

**Quan trọng:** `GR-PAY-CHAIR`, `GR-PAY-TCKT`, `GR-PAY-USERS` không được cấp quyền rộng tại gốc List/Library bởi như vậy có thể xem được **mọi hồ sơ, mọi pháp nhân**. Nhóm vẫn tồn tại và sẽ tham gia qua cơ chế ACL hồ sơ/tài liệu hoặc backend chạy dưới service identity đúng thẩm quyền. Không dùng lọc SPFx làm biện pháp bảo mật dữ liệu.

## Phạm vi kiểm tra / kiểm soát lỗi

- Script kiểm tra site URL, đủ 7 SharePoint groups, GUID, tên hiển thị, template, quyền Pilot, 8 thành phần cũ và toàn bộ 23 thành phần trước khi thay đổi.
- Bản sao lưu quyền của **cả 23** nằm trong `before-<InternalName>.json`. Có thêm `preflight-23-objects.csv`, `after-<InternalName>.json`, `run-manifest.json` và `final-audit-23-objects.csv`.
- Với 15 đối tượng chưa làm: nếu đã có quyền riêng **khác** chính sách, script **dừng**, không ghi đè. Nếu đã đúng thì bỏ qua. Nếu còn kế thừa nhưng chứa item/tài liệu thì dừng để bảo vệ dữ liệu.
- Nếu lỗi xảy ra giữa chừng, **không tự rollback** vì reset kế thừa có thể mở lại quyền theo site. Manifest đánh dấu `Touched` trước khi sửa để có thể rollback có kiểm soát.
- Để rollback **chỉ các đối tượng đã bị script V1.9 chạm tới** (kiểm tra kỹ dữ liệu trước), dùng:

```powershell
.\EMI_PAY_RBAC_Full_V1.9.ps1 -Mode Rollback -RunDir 'F:\...\EMI_PAY_RBAC_FULL_yyyymmdd-hhmmss_PID'
```

- Rollback chỉ dùng được khi trước đó đối tượng đang kế thừa, không có dữ liệu, hiện vẫn không có dữ liệu và site ACL không thay đổi. Không đảo ngược ACL Pilot/Wave1.

## Phạm vi chưa được giải quyết bằng RBAC tĩnh

**PASS 23/23 chỉ có nghĩa là khớp ma trận ACL cấp List/Library, KHÔNG có nghĩa EMI PAY đã chạy workflow được.** Những phần sau là nhiệm vụ riêng khi làm Power Automate / SPFx:

1. **Phân quyền động theo từng Master Record và hồ sơ tài liệu** (`LE`, `OU`, `PJ`, người lập, bộ phận được giao, người duyệt, trạng thái). Những nhóm không được cấp toàn List phải nhận quyền tối thiểu ở item/folder thích hợp hoặc truy cập qua API/Flow ủy quyền kiểm soát đầy đủ.
2. **Bảo vệ lệnh** trên `EMI_PAY_Commands`: danh tính người gửi, hồ sơ, bước và vai trò hợp lệ phải được kiểm tra ở phía máy chủ trước khi Flow chạy. Với ACL mặc định V1.9, người dùng cuối **chưa thể ghi trực tiếp** vào List này; cần thiết kế secure command ingress, không tự động cấp Contribute rộng.
3. **Thực thi workflow**: một Master Record duy nhất; chuyển bước; trả lại **bước ngay trước**, kiểm tra trạng thái và lưu dấu vết. Người được SharePoint cho phép xem một item không đồng nghĩa được phê duyệt bước đó.
4. **Kiểm thử quyền hiệu lực theo tài khoản**: nhóm đã tạo nhưng chưa có đầy đủ người thử nghiệm. ACL audit đọc được role assignments; không chứng minh được khả năng truy cập thực của các user chưa được thêm vào nhóm.
5. **Quản lý scope**: ưu tiên thư mục hồ sơ thay vì gán ACL riêng từng file; tránh quá nhiều unique scopes (Microsoft khuyến nghị dưới 5.000 / Library khi khả thi).

## Trạng thái kiểm thử của gói

Gói được kiểm tra cấu trúc và đối chiếu offline với 23 GUID của inventory. **Chưa được chạy trên tenant CECM bằng PowerShell thật**; môi trường tạo gói không có PnP PowerShell kết nối tenant. Chỉ thông báo đạt khi script của anh trả về dòng PASS cuối.
