# EMI PAY – RBAC nền tảng V1.2 (site CECM)

**Site:** https://emicomvn.sharepoint.com/sites/cecm  
**Đối tượng:** chỉ 19 Lists + 4 Document Libraries có mã `EMI_PAY_`. Không sửa `EMI_HOME_LAYOUT`, `EMI_PJ_Records_Pilot`, hay List/Library khác. 

## Ba chế độ

1. **Preview** (mặc định): kết nối PnP và kiểm tra 23 thành phần, nhóm sẵn có, kế thừa quyền. **Không thay đổi SharePoint**.
2. **Groups**: tạo 7 nhóm SharePoint `GR-PAY-*`, chưa thêm người, chưa cấp quyền lên Lists/Libraries.
3. **Baseline**: chỉ chạy sau khi rà soát Preview; tách kế thừa cấp List/Library của 23 đối tượng; cho Site Owners và `GR-PAY-SYSADM`, `GR-PAY-FLOW-SVC` Full Control; `GR-PAY-PROCADM` Contribute trên **8 danh mục cấu hình**; `GR-PAY-CHAIR` Read trên **12 List/Library dữ liệu hồ sơ**. Các nhóm bình thường `GR-PAY-TCKT` và `GR-PAY-USERS` chưa có quyền List chung. Script tự dừng nếu đã tồn tại quyền riêng trên bất kỳ List/Library EMI_PAY_ nào để không ghi đè cấu hình trước đó.

## Chạy trong PowerShell 7 đã có PnP 3.4.1

Từ thư mục giải nén, sử dụng ClientId App `EMI CECM - PnP PowerShell` mà anh đã tạo:

```powershell
$ClientId = "5c1a7c4d-3b40-4938-821d-12f44ee316e5"
.\rbac-cecm.ps1 -ClientId $ClientId -Mode Preview
# Sau khi kiểm tra:
.\rbac-cecm.ps1 -ClientId $ClientId -Mode Groups
# Chỉ sau khi xác nhận cấu hình site và tài khoản được giữ quyền:
.\rbac-cecm.ps1 -ClientId $ClientId -Mode Baseline
```

Script không yêu cầu Client Secret. Đăng nhập tương tác PnP như bước tạo cấu trúc.

**Phạm vi bảo mật sau Baseline:** các Lists lõi và thư viện đã tách thừa kế khỏi site. Site Owners vẫn có Full Control; nhóm Flow chưa có thành viên sẽ chưa có quyền thực tế. Khi dựng Power Automate, cần xác định tài khoản dịch vụ chuyên dụng và thêm vào nhóm này; không dùng tài khoản chung không kiểm soát.

## Chưa được triển khai ở RBAC V1.2

- **Quyền dữ liệu động theo hồ sơ/bước:** quyền người tạo trên `Requests`, file checklist, người trưởng/nhân sự được giao, TCKT, quyền riêng `ActivityInternal`, DocsInternal và file đã công khai.
- **Giao diện và lệnh:** quyền nhóm `GR-PAY-USERS` submit command với Power Automate xác thực, phản hồi trạng thái, không để chỉnh Master Record hoặc Activity trực tiếp.
- **Ủy quyền:** người được ủy quyền của Trưởng phòng phải được xác thực bằng cấu hình có thời hạn trước khi quyết định thay.
- **Quyền đọc CT-HĐQT:** Nhóm đã được cho phép Read trên các vùng hồ sơ (kể cả log nội bộ); chưa thêm thành viên thực.
- **Quyền về sau:** phân quyền theo RequestKey/StepInstanceKey khi workflow chạy, đồng thời thu hồi Edit và giữ Read khi bước kết thúc/hoàn tất.
- **Lưu trữ:** nơi lưu trữ mới phải áp dụng ACL ReadOnly đúng đối tượng sau chuyển file; chưa có flow di chuyển.

**Cảnh báo:** quyền unique per item có giới hạn và chi phí. Theo Microsoft, mức tối đa hỗ trợ 50.000 unique permissions mỗi list/library và Microsoft khuyến nghị ở mức tối đa khoảng 5.000. Khi tăng trưởng lớn phải nhóm quyền theo container hoặc phân vùng site/libraries thay vì phá kế thừa ở từng file vô hạn.

## Vì sao chưa bật quyền người dùng?

Hiện chưa có UPN thực tế của Trưởng phòng, CT-HĐQT, TCKT và tài khoản Flow; các danh mục `EMI_PAY_OrgUnits`, `EMI_PAY_OrgMembers` cũng chưa được cấu hình. Cấp quyền đọc/sửa chung quá sớm có thể làm lộ hồ sơ hoặc Activity nội bộ. Sau Baseline sẽ làm `RBAC V1.3`: cấu hình danh tính/nhóm thực + chuyển quyền động theo từng WorkItem.
