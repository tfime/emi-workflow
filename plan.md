## Các bước cần triển khai tiếp theo
1. Data Models	Tạo Lists, Libraries và cột	Đã tạo
2. RBAC tĩnh	Nhóm và ACL 23 List/Library	Đã xong (V1.9.1); Dyn ACL theo hồ sơ: kit V1 (`10.EMI_PAY_Dynamic_Permission_V1`)
3. Configuration	Cấu hình phòng ban, trưởng phòng, loại hồ sơ, checklist, quy trình	Một phần (seed gói 9; seed EMI_PAY_SPV kit còn lại)
4. Core Orchestrator	PA Solution `EMI_PAY_CORE_V1` (Phase1+2 gates)	**1.0.0.23** — CREATE mở (chọn OU); OrgMembers chỉ duyệt/kiểm tra; còn Import + UAT
5. SPFx	Giao diện live trên EMI-Pay.aspx (tạo dynamic + upload + Commands)	Fluent UI 8 + Contoso teal (shell/detail/inbox/create/dashboard/audit)
6. Kiểm thử	Chạy hồ sơ thanh toán từ đầu đến cuối	UAT Core PASS (09/04/08); UAT UI + RoutePlan 4 case còn lại

### Core Flow (1.0.0.23 — HTTP API + AUTH + Perf + RoutePlan optional BPCM)
- CREATE → checklist → SUBMIT → AwaitingManager → TP DECIDE → [BPCM2?] → [BPCM3?] → ACCEPT(+DueAt) → DECIDE … → CHAIR → TCKT_PAY → CONFIRM → Archiving
- 5 lệnh: `CREATE_REQUEST` | `SUBMIT` | `ACCEPT` | `DECIDE` | `CONFIRM_PAYMENT`
- AUTH: **CREATE** chỉ cần `createdOUCode` (mọi Author); OrgMembers **Manager** cho ACCEPT/DECIDE/CONFIRM · `AUTH_ORGMEMBERS_GATE.md`
- ZIP: **`EMI_PAY_CORE_V1_1_0_0_23.zip`** · `ROUTE_PLAN_OPTIONAL_BPCM.md`

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
- RoutePlan: BPCM2/3 tuỳ chọn («Không qua bước này»)

### Việc tiếp (ưu tiên)
1. **Import `1.0.0.23`** + Flow On → UAT CREATE user không OrgMembers + 4 case RoutePlan + chuyển bước
2. UAT AUTH: CREATE mở; DECIDE vẫn siết Manager (`AUTH_ORGMEMBERS_GATE.md`)
3. Dyn ACL: Apply PnP sau hồ sơ thật; child Flow / DocsInternal·Archive = V1.1
4. Catch toàn cục Commands `Failed` (PHASE2 #8); Assignments; chỉnh BA §03.4

### Flow nghiệp vụ (cùng 5 lệnh; BPCM trung gian do user pin)

```
CREATE → checklist → SUBMIT → TP DECIDE
  → [BPCM2?] → [BPCM3?] → TCKT_CHECK → CHAIR → TCKT_PAY → Archiving
```

`RoutePlanJson`: có key BPCM2/3 = qua bước đó + OU; vắng key = bỏ qua. TCKT/CHAIR/TT luôn có.
