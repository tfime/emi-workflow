# EMI PAY – Khởi tạo cấu trúc SharePoint mới trên CECM

**Site đích:** https://emicomvn.sharepoint.com/sites/cecm

**Trạng thái thực tế:** Đã xác minh site và danh sách hiện có. Đã tạo bộ khai báo và script triển khai; công cụ SharePoint đang kết nối với ChatGPT **chưa cung cấp thao tác tạo Lists/Columns trực tiếp**, nên **chưa triển khai 19 Lists và 4 Document Libraries lên site**.

## Phạm vi tách biệt

Tất cả các đối tượng mới có tiền tố `EMI_PAY_`, không sử dụng hoặc sửa các thành phần hiện hữu như `EMI_HOME_LAYOUT`, `EMI_PJ_Records_Pilot`, `Shared Documents`. Không sử dụng site `eecm-demo`.

## Bộ tài liệu

- `schema.json`: Khai báo 19 Lists, 4 Document Libraries, tên/kiểu cột, choice, index.
- `provision-cecm.ps1`: Script PnP PowerShell tạo cấu trúc idempotent, có chế độ xem trước và kiểm tra site.
- `WORKFLOW-RBAC.md`: Mô hình quan hệ dữ liệu, quy trình, luồng Power Automate, ranh giới quyền.

## Chạy trên PowerShell 7+ khi có tài khoản/quyền phù hợp

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
./provision-cecm.ps1 -ClientId '<ENTRA_APP_CLIENT_ID>' -Preview
./provision-cecm.ps1 -ClientId '<ENTRA_APP_CLIENT_ID>'
```

Cần cấu hình ứng dụng Entra (ClientId) và quyền PnP phù hợp với SharePoint site. Script **không tạo app đăng nhập hoặc tự cấp quyền**, không lưu mật khẩu hoặc secret. Script không xóa/recreate danh sách đã có.

## Quan trọng trước khi nhập dữ liệu thật

Script **chỉ dựng schema**; không thiết lập RBAC, ACL, SPFx, Power Automate hay kiểm soát giao dịch đồng thời. SharePoint Lists/Libraries mới tạo có thể kế thừa quyền từ site. **Không đưa dữ liệu thanh toán thật lên các Lists/Libraries này trước khi hoàn thành bảo mật**.

## Phiên bản tiếng Việt (V1.1)

- Các **tên hiển thị Lists, Document Libraries và cột** đã đổi sang tiếng Việt trong `schema.json` (`displayName`).
- Các **mã kỹ thuật, tên nội bộ của cột và URL** vẫn giữ nguyên `EMI_PAY_` và dạng tiếng Anh, để tránh gãy tham chiếu Power Automate/SPFx.
- Các **giá trị Choice dùng làm mã trạng thái** (ví dụ `Draft`, `Returned`, `Completed`) hiện **giữ nguyên tiếng Anh**; giao diện SPFx sẽ ánh xạ sang nhãn tiếng Việt. Không tự đổi giá trị Choice khi chưa cập nhật các Flow.
- `TEN-HIEN-THI-VI.csv` liệt kê toàn bộ cặp tên kỹ thuật ↔ tên hiển thị.
- Script mới vừa tạo nếu chưa có, vừa cập nhật **tên hiển thị** nếu các đối tượng `EMI_PAY_` đã được tạo bởi bản cũ; không đổi URL và không xóa dữ liệu.
- Trên site có thể tồn tại các thành phần khác đã có; script chỉ tác động đến những đối tượng được khai báo bắt đầu bằng `EMI_PAY_`.
- Lưu file script và schema dưới dạng UTF-8 để bảo toàn dấu tiếng Việt.

Chạy **xem trước** từ thư mục đã giải nén:

```powershell
$ClientId = '5c1a7c4d-3b40-4938-821d-12f44ee316e5'
.\provision-cecm.ps1 -ClientId $ClientId -Preview
```

Sau khi xem đúng danh sách, tạo cấu trúc thật (chỉ khi đã sẵn sàng):

```powershell
.\provision-cecm.ps1 -ClientId $ClientId
```
