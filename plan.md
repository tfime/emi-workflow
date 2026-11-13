## Các bước cần triển khai tiếp theo
1. Data Models	Tạo Lists, Libraries và cột	Đã tạo
2. RBAC tĩnh	Nhóm và ACL 23 List/Library	Đã xong (V1.9.1); Dyn ACL theo hồ sơ: kit V1 (`10.EMI_PAY_Dynamic_Permission_V1`)
3. Configuration	Cấu hình phòng ban, trưởng phòng, loại hồ sơ, checklist, quy trình	Một phần (seed gói 9; seed EMI_PAY_SPV kit còn lại)
4. Core Orchestrator	PA Solution `EMI_PAY_CORE_V1` (Phase1+2 gates)	**1.0.0.20** trong repo — Import tenant + UAT AUTH/chuyển bước
5. SPFx	Giao diện live trên EMI-Pay.aspx (tạo dynamic + upload + Commands)	Fluent UI 8 + Contoso teal (shell/detail/inbox/create/dashboard/audit)
6. Kiểm thử	Chạy hồ sơ thanh toán từ đầu đến cuối	UAT Core PASS (09/04/08); UAT UI + Import 1.0.0.20 còn lại

### Core Flow (1.0.0.20 — HTTP API + AUTH + Perf Gói 3)
- CREATE → checklist → SUBMIT → AwaitingManager → TP DECIDE → ACCEPT(+DueAt) → DECIDE PASS/REJECT → CHAIR duyệt hồ sơ → duyệt TT + `paymentDueAt` → UNC gate → CONFIRM → Archiving
- 5 lệnh: `CREATE_REQUEST` | `SUBMIT` | `ACCEPT` | `DECIDE` | `CONFIRM_PAYMENT`
- AUTH OrgMembers (`AUTH_ORGMEMBERS_GATE.md`); CREATE đủ field + ChecklistTemplates (Gói 2)
- Gói 3: Dedupe + Master ETag; `IF_AlreadyDone` (terminal) / `IF_AlreadyProcessing`; **không** trigger concurrency (sync Response); fix dual Response / CLAIM_CONFLICT
- ZIP Import: **`EMI_PAY_CORE_V1_1_0_0_22.zip`** (optional BPCM + CREATE RoutePlanJson escape) · `ROUTE_PLAN_OPTIONAL_BPCM.md`

### UAT đã PASS (tenant CECM)
- `09_UAT_Phase2_ActivityAccept.ps1` — Activity + ACCEPT gates
- `04_UAT_Phase1_HappyPath.ps1` — full path + CHAIR two-step (`PAY-CMD-20261112162811-39705a`)
- `08_UAT_Phase2_ChairPaymentDueAt.ps1` — gate due trước dossier / dossier / payment
- Perf đo (2026-11-13): CREATE ~18s; parallel 3 CREATE ~34s wall (`10_` / `11_PERF_*.ps1`) — trước khi chốt 1.0.0.20

### SPFx (Demo Off)
- Fluent UI 8 Contoso teal: tách `shell` / `detail` / `inbox` / `create` / `dashboard` / `audit` / `dialogs`
- Act-as + OrgMembers; Admin tạo trực tiếp; Member phòng xem/review (không DECIDE)
- Perf Gói 1: boot/loadDetail song song; `perfMark` (`localStorage.emiPayPerf=1`); DedupeKey idempotent
- Checklist / ghi chú / UNC / CHAIR hai bước / sửa Draft·Returned như trước

### Việc tiếp (ưu tiên)
1. **Import `1.0.0.20`** + Flow On → UAT chuyển bước (SUBMIT/ACCEPT/DECIDE) + `11_PERF_Goi3_Concurrent.ps1`
2. UAT AUTH OrgMembers (reject/pass theo `AUTH_ORGMEMBERS_GATE.md`)
3. **RoutePlan optional BPCM** — SPFx + Core **1.0.0.22** (fix CREATE: `_biz` object + escape `\` trước `"`). Import `EMI_PAY_CORE_V1_1_0_0_22.zip` + UAT 4 case.
4. Dyn ACL: Apply PnP sau hồ sơ thật; child Flow / DocsInternal·Archive = V1.1
5. Catch toàn cục Commands `Failed` (PHASE2 #8); Assignments sau

### Flow nghiệp vụ (cùng 5 lệnh; BPCM trung gian do user pin)

```
CREATE → checklist → SUBMIT → TP DECIDE
  → [BPCM2?] → [BPCM3?] → TCKT_CHECK → CHAIR → TCKT_PAY → Archiving
```

`RoutePlanJson`: có key BPCM2/3 = qua bước đó + OU; vắng key = bỏ qua. TCKT/CHAIR/TT luôn có.
