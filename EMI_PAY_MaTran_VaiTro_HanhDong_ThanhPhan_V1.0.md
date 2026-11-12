# EMI PAY – MA TRẬN VAI TRÒ × HÀNH ĐỘNG × THÀNH PHẦN HỆ THỐNG

> **Phiên bản:** V1.0 – Tài liệu tham chiếu triển khai và kiểm thử  
> **Ngày lập:** 12/11/2026  
> **Phạm vi:** Quy trình hồ sơ thanh toán SPV trên SharePoint CECM  
> **Site:** `https://emicomvn.sharepoint.com/sites/cecm`  
> **Kiến trúc:** SharePoint Online + Power Automate (một Main Flow) + SPFx và các Subflow ở giai đoạn tiếp theo  
> **Trạng thái:** **Ma trận nghiệp vụ/thiết kế tham chiếu; không phải biên bản xác nhận các vai trò người dùng đã truy cập được thực tế.**

## 1. Cơ sở và nguyên tắc sử dụng

Tài liệu được đối chiếu từ: (1) sơ đồ **“01. Quy trình hồ sơ thanh toán SPV 4.png”** do EMI cung cấp; (2) **“EMI_PAY_Main_Flow_Core_V1_0_KeHoach_DaChot.md”**; (3) bản xuất schema **`EMI_PAY_CORE_SCHEMA_20261112-090206.zip`**; (4) ma trận RBAC tĩnh **`EMI_PAY_RBAC_Policy_23.csv`** và kết quả nghiệm thu **PASS 23/23**; (5) bộ thiết kế Main Flow/Command hiện có. Các mã lệnh, trạng thái hoặc cơ chế giao tiếp chưa được nạp/kiểm thử trên tenant được gọi rõ là **đề xuất kỹ thuật**.

**Ba lớp phải phân biệt:**

1. **Quyền nghiệp vụ (Business Authorization):** vai trò nào **được phép thực hiện hành động** ở đúng bước, đúng hồ sơ, đúng lượt và đúng phân công.
2. **Quyền dữ liệu (SharePoint ACL):** người dùng/nhóm nào **thực sự có khả năng đọc/ghi** List, Library hoặc item/folder. RBAC tĩnh đã PASS, nhưng hiện **chưa cấp quyền động cho người xử lý ở cấp hồ sơ**.
3. **Quyền thực thi hệ thống (Automation Identity):** Flow xử lý dữ liệu qua **kết nối SharePoint của một danh tính được cấp quyền**, không phải bằng cách tự động kế thừa quyền của người bấm nút.

**Quy ước trạng thái triển khai:**

| Ký hiệu | Ý nghĩa |
|---|---|
| **CORE** | Trách nhiệm phải có trong một Main Flow `EMI_PAY_CORE_Orchestrator_V1`; định nghĩa thiết kế, **chưa được nghiệm thu chạy trên tenant** |
| **DOC** | Module/Subflow Document & Checklist – triển khai sau Core |
| **DYN** | Dynamic Permission và cổng gửi lệnh xác thực – bắt buộc trước vận hành đa người dùng |
| **ARC** | Archive Manager – xử lý lưu trữ thực tế và phản hồi kết quả |
| **NOTI** | Notification Manager – email/Teams/thông báo |
| **UI** | Giao diện SPFx/360° – triển khai sau, không phải quyền SharePoint |
| **CFG** | Quản trị cấu hình/danh mục trên Lists hiện có |
| **N/A** | Không có hành động/người dùng ở phạm vi này |

**Quy tắc nghiệp vụ bất biến:** **một hồ sơ = một Master Record** (`EMI_PAY_Requests`). Từ chối ở BPCM2, BPCM3, TCKT kiểm tra hoặc CT.HĐQT đều **trả về BPCM1**; sau khi chỉnh sửa, **gửi lại từ BPCM2**, lưu `ReviewRound` và lịch sử cũ. CT.HĐQT duyệt xong thì **TCKT thực hiện thanh toán bên ngoài SharePoint và tải UNC**. Main Flow dừng ở trạng thái logic **chờ lưu trữ**, chỉ hoàn tất sau khi Archive Manager xác nhận thành công.

## 2. Danh mục vai trò nghiệp vụ và đối chiếu nhóm RBAC

| Mã vai trò | Vai trò trong quy trình | Phạm vi nghiệp vụ dự kiến | Nhóm SharePoint liên quan | Ghi chú bắt buộc |
|---|---|---|---|---|
| **R01** | **BPCM1 / NH2 – Bộ phận chuyên môn 1** | Tạo, bổ sung/chỉnh sửa và gửi/gửi lại hồ sơ thuộc phạm vi được giao; xem lý do trả hồ sơ | `GR-PAY-USERS` *có thể là nhóm người dùng nền*; danh tính thực tế phải xác định bằng `OrgMembers`, `StepRecipients`, `Assignments` | **Không có nhóm GR-PAY-BPCM1 riêng** trong 7 nhóm hiện tại; không suy ra có quyền ghi trực tiếp List |
| **R02** | **BPCM2 – Bộ phận chuyên môn 2** | Nhận, kiểm tra kỹ thuật; quyết định đạt/không đạt trong đúng lượt công việc | Tương tự R01; phân công dựa theo OU/người cụ thể | Không được phê duyệt thay BPCM3, TCKT hay CT.HĐQT |
| **R03** | **BPCM3 – Bộ phận chuyên môn 3** | Nhận, kiểm tra giá; quyết định đạt/không đạt trong đúng lượt công việc | Tương tự R01; phân công dựa theo OU/người cụ thể | Không được tự sửa kết quả của BPCM2 |
| **R04** | **TCKT – Kiểm tra** | Nhận, kiểm tra hồ sơ thanh toán; quyết định đạt/không đạt | `GR-PAY-TCKT` kết hợp phân công công việc thực tế | Vai trò TCKT ở bước kiểm tra khác quyền ở bước thanh toán; phải kiểm tra `StepKey` |
| **R05** | **CT.HĐQT** | Phê duyệt/không phê duyệt; cập nhật thời hạn thanh toán khi duyệt nếu trường đã có và được cấu hình | `GR-PAY-CHAIR` kết hợp bước được giao | Không mặc nhiên có quyền trên tất cả hồ sơ chỉ vì thuộc nhóm CHAIR |
| **R06** | **TCKT – Thanh toán** | Nhận hồ sơ đã duyệt, thực hiện thanh toán ngoài hệ thống, tải UNC, xác nhận kết quả | `GR-PAY-TCKT` + phân công đúng bước `TCKT_PAY` | **Không** phải lệnh chuyển tiền ngân hàng, không phải ký số/giám đốc SPV ký chi |
| **R07** | **Hệ thống / Main Flow** | Xác minh lệnh, chuyển bước, tạo/đóng WorkItem, cập nhật Master Record, ghi nhật ký | Kết nối dịch vụ liên quan `GR-PAY-FLOW-SVC` | Phải kiểm tra danh tính tài khoản kết nối thực sự; **tên nhóm** không tự cấp quyền cho Flow |
| **R08** | **Quản trị quy trình** | Cập nhật loại hồ sơ, OU, nhân sự, bước/phiên bản, checklist và người nhận | `GR-PAY-PROCADM` | Tĩnh: `Contribute` ở **7 Lists cấu hình kể cả PaymentTypes**; **không** có quyền trực tiếp trên `SystemSettings` |
| **R09** | **Quản trị hệ thống CECM / EMI PAY** | Quản lý cấu hình hệ thống, kết nối, phân quyền, xử lý sự cố có kiểm soát | `GR-PAY-SYSADM`; Site Owners | Full Control về kỹ thuật **không đồng nghĩa được ra quyết định phê duyệt nghiệp vụ thay người có thẩm quyền** |
| **R10** | **Kiểm toán / giám sát** | Xem nhật ký và thông tin được cấp để đối chiếu, không ra quyết định | `GR-PAY-AUDIT` | Hiện chỉ có **Read trực tiếp ở `EMI_PAY_ActivityInternal`**; quyền xem hồ sơ khác cần phê duyệt/cấp riêng |

> **Quan trọng:** Mối quan hệ BPCM1/BPCM2/BPCM3 ↔ OU/người thực tế chưa được nạp đủ dữ liệu cấu hình. Không tự đồng nhất BPCM1/BPCM2/BPCM3 với một nhóm `GR-PAY-*` nào. Mọi thao tác nghiệp vụ yêu cầu **đúng người được phân công, đúng bước và đúng trạng thái**, không chỉ đúng nhóm.

## 3. Ma trận chi tiết: ai làm hành động gì, trên thành phần nào?

**Cách đọc:** cột **“Người thao tác”** là người **được quyền nghiệp vụ theo thiết kế**. Cột **“Thành phần đọc/ghi”** ghi nơi Flow/module sẽ tương tác; **không** có nghĩa người đó được ghi trực tiếp lên SharePoint. Mọi lệnh `CREATE_REQUEST`, `SUBMIT`, `DECIDE`, `CONFIRM_PAYMENT` đều đi qua **cổng gửi lệnh có xác thực** (giai đoạn test dùng tài khoản quản trị/dịch vụ được cho phép) → `EMI_PAY_Commands` → Main Flow.

### 3.1. Giai đoạn BPCM1 – tạo hồ sơ, chỉnh sửa, gửi/gửi lại

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **A01** | BPCM1 được giao | Xem các loại hồ sơ, biểu mẫu/checklist | Loại hồ sơ còn hiệu lực | Đọc `EMI_PAY_PaymentTypes`, `EMI_PAY_ChecklistTemplates`, `EMI_PAY_WorkflowVersions`, `EMI_PAY_WorkflowSteps` | UI/đọc cấu hình qua tầng được phân quyền; không sửa danh mục | UI/CFG |
| **A02** | BPCM1 được giao | Tạo mới một hồ sơ thanh toán | Đúng OU/pháp nhân thuộc phạm vi; mã hồ sơ duy nhất | Ghi `EMI_PAY_Commands`; Flow tạo **1** item `EMI_PAY_Requests`; ghi `EMI_PAY_ActivityPublic` | `CREATE_REQUEST` | CORE |
| **A03** | BPCM1 là người lập hoặc người được phép | Nhập/điều chỉnh thông tin đề nghị thanh toán | Chỉ khi `DRAFT` hoặc đã trả lại BPCM1; không sửa hồ sơ đang được kiểm tra ở bước khác | `EMI_PAY_Requests` (vùng dữ liệu nghiệp vụ cho phép) | **Chưa có lệnh EDIT riêng trong 4 lệnh Core**; phải thiết kế kênh cập nhật an toàn trước khi mở cho người dùng | UI/DYN – bổ sung |
| **A04** | BPCM1 | Tạo/xem checklist của hồ sơ | Theo `PaymentTypeCode` và phiên bản checklist | Đọc `EMI_PAY_ChecklistTemplates`; tạo/đọc `EMI_PAY_ChecklistItems` | Main Flow kiểm tra điều kiện trước `SUBMIT`; khởi tạo/đồng bộ checklist chi tiết qua DOC | CORE + DOC |
| **A05** | BPCM1 | Tải hồ sơ, chứng từ ban đầu | Tài liệu thuộc hồ sơ được phép và phiên bản hiện tại | `EMI_PAY_DocsWorking`, `EMI_PAY_DocumentIndex`, `EMI_PAY_ChecklistItems` | Upload + metadata/index qua Document & Checklist; **không nằm trong 4 lệnh Core hiện tại** | DOC/DYN/UI |
| **A06** | BPCM1 | Kiểm tra thiếu tài liệu / số lượng tối thiểu | Các mục bắt buộc đã có file hợp lệ | Đọc `EMI_PAY_ChecklistItems`, `EMI_PAY_DocumentIndex` | Điều kiện chặn `SUBMIT` được Main Flow xác nhận | CORE |
| **A07** | BPCM1 | Gửi hồ sơ lần đầu | Hồ sơ ở BPCM1, `DRAFT`; checklist đạt điều kiện | `EMI_PAY_Commands` → `EMI_PAY_Requests`, `EMI_PAY_WorkItems`, `EMI_PAY_ActivityPublic` | `SUBMIT`, tạo công việc BPCM2 | CORE |
| **A08** | BPCM1 | Xem lý do và danh sách tài liệu chưa đạt khi hồ sơ bị trả | Đúng hồ sơ của mình/được giao | Đọc `EMI_PAY_Requests`, `EMI_PAY_WorkItems`, `EMI_PAY_StepReviews`, `EMI_PAY_ActivityPublic`, tài liệu được phép | UI xem lịch sử; dữ liệu chỉ xuất hiện nếu ACL động/cổng đọc cho phép | UI/DYN |
| **A09** | BPCM1 | Bổ sung hồ sơ sau trả lại | `RETURNED`, bước hiện tại BPCM1; ghi bổ sung, không xóa lịch sử lượt cũ | `EMI_PAY_DocsWorking`, `EMI_PAY_DocumentIndex`, `EMI_PAY_ChecklistItems`; có thể điều chỉnh phần cho phép của `Requests` | DOC + kênh cập nhật an toàn | DOC/DYN/UI |
| **A10** | BPCM1 | Gửi lại hồ sơ | Hoàn tất bổ sung, đã đáp ứng điều kiện, vẫn cùng Master Record | `Commands`, `Requests`, `WorkItems`, `ActivityPublic` | `SUBMIT`; tăng `ReviewRound` **một lần**, quay lại **BPCM2** | CORE |
| **A11** | BPCM1 | Xem lịch sử các lần gửi/trả lại | Chỉ hồ sơ thuộc phạm vi | Đọc `ActivityPublic`, `WorkItems`, `StepReviews`, `DocumentIndex` | UI timeline theo `RequestKey`/`ReviewRound` | UI/DYN |

### 3.2. Giai đoạn BPCM2 – kiểm tra kỹ thuật

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **B01** | BPCM2 được giao | Xem danh sách hồ sơ chờ kiểm tra kỹ thuật | WorkItem `OPEN` tại `BPCM2_TECH` của mình/OU được giao | Đọc `EMI_PAY_WorkItems`, `EMI_PAY_Assignments`, `EMI_PAY_Requests` | UI “Công việc của tôi” | UI/DYN |
| **B02** | BPCM2 được giao | Tiếp nhận và mở hồ sơ, xem tài liệu | Đúng công việc hiện hành; đúng `ReviewRound` | Đọc `Requests`, `DocsWorking`, `DocumentIndex`, `ChecklistItems` | UI/Document module | DOC/DYN/UI |
| **B03** | BPCM2 được giao | Bổ sung tài liệu đính kèm phục vụ kiểm tra (nếu có) | Đúng phạm vi tài liệu của BPCM2; không sửa tài liệu thuộc bộ phận khác | `DocsInternal` hoặc `DocsWorking` theo phân loại; `DocumentIndex` | Upload/index qua DOC | DOC/DYN |
| **B04** | BPCM2 được giao | Đánh dấu tài liệu đạt/chưa đạt và ghi lý do | Từng checklist item thuộc lượt kiểm tra hiện tại | Ghi `EMI_PAY_StepReviews`; đọc `ChecklistItems`/`DocumentIndex` | Tác vụ kiểm tra tài liệu chi tiết | DOC/UI; Main Flow đọc kết quả |
| **B05** | BPCM2 được giao | Chấp nhận kết quả kỹ thuật | Hồ sơ tại `BPCM2_TECH`, thỏa điều kiện, người được phân công | `Commands` → đóng `WorkItems` hiện tại; cập nhật `Requests`; mở WorkItem BPCM3; ghi `ActivityPublic` | `DECIDE = PASS` → `BPCM3_PRICE` | CORE |
| **B06** | BPCM2 được giao | Từ chối/không đạt, nêu lý do | Lý do bắt buộc, không tự chỉnh Master Record trái thẩm quyền | `Commands`, `WorkItems`, `Requests`, `ActivityPublic`, kết quả tài liệu liên quan | `DECIDE = REJECT` → **BPCM1** | CORE |

### 3.3. Giai đoạn BPCM3 – kiểm tra giá

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **C01** | BPCM3 được giao | Xem công việc/hồ sơ đến bước kiểm tra giá | WorkItem hiện tại `BPCM3_PRICE` | `WorkItems`, `Assignments`, `Requests`, `DocumentIndex` | UI/DYN | UI/DYN |
| **C02** | BPCM3 được giao | Xem tài liệu và bổ sung tài liệu của bộ phận (nếu có) | Quyền theo hồ sơ và phân loại tài liệu | `DocsWorking`/`DocsInternal`, `DocumentIndex` | DOC | DOC/DYN |
| **C03** | BPCM3 được giao | Ghi đánh giá tài liệu/giá và lý do không đạt | Đúng bước/lượt; không sửa kết quả của BPCM2 | `StepReviews` và tài liệu liên quan | DOC; Main Flow dùng kết quả kiểm tra làm điều kiện | DOC/UI |
| **C04** | BPCM3 được giao | Chấp nhận kiểm tra giá | Đủ điều kiện và đúng người xử lý | `Commands` → `Requests`, `WorkItems`, `ActivityPublic` | `DECIDE = PASS` → `TCKT_CHECK` | CORE |
| **C05** | BPCM3 được giao | Từ chối kiểm tra giá, nêu lý do | Yêu cầu lý do cụ thể | `Commands`, `Requests`, `WorkItems`, `ActivityPublic` | `DECIDE = REJECT` → **BPCM1** | CORE |

### 3.4. Giai đoạn TCKT – kiểm tra hồ sơ thanh toán

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **D01** | TCKT được giao bước kiểm tra | Nhận/xem hồ sơ thanh toán | `TCKT_CHECK`, WorkItem hiện hành | `WorkItems`, `Requests`, `DocumentIndex`, `ChecklistItems` | UI/DYN | UI/DYN |
| **D02** | TCKT được giao | Kiểm tra chứng từ tài chính, bổ sung tài liệu nội bộ nếu cần | Đúng phạm vi, không tự thay chứng từ người khác | `StepReviews`, `DocsInternal`, `DocumentIndex`, `DocsWorking` | DOC | DOC/DYN |
| **D03** | TCKT được giao | Chấp nhận hồ sơ thanh toán | Checklist và các điều kiện hợp lệ | `Commands` → `Requests`, `WorkItems`, `ActivityPublic` | `DECIDE = PASS` → `CHAIR_APPROVE` | CORE |
| **D04** | TCKT được giao | Không đạt, trả hồ sơ về bộ phận lập | Phải có lý do/tài liệu chưa đạt | `Commands`, `Requests`, `WorkItems`, `ActivityPublic`, `StepReviews` | `DECIDE = REJECT` → **BPCM1** | CORE |

### 3.5. Giai đoạn CT.HĐQT – phê duyệt

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **E01** | CT.HĐQT có thẩm quyền, được giao | Xem hồ sơ trình duyệt và lịch sử kiểm tra | Hồ sơ ở `CHAIR_APPROVE`, đúng chủ thể duyệt | `Requests`, `WorkItems`, `ActivityPublic`, `DocumentIndex`, các tài liệu được cấp quyền | UI/DYN | UI/DYN |
| **E02** | CT.HĐQT có thẩm quyền | Phê duyệt hồ sơ | Đúng bước/lượt, đủ điều kiện; không có sai lệch trạng thái | `Commands` → `Requests`, `WorkItems`, `ActivityPublic` | `DECIDE = PASS` → `TCKT_PAY` | CORE |
| **E03** | CT.HĐQT có thẩm quyền | Không phê duyệt và ghi lý do | Ghi rõ lý do, giữ lịch sử duyệt cũ | `Commands`, `Requests`, `WorkItems`, `ActivityPublic` | `DECIDE = REJECT` → **BPCM1** | CORE |
| **E04** | CT.HĐQT có thẩm quyền | Cập nhật thời hạn thanh toán khi duyệt | Yêu cầu trên BPMN; **schema hiện tại chưa có `PaymentDueAt`** | Dự kiến trường thời hạn thanh toán trên `Requests` hoặc trường được phê duyệt khác | **Chưa thể hoàn thiện lưu dữ liệu trước khi thống nhất trường** | Bổ sung schema/CORE |

### 3.6. Giai đoạn TCKT – thực hiện thanh toán và UNC

| ID | Người thao tác | Hành động nghiệp vụ | Điều kiện / phạm vi | Thành phần đọc/ghi của hệ thống | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **F01** | TCKT được giao bước thanh toán | Nhận hồ sơ đã được CT.HĐQT duyệt | WorkItem `TCKT_PAY` hiện hành | `WorkItems`, `Assignments`, `Requests`, `ActivityPublic` | UI/DYN | UI/DYN |
| **F02** | TCKT có thẩm quyền thanh toán ngoài hệ thống | Thực hiện thanh toán theo quy trình tài chính/ngân hàng | Bên ngoài EMI PAY; thẩm quyền ngân hàng tuân theo quy định riêng | **Không phát sinh lệnh chuyển tiền trong SharePoint** | Nghiệp vụ bên ngoài | N/A |
| **F03** | TCKT được giao | Tải UNC/chứng từ thanh toán lên hồ sơ | UNC thuộc đúng `RequestKey`, là bản hiện hành, có link tệp | `DocsWorking` (hoặc thư viện được chỉ định), `DocumentIndex` với `DocClass` phù hợp | DOC | DOC/DYN |
| **F04** | TCKT được giao | Xác nhận đã thanh toán | Chỉ tại `TCKT_PAY`; UNC hợp lệ theo `DocumentIndex`, xác minh người thao tác | `Commands` → `Requests.PaidAt`, `WorkItems`, `ActivityPublic`, sinh yêu cầu tại `ArchiveJobs` khi module nối | `CONFIRM_PAYMENT` → `ARCHIVE_PENDING` | CORE |
| **F05** | TCKT được giao | Xem trạng thái lưu trữ, lỗi nếu có | Chỉ hồ sơ thuộc phạm vi, không tự đánh dấu hoàn tất | `Requests`, `ArchiveJobs`, `ActivityPublic` | UI trạng thái chờ | UI/ARC |

### 3.7. Hệ thống – điều phối, lưu trữ, thông báo

| ID | Chủ thể thực hiện | Hành động hệ thống | Điều kiện / phạm vi | Thành phần đọc/ghi | Lệnh hoặc cách xử lý | Phạm vi |
|---|---|---|---|---|---|---|
| **S01** | Main Flow qua kết nối dịch vụ | Nhận lệnh mới | `Commands.State = NEW`, trigger item created | Đọc `Commands` | SharePoint trigger | CORE |
| **S02** | Main Flow | Kiểm tra lệnh trùng và nhận xử lý | `CommandKey`, `DedupeKey`, ETag/State hợp lệ | Đọc/ghi `Commands` | `NEW → PROCESSING` hoặc từ chối/không chạy lại | CORE |
| **S03** | Main Flow | Xác định hồ sơ, bước, phiên bản, nơi nhận | Một `RequestKey` chính xác, cấu hình có hiệu lực | Đọc `Requests`, `WorkflowVersions`, `WorkflowSteps`, `StepRecipients`, `WorkItems` | Đọc cấu hình | CORE |
| **S04** | Main Flow | Xác minh người gọi và quyền nghiệp vụ | Không tin `ActorUPN` tự khai; kiểm tra người tạo lệnh đáng tin, phân công và trạng thái | `Commands.Author`, `OrgMembers`, `Assignments`, `WorkItems`, `Requests` | Gate thẩm quyền | CORE; DYN để vận hành thật |
| **S05** | Main Flow | Xác minh điều kiện tài liệu và UNC | Checklist bắt buộc; UNC cho lệnh xác nhận thanh toán | Đọc `ChecklistItems`, `DocumentIndex`, `StepReviews` khi cần | Gate nghiệp vụ | CORE; DOC cung cấp dữ liệu |
| **S06** | Main Flow | Chọn bước mới hoặc trả về BPCM1 | Đúng bước, đúng lượt, đúng kết quả | Đọc `WorkflowSteps`, cập nhật `Requests` | `SUBMIT`/`DECIDE`/`CONFIRM_PAYMENT` | CORE |
| **S07** | Main Flow | Tạo/đóng công việc; duy trì lịch sử lượt bước | `StepInstanceKey` duy nhất, không tạo trùng khi retry | Ghi `WorkItems`, có thể ghi `Assignments` theo mô hình phân công | Điều phối WorkItem | CORE |
| **S08** | Main Flow | Ghi nhật ký sự kiện và lỗi | `ActivityKey`/`CommandKey` duy nhất; không nhân đôi log | Ghi `ActivityPublic`, `ActivityInternal` khi cần; cập nhật `Commands` | Log + trạng thái `SUCCEEDED`/`REJECTED`/`FAILED` | CORE |
| **S09** | Document & Checklist | Đồng bộ tài liệu, phiên bản, chỉ mục, checklist | Quyền trên hồ sơ và thư viện đã bảo đảm | `DocsWorking`, `DocsInternal`, `DocumentIndex`, `ChecklistItems`, `StepReviews` | Module/Subflow | DOC – sau |
| **S10** | Dynamic Permission | Cấp/thu hồi quyền hồ sơ và tài liệu | Dựa vào hồ sơ, OU, phân công, tình trạng xử lý; tránh lộ dữ liệu liên pháp nhân | ACL item `Requests`, ACL folder/file ở 4 Libraries và các list dữ liệu liên quan | Module/Subflow | DYN – sau, bắt buộc trước go-live |
| **S11** | Archive Manager | Chuyển tài liệu, đối chiếu và xác nhận lưu trữ | Chỉ sau `ARCHIVE_PENDING`; không được tự ý phê duyệt | `ArchiveJobs`, `ArchiveCompleted`/`ArchiveCancelled`, `DocumentIndex`, kết quả trả cho Main Flow | `ARCHIVE_RESULT` (đề xuất khi nối) | ARC – sau |
| **S12** | Main Flow | Hoàn tất hồ sơ khi lưu trữ thành công | Chỉ khi kết quả lưu trữ từ nguồn được xác thực | `Requests.ArchiveStatus`, `Requests.ArchivedAt`, `ActivityPublic` | `COMPLETED` theo nhánh kết quả Archive | CORE (điểm kết nối) + ARC |
| **S13** | Notification Manager | Thông báo giao việc, trả hồ sơ, duyệt, thanh toán, hoàn tất | Sự kiện hợp lệ, người nhận đúng | `Notifications`; kết nối Email/Teams | Event consumer | NOTI – sau |

### 3.8. Quản trị hệ thống, cấu hình và kiểm toán

| ID | Người thao tác | Hành động | Thành phần dữ liệu | Quyền SharePoint tĩnh hiện có | Ranh giới |
|---|---|---|---|---|---|
| **M01** | `GR-PAY-PROCADM` | Quản trị danh mục loại hồ sơ | `EMI_PAY_PaymentTypes` | `Contribute` | Không tự duyệt hồ sơ kinh doanh |
| **M02** | `GR-PAY-PROCADM` | Quản trị phòng ban và người thuộc đơn vị | `EMI_PAY_OrgUnits`, `EMI_PAY_OrgMembers` | `Contribute` | Dữ liệu nhân sự phải được kiểm chứng theo thực tế |
| **M03** | `GR-PAY-PROCADM` | Quản trị phiên bản và các bước quy trình | `EMI_PAY_WorkflowVersions`, `EMI_PAY_WorkflowSteps` | `Contribute` | Không sửa hồi tố phiên bản đang gắn với hồ sơ đã phát sinh |
| **M04** | `GR-PAY-PROCADM` | Cấu hình checklist và nơi nhận từng bước | `EMI_PAY_ChecklistTemplates`, `EMI_PAY_StepRecipients` | `Contribute` | Chỉ ban hành cấu hình sau khi rà soát nghiệp vụ |
| **M05** | `GR-PAY-SYSADM`/Site Owners | Quản trị tham số hệ thống, ACL, kết nối và triển khai | `EMI_PAY_SystemSettings` và phạm vi hệ thống | `Full Control` | Không mặc nhiên có quyền ký/phê duyệt nghiệp vụ |
| **M06** | Danh tính Flow có quyền hợp lệ | Đọc cấu hình, ghi bản ghi nghiệp vụ | 23 thành phần theo ma trận và nhu cầu Flow | `GR-PAY-FLOW-SVC` cấp `Full Control` cho 23 thành phần; **phải xác minh tài khoản kết nối** | Ghi qua Flow, không qua danh tính người dùng tự khai |
| **M07** | `GR-PAY-AUDIT` | Xem nhật ký nội bộ để kiểm tra | `EMI_PAY_ActivityInternal` | `Read` trực tiếp | Chưa có quyền đọc tất cả hồ sơ/tài liệu |
| **M08** | `GR-PAY-SYSADM` hoặc người vận hành được ủy quyền | Kiểm tra, xử lý lỗi/reconcile lệnh, phục hồi có kiểm soát | `Commands`, `ActivityInternal`, `WorkItems`, `Requests` và báo cáo vận hành | Full Control theo nhóm quản trị | Chỉ khắc phục kỹ thuật; không được tự làm sai lệch quyết định nghiệp vụ |

## 4. Quyền truy cập tĩnh hiện tại – không được nhầm với quyền thao tác workflow

### 4.1. Tổng hợp quyền đã PASS V1.9.1

| Nhóm SharePoint | Danh mục cấu hình (7 Lists) | `SystemSettings` | Các Lists/Thư viện nghiệp vụ còn lại | Ý nghĩa |
|---|---|---|---|---|
| Site Owners (`cecm Chủ sở hữu`) | Full Control | Full Control | Full Control | Quản trị kỹ thuật |
| `GR-PAY-SYSADM` | Full Control | Full Control | Full Control | Quản trị hệ thống |
| `GR-PAY-FLOW-SVC` | Full Control | Full Control | Full Control | Nhóm được chuẩn bị cho danh tính thực thi Flow |
| `GR-PAY-PROCADM` | Contribute | **Không cấp** | **Không cấp** | Quản trị cấu hình quy trình |
| `GR-PAY-CHAIR` | Không cấp | Không cấp | Không cấp | Chưa có quyền dữ liệu động cấp theo hồ sơ |
| `GR-PAY-TCKT` | Không cấp | Không cấp | Không cấp | Chưa có quyền dữ liệu động cấp theo hồ sơ |
| `GR-PAY-USERS` | Không cấp | Không cấp | Không cấp | Chưa có quyền dữ liệu động cấp theo hồ sơ |
| `GR-PAY-AUDIT` | Không cấp | Không cấp | **Read riêng `ActivityInternal`**; các nơi khác không cấp | Chỉ đọc nhật ký nội bộ |

*“Không cấp” ở bảng trên là không có Role Assignment **trực tiếp ở cấp List/Library** theo ma trận đã nghiệm thu, không phải tuyên bố rằng không thể tồn tại quyền hiệu lực do site owner, tài khoản quản trị, chia sẻ item hoặc các cơ chế khác. Hiện chưa nghiệm thu kiểm thử bằng người dùng cuối.*

### 4.2. Danh sách đầy đủ 23 thành phần và vai trò sử dụng

| # | Thành phần (tên kỹ thuật) | Mục đích | Ai sử dụng về mặt nghiệp vụ | Ai ghi trực tiếp trong thiết kế vận hành | Trạng thái |
|---|---|---|---|---|---|
| 01 | `EMI_PAY_PaymentTypes` | Danh mục loại hồ sơ | BPCM1 tra cứu; PROC Admin quản trị | PROC Admin; SYSADM/Flow có quyền | CFG |
| 02 | `EMI_PAY_OrgUnits` | Danh mục phòng ban | Tất cả bước tra cứu phân công | PROC Admin; SYSADM/Flow | CFG |
| 03 | `EMI_PAY_OrgMembers` | Thành viên phòng ban | Main Flow đối chiếu tư cách người xử lý | PROC Admin; SYSADM/Flow | CFG |
| 04 | `EMI_PAY_WorkflowVersions` | Phiên bản quy trình | Main Flow tham chiếu | PROC Admin; SYSADM/Flow | CFG |
| 05 | `EMI_PAY_WorkflowSteps` | Danh mục 7 bước | Main Flow tìm bước tiếp theo | PROC Admin; SYSADM/Flow | CFG |
| 06 | `EMI_PAY_ChecklistTemplates` | Mẫu checklist theo loại hồ sơ | BPCM1 và các bước kiểm tra | PROC Admin; SYSADM/Flow | CFG/DOC |
| 07 | `EMI_PAY_StepRecipients` | Đơn vị nhận từng bước | Main Flow định tuyến | PROC Admin; SYSADM/Flow | CFG |
| 08 | `EMI_PAY_SystemSettings` | Tham số kỹ thuật hệ thống | SYSADM/Flow | **Chỉ SYSADM, Owners, Flow**; không PROC Admin | CFG |
| 09 | `EMI_PAY_Commands` | Hàng đợi lệnh nghiệp vụ | BPCM1/2/3, TCKT, CHAIR qua cổng xác thực | **Cổng dịch vụ/Flow**, không cấp ghi trực tiếp đại trà | CORE/DYN |
| 10 | `EMI_PAY_Requests` | **Master Record** | Tất cả vai trò được phân công xem phần của mình | Main Flow; không để user sửa trực tiếp trạng thái | CORE/DYN |
| 11 | `EMI_PAY_WorkItems` | Công việc theo từng bước/lượt | BPCM1/2/3, TCKT, CHAIR xem/ra quyết định qua workflow | Main Flow | CORE/DYN |
| 12 | `EMI_PAY_Assignments` | Phân công nhân sự vào WorkItem | Người/bộ phận được phân công; người quản lý có thẩm quyền | Main Flow hoặc tác vụ phân công được xác thực | CORE/DYN |
| 13 | `EMI_PAY_StepReviews` | Kết quả kiểm tra từng checklist item | BPCM2/3, TCKT khi kiểm tra | Module DOC/dịch vụ được phân quyền | DOC |
| 14 | `EMI_PAY_ChecklistItems` | Checklist thực tế của từng hồ sơ | BPCM1 và các bộ phận kiểm tra | Main Flow/module DOC | CORE/DOC |
| 15 | `EMI_PAY_DocumentIndex` | Chỉ mục tệp đính kèm và UNC | Người lập, bộ phận kiểm tra, TCKT, CHAIR trong phạm vi | Module DOC/Archive qua dịch vụ | DOC/ARC |
| 16 | `EMI_PAY_DocsWorking` | Tài liệu hồ sơ đang xử lý | Người tạo và bộ phận được phân công | Module upload dịch vụ hoặc người được cấp ACL động phù hợp | DOC/DYN |
| 17 | `EMI_PAY_DocsInternal` | Tài liệu nội bộ bộ phận | Chỉ đúng đơn vị/tài liệu có thẩm quyền | Module DOC theo phân loại/ACL | DOC/DYN |
| 18 | `EMI_PAY_ActivityPublic` | Nhật ký tiến trình hiển thị theo hồ sơ | Người được xem hồ sơ | Main Flow | CORE/DYN |
| 19 | `EMI_PAY_ActivityInternal` | Nhật ký kỹ thuật, thay đổi nội bộ | SYSADM; AUDIT được đọc | Main Flow/Flow xử lý lỗi | CORE |
| 20 | `EMI_PAY_ArchiveJobs` | Lệnh/công việc lưu trữ | Main Flow và Archive Manager | Main Flow/Archive Manager | ARC |
| 21 | `EMI_PAY_ArchiveCompleted` | Kho hồ sơ đã hoàn tất | Người có quyền tra cứu hậu kiểm | Archive Manager | ARC/DYN |
| 22 | `EMI_PAY_ArchiveCancelled` | Kho hồ sơ hủy | Quản trị/nhân sự được cấp quyền riêng | Archive Manager | ARC/DYN; **chưa có lệnh hủy Core** |
| 23 | `EMI_PAY_Notifications` | Thông báo hệ thống và trạng thái gửi | Người nhận thông báo theo hồ sơ | Notification Manager | NOTI |

**Quyền PROCADM `Contribute` theo mặc định SharePoint có thể bao gồm xóa item trong danh mục cấu hình.** Nếu cần cấm xóa hoặc kiểm soát thay đổi cấu hình đã ban hành, đó là yêu cầu bổ sung về Permission Level/quản trị phiên bản; RBAC tĩnh V1.9.1 hiện đã được nghiệm thu theo mức quyền nêu trên.

## 5. Ma trận “Được phép / Không được phép” theo vai trò

| Vai trò | Được phép khi đủ điều kiện nghiệp vụ | Không được phép trong nghiệp vụ | Tình trạng quyền người dùng hiện tại |
|---|---|---|---|
| BPCM1 | Tạo, bổ sung hồ sơ của mình, gửi, sửa khi bị trả, gửi lại, theo dõi | Duyệt thay BPCM2/BPCM3/TCKT/CHAIR; tự chuyển trạng thái hoặc tự hoàn tất | Chưa có ACL động/gateway/UI hoàn chỉnh |
| BPCM2 | Xem/kiểm tra kỹ thuật tại bước được giao; PASS/REJECT có lý do | Duyệt giá, tài chính, thanh toán, phê duyệt CHAIR; sửa bước khác | Chưa có ACL động/gateway/UI hoàn chỉnh |
| BPCM3 | Xem/kiểm tra giá tại bước được giao; PASS/REJECT có lý do | Duyệt kỹ thuật thay BPCM2, phê duyệt thanh toán, tự sửa Master | Chưa có ACL động/gateway/UI hoàn chỉnh |
| TCKT kiểm tra | Kiểm tra hồ sơ tài chính; PASS/REJECT đúng `TCKT_CHECK` | Duyệt thay CHAIR; xác nhận thanh toán khi chưa đến `TCKT_PAY` | Chưa có ACL động/gateway/UI hoàn chỉnh |
| CT.HĐQT | Duyệt/không duyệt ở `CHAIR_APPROVE` trên hồ sơ được trình | Sửa chứng từ, tự đánh dấu đã thanh toán, tự can thiệp nhật ký | Chưa có ACL động/gateway/UI hoàn chỉnh |
| TCKT thanh toán | Nhận hồ sơ duyệt, tải UNC, xác nhận thanh toán ở `TCKT_PAY` | Duyệt thay CHAIR; xác nhận khi thiếu UNC; tự đánh dấu đã lưu trữ | Chưa có ACL động/gateway/UI hoàn chỉnh |
| PROC Admin | Sửa danh mục, người nhận, cấu hình workflow/checklist được cấp | Sửa `SystemSettings`; phê duyệt thay vai trò nghiệp vụ | Có ACL tĩnh tại 7 danh mục cấu hình |
| SYSADM / Owners | Quản trị kỹ thuật, xử lý lỗi có ghi nhận | Dùng quyền admin làm bằng chứng phê duyệt nghiệp vụ | Có Full Control về kỹ thuật |
| AUDIT | Đọc nhật ký nội bộ; đề nghị tra cứu thêm theo thủ tục | Sửa hồ sơ, duyệt, cấp quyền, thay quyết định | Read tĩnh trên `ActivityInternal` |
| Main Flow / Flow service | Xác minh và thực thi chuyển trạng thái hợp lệ, ghi log, chống trùng | Tin payload tự khai danh tính; tự quyết định thay người dùng; hoàn tất khi lưu trữ chưa xong | ACL tĩnh chuẩn bị cho dịch vụ; connection identity cần kiểm chứng |

## 6. Lệnh Core, điểm kiểm tra thẩm quyền và tác động lên dữ liệu

| Lệnh dự kiến | Vai trò nghiệp vụ có thể yêu cầu | Khi nào hợp lệ | Tác động chính trong Main Flow | Nhánh từ chối/error |
|---|---|---|---|---|
| `CREATE_REQUEST` | BPCM1 có thẩm quyền khởi tạo | Định danh được xác thực, đúng OU, `RequestKey` chưa tồn tại | Tạo duy nhất 1 `Requests`; ghi sự kiện | Không tạo hồ sơ trùng `RequestKey`/`DedupeKey` |
| `SUBMIT` | BPCM1 được giao | Hồ sơ tại BPCM1, ở `DRAFT`/`RETURNED`, checklist đủ | `Requests → BPCM2`; mở WorkItem; khi gửi lại tăng `ReviewRound` đúng một lần | Thiếu tài liệu hoặc sai trạng thái → REJECTED, không chuyển bước |
| `DECIDE` + `PASS` | BPCM2, BPCM3, TCKT kiểm tra, CHAIR **đúng bước** | `CurrentStepKey` đúng, WorkItem hiện hành, đúng người được giao, kiểm tra đủ điều kiện | Đóng công việc cũ, mở bước kế tiếp, ghi nhật ký | Sai bước/người/lượt → từ chối |
| `DECIDE` + `REJECT` | Các vai trò trên **đúng bước** | Có lý do; đúng công việc hiện tại | Đóng công việc cũ, **trả BPCM1**, ghi lý do và lượt xử lý | Thiếu lý do hoặc hồ sơ đã đổi bước → từ chối |
| `CONFIRM_PAYMENT` | TCKT thanh toán được giao | Đã qua CHAIR, bước `TCKT_PAY`, có UNC hợp lệ | Cập nhật thanh toán; đưa về `ARCHIVE_PENDING`; tạo tín hiệu lưu trữ | Thiếu UNC hoặc chưa đến bước → từ chối |
| `ARCHIVE_RESULT` (**sau**) | **Archive Manager đã xác thực**, không phải người dùng thường | Có `ArchiveJob` hợp lệ và kết quả xử lý kho lưu trữ | Main Flow hoàn tất chỉ khi archive thành công | Archive lỗi → giữ chờ, ghi retry/error, **không** `COMPLETED` |

**Điểm kiểm tra chung của mọi lệnh:** người gọi có nguồn tin cậy; hồ sơ còn ở đúng trạng thái; `RequestKey`, `CurrentStepKey`, `CurrentStepInstanceKey`, `ReviewRound` nhất quán; phân công/role hợp lệ; `DedupeKey` chưa được xử lý; các điều kiện tài liệu/UNC tương ứng đạt. Các lệnh Core đang là **hợp đồng kỹ thuật đề xuất**, không có nghĩa người dùng đã có cổng gọi trực tiếp.

## 7. Mapping các trường đã có trong schema thực tế

| Đối tượng | Trường nghiệp vụ đã xác nhận tồn tại | Chức năng liên quan |
|---|---|---|
| `EMI_PAY_Requests` | `RequestKey`, `RequestCode`, `CreatedOUCode`, `CreatorUPN`, `PaymentTypeCode`, `Amount`, `Explanation`, `WorkflowCode`, `ChecklistVersion`, `ReviewRound`, `CurrentStepKey`, `CurrentStepInstanceKey`, `CurrentOUCode`, `Status`, `IsLocked`, `ArchiveStatus`, `FirstSubmittedAt`, `PaidAt`, `ArchivedAt` | Một Master Record và trạng thái |
| `EMI_PAY_Commands` | `RequestKey`, `CommandKey`, `StepInstanceKey`, `CommandType`, `PayloadJson`, `State`, `DedupeKey`, `ProcessedAt`, `ErrorMessage` | Yêu cầu/thực thi thao tác |
| `EMI_PAY_WorkItems` | `RequestKey`, `StepInstanceKey`, `ReviewRound`, `StepKey`, `StepOrder`, `StepKind`, `ResponsibleOUCode`, `ManagerUPN`, `State`, `AcceptedByUPN`, `AcceptedAt`, `DueAt`, `ClosedAt`, `Decision`, `DecisionNote` | Giao việc, tiếp nhận, quyết định |
| `EMI_PAY_Assignments` | `StepInstanceKey`, `StaffUPN`, `AssignedByUPN`, `AssignedAt`, `RemovedAt`, `IsActive` | Người được phân công thực tế |
| `EMI_PAY_StepReviews` | `RequestKey`, `StepInstanceKey`, `ReviewRound`, `ChecklistItemKey`, `Result`, `Reason`, `ReviewedByUPN`, `ReviewedAt` | Kiểm tra tài liệu chi tiết |
| `EMI_PAY_ChecklistItems` | `RequestKey`, `ChecklistItemKey`, `ItemCode`, `IsRequired`, `MinFileCount`, `UploadedCount`, `ItemStatus`, `IsLocked` | Điều kiện tài liệu |
| `EMI_PAY_DocumentIndex` | `RequestKey`, `DocumentKey`, `StepInstanceKey`, `ChecklistItemKey`, `DocClass`, `Visibility`, `FileName`, `LibraryName`, `DriveItemId`, `FileUrl`, `UploadedByUPN`, `IsCurrent`, `IsArchived`, `ArchiveLocation` | Chỉ mục chứng từ và UNC |
| `EMI_PAY_ActivityPublic` | `RequestKey`, `ActivityKey`, `StepInstanceKey`, `ReviewRound`, `EventType`, `EventTime`, `ActorUPN`, `FromState`, `ToState`, `Note`, `DetailsJson` | Timeline hồ sơ |
| `EMI_PAY_ActivityInternal` | `RequestKey`, `ActivityKey`, `StepInstanceKey`, `OUCode`, `ReviewRound`, `EventType`, `EventTime`, `ActorUPN`, `FieldName`, `OldValue`, `NewValue`, `Reason` | Truy vết nội bộ |
| `EMI_PAY_StepRecipients` | `WorkflowCode`, `VersionNo`, `StepKey`, `OUCode`, `IsDefault` | Định tuyến bước |

**Các điểm chưa chốt schema hoặc chưa có trong bản xuất:** `PaymentDueAt`, `PaymentLECode`, `WorkflowVersionNo` trong `Requests` (đều đã từng được đề xuất, chưa được xác nhận là đã tạo); cách khóa phiên bản quy trình cho hồ sơ; giá trị Choice thực tế; định danh gateway người dùng thực; mã OU/người nhận thực tế. Riêng `DueAt` **đã tồn tại trên `WorkItems`** nhưng không mặc nhiên thay thế được thời hạn thanh toán ở hồ sơ.

## 8. Cơ chế phân quyền và cách triển khai để không bị vượt quyền

1. **Không mở `EMI_PAY_Commands` cho tất cả người dùng.** Về sau cần cổng gửi lệnh xác thực dùng danh tính thật của người thao tác; chỉ dịch vụ đã được cấp quyền mới ghi lệnh vào List.
2. **Không coi `ActorUPN`/`PayloadJson` là bằng chứng danh tính.** Trong Pilot chỉ chấp nhận lệnh phát bởi tài khoản quản trị nằm trong allowlist; khi đưa vào sử dụng phải kiểm tra nguồn tạo lệnh, tổ chức, bước và phân công.
3. **Không cho user cập nhật trực tiếp `Requests.CurrentStepKey`, `Status`, `WorkItems.Decision`, `PaidAt` hoặc Activity Log.** Các chuyển trạng thái phải qua Main Flow.
4. **Không lấy việc ẩn nút trong SPFx làm bảo mật.** Người dùng chỉ xem được tệp/item khi ACL thật đã được cấp, hoặc qua một dịch vụ có kiểm soát quyền phù hợp.
5. **Đối với tài liệu nội bộ**, quyền xem phải xét `Visibility`/phòng ban; không tự mở cho toàn bộ người trong quy trình.
6. **RBAC tĩnh** 23/23 đã PASS chỉ là điều kiện nền. **Dynamic Permission** và kiểm thử người dùng thật vẫn là điều kiện trước go-live.
7. Các thay đổi RBAC hay cấu hình phải được ghi lại; quản trị viên kỹ thuật không mặc nhiên là người duyệt hoặc người làm thanh toán.

## 9. Kịch bản kiểm thử nghiệp vụ theo vai trò (tham chiếu UAT)

| Mã | Kịch bản | Vai trò thử | Kết quả phải đạt | Điều kiện để kiểm thử thực tế |
|---|---|---|---|---|
| T01 | BPCM1 tạo hồ sơ hợp lệ | BPCM1 | 1 `RequestKey`, 1 Master Record; không nhân bản | Core + cổng thử tin cậy |
| T02 | BPCM1 gửi khi thiếu tài liệu bắt buộc | BPCM1 | Bị chặn, không chuyển bước | Core + checklist demo |
| T03 | BPCM1 gửi hợp lệ | BPCM1 | WorkItem BPCM2 mở, timeline ghi nhận | Core |
| T04 | BPCM2 PASS | BPCM2 | Tạo bước BPCM3, không vượt TCKT | Core + xác thực người xử lý |
| T05 | BPCM2 REJECT có lý do | BPCM2 | Trả BPCM1, giữ lịch sử và lý do | Core |
| T06 | BPCM3 REJECT | BPCM3 | Trả BPCM1, không quay về BPCM2 | Core |
| T07 | TCKT kiểm tra PASS/REJECT | TCKT kiểm tra | PASS→CHAIR; REJECT→BPCM1 | Core |
| T08 | CHAIR phê duyệt | CT.HĐQT | Sang `TCKT_PAY`, không mặc định đã thanh toán | Core |
| T09 | CHAIR từ chối | CT.HĐQT | Trả BPCM1 kèm lý do | Core |
| T10 | BPCM1 bổ sung và gửi lại | BPCM1 | Cùng Master, `ReviewRound` tăng 1, quay BPCM2 | Core + DOC cho file thật |
| T11 | TCKT xác nhận thanh toán khi chưa có UNC | TCKT thanh toán | Từ chối, hồ sơ không chờ lưu trữ | Core + chỉ mục UNC |
| T12 | TCKT xác nhận khi UNC hợp lệ | TCKT thanh toán | `ARCHIVE_PENDING`, không `COMPLETED` | Core |
| T13 | Replay `CommandKey`/`DedupeKey` đã chạy | Hệ thống thử nghiệm | Không nhân đôi Master/WorkItem/log | Core |
| T14 | Người không được giao gửi `DECIDE` | Người dùng khác | Lệnh bị từ chối, không đổi bước | Cổng xác thực + phân công |
| T15 | Người thuộc vai trò đúng nhưng sai bước gửi lệnh | TCKT/CHAIR | Lệnh bị từ chối | Core |
| T16 | Archive thất bại | Archive Manager | Vẫn chờ, có log/khả năng retry, không hoàn tất | ARC – sau |
| T17 | Archive thành công | Archive Manager | Chuyển `COMPLETED` đúng một lần | ARC – sau |
| T18 | Người ngoài phạm vi cố đọc hồ sơ qua URL/API | Người dùng không liên quan | Không đọc được dữ liệu được bảo vệ | DYN + UAT người dùng thật |
| T19 | PROCADM cố cập nhật `SystemSettings` | PROC Admin | Bị SharePoint từ chối | RBAC tĩnh hiện tại |
| T20 | AUDIT xem/sửa `ActivityInternal` | AUDIT | Đọc được, không sửa được | RBAC tĩnh + UAT người dùng thật |

## 10. Quyết định và công việc còn mở

**Đã chốt:** Quy trình BPMN 7 giai đoạn; 1 Master Record; 1 Main Flow/8 khối; bốn loại lệnh Core; từ chối trả về BPCM1; gửi lại BPCM2; TCKT thanh toán ngoài SharePoint và tải UNC; không đánh dấu hoàn tất khi chưa có Archive Result; RBAC tĩnh 23/23.

**Chưa chốt/triển khai:** gắn người thực vào BPCM1/2/3; kênh cập nhật nội dung Draft/Returned và upload file; cổng người dùng xác thực và Dynamic ACL; lưu thời hạn thanh toán; cấu hình Choice; Archive Manager và Notification Manager; nghiệm thu Solution ZIP trên tenant; kiểm thử quyền thực tế của người dùng.

> **Khuyến nghị triển khai:** Dùng bảng mục 3 làm **ma trận hành động nghiệp vụ** để thiết kế UI và kiểm thử; dùng mục 4 làm **ma trận truy cập dữ liệu hiện tại** để tránh cấp nhầm quyền; dùng mục 6 làm hợp đồng **Command/API** của Main Flow. Chỉ mở giao diện người dùng cuối sau khi cả ba lớp quyền được kiểm chứng.
