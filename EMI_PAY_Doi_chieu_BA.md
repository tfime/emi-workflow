# EMI PAY — Đối chiếu BA với phần đã làm

> Rà soát 12/11/2026 (cập nhật BA: duyệt nội bộ BPCM1 + RoutePlan). Nguồn: `BA.md`, quy tắc V1.0, Core Flow, `LivePayApp`.
>
> **Đủ trên live** nghĩa là lệnh hoặc màn hình đã nối dữ liệu thật. Dialog demo không tính là đã làm.
>
> **BA mới (đã chốt):** `SUBMIT` = trình TP (`AwaitingManager`); TP `DECIDE` PASS mới → BPCM2; OU các bước từ `RoutePlanJson`.

## Kết quả

| Trạng thái | Số đầu mục | Ý nghĩa |
|---|---:|---|
| Đủ trên live | 13 | Lệnh hoặc màn hình đã chạy với list thật |
| Một phần | 15 | Có dữ liệu hoặc form, chưa đủ quy tắc BA |
| Chưa có | 27 | Chưa có lệnh Core, chưa có màn hình live |
| **Tổng** | **55** | |

Core chỉ nhận bốn lệnh: `CREATE_REQUEST`, `SUBMIT`, `DECIDE`, `CONFIRM_PAYMENT`. Lệnh khác bị từ chối là `Unknown CommandType`.

Luồng một hồ sơ từ tạo đến chờ lưu trữ đã có trên tenant (`plan.md`, UAT Core tới 1.0.0.9). BA mục 8 ghi SPFx và Power Automate chưa nghiệm thu; bản đó cũ hơn `plan.md`. UAT giao diện trên trang EMI-Pay vẫn đang chờ (bước 8 trong kế hoạch port).

Khoảng trống chặn nhiều người dùng là quyền và vai trò. Nhân sự đúng bước hiện vẫn bấm được chuyển bước. Chưa có tiếp nhận, hạn xử lý, phân công nhiều người, hay quyền đọc theo từng hồ sơ.

## Theo nhóm

| Nhóm | Đủ | Một phần | Chưa có |
|---|---:|---:|---:|
| Khởi tạo | 4 | 4 | 0 |
| Quyết định bước | 5 | 1 | 0 |
| Phân công và ủy quyền | 0 | 0 | 7 |
| Checklist và tài liệu | 1 | 4 | 2 |
| Hạn và thông báo | 1 | 0 | 5 |
| Hủy và lưu trữ | 0 | 1 | 4 |
| Quyền và nhật ký | 1 | 2 | 3 |
| Màn hình | 1 | 3 | 6 |

## Việc cần có trước khi nhiều người cùng chạy

| Ưu tiên | Việc còn thiếu | Vì sao chặn |
|---:|---|---|
| 1 | Quyền động và cổng lệnh tin cậy | Không tin `ActorUPN`; cấp đọc/ghi theo hồ sơ trước go-live |
| 2 | Tách người xử lý và người chốt | Chỉ trưởng phòng hoặc người được ủy quyền được `DECIDE` |
| 3 | Tiếp nhận, hạn, phân công | WorkItem mở thẳng `InReview`, không có Assignments |
| 4 | Checklist theo bộ phận và lượt | Kết quả Đạt của BPCM2 không được ghi đè cho BPCM3 |
| 5 | Hủy, lưu trữ, thông báo | `Archiving` dừng ở trạng thái; chưa `COMPLETED`, chưa email |

`featureMap` đánh dấu tiếp nhận, phân công, ủy quyền, gia hạn và hủy là đã phủ. Các dialog đó nằm ở UI demo. Orchestrator không thực thi chúng.

## Đầu mục

### Khởi tạo

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Một Master Record xuyên suốt | Đủ | `CREATE_REQUEST` tạo `EMI_PAY_Requests` |
| BPCM1 trình TP rồi mới ra BPCM2 | Một phần | Đang triển khai: Status `AwaitingManager` + RoutePlan; Flow/UI theo plan |
| Pin RoutePlan StepKey→OU lúc tạo | Một phần | Schema `RoutePlanJson`; UI chọn từ StepRecipients |
| Chọn loại hồ sơ từ danh mục | Đủ | LivePayApp đọc PaymentTypes |
| Chặn gửi khi thiếu chứng từ bắt buộc | Đủ | Gate UI và Flow trước `SUBMIT` |
| Nhập đề nghị, pháp nhân, dự án | Một phần | Title, số tiền, diễn giải vá sau CREATE; chưa có trường pháp nhân và dự án |
| Sinh checklist theo loại hồ sơ | Một phần | Flow seed 2 mục; UI bù template. Chưa đồng bộ một kênh |
| Lưu và hoàn thiện bản nháp | Một phần | Có trạng thái Draft sau khi tạo, không có nháp trước lệnh |
| Khóa sửa khi bộ phận khác đang kiểm tra | Một phần | `IsLocked` khi SUBMIT; chưa có lệnh EDIT khi hồ sơ bị trả |

### Quyết định bước

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Chuyển BPCM2, BPCM3, TCKT kiểm tra, CT.HĐQT, TCKT thanh toán | Đủ | `DECIDE` PASS, Core 1.0.0.9 |
| Không đạt hoặc không duyệt thì trả về BPCM1 | Đủ | REJECT từ mọi bước kiểm tra và CT.HĐQT |
| Gửi lại cùng hồ sơ, tăng ReviewRound, vào lại BPCM2 | Đủ | `SUBMIT` từ Returned |
| CT.HĐQT cập nhật hạn thanh toán khi duyệt | Đủ | `paymentDueAt` bắt buộc lúc PASS |
| Tải UNC và xác nhận đã thanh toán | Đủ | `CONFIRM_PAYMENT` chỉ khi DocumentIndex có UNC |
| Lý do trả hồ sơ tra cứu được trên nhật ký | Một phần | UI bắt buộc lý do; ActivityPublic và ActivityInternal chưa ghi |

### Phân công và ủy quyền

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Trưởng phòng tiếp nhận và bắt buộc đặt hạn | Chưa có | Dialog chỉ có trên UI demo; không có lệnh ACCEPT |
| Giao một hoặc nhiều nhân sự | Chưa có | Không có Assignments trong luồng live |
| Thêm hoặc bỏ người, giữ kết quả đã kiểm tra | Chưa có | BA mục 6 |
| Nhân sự không được chốt DECIDE | Chưa có | LivePayApp cho mọi persona đúng bước quyền chuyển bước |
| Trưởng phòng chốt hoặc sửa đánh giá của bộ phận | Chưa có | Đánh giá ghi thẳng ChecklistItems, không có bước chốt |
| Ủy quyền quyết định theo phạm vi | Chưa có | BA chưa đặc tả màn hình, thời hạn, thu hồi |
| Rút hồ sơ khi chưa được tiếp nhận | Chưa có | WITHDRAW chỉ có trên mock `capability.ts` |

### Checklist và tài liệu

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Xem chứng từ trong hồ sơ | Đủ | Upload DocsWorking và drawer xem tệp |
| Đánh dấu Đạt hoặc Không đạt từng mục | Một phần | Ghi đè ItemStatus; chưa tách kết quả theo bộ phận |
| Ghi nhận xét và lý do không đạt | Một phần | StepReviews từ UI, không qua lệnh Core |
| Giữ kết quả theo lượt ReviewRound | Một phần | StepReviews có round; trạng thái mục dùng chung bị ghi đè |
| Bổ sung tài liệu nội bộ của bộ phận | Một phần | Upload có; chưa tách DocsInternal và phạm vi phòng |
| Giữ phiên bản khi thay tài liệu | Chưa có | Chưa quản lý IsCurrent và phiên bản cũ |
| Nhân sự báo hoàn thành phần việc | Chưa có | Không có trạng thái phần việc riêng trưởng phòng |

### Hạn và thông báo

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Hiển thị hạn thanh toán sau khi duyệt | Đủ | `Requests.PaymentDueAt` trên chi tiết |
| Đặt hạn xử lý lúc tiếp nhận | Chưa có | `WorkItems.DueAt` có trong thiết kế, chưa có thao tác |
| Gia hạn có lý do và lịch sử hạn cũ, hạn mới | Chưa có | Dialog gia hạn chỉ ở UI demo |
| Nhắc việc theo lịch | Chưa có | Scheduled subflow chưa làm |
| Cảnh báo quá hạn, không tự chuyển bước | Chưa có | Inbox không tính quá hạn theo hạn xử lý |
| Thông báo giao việc, trả hồ sơ, thanh toán | Chưa có | Không chọn người nhận lúc xác nhận UNC |

### Hủy và lưu trữ

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Trạng thái chờ lưu trữ sau khi thanh toán | Một phần | Status Archiving / `SYSTEM_ARCHIVE`; chưa có ArchiveJobs |
| Người tạo hủy khi nháp hoặc bị trả, có lý do | Chưa có | CANCEL chỉ có trên mock; không có lệnh Core |
| COMPLETED chỉ sau khi lưu trữ thành công | Chưa có | Chưa có `ARCHIVE_RESULT` |
| Kho hoàn tất, kho hủy, thử lại khi lỗi | Chưa có | ArchiveCompleted và ArchiveCancelled chưa nối |
| Khóa hồ sơ sau hoàn tất hoặc hủy | Chưa có | Chưa có vòng đời khóa cuối |

### Quyền và nhật ký

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| RBAC tĩnh 23 list và thư viện | Đủ | PASS 23/23 theo ma trận V1.9.1 |
| Chống chạy lại cùng một lệnh | Một phần | DedupeKey gắn command mới; chưa chặn replay |
| Màn kiểm toán | Một phần | Khung AUDIT; chưa đọc ActivityInternal |
| Quyền động theo hồ sơ và pháp nhân | Chưa có | CHAIR, TCKT, USERS chưa có ACL theo hồ sơ |
| Cổng lệnh không tin ActorUPN tự khai | Chưa có | Backlog kỹ thuật, mục trusted caller |
| Nhật ký nghiệp vụ, phân công, hạn | Chưa có | ActivityPublic và ActivityInternal chưa được Flow ghi |

### Màn hình

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Tạo hồ sơ | Đủ | LivePayApp |
| Hồ sơ 360 | Một phần | Có tài liệu, checklist, bước; thiếu phân công, hạn xử lý, nhật ký |
| Việc của tôi | Một phần | Lọc Requests theo người tạo hoặc trạng thái, không theo WorkItem |
| Quản trị danh mục quy trình | Một phần | CRUD loại, phòng, thành viên, checklist, người nhận; phiên bản WF chỉ đọc |
| Tổng quan | Chưa có | BA mục 4.7 |
| Việc của phòng | Chưa có | Chưa tách inbox trưởng phòng |
| Quản lý và tra cứu hồ sơ | Chưa có | Không lọc theo mã, pháp nhân, loại, trạng thái |
| Theo dõi thời hạn | Chưa có | BA mục 4.7 |
| Kho lưu trữ | Chưa có | BA mục 4.7 |
| Báo cáo | Chưa có | Chỉ số chưa được BA chốt |

## Điểm BA chưa chốt

Mục 7 của `BA.md` vẫn để mở. Thiếu tính năng ở trên không thay cho việc nghiệp vụ chưa duyệt.

| Vấn đề | Cách hiểu đang dùng trong code | Trạng thái BA |
|---|---|---|
| Trả hồ sơ | Mọi bước không đạt về BPCM1, gửi lại từ BPCM2 | Cần duyệt thống nhất |
| Thanh toán | Ngoài SharePoint; app chỉ nhận UNC và xác nhận | Đề nghị xác nhận |
| Ủy quyền | Chưa có dữ liệu phạm vi, thời hạn, thu hồi | Cần làm rõ chi tiết |
| Hủy hồ sơ | Chưa có lệnh; quy tắc người tạo, nháp, không thông báo | Đề nghị xác nhận |
| Quá hạn | Chưa cảnh báo; BA không cho tự chốt | Đề nghị xác nhận |
| Hoàn tất | Dừng ở Archiving, chưa COMPLETED | Đề nghị xác nhận |

## Ngoài phạm vi V1

Đúng với BA: không chặn hồ sơ trùng nội dung thanh toán, không chuyển tiền ngân hàng, không có bước Giám đốc SPV ký chi.
