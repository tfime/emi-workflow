# EMI PAY – Kế hoạch Main Flow Core V1.0

> **Trạng thái:** ĐÃ THỐNG NHẤT VỀ KIẾN TRÚC VÀ PHẠM VI MAIN FLOW  
> **Ngày ghi nhận:** 12/11/2026  
> **Mục đích:** Tài liệu tham chiếu để tiếp tục thiết kế, cấu hình và triển khai sau; **chưa phải tài liệu xác nhận Flow đã hoạt động**.  
> **Site:** `https://emicomvn.sharepoint.com/sites/cecm`  
> **Nền tảng:** SharePoint Online + Power Automate (new designer) + PnP PowerShell + SPFx (giai đoạn sau)

---

## 1. Bối cảnh và các phần đã hoàn thành

- EMI PAY là hệ thống quản lý và điều phối hồ sơ thanh toán trên SharePoint CECM.
- Data Model đã được tạo: **19 SharePoint Lists và 4 Document Libraries** (tổng **23 thành phần**).
- Đã tạo **7 nhóm SharePoint RBAC** dạng `GR-PAY-*`.
- **RBAC tĩnh V1.9.1: PASS 23/23 thành phần**; Site ACL chỉ ghi nhận bổ sung một vai trò `Guest/Limited Access` do SharePoint tự động tạo. Kết quả này **không đồng nghĩa** đã nghiệm thu quyền người dùng thực tế hoặc phân quyền động.
- **Chưa triển khai:** Main Flow, các Subflow, SPFx, kiểm thử nghiệp vụ đầu cuối bằng người dùng thật.
- **Chưa sử dụng dữ liệu thanh toán thật.**
- Một hồ sơ thanh toán sử dụng **một Master Record duy nhất** trong `EMI_PAY_Requests`, kể cả khi trả lại hoặc gửi lại; không tạo hồ sơ bản sao theo mỗi vòng xử lý.
- Sơ đồ BPMN hồ sơ thanh toán SPV được người dùng cung cấp ngày 12/11/2026 là tham chiếu nghiệp vụ chính cho kế hoạch này.

## 2. Quyết định kiến trúc đã chốt

**Xây dựng duy nhất một Main Flow** tên đề xuất:

`EMI_PAY_CORE_Orchestrator_V1`

Main Flow chịu trách nhiệm **nhận lệnh → xác minh → xác định bước → kiểm tra điều kiện → chuyển trạng thái Master Record → tạo/đóng công việc → ghi lịch sử → phản hồi kết quả lệnh**.

### 2.1. Một Flow, nhiều lượt chạy ngắn

- Đây là **một định nghĩa Automated Cloud Flow**; mỗi item lệnh mới trên `EMI_PAY_Commands` kích hoạt **một lượt chạy**.
- **Không** tạo một lần chạy Power Automate chờ xuyên suốt 7 giai đoạn, cũng **không** tạo một Flow độc lập cho từng phòng ban.
- **Không** dùng trigger thay đổi của `EMI_PAY_Requests` để tự điều phối toàn bộ tiến trình, tránh kích hoạt lại bởi chính các thao tác cập nhật của Main Flow.
- Main Flow đọc quy trình qua các Lists cấu hình hiện có; không hard-code từng phòng ban thành nhiều luồng riêng.
- Ưu tiên xử lý tuần tự trong giai đoạn Core; thiết kế idempotency/chống trùng để hỗ trợ retry và xử lý đồng thời sau này.

### 2.2. Mô hình điều phối

```text
Người dùng / SPFx (giai đoạn sau) / bộ kiểm thử có quyền
                     |
                     v
              EMI_PAY_Commands
                     |
             When item is created
                     |
                     v
       EMI_PAY_CORE_Orchestrator_V1
         |      |          |       |
         v      v          v       v
      Requests  WorkItems  Activity  Config Lists
         |
         +----> Sự kiện / yêu cầu cho Subflows (sau)
                   |-- Document & Checklist
                   |-- Dynamic Permission
                   |-- Archive Manager
                   `-- Notification Manager
```

> Trong giai đoạn kiểm thử Core, lệnh do tài khoản quản trị/dịch vụ có quyền hợp lệ tạo ra. Không mở quyền ghi trực tiếp vào `EMI_PAY_Commands` cho toàn bộ người dùng chỉ để kích hoạt Flow.

## 3. Quy trình nghiệp vụ chuẩn theo BPMN

| Giai đoạn logic | Chủ thể/bộ phận | Công việc | Kết quả đi tiếp |
|---|---|---|---|
| 1 | BPCM1 / NH2 | Tạo hồ sơ, đính kèm tài liệu theo checklist; điều chỉnh khi bị trả lại; gửi/gửi lại | BPCM2 |
| 2 | BPCM2 | Tiếp nhận, kiểm tra kỹ thuật; có thể yêu cầu bổ sung tài liệu | BPCM3 nếu đạt; BPCM1 nếu từ chối/không đạt |
| 3 | BPCM3 | Tiếp nhận, kiểm tra giá; có thể yêu cầu bổ sung tài liệu | TCKT kiểm tra nếu đạt; BPCM1 nếu từ chối/không đạt |
| 4 | TCKT | Tiếp nhận, kiểm tra hồ sơ thanh toán; có thể yêu cầu bổ sung tài liệu | CT.HĐQT nếu đạt; BPCM1 nếu không đạt |
| 5 | CT.HĐQT | Tiếp nhận, phê duyệt hoặc không phê duyệt hồ sơ; khi duyệt cập nhật thời hạn thanh toán | TCKT thanh toán nếu duyệt; BPCM1 nếu không duyệt |
| 6 | TCKT | Nhận hồ sơ; thực hiện thanh toán **bên ngoài SharePoint**; tải lên UNC; xác nhận kết quả | Chờ lưu trữ |
| 7 | Hệ thống | Xác nhận kết quả thanh toán, lưu hồ sơ, thông báo liên quan và kết thúc | Hoàn tất **sau khi lưu trữ thành công** |

**Quy tắc trả lại đã chốt theo sơ đồ hiện tại:** BPCM2, BPCM3, TCKT (kiểm tra) hoặc CT.HĐQT từ chối/không đạt thì hồ sơ **trả trực tiếp về BPCM1**, kèm lý do, tài liệu liên quan hoặc lý do không đạt. Khi BPCM1 sửa và gửi lại, lượt kiểm tra mới bắt đầu **từ BPCM2**.

**Không đưa vào Main Flow theo sơ đồ hiện tại:** bước riêng “Giám đốc SPV ký chi”. Không nhầm thao tác xác nhận thanh toán trong phần mềm với chuyển tiền ngân hàng hoặc ký số.

**Dữ liệu xuyên suốt:** giữ nguyên `RequestKey` và Master Record; bảo lưu tất cả vòng kiểm tra, WorkItem, quyết định, nhật ký và phiên bản tài liệu. `ReviewRound` phân biệt các lượt xử lý; quy tắc tăng vòng khi gửi lại sẽ được cụ thể hóa ở bước triển khai để tránh tăng trùng.

## 4. Tám khối xử lý bắt buộc **trong cùng một Main Flow**

| Khối | Tên khối | Mục tiêu và dữ liệu chính |
|---|---|---|
| **01** | Nhận yêu cầu | Trigger SharePoint `When an item is created` tại `EMI_PAY_Commands`; lấy loại lệnh, mã hồ sơ và dữ liệu yêu cầu |
| **02** | Kiểm tra lệnh và chống trùng | Kiểm tra lệnh hợp lệ, trạng thái, `DedupeKey`/định danh lệnh; từ chối hoặc bỏ qua lệnh đã xử lý |
| **03** | Đọc hồ sơ và cấu hình | Đọc `EMI_PAY_Requests`, `WorkflowVersions`, `WorkflowSteps`, `StepRecipients`, `WorkItems` và danh mục liên quan |
| **04** | Kiểm tra điều kiện và thẩm quyền | Xác minh trạng thái hiện tại, bước hiện tại, người/phòng ban được giao, điều kiện checklist, điều kiện thanh toán; không tin danh tính khai báo trong payload nếu không có bằng chứng đáng tin cậy |
| **05** | Xác định nhánh nghiệp vụ | Điều phối theo loại lệnh; tính bước kế tiếp, nhánh trả BPCM1, gửi lại, chờ lưu trữ |
| **06** | Cập nhật hồ sơ và công việc | Chỉ cập nhật **Master Record hiện có**; tạo/đóng `WorkItems`, quản lý lượt xử lý; bảo đảm retry không tạo trùng |
| **07** | Ghi lịch sử và phát sinh sự kiện | Ghi `ActivityPublic`/`ActivityInternal` và dấu hiệu sự kiện nghiệp vụ để nối các Subflow sau |
| **08** | Kết thúc lệnh và xử lý lỗi | Ghi trạng thái xử lý lệnh trong `EMI_PAY_Commands`; hỗ trợ kiểm tra lỗi, retry an toàn và truy vết |

Các khối là cấu trúc logic nội bộ của **một Flow duy nhất**, không phải 8 Flow con.

## 5. Bộ lệnh nghiệp vụ cốt lõi

Tên dưới đây là **đề xuất giao diện lệnh**, chưa khẳng định là giá trị Choice/enum đã tồn tại trong SharePoint. Khi triển khai phải đối chiếu schema và lựa chọn hiện hành.

| Lệnh | Hành vi chính | Thuộc Main Flow hiện tại? |
|---|---|---|
| `CREATE_REQUEST` | Khởi tạo một Master Record cho hồ sơ mới | Có |
| `SUBMIT` | Gửi hồ sơ lần đầu hoặc gửi lại sau điều chỉnh; chuyển từ BPCM1 sang BPCM2 | Có |
| `DECIDE` | Chấp nhận/không chấp nhận tại BPCM2, BPCM3, TCKT kiểm tra hoặc CT.HĐQT; cập nhật bước và công việc | Có |
| `CONFIRM_PAYMENT` | Xác nhận chứng từ UNC và kết quả thanh toán; chuyển hồ sơ sang chờ lưu trữ | Có |
| `ARCHIVE_RESULT` | Nhận kết quả lưu trữ để xác định hoàn tất hay thất bại | **Điểm kết nối dự phòng**; xử lý khi gắn Archive Manager |

Trường hợp không đạt/từ chối đi qua logic `DECIDE` theo bước và kết quả; không cần tạo nhiều Flow từ chối riêng.

## 6. Phân định Main Flow và Subflows

| Chức năng | Phạm vi Main Flow hiện tại | Phần gắn vào sau |
|---|---|---|
| Tạo và cập nhật Master Record | **Có** | — |
| Kiểm tra lệnh, thẩm quyền, trạng thái | **Có** | Bổ sung kênh xác thực/ủy quyền thực tế cho SPFx |
| Đọc cấu hình và xác định bước | **Có** | — |
| Chuyển bước, trả về BPCM1, gửi lại | **Có** | — |
| Tạo/đóng WorkItem; quản lý `ReviewRound` | **Có** | — |
| Ghi lịch sử phê duyệt, nhật ký thao tác | **Có** | — |
| Kiểm tra hồ sơ có đủ điều kiện/checklist để chuyển bước | **Có** | Kiểm tra nội dung chứng từ chuyên sâu, OCR/AI |
| Ghi nhận kết quả thanh toán và UNC | **Có** | Nghiệp vụ chuyển tiền bên ngoài; tích hợp ngân hàng nếu có giai đoạn khác |
| Di chuyển/sao chép tài liệu sang kho hoàn tất | Phát sinh yêu cầu lưu trữ, **chưa hoàn tất vật lý** | **Archive Manager** |
| Cấp/thu hồi quyền SharePoint theo từng hồ sơ | Phát sinh sự kiện liên quan | **Dynamic Permission** |
| Gửi email/Teams và thông báo | Ghi nhận sự kiện | **Notification Manager** |
| Lập chỉ mục, xử lý phiên bản, đồng bộ checklist tài liệu | Đọc điều kiện tối thiểu để ra quyết định | **Document & Checklist** |
| SLA, quá hạn, nhắc việc định kỳ | Không | Scheduled Flow độc lập về sau |
| Dashboard, báo cáo, UI SPFx | Không | Các thành phần đọc/hiển thị riêng về sau |

**Ranh giới bắt buộc:** Main Flow là **chủ sở hữu duy nhất của logic chuyển trạng thái nghiệp vụ**. Subflows không tự phê duyệt hay tự ý đổi bước. Ngoại lệ tích hợp kết quả lưu trữ: Archive Manager trả kết quả, Main Flow nhận kết quả hợp lệ và mới chuyển `COMPLETED`.

### 6.1. Bốn nhóm Subflow dự kiến

1. **Document & Checklist:** xử lý upload, metadata, phiên bản, danh mục tài liệu, kiểm tra checklist chuyên sâu.
2. **Dynamic Permission:** áp dụng ACL theo hồ sơ, bộ phận và người được phân công; **bắt buộc trước khi vận hành nhiều người dùng thật**.
3. **Archive Manager:** tiếp nhận yêu cầu, xử lý lưu trữ và trả lại kết quả/thất bại; có cơ chế retry.
4. **Notification Manager:** email, Teams và thông báo theo sự kiện; lỗi gửi thông báo không được làm đảo ngược quyết định nghiệp vụ đã chấp nhận.

Các nhóm này là **phạm vi dự kiến**, chưa phải cam kết mỗi nhóm chính xác một Child Flow hay đã được tạo.

## 7. Hợp đồng sự kiện để gắn Subflows sau

| Sự kiện logic | Bộ phận/phân hệ tiêu thụ dự kiến |
|---|---|
| `REQUEST_CREATED` | Document & Checklist; Dynamic Permission |
| `REQUEST_SUBMITTED` | Dynamic Permission; Notification |
| `STEP_ASSIGNED` | Dynamic Permission; Notification |
| `REQUEST_RETURNED` | Dynamic Permission; Notification |
| `PAYMENT_RECORDED` | Archive Manager |
| `ARCHIVE_SUCCEEDED` | Main Flow tiếp nhận để hoàn tất |
| `REQUEST_COMPLETED` | Notification; Dynamic Permission |

**Lưu ý:** Đây là **tên sự kiện đề xuất**, chưa phải dữ liệu đã nạp vào List. Khi xây dựng cần thống nhất cấu trúc sự kiện hoặc bản ghi hàng đợi phù hợp trong Data Model hiện có, không tự tiện tạo List mới.

**Dữ liệu tối thiểu của hợp đồng sự kiện/lệnh:** định danh lệnh, `RequestKey`, loại sự kiện, `ReviewRound`, bước hoặc `StepInstanceKey` liên quan, dấu thời gian, nguồn phát và dữ liệu cần thiết để xử lý idempotent. Quy định cách xác thực nguồn phát trước khi cho phép cập nhật trạng thái.

## 8. Quyền truy cập và bảo mật

- **RBAC tĩnh 23/23 PASS** chỉ chứng minh ACL cấp List/Library theo ma trận hiện tại. Không coi đó là RBAC động hoặc quyền phê duyệt của người dùng.
- `EMI_PAY_Commands` hiện không được mở quyền ghi trực tiếp cho tất cả `GR-PAY-USERS`. Kiểm thử ban đầu dùng danh tính quản trị/dịch vụ được cấp quyền phù hợp.
- Một `ActorUPN` do người dùng tự khai trong `PayloadJson` **không đủ** làm căn cứ xác thực/phê duyệt. Kênh gọi thật qua SPFx sau này phải xác định danh tính đáng tin cậy và đối chiếu với phân công, bước, trạng thái.
- Khi người dùng chưa được cấp quyền đọc trên Master Record hoặc tài liệu, UI không được coi bộ lọc hiển thị là biện pháp bảo mật thay thế SharePoint ACL.
- Main Flow thực hiện ghi dữ liệu qua kết nối SharePoint có quyền phù hợp; việc đặt tên nhóm `GR-PAY-FLOW-SVC` không tự bảo đảm Power Automate thực thi dưới danh tính của nhóm đó.

## 9. Kiểm soát tính nhất quán và lỗi

- **Chống lệnh trùng:** dùng định danh lệnh và `DedupeKey`, kiểm tra trạng thái xử lý trước khi thay đổi dữ liệu.
- **Chống vượt bước:** xác minh CurrentStep/Status tại thời điểm xử lý; lệnh không đúng trạng thái phải từ chối, ghi lý do.
- **Idempotent:** một lệnh chạy lại không được tạo thêm Master Record, nhân đôi WorkItem hoặc ghi nhận cùng quyết định nhiều lần.
- **Xử lý tuần tự giai đoạn đầu:** nhằm giảm xung đột khi nhiều người thao tác cùng hồ sơ. Trước khi mở rộng concurrency cần bổ sung kiểm soát cập nhật đồng thời phù hợp.
- **Lỗi giữa nhiều Lists:** SharePoint không cung cấp giao dịch nguyên tử liên List, nên cần lưu checkpoint/trạng thái và thiết kế retry/bù trừ có kiểm soát. Chưa xem đây là cơ chế đã được triển khai.
- **Lỗi Subflow thông báo:** không đảo ngược bước nghiệp vụ hợp lệ.
- **Lỗi Archive Manager:** hồ sơ giữ ở trạng thái chờ/khắc phục lỗi, **không** đánh dấu hoàn tất khi chưa nhận xác nhận lưu trữ thành công.

## 10. Trạng thái nghiệp vụ – nguyên tắc, chưa chốt enum kỹ thuật

| Tình huống | Quy tắc trạng thái |
|---|---|
| Tạo mới nhưng chưa gửi | Hồ sơ ở giai đoạn chuẩn bị tại BPCM1 |
| Đã gửi | Hồ sơ ở bước BPCM2, tạo công việc tiếp nhận |
| Bước BPCM2/BPCM3/TCKT/CT.HĐQT đạt/duyệt | Đóng công việc hiện tại, xác lập bước tiếp theo |
| Bước bất kỳ ở nhánh kiểm tra/phê duyệt không đạt | Về BPCM1, ghi lý do, bảo lưu lịch sử |
| BPCM1 gửi lại | Mở lượt kiểm tra mới, bắt đầu lại BPCM2 |
| TCKT xác nhận thanh toán và UNC hợp lệ | **Chờ lưu trữ**, tên trạng thái gợi ý: `ARCHIVE_PENDING` |
| Archive Manager xác nhận lưu trữ thành công | Main Flow chuyển **hoàn tất**, tên gợi ý: `COMPLETED` |
| Lưu trữ thất bại | Không hoàn tất; ghi lỗi và hỗ trợ thử lại |

`ARCHIVE_PENDING` và `COMPLETED` là **nhãn logic đề xuất**; không tự coi là các Choice value đã được xác thực trong Lists hiện tại.

## 11. Phạm vi triển khai và thứ tự thực hiện

### Đợt 1 – Main Flow Core (đã chốt phạm vi, **chưa thực thi**)

- Nạp cấu hình nghiệp vụ tối thiểu dựa trên schema SharePoint thực tế và BPMN đã chốt.
- Tạo Solution quản lý phiên bản và **một** Main Flow `EMI_PAY_CORE_Orchestrator_V1`.
- Trigger lệnh từ `EMI_PAY_Commands`, xử lý các lệnh cốt lõi.
- Đọc cấu hình, chuyển bước, trả lại/gửi lại, quản lý WorkItems và Activity Logs.
- Xác nhận thanh toán và dừng ở trạng thái **chờ lưu trữ** trước khi Archive Manager được triển khai.
- Kiểm thử Core bằng dữ liệu demo, chưa mở quyền người dùng đại trà.

### Đợt 2 – Các Subflows thiết yếu (sau Main Flow)

- Document & Checklist.
- Dynamic Permission.
- Archive Manager và phản hồi kết quả lưu trữ để hoàn tất hồ sơ.

### Đợt 3 – Tích hợp và mở rộng

- Notification Manager; cảnh báo SLA/quá hạn.
- SPFx tạo hồ sơ, chi tiết hồ sơ 360°, công việc của tôi, theo dõi tiến độ.
- Dashboard, báo cáo và các chức năng mở rộng theo kế hoạch sản phẩm.

> **Nguyên tắc tổ chức công việc:** Gộp những hạng mục có thể thực hiện và kiểm thử chung; không chia quá nhỏ thành các task hoặc nhiều Flow theo từng phòng ban. Chỉ tách Subflow khi có lý do về trách nhiệm, retry, hiệu năng, phân quyền hoặc tái sử dụng.

## 12. Tiêu chí nghiệm thu Đợt 1 – Main Flow Core

- [ ] Chỉ có **một Main Flow** cho điều phối; mỗi lệnh là một lượt chạy ngắn.
- [ ] Một Master Record từ đầu đến cuối; không tạo bản sao hồ sơ theo vòng xử lý.
- [ ] Hồ sơ đi đúng BPCM1 → BPCM2 → BPCM3 → TCKT → CT.HĐQT → TCKT thanh toán.
- [ ] Từ các bước kiểm tra/phê duyệt không đạt, hồ sơ về **BPCM1**, sau chỉnh sửa gửi lại **BPCM2**.
- [ ] Hồ sơ lưu đầy đủ vòng xử lý, quyết định, lý do trả lại và lịch sử.
- [ ] Công việc được tạo/đóng đúng bước, không trùng lặp khi chạy lại lệnh.
- [ ] Không thể xử lý lệnh vượt bước, sai trạng thái hoặc không đủ thẩm quyền đã xác minh.
- [ ] TCKT ghi nhận UNC/kết quả thanh toán và đưa hồ sơ đến **chờ lưu trữ**.
- [ ] Chưa có xác nhận lưu trữ thành công thì **không** chuyển hồ sơ thành `COMPLETED`.
- [ ] Lỗi được ghi nhận, có thể truy vết và thử lại có kiểm soát.
- [ ] Không phá vỡ RBAC tĩnh đã PASS 23/23.
- [ ] Toàn bộ kịch bản được thử bằng **dữ liệu demo**, chưa sử dụng dữ liệu thanh toán thật.

## 13. Những việc cần xác minh khi bắt tay triển khai (không thay đổi quyết định kiến trúc)

1. Giá trị Choice/Status/Command thực tế trong schema CECM; thống nhất mapping tên kỹ thuật trước khi ghi.
2. Bộ dữ liệu cấu hình thực tế (loại hồ sơ, pháp nhân, OU, người nhận bước, checklist), không tự giả định người dùng từ tên lane BPMN.
3. Các trường bổ sung nếu thực sự cần cho phân biệt pháp nhân thanh toán, phiên bản workflow và thời hạn thanh toán; **chưa tự động coi đề xuất bổ sung cột là đã phê duyệt**.
4. Cách tạo lệnh từ SPFx trong tương lai bảo đảm nhận diện người dùng thực, tránh tự khai quyền qua payload.
5. Hợp đồng yêu cầu lưu trữ/kết quả lưu trữ và vị trí lưu trạng thái lỗi, retry khi Archive Manager được phát triển.

---

## 14. Bảng chốt phạm vi một trang

| Nội dung | Quyết định |
|---|---|
| Số Main Flow | **1** |
| Tên | `EMI_PAY_CORE_Orchestrator_V1` (đề xuất) |
| Trigger | SharePoint – `When an item is created` trên `EMI_PAY_Commands` |
| Cấu trúc nội bộ | **8 khối logic** |
| Mỗi hồ sơ | **1 Master Record** |
| Nhánh từ chối | **Trả BPCM1, gửi lại từ BPCM2** |
| Sau CT.HĐQT duyệt | **TCKT thanh toán bên ngoài hệ thống, tải UNC** |
| Kết thúc Main Flow đợt đầu | **Chờ lưu trữ**, không giả định đã hoàn tất |
| Hoàn tất thực sự | Sau khi Archive Manager trả **thành công** |
| Subflows sau | Document & Checklist; Dynamic Permission; Archive Manager; Notification Manager |
| Quyền | Giữ nguyên RBAC tĩnh 23/23; quyền động triển khai sau |
| Trạng thái tài liệu | **Kế hoạch đã chốt; chưa triển khai Flow** |

*Tài liệu này ghi nhận quyết định đã thống nhất giữa người dùng và trợ lý để làm mốc tham chiếu khi tiếp tục dự án. Khi triển khai, mọi thay đổi so với các nguyên tắc trên cần được ghi rõ thành phiên bản mới.*
