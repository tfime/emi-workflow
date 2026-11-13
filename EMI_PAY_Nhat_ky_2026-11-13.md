# Nhật ký làm việc — 2026-11-13

Tóm tắt một ngày trên CECM / repo `emi-workflow`: quyền OrgMembers, đo perf, Perf Gói 3 (Core), Fluent SPFx, và các vòng Import Flow.

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

- ZIP hiện tại cần Import: **`EMI_PAY_CORE_V1_1_0_0_20.zip`**
- Build có bước validate (concurrency / Until / SetVariable self-ref) trước khi đóng ZIP.

### 5. SPFx Fluent
- Tách `LivePayApp` → shell / detail / create rail / audit / dialogs + `fluentPayTheme`.
- Commit sớm trong ngày: `b9cdbe0` (tới 1.0.0.19 + Fluent); tiếp theo commit kèm 1.0.0.20 + nhật ký này.

### 6. Git
- Đã push `master` (commit Gói 3 + Fluent tới 1.0.0.19).
- Cập nhật `plan.md` + nhật ký + ZIP 1.0.0.20 (commit cùng lượt nếu chưa push).

---

## Chưa làm / còn mở

1. **Import Core `1.0.0.20`** trên Power Automate (Environment đúng) → Flow On → gắn lại connection SharePoint nếu cần.
2. **UAT chuyển bước** sau Import: SUBMIT → ACCEPT → DECIDE (và happy path ngắn) — xác nhận hết `CLAIM_CONFLICT` / dual Response.
3. **UAT AUTH** OrgMembers: reject payload UPN lệch; Member không DECIDE; Manager/SYSADM pass (`AUTH_ORGMEMBERS_GATE.md`).
4. Lặp **`11_PERF_Goi3_Concurrent.ps1`** sau khi 1.0.0.20 On.
5. **Dyn ACL**: chạy Apply PnP theo RequestKey thật; child Flow sau Response / DocsInternal·Archive = V1.1.
6. PHASE2 còn lại: Catch → Commands `Failed` (#8); Assignments; seed drift `EMI_PAY_SPV` vs gói 9 nếu còn.
7. UAT UI end-to-end trên EMI-Pay.aspx (toàn quy trình user) — Core UAT cũ PASS, UI còn điểm lẻ.

---

## File / artifact chính trong ngày

- `EMI_PAY_CORE_V1_1_0_0_20.zip` (Import)
- `EMI_PAY_Core_Flow_Phase1/scripts/Build-Phase1Solution.ps1`
- `EMI_PAY_Core_Flow_Phase1/PERF_GOI3.md`, `PERF_MEASURE.md`
- `EMI_PAY_Core_Flow_Phase1/scripts/10_PERF_Measure_Create.ps1`, `11_PERF_Goi3_Concurrent.ps1`
- `spfx/.../perfMark.ts`, `CommandService.ts` (`buildDedupeKey`), Fluent components
- `plan.md` (đã cập nhật trạng thái 1.0.0.20)
