# EMI PAY – Model & nguyên tắc thực thi trên SharePoint + Power Automate

## 1. Một hồ sơ thanh toán = một Master Record

`EMI_PAY_Requests` chứa 1 bản ghi cho mỗi hồ sơ (`RequestKey` bất biến, `RequestCode` để hiển thị); không clone khi gửi, từ chối, rút hoặc gửi lại. `WorkflowCode` + `WorkflowVersion` + `ChecklistVersion` cố định từ lần gửi đầu.

**Config**: `EMI_PAY_OrgUnits`, `EMI_PAY_OrgMembers`, `EMI_PAY_PaymentTypes`, `EMI_PAY_WorkflowVersions`, `EMI_PAY_WorkflowSteps`, `EMI_PAY_StepRecipients`, `EMI_PAY_ChecklistTemplates`, `EMI_PAY_SystemSettings`.

**Runtime**: `EMI_PAY_Requests`, `EMI_PAY_ChecklistItems`, `EMI_PAY_WorkItems`, `EMI_PAY_Assignments`, `EMI_PAY_StepReviews`, `EMI_PAY_DocumentIndex`.

**Điều phối & lịch sử**: `EMI_PAY_Commands`, `EMI_PAY_ActivityPublic`, `EMI_PAY_ActivityInternal`, `EMI_PAY_Notifications`, `EMI_PAY_ArchiveJobs`.

**Thư viện**: `EMI_PAY_DocsWorking` (file checklist/tài liệu đã công khai), `EMI_PAY_DocsInternal` (tài liệu nội bộ chưa chốt), `EMI_PAY_ArchiveCompleted`, `EMI_PAY_ArchiveCancelled`.

## 2. Quan hệ quan trọng

- Một PaymentType có một mẫu checklist và tham chiếu một quy trình theo phiên bản.
- Một workflow-version có N bước; mỗi bước chọn **một** OU từ các phòng trong `StepRecipients`.
- Một hồ sơ có N mục checklist từ template **chụp tại thời điểm tạo hồ sơ**.
- Một hồ sơ có N WorkItems; một WorkItem có N Assignments (hỗ trợ nhiều nhân sự), N StepReviews (**một kết quả hiện tại cho mỗi mục checklist tại bước**).
- Một tài liệu có `DocumentKey`, `RequestKey`, `DocClass` và có thể có `StepInstanceKey` / `ChecklistItemKey`. File không bị clone khi chuyển bước. Sau lưu trữ, locator trong `DocumentIndex` cập nhật tới kho mới.
- ReviewRound tăng **chỉ khi hồ sơ bị trả về BPCM1 và người tạo gửi lại**. Hồ sơ gốc vẫn giữ nguyên.

## 3. Lưu ý bảo mật đặc biệt

*Không được đồng nhất quyền xem UI với quyền đọc file SharePoint.* Nhân sự chỉ được cập nhật các dữ liệu được giao, trưởng phòng (hoặc người ủy quyền) đóng bước. Người tạo xem tiến trình và kết luận đã chốt, không đọc Activity nội bộ và file nội bộ chưa chốt. CT-HĐQT được xem toàn bộ nhưng không chỉnh sửa. BPCM tiếp theo xem kết quả chính thức của bước trước, không thấy log nội bộ.

`ActivityInternal` và `DocsInternal` phải được phân quyền phù hợp theo `RequestKey`/`StepInstanceKey`/OU. Không cho người dùng nghiệp vụ trực tiếp sửa các List lõi nếu mọi hành động phải được ghi log. Đề nghị SPFx gửi **lệnh** vào `EMI_PAY_Commands`, flow xác thực `Created By` thực tế + vai trò + trạng thái + dữ liệu mới nhất trước khi thay đổi, chống xử lý trùng `DedupeKey`. `Activities` do danh tính dịch vụ ghi, người dùng thông thường chỉ đọc theo quyền.

Để khóa file khi bước gửi đi, quyền chỉnh sửa của tác nhân trước phải bị thu hồi ở SharePoint, không chỉ ẩn nút. Tương tự, sau khi đóng hồ sơ/đã hủy, quyền chỉ đọc phải được áp dụng ở cả thư viện đích. Cần kiểm chứng điều kiện bảo toàn phiên bản/metadata khi move giữa các thư viện.

## 4. Luồng nghiệp vụ tóm tắt

1. BPCM1 tạo hồ sơ, điền đơn vị/người tạo/số tiền/diễn giải và tải đủ checklist.
2. Người tạo gửi, xác nhận đúng phòng/Trưởng phòng **bước kế tiếp**, không cần biết toàn bộ tuyến.
3. Trưởng phòng tiếp nhận (bắt buộc đặt hạn xử lý) và tự làm hoặc giao N người dùng chung checklist. Một nhân sự làm hết là được.
4. Trưởng phòng sửa được đánh giá và quyết định cuối. Gửi tiếp chỉ khi toàn bộ checklist đạt; trả hồ sơ bất kỳ khi cần, phải ghi lý do, trực tiếp về BPCM1.
5. Tại BPCM1 chỉ sửa tài liệu checklist không đạt và thông tin chung bị yêu cầu chỉnh sửa. Gửi lại bắt đầu lại từ BPCM2 (ReviewRound mới).
6. Bên gửi chỉ được rút khi bên nhận chưa nhấn Tiếp nhận xử lý. Rút không tăng lượt kiểm tra.
7. CT-HĐQT chỉ Duyệt/Không duyệt, xem toàn bộ hồ sơ và log nếu cần.
8. TCKT xác nhận thanh toán sau khi xử lý bên ngoài, tải UNC và chọn đối tượng thông báo. Nhấn Xác nhận gửi thông báo ngay một lần.
9. Hệ thống khóa nghiệp vụ, chuyển **file** vào kho cấu hình, giữ Master Record tại List. Chỉ Completed khi archive thành công; lỗi tự retry, lỗi kéo dài báo admin.
10. Hủy chỉ khi Nháp/Returned, người tạo ghi lý do, không gửi thông báo hủy, chuyển file sang archive hủy và khóa.

## 5. Power Automate cần xây dựng (chưa có)

- `PAY-01-ExecuteCommand`: Trigger khi tạo `EMI_PAY_Commands`; validate role, ETag, command id, read current state; ghi data + activity + task + outbox.
- `PAY-02-ReminderWaitingAcceptance`: Recurrence nhắc Trưởng phòng chưa tiếp nhận theo cấu hình chung.
- `PAY-03-ReminderDue`: Recurrence nhắc Trưởng phòng/nhân sự được phân công trước hạn và quá hạn; trưởng phòng gia hạn có lý do.
- `PAY-04-SendNotification`: đọc outbox, chống gửi lặp và lưu kết quả gửi.
- `PAY-05-Archive`: xử lý ArchiveJob từng file, cập nhật DocumentIndex, kiểm tra đủ file rồi đóng hồ sơ.
- `PAY-06-ArchiveRetry`: retry theo số lần/giãn cách cấu hình, cảnh báo admin khi lỗi kéo dài.

Không dùng một flow dài chạy chờ suốt vòng đời. Các flow ngắn thực thi từng hành động, trạng thái được giữ bền trên SharePoint.

## 6. Chưa chốt và không được giả định

- Thông tin trưởng phòng, nhân sự, nhóm Entra/SharePoint và quan hệ OU/pháp nhân thật.
- Các loại hồ sơ, danh mục tài liệu và đường đi cụ thể.
- Quy tắc sinh mã hồ sơ/đánh số, nơi lưu trữ và thời gian nhắc việc.
- Ủy quyền/phê duyệt tài chính riêng của pháp nhân.
- Cấu hình Power Automate, SPFx, security, retry, concurrency và chính sách Purview thật.
