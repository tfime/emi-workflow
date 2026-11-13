# EMI PAY — Đối chiếu BA với phần đã làm

> Rà soát 12/11/2026 (cập nhật: Core **1.0.0.12** CHAIR duyệt hồ sơ rồi duyệt TT). Nguồn: `BA.md`, quy tắc V1.0, Core Flow, `LivePayApp`.
>
> **Đủ trên live** nghĩa là lệnh hoặc màn hình đã nối dữ liệu thật. Dialog demo không tính là đã làm.
>
> **BA mới (đã chốt):** `SUBMIT` = trình TP (`AwaitingManager`); TP `DECIDE` PASS → bước kế theo **RoutePlan đã pin**; `ACCEPT`+`DueAt` trước DECIDE ở bước phòng; OU từ `RoutePlanJson`.
>
> **Chọn BPCM trung gian (chốt lại 13/11/2026):** Người tạo chọn BPCM2 và/hoặc BPCM3 (cả hai / một / không) — không gắn cố định theo loại hồ sơ. Spec: `ROUTE_PLAN_OPTIONAL_BPCM.md`. Phase1 vẫn bắt đủ BPCM2+3; chưa live.

## Kết quả

| Trạng thái | Số đầu mục | Ý nghĩa |
|---|---:|---|
| Đủ trên live | 16 | Lệnh hoặc màn hình đã chạy với list thật |
| Một phần | 14 | Có dữ liệu hoặc form, chưa đủ quy tắc BA |
| Chưa có | 25 | Chưa có lệnh Core, chưa có màn hình live |
| **Tổng** | **55** | |

Core nhận năm lệnh: `CREATE_REQUEST`, `SUBMIT`, `ACCEPT`, `DECIDE`, `CONFIRM_PAYMENT`.

Luồng tạo → Archiving: Core **1.0.0.12** (Activity + ACCEPT + CHAIR hai bước). UAT UI trên EMI-Pay vẫn chờ (port bước 8). Còn thiếu phân công nhiều người, ủy quyền, quyền động theo hồ sơ.

## Theo nhóm

| Nhóm | Đủ | Một phần | Chưa có |
|---|---:|---:|---:|
| Khởi tạo | 4 | 4 | 0 |
| Quyết định bước | 5 | 1 | 0 |
| Phân công và ủy quyền | 1 | 0 | 6 |
| Checklist và tài liệu | 1 | 4 | 2 |
| Hạn và thông báo | 2 | 0 | 4 |
| Hủy và lưu trữ | 0 | 1 | 4 |
| Quyền và nhật ký | 1 | 3 | 2 |
| Màn hình | 1 | 3 | 6 |

## Việc cần có trước khi nhiều người cùng chạy

| Ưu tiên | Việc còn thiếu | Vì sao chặn |
|---:|---|---|
| 1 | Quyền động và cổng lệnh tin cậy | Không tin `ActorUPN`; cấp đọc/ghi theo hồ sơ trước go-live |
| 2 | Tách người xử lý và người chốt | Chỉ trưởng phòng hoặc người được ủy quyền được `DECIDE` |
| 3 | Phân công nhiều người / Assignments | ACCEPT+DueAt đã có; chưa giao nhiều nhân sự |
| 4 | Checklist theo bộ phận và lượt | SPFx: phòng đánh giá mục chưa khóa; DECIDE PASS khóa Pass/Fail — phòng sau xem không sửa. Core mirror IsLocked còn backlog |
| 5 | Hủy, lưu trữ, thông báo | `Archiving` dừng ở trạng thái; chưa `COMPLETED`, chưa email |

`featureMap` đánh dấu tiếp nhận, phân công, ủy quyền, gia hạn và hủy là đã phủ. Các dialog đó nằm ở UI demo. Orchestrator không thực thi chúng.

## Đầu mục

### Khởi tạo

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Một Master Record xuyên suốt | Đủ | `CREATE_REQUEST` tạo `EMI_PAY_Requests` |
| BPCM1 trình TP rồi mới ra bước kiểm tra tiếp | Một phần | `AwaitingManager` + RoutePlan OK; Core vẫn luôn → BPCM2 |
| Chọn BPCM2/3 tuỳ hồ sơ (0/1/2 bước) | Một phần | SPFx + Core 1.0.0.21 coded; chờ Import + UAT |
| Pin RoutePlan StepKey→OU lúc tạo | Một phần | Key vắng = bỏ BPCM; AUTO TCKT/CHAIR vẫn default |
| Chọn loại hồ sơ từ danh mục | Đủ | LivePayApp đọc PaymentTypes |
| Chặn gửi khi thiếu chứng từ bắt buộc | Đủ | Gate UI và Flow trước `SUBMIT` |
| Nhập đề nghị, pháp nhân, dự án | Một phần | Title, số tiền, diễn giải vá sau CREATE; chưa có trường pháp nhân và dự án |
| Sinh checklist theo loại hồ sơ | Một phần | Flow seed 2 mục; UI bù template. Chưa đồng bộ một kênh |
| Điều chỉnh thông tin khi Draft/Returned | Một phần | Form sửa trên detail BPCM1 (`patchRequestBusinessFields`); chưa lệnh Core EDIT |
| Lưu và hoàn thiện bản nháp | Một phần | Có trạng thái Draft sau khi tạo, không có nháp trước lệnh |
| Khóa sửa khi bộ phận khác đang kiểm tra | Một phần | `IsLocked` khi SUBMIT; chưa có lệnh EDIT khi hồ sơ bị trả |

### Quyết định bước

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Chuyển BPCM2, BPCM3, TCKT kiểm tra, CT.HĐQT, TCKT thanh toán | Một phần | `DECIDE` PASS hardcode luôn BPCM2→BPCM3; chưa skip theo RoutePlan |
| Không đạt hoặc không duyệt thì trả về BPCM1 | Đủ | REJECT từ mọi bước kiểm tra và CT.HĐQT |
| Gửi lại cùng hồ sơ, tăng ReviewRound, vào lại BPCM2 | Đủ | `SUBMIT` từ Returned |
| CT.HĐQT cập nhật hạn thanh toán khi duyệt | Đủ | Core 1.0.0.12: duyệt hồ sơ (giữ CHAIR) rồi «Duyệt thanh toán» + `paymentDueAt` → TCKT_PAY |
| Tải UNC và xác nhận đã thanh toán | Đủ | `CONFIRM_PAYMENT` chỉ khi DocumentIndex có UNC |
| Lý do trả hồ sơ tra cứu được trên nhật ký | Một phần | ActivityPublic có `STEP_REJECTED`/`MANAGER_REJECTED` + Note; lý do checklist vẫn ở StepReviews |

### Phân công và ủy quyền

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Trưởng phòng tiếp nhận và bắt buộc đặt hạn | Đủ | `ACCEPT` + `DueAt` (Core 1.0.0.11); UI dialog tiếp nhận |
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
| Đánh dấu Đạt hoặc Không đạt từng mục | Một phần | Phòng tự chọn mục chưa `IsLocked`; không gán cứng mục↔bước; không đòi Đạt hết để chuyển bước |
| Ghi nhận xét và lý do không đạt | Một phần | StepReviews từ UI, không qua lệnh Core |
| Giữ kết quả theo lượt / khóa sau chốt | Một phần | Sau DECIDE PASS: `lockReviewedItems` (Pass/Fail). Core chưa mirror IsLocked |
| Bổ sung tài liệu nội bộ của bộ phận | Một phần | Upload có; chưa tách DocsInternal và phạm vi phòng |
| Giữ phiên bản khi thay tài liệu | Chưa có | Chưa quản lý IsCurrent và phiên bản cũ |
| Nhân sự báo hoàn thành phần việc | Chưa có | Không có trạng thái phần việc riêng trưởng phòng |

### Hạn và thông báo

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Hiển thị hạn thanh toán sau khi duyệt | Đủ | `Requests.PaymentDueAt` trên chi tiết |
| Đặt hạn xử lý lúc tiếp nhận | Đủ | `ACCEPT` ghi `WorkItems.DueAt` + `AcceptedAt` |
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
| Màn kiểm toán | Một phần | Khung AUDIT; ActivityInternal đã ghi khi Rejected/Failed — UI AUDIT chưa list |
| Quyền động theo hồ sơ và pháp nhân | Một phần | Kit Dyn ACL V1 (`10.EMI_PAY_Dynamic_Permission_V1`); chưa hook Flow + UAT user-level |
| Cổng lệnh không tin ActorUPN tự khai | Chưa có | Backlog kỹ thuật, mục trusted caller |
| Nhật ký nghiệp vụ, phân công, hạn | Một phần | ActivityPublic + StepReviews trên timeline; phân công/gia hạn chưa có |

### Màn hình

| Chức năng | Trạng thái | Hiện trạng |
|---|---|---|
| Tạo hồ sơ | Đủ | LivePayApp |
| Hồ sơ 360 | Một phần | Có tài liệu, checklist, bước, nhật ký Activity, hạn sau ACCEPT; thiếu phân công |
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
