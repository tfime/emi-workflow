# EMI PAY – Import candidate Solution V1.0.0.2

**Ngày:** 12/11/2026  
**Trạng thái:** Gói import **thử nghiệm**, dựng từ ZIP Unmanaged do EMI xuất từ chính Power Automate. **Chưa import, chưa save, chưa chạy trên tenant EMI**.  
**Bảo đảm:** Đã chạy kiểm tra tĩnh ZIP/XML/JSON, GUID, action references, connection references, biểu thức và mã Workflow. Kết quả kiểm tra tĩnh **không thay thế** import/Flow Checker/UAT trong Power Automate.

## 1. Đối chiếu với ZIP anh đã xuất

| Trường | ZIP gốc | Gói xây dựng |
|---|---|---|
| Solution unique name | `EMI_PAY_CORE_V1` | Giữ nguyên |
| Publisher | `tfime` | Giữ nguyên |
| Flow GUID | `1703d2f2-46de-f111-84ea-000d3aa191f1` | Giữ nguyên (update in place) |
| Version | `1.0.0.1` | `1.0.0.2` |
| Trigger | `EMI_PAY_Requests` | **`EMI_PAY_Commands`** |
| Teams UpdateSection | Có ở Flow mẫu | Bỏ khỏi Flow |
| SharePoint Connection Reference | `tfime_sharedsharepointonline_5e343` | Giữ nguyên |
| Flow State | Active trong mẫu | Đưa về Draft/Off trong XML; có thêm chốt chặn `PilotEnabled=false` |
| Phạm vi | 1 trigger, 1 action thử | CREATE_REQUEST, SUBMIT, DECIDE, CONFIRM_PAYMENT, WorkItems, Master, audit, catch |

## 2. An toàn trước khi import

**Không nhập dữ liệu thanh toán thật. Không bật Flow ngay sau import.**

- ZIP gốc của anh là bản backup. Gói mới sử dụng **cùng** `Solution UniqueName` và **cùng** `WorkflowId` để cập nhật Flow mẫu, không tạo một Flow thứ hai.
- Mặc định `C00_PilotEnabled = false`, `C00_AllowedActorUPN = __SET_TRUSTED_ADMIN_UPN__`; ngay cả khi import làm Flow bật, Main Flow sẽ kết thúc sớm, chưa đụng dữ liệu. Sau khi import, cần kiểm tra trạng thái Flow.
- Vẫn cần dùng đúng SharePoint connection có quyền trên site CECM. Tồn tại nhóm `GR-PAY-FLOW-SVC` không có nghĩa connection tự dùng danh tính nhóm.
- Không cấp người dùng thường quyền ghi `EMI_PAY_Commands`; phiên bản này **chỉ chạy thử theo danh tính admin có trong `C00_AllowedActorUPN`**, lấy từ SharePoint `Author/EMail`, **không** tin `ActorUPN` trong JSON payload.

## 3. Import một lượt

1. Vào **Power Automate > Solutions** đúng Environment đã xuất ZIP mẫu.
2. Giữ lại ZIP gốc `EMI_PAY_CORE_V1_1_0_0_1.zip` để có thể đối chiếu/khôi phục.
3. Chọn **Import solution**, chọn `EMI_PAY_CORE_V1_MainFlow_ImportCandidate_1_0_0_2.zip`.
4. Đây là cùng Solution (Unmanaged) bản mới, kiểm tra màn hình update/overwrite; nếu xuất hiện xung đột hoặc lỗi validation, **dừng và gửi nguyên văn lỗi**. Không xóa Solution cũ để khắc phục theo phỏng đoán.
5. Gán lại Connection Reference `tfime_sharedsharepointonline_5e343` đến kết nối SharePoint của tài khoản có quyền phù hợp.
6. Trong Solution, mở Flow `EMI_PAY_CORE_Orchestrator_V1`. Xác nhận trigger **When an item is created** đang trỏ đến `EMI_PAY_Commands` (GUID `e16b76dc-7686-43e9-b232-18c80e2b31d2`), và không còn action Teams.
7. Chạy **Flow Checker**, kiểm tra toàn bộ Action. Nếu có lỗi, **chưa bật Flow** và gửi lỗi để sửa định nghĩa gói.

## 4. Điều kiện cần hoàn tất trước khi chạy thử

**Các trường chưa có trong bản schema xuất 09:02 ngày 12/11/2026** (không tự động thêm trong Solution ZIP):

- `EMI_PAY_Requests.PaymentLECode` (Text)
- `EMI_PAY_Requests.WorkflowVersionNo` (Number)
- `EMI_PAY_Requests.PaymentDueAt` (DateTime)

Hãy chạy `01_Preflight_ReadOnly.ps1` để đối chiếu. Tạo ba cột chỉ sau khi chốt trên tenant. Không chạy lại Baseline, không tự sửa ACL.

**Dữ liệu cấu hình bắt buộc:**

- `WorkflowVersions`: `EMI_PAY_SPV`, phiên bản `1`, `Lifecycle=PUBLISHED` (bản seed cũ để `DRAFT`).
- `WorkflowSteps`: đủ 7 `StepKey`/`StepKind`/`StepOrder`; đúng phiên bản, `IsActive=true`.
- `StepRecipients`: 1 OU `IsDefault=true` cho mỗi bước có người xử lý; không gán OU giả cho bước `SYSTEM_ARCHIVE`.
- `OrgUnits` và `PaymentTypes`: giá trị OU/pháp nhân/loại thanh toán thật, đã được phê duyệt; không tự suy diễn từ sơ đồ.
- `ChecklistItems`: mẫu thử phải có ít nhất một checklist bắt buộc cho `SUBMIT/DECIDE PASS`; `UploadedCount >= MinFileCount`. Trong Core V1, việc tạo ChecklistItems/upload tệp thuộc phần tích hợp tài liệu sẽ làm tiếp.
- `CONFIRM_PAYMENT` phải có `DocumentIndex` với `RequestKey`, `DocumentKey`, `IsCurrent=true`, `FileUrl` không rỗng. Điều này chỉ kiểm chứng **chỉ mục**, không thay thế kiểm tra nội dung chứng từ hoặc ngân hàng.
- Cột `State`, `Status`, `StepKind`, `Decision`, `Lifecycle` phải có các giá trị Choice logic tương ứng trước khi nạp; script preflight chỉ đọc, không tự thêm lựa chọn.

## 5. Khi nào mới bật pilot

Chỉ sau khi preflight, Flow Checker, seed config và danh sách nhân sự thử nghiệm đã PASS:

1. Mở Flow ở designer, sửa 2 Compose đầu tiên:
   - `C00_AllowedActorUPN` = UPN/email chính xác tài khoản admin chạy thử.
   - `C00_PilotEnabled` = chuỗi `true` (không nhập biểu thức).
2. Save, kiểm tra Flow Checker lần nữa.
3. Turn On. Tạo một item **giả lập** mới trong `EMI_PAY_Commands` qua tài khoản admin đó với `State=NEW`, `CommandKey`, `DedupeKey`, `CommandType` và `PayloadJson` hợp lệ. Lưu ý cột `Title` là bắt buộc.
4. Xem **Run History** và đối chiếu `Requests/WorkItems/ActivityPublic/Commands`, không chỉ kiểm tra flow hiển thị Succeeded.
5. Nếu lỗi, **Turn Off**, xuất thông báo lỗi Run History; không xóa item hoặc tự chạy lại lệnh cũ.

### Định nghĩa lệnh

- `CREATE_REQUEST`: tạo đúng 1 Master Record, `Status=DRAFT`, `BPCM1_PREPARE`, `ReviewRound=1`, WorkItem mở.
- `SUBMIT`: BPCM1 gửi/gửi lại → BPCM2; tăng ReviewRound chỉ khi hồ sơ trước đó `RETURNED`.
- `DECIDE PASS`: BPCM2 → BPCM3 → TCKT_CHECK → CHAIR_APPROVE → TCKT_PAY. Khi CHAIR duyệt cần `paymentDueAt`.
- `DECIDE REJECT`: từ BPCM2/BPCM3/TCKT_CHECK/CHAIR_APPROVE về **BPCM1** kèm lý do, không clone Master.
- `CONFIRM_PAYMENT`: phải có UNC trong chỉ mục → `ARCHIVE_PENDING` (không chuyển `COMPLETED`).

## 6. Giới hạn chưa được xem là hoàn tất

- Không có Subflows: Dynamic Permission, Document/Checklist, Archive Manager, Notification Manager.
- Không có giao diện SPFx. Chưa có cổng gửi lệnh xác thực người dùng thông thường.
- Chưa đủ bảo đảm giao dịch nguyên tử trên nhiều SharePoint Lists: có `NEEDS_RECONCILIATION` nếu ghi dở; cần UAT các tình huống 412/429/5xx để xây dựng retry an toàn.
- Chưa nghiệm thu nghiệp vụ thực tế trên tenant, chỉ kiểm tra tĩnh package offline.
- Không tự chuyển tiền hoặc ký số, không đánh dấu hoàn tất trước khi Subflow lưu trữ báo thành công.

## 7. Các file trong gói bàn giao

- `EMI_PAY_CORE_V1_MainFlow_ImportCandidate_1_0_0_2.zip`: ZIP **Solution Unmanaged** để thử import (chỉ có 4 tài nguyên chuẩn Solution, **không** nhét tài liệu vào trong).
- `01_Preflight_ReadOnly.ps1`: rà soát schema/Choice/quyền và dữ liệu cấu hình, **không ghi** SharePoint.
- `02_Check_Solution_Package.py`: kiểm tra lại file zip định dạng Solution (offline).
- `03_Reference`: JSON workflow & tài liệu kế hoạch đã chốt (tham chiếu, không import).

**Khuyến nghị:** Thử import trong môi trường phát triển/sandbox nếu có. Chưa đưa vào production hoặc dữ liệu thật trước khi nghiệm thu import, quyền, cấu hình và UAT đầu-cuối.
