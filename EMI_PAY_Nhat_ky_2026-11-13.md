# Nhật ký làm việc — 2026-11-13

Tóm tắt một ngày trên CECM / repo `emi-workflow`: quyền OrgMembers, đo perf, Perf Gói 3 (Core), Fluent SPFx, RoutePlan optional BPCM, seed Tổng hợp.

---

## Đã làm hôm nay

### 1. Quyền & OrgMembers (trước đo perf)
- Seed / sửa upsert `OrgMembers` (Member tạm các phòng kiểm tra); fix PowerShell unwrap 1 phần tử → `@()`.
- SPFx: Member xem hồ sơ phòng, review/ghi chú/đính kèm; **không** DECIDE; Admin tạo/trình không cần act-as (lựa chọn 2).
- Spec + build cổng AUTH OrgMembers trong Core (từ 1.0.0.13, gói trong các ZIP sau).

### 2. Đo latency (đo trước Gói 3)
- Script `10_PERF_Measure_Create.ps1` + SPFx `perfMark` (`localStorage.emiPayPerf=1`).
- Kết quả tham chiếu (tenant, OrchestratorUrl từ EMI-Pay.aspx):
  - boot.cfg.lists ~2.7–3.3s; inbox ~0.5s
  - CREATE `orchestratorApi` ~**14.6s**; `enqueueAndRun.total` ~**18s**
  - Gói 2 trên tenant: Title/Amount/RoutePlanJson + ChecklistItems = 3 template — **OK**
- Doc: `EMI_PAY_Core_Flow_Phase1/PERF_MEASURE.md`

### 3. Perf Gói 3 (Core) + SPFx hỗ trợ
- Dedupe theo `DedupeKey`; Master MERGE dùng `MasterETag` (không `*` trên Requests).
- SPFx `buildDedupeKey` idempotent (SUBMIT/ACCEPT/DECIDE/CONFIRM).
- Script concurrent `11_PERF_Goi3_Concurrent.ps1`: 3 CREATE song song **PASS** (~34s wall); double-invoke không nhân Master.
- Doc: `EMI_PAY_Core_Flow_Phase1/PERF_GOI3.md`
- **Không** gắn child Flow Dyn ACL (vẫn PnP Apply async ngoài Core).

### 4. Vòng Import Flow (lỗi XRM / runtime → sửa)
| ZIP | Vấn đề | Hướng xử lý |
|-----|--------|-------------|
| 1.0.0.16 | `Until` expression object | Chuỗi `@or(...)` |
| 1.0.0.17 | `SetVariable` self-ref `RequestKey` | Chỉ gán từ body Dedupe |
| 1.0.0.18–19 | Trigger `concurrency.runs` + sync `Response` | Bỏ concurrency control trên trigger |
| 1.0.0.19 runtime | `CLAIM_CONFLICT` + dual Response (`RESP_Api` + nhánh Claim-fail) | **1.0.0.20**: bỏ nhánh Claim-fail Response; `RESP_Api` không `Skipped`; Claim `IF-MATCH *`; siết `IF_AlreadyDone` (terminal) / `IF_AlreadyProcessing` |

- Build có bước validate (concurrency / Until / SetVariable self-ref) trước khi đóng ZIP.

### 5. SPFx Fluent
- Tách `LivePayApp` → shell / detail / create rail / audit / dialogs + `fluentPayTheme`.
- Form tạo: hierarchy Fluent (tiêu đề + số tiền lên đầu); ComboBox border theo `semanticColors` / `::after` (không viền đen).

### 6. RoutePlan — chọn BPCM2/3 tuỳ hồ sơ (chốt lại cuối ngày)
- **Không** gắn bỏ BPCM theo `PaymentTypes.WorkflowCode` (huỷ hướng `ROUTE_BY_PAYMENT_TYPE.md`).
- Người tạo pin RoutePlan: BPCM2 và/hoặc BPCM3 — cả hai, một, hoặc không (TP → thẳng TCKT). Spec: `ROUTE_PLAN_OPTIONAL_BPCM.md`.
- SPFx: `routePlan.ts`; UI «Không qua bước này»; mặc định opt-in (bỏ qua); `ApprovalFlow` / rail theo RoutePlan; `_biz` lưu **object** (không stringify lồng).
- Core **1.0.0.22**: `COMPOSE_RoutePlan` trước `SET_Next_Decide`; skip BPCM thiếu key; CREATE escape `\` rồi `"` cho `RoutePlanJson`.
- ZIP Import: **`EMI_PAY_CORE_V1_1_0_0_22.zip`** (21 trung gian, dùng 22).
- UAT nhanh: hồ sơ bỏ BPCM vẫn **AwaitingManager** tại BPCM1 — phải TP **đơn vị tạo** duyệt (vd. tạo từ TCKT → đóng vai `tp.tckt`). Rail dễ nhầm vì `CurrentOU=OU_TCKT` — đã tách «Đơn vị tạo» / «Chờ duyệt bởi TP …».

### 7. Seed Phòng Tổng hợp (CECM)
- Seed trước thiếu: `ManagerUPN=TO_FILL`, không có OrgMembers.
- `seed-config.json` + upsert tenant: `tp.tonghop@emi.com.vn` (Manager), `nv.tonghop@emi.com.vn` (Member).

### 8. Git
- Push cuối ngày: RoutePlan optional BPCM + Core 1.0.0.22 + nhật ký + seed Tổng hợp.

---

## Chưa làm / còn mở

1. **Import Core `1.0.0.22`** (nếu tenant còn 20/21) → Flow On → UAT AUTH + chuyển bước + 4 case RoutePlan (cả hai / chỉ 2 / chỉ 3 / không BPCM).
2. Lặp **`11_PERF_Goi3_Concurrent.ps1`** sau Import mới.
3. **Dyn ACL**: Apply PnP theo RequestKey thật; child Flow / DocsInternal·Archive = V1.1.
4. PHASE2: Catch → Commands `Failed` (#8); Assignments; chỉnh câu BA §03.4 (chọn subset BPCM).
5. UAT UI end-to-end trên EMI-Pay.aspx.

---

## File / artifact chính trong ngày

- `EMI_PAY_CORE_V1_1_0_0_20.zip` … **`22.zip`** (Import ưu tiên 22)
- `EMI_PAY_Core_Flow_Phase1/ROUTE_PLAN_OPTIONAL_BPCM.md`, `Build-Phase1Solution.ps1`
- `spfx/.../routePlan.ts`, ApprovalFlow / Create / partyBiz
- `9.EMI_PAY_Core_Orchestrator_V1/config/seed-config.json` (OU_TONGHOP)
- `plan.md`, `EMI_PAY_Doi_chieu_BA.md`, nhật ký này
