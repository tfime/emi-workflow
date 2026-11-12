# EMI PAY – Lắp Main Flow Core V1 bằng Power Automate new designer

**Tình trạng:** Bản triển khai có mapping theo schema CECM thật + biểu thức và logic chi tiết. Chưa phải Power Automate Solution ZIP có thể import; chưa tạo/kiểm thử cloud flow trong tenant. Mục tiêu là lắp **một** flow `EMI_PAY_CORE_Orchestrator_V1` trong Solution `EMI_PAY_CORE_V1` sau khi cấu hình PnP hợp lệ.

## 0. Phạm vi và an toàn

- Sử dụng site `https://emicomvn.sharepoint.com/sites/cecm`, các List có GUID trong `reference/CECM_23_object_ids.json`.
- Dùng SharePoint Standard connector; connection vận hành phải là tài khoản **thực sự có Full Control** hoặc quyền tương ứng trên những Lists. Việc có group `GR-PAY-FLOW-SVC` không tự tạo identity chạy Flow.
- Chỉ bật chế độ **PILOT_ADMIN_ONLY** bằng tài khoản quản trị đã có quyền. Không cho nhân viên ghi thẳng `EMI_PAY_Commands`. `PayloadJson.ActorUPN`, `ActorRole`, `uncVerified` **không được coi là bằng chứng**.
- Không dùng flow dài chờ phê duyệt; cứ mỗi item mới trên Commands là một run ngắn.
- Không được tự chuyển hồ sơ sang `COMPLETED`; Main V1 chỉ đến `ARCHIVE_PENDING`.
- **Bắt buộc tạo dữ liệu routing, type, choice chính xác trước khi bật Flow**; không dùng OU giả trong danh mục thật.
- Cấu hình `Concurrency control` trigger = On, `Degree of parallelism` = `1` cho pilot; `Split on` theo mặc định nếu cần và phải kiểm tra lưu lượng thật khi nâng cấp.

## 1. Tạo một Solution và Flow

1. Mở `make.powerautomate.com`, chọn đúng Environment; `Solutions` → `New solution`: display name `EMI PAY Core V1`, unique name `EMI_PAY_CORE_V1` (publisher hiện có theo chuẩn tổ chức).
2. Trong Solution → `New` → `Automation` → `Cloud flow` → `Automated`, tên `EMI_PAY_CORE_Orchestrator_V1`.
3. Trigger SharePoint **When an item is created** (`GetOnNewItems`): Site CECM; List nhập GUID `e16b76dc-7686-43e9-b232-18c80e2b31d2` qua **Enter custom value** nếu danh sách hiển thị tiếng Việt gây lỗi.
4. Sử dụng SharePoint connection reference của Solution. Ban đầu để Flow **Off** trong lúc lắp actions.

### Ký pháp đầu vào

- `cmd`: item của `EMI_PAY_Commands`; `CommandKey`, `DedupeKey`, `CommandType`, `RequestKey`, `StepInstanceKey`, `PayloadJson`, `State`, `ErrorMessage`.
- `payload`: `json(coalesce(triggerBody()?['PayloadJson'],'{}'))` (Compose `C02_Payload`). Nếu payload JSON không hợp lệ, xử lý qua Catch.
- `request`: bản ghi Master tìm từ `EMI_PAY_Requests` bằng `RequestKey`, **không** dùng tên hiển thị.
- Những trường status là **Choice**; cách đọc qua trigger có thể là string hoặc `['Value']`. Xác nhận trong một run `Code view`/Run history trước khi dùng biểu thức cứng.

## 2. Hành động kết nối SharePoint theo GUID

Để tránh phụ thuộc tên tiếng Việt, các bước CRUD chính ưu tiên SharePoint **Send an HTTP request to SharePoint** (`HttpRequest`). Thao tác GET:

| Thao tác | Method | Uri relative to site | Ghi chú |
|---|---|---|---|
| Tìm hồ sơ | GET | `_api/web/lists(guid'12b3051d-7642-4f90-a39d-5364df561fbf')/items?$filter=RequestKey eq 'PAY-...'&$top=2` | `RequestKey` phải từ key hệ thống, escape dấu `'` theo OData |
| Tìm lệnh trùng | GET | `_api/web/lists(guid'e16b76dc-7686-43e9-b232-18c80e2b31d2')/items?$filter=DedupeKey eq '...'&$top=3` | Nếu lệnh khác đã `SUCCEEDED`, no-op |
| Tìm công việc | GET | `_api/web/lists(guid'e21ef6e7-ee31-466a-be3b-65ae30ca7722')/items?$filter=StepInstanceKey eq '...'&$top=2` | Không tạo trùng |
| Tìm tuyến nhận | GET | `_api/web/lists(guid'7ebac733-193d-4216-bf63-785c6a5f06a2')/items?$filter=StepKey eq '...' and WorkflowCode eq 'EMI_PAY_SPV' and VersionNo eq 1` | Phải có đúng một `IsDefault=true` |
| Tìm phiên bản | GET | `_api/web/lists(guid'b263446d-7cea-4fd8-bfde-b22dd2de4281')/items?...` | `Lifecycle=PUBLISHED`, không dùng DRAFT cho hoạt động thật |
| Đối chiếu UNC | GET | `_api/web/lists(guid'a45c74cd-1f21-454c-9fcc-6812692b801b')/items?$filter=RequestKey eq '...' and DocumentKey eq '...'&$top=2` | Bắt buộc bản ghi có `FileUrl`, `IsCurrent=true`; không tin cờ `uncVerified` tự khai |

Header GET: `Accept: application/json;odata=nometadata`. Kết quả item: `body('Tên_Action_GET')?['value']`; `length(...)` phải là 0 hoặc 1 theo yêu cầu. Không dùng `Get item` cho Master nếu đầu vào là `RequestKey` dạng text — phải `Get items` có filter hoặc REST GET trước.

POST CREATE item: `_api/web/lists(guid'<LIST_GUID>')/items` với `Content-Type: application/json;odata=nometadata`, body là object có đúng **InternalName**. Sau khi tạo, lấy `Id` trả về để đối chiếu.

PATCH/MERGE cập nhật item: POST `_api/web/lists(guid'<LIST_GUID>')/items(<ID>)` với headers `IF-MATCH: <etag từ GET>`, `X-HTTP-Method: MERGE`, `Content-Type: application/json;odata=nometadata`. **Không dùng `IF-MATCH:*` cho cập nhật Master** vì có thể ghi đè người khác; xử lý `412 Precondition Failed` như xung đột, kiểm tra lại hồ sơ rồi từ chối/retry.

### Các biểu thức mẫu (dùng tab Expression)

```text
json(coalesce(triggerBody()?['PayloadJson'],'{}'))
length(body('HTTP_Find_Master')?['value'])
first(body('HTTP_Find_Master')?['value'])?['CurrentStepKey']
first(body('HTTP_Find_Master')?['value'])?['CurrentStepInstanceKey']
first(body('HTTP_Find_Master')?['value'])?['ReviewRound']
concat('PAY-', triggerBody()?['CommandKey'])
concat(triggerBody()?['RequestKey'],'|',variables('NextStepKey'),'|',triggerBody()?['CommandKey'])
concat(triggerBody()?['CommandKey'],'|',variables('EventType'))
add(int(first(body('HTTP_Find_Master')?['value'])?['ReviewRound']),1)
```

Tất cả các action name trong expression phải khớp **tên thực tế** trên canvas. `Run after` chỉ gọi các bước khi action trước thành công, trừ nhánh Catch.

## 3. Tám khối (8 Scopes trong cùng một Flow)

### S01 — `S01_Receive` / Trigger

- Trigger `Commands.When item is created`.
- Compose `C01_CommandKey = triggerBody()?['CommandKey']`, `C02_Payload = json(...)`, `C03_CommandType = triggerBody()?['CommandType']`.
- Kiểm tra CommandKey, DedupeKey, CommandType khác rỗng, là 1 trong 4 lệnh `CREATE_REQUEST`,`SUBMIT`,`DECIDE`,`CONFIRM_PAYMENT`; trường `State` phải NEW.

### S02 — `S02_Dedupe` / Claim

- GET lại Commands theo `DedupeKey`. Nếu trùng lệnh khác đã SUCCEEDED → kết thúc NO-OP và ghi nhận lý do. Nếu trùng key nhưng payload khác → REJECTED.
- Đặt Commands.State=`PROCESSING`, không dùng `PayloadJson` làm cơ sở xác minh người dùng.
- Pilot: cho phép `Author.Email` thuộc danh sách quản trị tin cậy (lưu ở `SystemSettings` hoặc cấu hình Solution; không tự nhập UPN chưa được xác thực). Đừng dùng `ActorUPN` trong payload.

### S03 — `S03_Context` / Read

- Với lệnh khác CREATE: GET Master theo RequestKey. `length=1`.
- GET WorkflowVersions theo mã+phiên bản cố định của hồ sơ; chỉ tuyến hợp lệ mới đi tiếp.
- GET WorkItem hiện tại dựa trên `CurrentStepInstanceKey`; `State=OPEN`.
- GET WorkflowSteps / StepRecipients theo WorkflowCode, VersionNo, StepKey; xác định `NextStepKey`, `ResponsibleOUCode`, người phụ trách.

### S04 — `S04_Guards` / Authorize

- `expectedStepKey`, `expectedStepInstanceKey`, `expectedReviewRound` trong `PayloadJson` là preconditions; kiểm tra trùng với Master ở thời điểm thực thi. Nếu lệch: REJECTED, không đổi Master.
- `SUBMIT` chỉ hợp lệ tại `BPCM1_PREPARE` và `Status=DRAFT|RETURNED`, checklist bắt buộc đã đạt theo `EMI_PAY_ChecklistItems`/DocumentIndex.
- `DECIDE` chỉ ở BPCM2/BPCM3/TCKT_CHECK/CHAIR_APPROVE, `decision=PASS|REJECT`; `REJECT` bắt buộc lý do.
- `CONFIRM_PAYMENT` chỉ ở `TCKT_PAY`; xác minh UNC qua **DocumentIndex thực tế** (`RequestKey`,`DocumentKey`,`IsCurrent`,`FileUrl`).
- Giai đoạn pilot: cho phép thử với admin theo connection thực, KHÔNG bật cho người dùng thường trước khi có kênh xác thực Actor và Dynamic Permission.

### S05 — `S05_Dispatch` / Switch `CommandType`

| Case | Kết quả tính toán; chưa ghi ngay nếu guard không đạt |
|---|---|
| `CREATE_REQUEST` | `RequestKey=PAY-{CommandKey}`, trạng thái DRAFT, bước `BPCM1_PREPARE`, `ReviewRound=1`, tạo WorkItem chuẩn bị, WorkflowVersionNo được pin **lúc SUBMIT lần đầu** |
| `SUBMIT` | `BPCM1 → BPCM2_TECH`; nếu từ RETURNED thì `ReviewRound +=1`, nếu DRAFT giữ `1`; bước nhận đúng tuyến/OU |
| `DECIDE PASS` | `BPCM2→BPCM3→TCKT_CHECK→CHAIR_APPROVE→TCKT_PAY`; riêng CHAIR_APPROVE yêu cầu `paymentDueAt` và lưu `PaymentDueAt` |
| `DECIDE REJECT` | **BPCM2/BPCM3/TCKT_CHECK/CHAIR_APPROVE → BPCM1_PREPARE**; giữ ReviewRound, đóng work item, tạo work item sửa hồ sơ, lưu lý do |
| `CONFIRM_PAYMENT` | `TCKT_PAY → SYSTEM_ARCHIVE`; `Status=ARCHIVE_PENDING`, `PaidAt=utcNow()`, không COMPLETED |

### S06 — `S06_Commit` / Mutations

- Với CREATE: tra `RequestKey` trước khi POST Master; chỉ được tạo một item Master duy nhất. `CreatedOUCode` phải là OU hợp lệ lấy từ cấu hình; không chỉ tin input.
- Với chuyển bước: (a) xác minh/đóng WorkItem cũ; (b) tính StepInstanceKey mới là `RequestKey|StepKey|CommandKey`; (c) chỉ tạo WorkItem mới nếu key chưa tồn tại; (d) cập nhật Master với ETag từ lần GET mới nhất.
- WorkItems dùng `StepInstanceKey`, `ReviewRound`, `StepKey`, `StepOrder`, `StepKind`, `ResponsibleOUCode`, `State=OPEN`; không tự cấp ACL ở Main V1.
- Nếu lỗi ở giữa nhiều Lists, chuyển Commands sang trạng thái `NEEDS_RECONCILIATION` (bổ sung Choice bằng script), **không** ghi `FAILED` chung rồi retry vô điều kiện. Một lệnh chưa commit đủ là tình huống cần đối chiếu.

### S07 — `S07_AuditAndEvent`

- Ghi một ActivityPublic với `ActivityKey={CommandKey}|{EventType}`, `RequestKey`, `StepInstanceKey`, `ReviewRound`, `EventTime`, `FromState`, `ToState`, `Note`.
- Kiểm tra ActivityKey tồn tại trước khi thêm, tránh ghi trùng khi retry.
- Các loại sự kiện dùng được cho Subflows sau: `REQUEST_CREATED`, `REQUEST_SUBMITTED`, `STEP_ASSIGNED`, `REQUEST_RETURNED`, `PAYMENT_RECORDED`.
- Không tạo email/Teams, không cấp ACL động và không chuyển kho lúc này.

### S08 — `S08_FinalizeAndCatch`

- Chỉ cập nhật Commands.State=`SUCCEEDED`, `ProcessedAt=utcNow()` **sau** khi cập nhật Master, WorkItem và Audit thành công.
- Catch Scope (`Configure run after = failed/timed out`) ghi thông tin an toàn vào `ErrorMessage` và ActivityInternal, đặt `FAILED` nếu chưa có ghi dở; nếu đã có ghi dở đặt `NEEDS_RECONCILIATION`.
- Không ghi dữ liệu chứng từ/UPN nhạy cảm thô vào ErrorMessage.
- Khi một run bị retry sau lỗi hệ thống: kiểm tra dấu vết Master/WorkItems/ActivityKey/CommandKey trước khi làm tiếp. Không mặc định chỉ cần `Concurrency=1` là an toàn.

## 4. Quy tắc nhất quán và phiên bản

**Bất biến:** 1 Master; không chuyển bước nếu không hợp lệ; không bỏ qua authorization; mỗi transition có StepInstanceKey và ActivityKey ổn định dựa trên CommandKey; ReviewRound chỉ tăng lúc BPCM1 **gửi lại** sau RETURNED; workflow version pin lúc SUBMIT đầu tiên; không sửa lịch sử lượt cũ.

Nên bật `Enforce unique values` và index cho các key phù hợp trước dữ liệu thật (Requests.RequestKey; Commands.CommandKey, DedupeKey; WorkItems.StepInstanceKey; ActivityPublic.ActivityKey). Xác nhận trên CECM không có trùng dữ liệu trước khi bật; không tự kích hoạt trong gói này.

## 5. Điều kiện bật thử một Flow

- [ ] 6 nhóm cấu hình có đủ cột, Choice và các trường bổ sung được duyệt.
- [ ] Routing gắn đúng OU thật, không dùng giả định lane là phòng ban thật; PaymentTypes và ChecklistTemplates được phê duyệt.
- [ ] Connection reference thực sự dùng identity có quyền, không chỉ group FLOW-SVC trống.
- [ ] Flow Off cho tới khi hoàn tất toàn bộ nhánh + Catch.
- [ ] `Concurrency=1`; `RequestKey` và CommandKey unique; Error flow không tự retry mãi.
- [ ] Thử lệnh bằng tài khoản admin, dữ liệu giả, kiểm tra Run History và 23/23 static RBAC không đổi.
- [ ] `CONFIRM_PAYMENT` chỉ dùng UNC đã tồn tại trong SharePoint DocumentIndex; không tin cờ do client khai.

## 6. Điểm nối Subflows để sau

- `REQUEST_CREATED / REQUEST_SUBMITTED / STEP_ASSIGNED`: quyền động, thông báo.
- `PAYMENT_RECORDED`: ArchiveJob + Archive Manager (chạy riêng, có retry và kết quả), không hoàn tất Master tại đây.
- `ARCHIVE_SUCCEEDED`: Main Flow sau này sẽ chấp nhận một command `ARCHIVE_RESULT` **chỉ từ service identity tin cậy**; không cho người dùng tự xác nhận lưu trữ.

## 7. Tài liệu chính thức

- [Create a flow in a solution](https://learn.microsoft.com/en-us/power-automate/create-flow-solution)
- [Power Automate new designer](https://learn.microsoft.com/en-us/power-automate/flows-designer)
- [SharePoint connector operations](https://learn.microsoft.com/en-us/connectors/sharepoint/)
- [SharePoint HTTP request guide](https://learn.microsoft.com/en-us/sharepoint/dev/business-apps/power-automate/guidance/working-with-send-sp-http-request)

> **Lưu ý về import:** Power Automate new designer cho phép xem `Code view` nhưng không sửa trực tiếp JSON ở đó. File này là runbook để lắp Flow và nghiệm thu. Không đổi tên thành Solution ZIP và không tuyên bố đã triển khai tenant khi chưa có flow export/connection references hợp lệ.
