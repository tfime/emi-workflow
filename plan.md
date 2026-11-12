##Các bước cần triển khai tiếp theo
1. Data Models	Tạo Lists, Libraries và cột	Đã tạo
2. RBAC tĩnh	Nhóm và ACL 23 List/Library	Đã xong (V1.9.1)
3. Configuration	Cấu hình phòng ban, trưởng phòng, loại hồ sơ, checklist, quy trình	Một phần (seed gói 9; seed EMI_PAY_SPV kit còn lại)
4. Core Orchestrator	PA Solution `EMI_PAY_CORE_V1` (Phase1+2 gates)	**1.0.0.12** — UAT Core PASS
5. SPFx	Giao diện live trên EMI-Pay.aspx (tạo dynamic + upload + Commands)	Đang làm (LivePayApp: Activity VI, StepAttachment, CHAIR 2 bước)
6. Kiểm thử	Chạy hồ sơ thanh toán từ đầu đến cuối	UAT Core PASS (09/04/08); UAT UI trên EMI-Pay.aspx còn lại

### Core Flow (1.0.0.12 — HTTP API)
- CREATE → checklist → SUBMIT → AwaitingManager → TP DECIDE → ACCEPT(+DueAt) → DECIDE PASS/REJECT → CHAIR duyệt hồ sơ → duyệt TT + `paymentDueAt` → UNC gate → CONFIRM → Archiving
- 5 lệnh: `CREATE_REQUEST` | `SUBMIT` | `ACCEPT` | `DECIDE` | `CONFIRM_PAYMENT`
- ActivityPublic sau Succeeded; ActivityInternal khi Rejected/Failed
- CHAIR hai bước (1.0.0.12): PASS không due = giữ CHAIR; PASS + due (sau dossier) → TCKT_PAY
- REJECT về BPCM1; SUBMIT lại tăng `ReviewRound`, vào lại BPCM2
- ZIP: `EMI_PAY_CORE_V1_1_0_0_12.zip` · runbook/UAT: `EMI_PAY_Core_Flow_Phase1/`

### UAT đã PASS (tenant CECM)
- `09_UAT_Phase2_ActivityAccept.ps1` — Activity + ACCEPT gates
- `04_UAT_Phase1_HappyPath.ps1` — full path + CHAIR two-step (`PAY-CMD-20261112162811-39705a`)
- `08_UAT_Phase2_ChairPaymentDueAt.ps1` — gate due trước dossier / dossier / payment

### SPFx (Demo Off) gần đây
- Nhật ký Activity: mới nhất trước, badge/tiêu đề tiếng Việt
- Tab Tài liệu hỗ trợ: tải `DocClass=StepAttachment`
- CT.HĐQT: «Phê duyệt hồ sơ» rồi «Duyệt thanh toán» (dialog hạn chỉ ở bước 2)

### Việc tiếp
- UAT UI end-to-end trên EMI-Pay.aspx với persona thật
- Seed EMI_PAY_SPV / PROCADM còn lại; trusted caller / dedupe (PHASE2_BACKLOG)
