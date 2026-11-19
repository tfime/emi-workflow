# EMI PAY – Core Main Flow V1 | Implementation Kit

**Ngày:** 12/11/2026 · **Đối tượng:** `https://emicomvn.sharepoint.com/sites/cecm`

## Trạng thái bàn giao – đọc trước

| Hạng mục | Trạng thái trong gói này |
|---|---|
| 23 GUID & mapping các cột theo ZIP schema 12/11/2026 | Đã đối chiếu offline |
| Bộ quy tắc 7 giai đoạn, trả về BPCM1 | Đã mã hóa vào JSON và mô hình test |
| Mô hình state machine & 18 assertions | **PASS offline** (không truy cập tenant) |
| Script PnP kiểm tra/nạp cấu hình | Đã soạn, **chưa chạy tenant**; mặc định Validate, chưa thực hiện ghi |
| Bản đồ 21 actions và hướng dẫn designer | Đã soạn theo GUID; **cần thực hiện trong Power Automate** |
| Solution `EMI_PAY_CORE_V1` và Cloud Flow `EMI_PAY_CORE_Orchestrator_V1` | **CHƯA được tạo trên tenant** |
| RBAC tĩnh 23/23 | Đã PASS từ biên bản người dùng; script này **không** sửa ACL |
| Dynamic Permission, Archive, Notification | Chưa xây dựng (đúng kế hoạch) |

> **Không có flow ZIP giả.** Bộ này KHÔNG phải package import Power Automate. Power Automate không cho sửa trực tiếp Code view của action trong new designer; phải dựng các cards hoặc dùng luồng ALM thực sự được export từ tenant rồi mới có thể đóng gói Solution. [Microsoft: new designer code view](https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/use-peekcode-addnotes).

## Tập trung 3 thao tác lớn, không chia nhỏ task

### A. Chuẩn bị dữ liệu trong một lượt

Chỉ cần điền chính xác ba file một lần, theo danh mục/phân công của EMI:

- `config/routing.template.csv`: 6 bước có người nhận + mã OU/UPN thực, không tạo OU giả từ tên lane BPMN.
- `config/paymenttypes.template.csv`: loại hồ sơ thực tế; WorkflowCode dùng mã đã thống nhất (file mẫu đề xuất `EMI_PAY_SPV`, có thể thay đổi trước Apply).
- `config/checklist.template.csv`: tài liệu bắt buộc theo loại hồ sơ và version; không tự tạo tên chứng từ chưa được phê duyệt.

`config/workflow.json` đã chứa các key 7 giai đoạn, các nhánh pass/reject, enum status đề xuất. Kiểm tra mã `EMI_PAY_SPV` trước khi Apply vì đây là mã cấu hình mới **đề xuất**.

### B. Kiểm tra và nạp dữ liệu một lượt qua PowerShell 7

Kết nối PnP tới CECM bằng Entra App đang sử dụng. Đặt PowerShell tại thư mục gốc của gói (nơi có `config/` và `provision/`):

```powershell
Connect-PnPOnline -Url 'https://emicomvn.sharepoint.com/sites/cecm' -ClientId '<CLIENT_ID_CECM_DANG_DUNG>' -Interactive
Unblock-File .\provision\01_Validate_And_Seed_CECM.ps1
.\provision\01_Validate_And_Seed_CECM.ps1 -Mode Validate
```

Validate **không ghi** vào tenant. Nó kiểm tra GUID, ACL unique, ba cột đề xuất, và Choice values thực tế (schema ZIP hiện không chứa option Choice).

Khi đã kiểm tra báo cáo Preview, đồng ý bổ sung các trường/Choice nếu còn thiếu và điền CSV thực tế:

```powershell
.\provision\01_Validate_And_Seed_CECM.ps1 -Mode Apply -ApproveSchemaExtension -ApproveChoiceExtensions
```

Apply có hai cờ chấp thuận tường minh để **bổ sung có kiểm soát** (không xóa Choice cũ):

- 3 trường Master `PaymentLECode` (Text), `WorkflowVersionNo` (Number), `PaymentDueAt` (DateTime) nếu còn thiếu.
- Choice: WorkflowVersions.Lifecycle; WorkflowSteps.StepKind; Commands.State; Requests.Status; WorkItems.State/Decision.

Sau kiểm tra dữ liệu seed, quản trị viên chuyển `WorkflowVersions.Lifecycle` của `EMI_PAY_SPV|1` từ `DRAFT` sang `PUBLISHED` qua giao diện hoặc lệnh PnP có kiểm soát. Không publish tự động khi định tuyến còn thiếu.

**Lưu ý:** Chạy Apply cần có quyền thật, có thể tạo dữ liệu/cột mới và thay đổi danh sách Choice. Không chạy nếu chưa kiểm tra bản Preview. Gói không xóa/ghi đè bản ghi cũ; nếu tồn tại cấu hình khác, script báo `DRIFT` rồi dừng. Lệnh này chưa được thử trong tenant — lưu snapshot trước khi áp dụng.

### C. Dựng một Flow và kiểm thử end-to-end

Mở `flow/01_Designer_Runbook.md`, lắp **một** Solution-aware Automated Cloud Flow trong **new designer**, gồm 8 khối và 21 hành động tham chiếu (`flow/02_Action_Map.csv`). Đầu ra một workflow hoạt động trên Commands→Requests→WorkItems→Activity.

Chạy `python tests/core_model.py` để kiểm tra logic mô hình offline trước khi vào tenant. Thử trên tenant theo `tests/UAT_Core_V1.csv`. **Lệnh đầu tiên nên chạy bằng admin và dữ liệu giả; không bật cho người dùng thật.**

## Nội dung từng tệp

| Path | Mục đích |
|---|---|
| `config/workflow.json` | 7 bước và quyết định chuyển trạng thái |
| `config/routing.template.csv` | Mẫu ánh xạ OU thực tế, chưa được điền |
| `config/paymenttypes.template.csv` | Mẫu loại hồ sơ thanh toán, chưa được điền |
| `config/checklist.template.csv` | Mẫu checklist được phê duyệt, chưa được điền |
| `config/command_examples.json` | Payload ví dụ cho môi trường pilot |
| `provision/01_Validate_And_Seed_CECM.ps1` | Kiểm tra/nạp cấu hình bằng GUID, không tạo lại List |
| `flow/01_Designer_Runbook.md` | Các action thực tế trong new designer, kiểm soát trạng thái/lỗi |
| `flow/02_Action_Map.csv` | 21 actions theo 8 khối, GUID tương ứng |
| `flow/03_Command_Envelope_Schema.json` | Hợp đồng lệnh cho Commands |
| `flow/04_Core_Transitions.json` | Quy tắc chuyển bước machine-readable |
| `flow/05_SharePoint_HTTP_Recipes.json` | Mẫu HTTP request vào đúng GUID Lists |
| `tests/core_model.py` | Mô hình trạng thái offline để kiểm tra logic |
| `tests/offline_test_results.txt` | Biên bản PASS 18 kiểm tra **offline** |
| `tests/UAT_Core_V1.csv` | Kịch bản kiểm thử trên tenant |
| `reference/CECM_23_object_ids.json` | Mapping GUID lấy từ schema ZIP thực tế |
| `reference/CECM_Business_Fields.csv` | Danh sách field nghiệp vụ (bỏ field hệ thống/ẩn) |

## Giới hạn cần nói rõ

1. Không có công cụ ghi Power Automate trong kết nối hiện tại, nên em không thể tuyên bố đã triển khai Cloud Flow; người có quyền Maker cần dựng Flow hoặc chuyển sang Work có browser và quyền phù hợp.
2. Không thể suy ra Choice options, routing theo OU, danh sách nhân sự hay PaymentType thật từ file ZIP. Script phải đọc trực tiếp khi chạy và không tự bịa.
3. Giai đoạn Core chưa có Dynamic Permission/verified caller gateway. Những người dùng thông thường chưa được phép gửi lệnh trực tiếp từ SPFx; Pilot chỉ kiểm thử với tài khoản quyền quản trị thực tế.
4. Không có giao dịch nguyên tử SharePoint xuyên nhiều Lists. Khi chạy lỗi dở phải đối soát trước retry; tính `idempotent` hoàn toàn cần kiểm thử thực tế trên tenant và các ràng buộc unique.
5. Đầu ra Core đợt đầu: `ARCHIVE_PENDING`, **không** `COMPLETED`.
