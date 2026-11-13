##Các bước cần triển khai tiếp theo
1. Data Models	Tạo Lists, Libraries và cột	Đã tạo
2. RBAC tĩnh	Nhóm và ACL 23 List/Library	Đã xong (V1.9.1); Dyn ACL theo hồ sơ: kit V1 (`10.EMI_PAY_Dynamic_Permission_V1`)
3. Configuration	Cấu hình phòng ban, trưởng phòng, loại hồ sơ, checklist, quy trình	Một phần (seed gói 9; seed EMI_PAY_SPV kit còn lại)
4. Core Orchestrator	PA Solution `EMI_PAY_CORE_V1` (Phase1+2 gates)	**1.0.0.13** — AUTH OrgMembers (cần Import + UAT)
5. SPFx	Giao diện live trên EMI-Pay.aspx (tạo dynamic + upload + Commands)	Đang làm (LivePayApp: Activity VI, StepAttachment, CHAIR 2 bước)
6. Kiểm thử	Chạy hồ sơ thanh toán từ đầu đến cuối	UAT Core PASS (09/04/08); UAT UI trên EMI-Pay.aspx còn lại

### Core Flow (1.0.0.13 — HTTP API + AUTH)
- CREATE → checklist → SUBMIT → AwaitingManager → TP DECIDE → ACCEPT(+DueAt) → DECIDE PASS/REJECT → CHAIR duyệt hồ sơ → duyệt TT + `paymentDueAt` → UNC gate → CONFIRM → Archiving
- 5 lệnh: `CREATE_REQUEST` | `SUBMIT` | `ACCEPT` | `DECIDE` | `CONFIRM_PAYMENT`
- ActivityPublic sau Succeeded; ActivityInternal khi Rejected/Failed
- CHAIR hai bước (1.0.0.12): PASS không due = giữ CHAIR; PASS + due (sau dossier) → TCKT_PAY
- REJECT về BPCM1; SUBMIT lại tăng `ReviewRound`, vào lại BPCM2
- ZIP: `EMI_PAY_CORE_V1_1_0_0_13.zip` · runbook/UAT: `EMI_PAY_Core_Flow_Phase1/` · AUTH: `AUTH_ORGMEMBERS_GATE.md`

### UAT đã PASS (tenant CECM)
- `09_UAT_Phase2_ActivityAccept.ps1` — Activity + ACCEPT gates
- `04_UAT_Phase1_HappyPath.ps1` — full path + CHAIR two-step (`PAY-CMD-20261112162811-39705a`)
- `08_UAT_Phase2_ChairPaymentDueAt.ps1` — gate due trước dossier / dossier / payment

### SPFx (Demo Off) gần đây
- Nhật ký Activity: mới nhất trước, badge/tiêu đề tiếng Việt; tab **Nhật ký / Ghi chú** có badge đỏ đếm
- Tab Ghi chú: list Note/Reason; gửi StepReviews (`USER_NOTE` trong ChecklistItemKey; Dyn ListContribute StepReviews theo UPN)
- Chưa ACCEPT (BPCM2/3/TCKT): khoá **đánh giá checklist** và **gửi ghi chú** (tab + preview tệp); chỉ tin AcceptedAt của WI đúng CurrentStepInstanceKey
- Banner Returned hiện lý do REJECT
- Tab Tài liệu hỗ trợ: tải `DocClass=StepAttachment`
- CT.HĐQT: «Phê duyệt hồ sơ» rồi «Duyệt thanh toán» (dialog hạn chỉ ở bước 2)
- Checklist: full lúc CREATE; phòng tự đánh giá mục chưa khóa; **không** đòi Đạt hết để DECIDE PASS; sau PASS khóa mục Pass/Fail (`lockReviewedItems`)
- Draft/Returned (BPCM1): form **Sửa thông tin hồ sơ** (title/amount/explanation/OU/RoutePlan) qua `patchRequestBusinessFields`

### Việc tiếp
- ~~Seed OrgMembers + Đóng vai~~; ~~Admin tạo/trình trực tiếp~~; ~~Member phòng kiểm tra (xem/review, không DECIDE)~~
- **Perf Gói 1 (SPFx)** — DONE: `loadDetail`/`boot` song song; spinner tắt sau lệnh; reconcile chỉ khi lệch; ghi checklist `mapPool(4)`
- **Perf Gói 2 (Flow)** — DONE trong repo: Core **1.0.0.14** CREATE đủ field + ChecklistTemplates; SPFx bỏ patch/reconcile — còn **Import ZIP** trên tenant
- **Perf Gói 3** — Dedupe + ETag Master → concurrency trigger 1→5–10; Dyn ACL async sau Response
- Cổng OrgMembers (trong 1.0.0.14) — Import Solution + UAT AUTH reject/pass
- Dyn ACL hook sau Core Succeeded khi UPN Entra có thật; DocsInternal/Archive ACL (Dyn V1.1)
- Dedupe (PHASE2_BACKLOG #6); Assignments (phân công nhiều người) sau

