# Đo latency EMI PAY (sau Gói 1–2 / Core ≥ 1.0.0.15)

## A) Script tenant (Flow CREATE + list)

```powershell
Connect-PnPOnline -Url https://emicomvn.sharepoint.com/sites/cecm `
  -ClientId 5c1a7c4d-3b40-4938-821d-12f44ee316e5 -Interactive
cd EMI_PAY_Core_Flow_Phase1\scripts
.\10_PERF_Measure_Create.ps1
# có HTTP sync:
# .\10_PERF_Measure_Create.ps1 -OrchestratorUrl 'https://.../triggers/manual/paths/invoke?api-version=...'
# chỉ đo đọc list:
# .\10_PERF_Measure_Create.ps1 -SkipCreate
```

In `[PERF]` ms: `boot.cfg.lists`, `enqueueCommand`, `orchestratorApi`/`enqueueAndRun.total`, `loadDetail.*`, và signal Gói 2 (Title/Amount/Route + số ChecklistItems).

## B) SPFx Console

```js
localStorage.setItem('emiPayPerf','1'); location.reload();
```

Filter: `EMI PAY perf`. Tắt: `localStorage.removeItem('emiPayPerf')`. Cần serve/package có `perfMark`.

| # | Hành động | Log |
|---|-----------|-----|
| 1 | F5 inbox | `boot.cfg` · `boot.inbox` · `boot.total` |
| 2 | Mở Draft | `loadDetail.total` (`didReconcile`) |
| 3 | Tạo hồ sơ | `enqueueAndRun.total` · `ui.create.refreshAfter` · `loadDetail.total` |
| 4 | SUBMIT/ACCEPT/DECIDE | `enqueueAndRun.total` + `loadDetail.total` |

- `loadDetail.reconcile` → Gói 2 chưa trên tenant / hồ sơ cũ.
- `mode: 'poll'` → thiếu Orchestrator URL trên web part.

## Baseline (2026-11-13, script A + OrchestratorUrl từ EMI-Pay.aspx)

| Metric | ms | Ghi chú |
|--------|-----|---------|
| boot.cfg.lists | **2735–3254** | 4 list PnP tuần tự |
| boot.inbox.top50 | **~530–620** | |
| cfg.templates | **~2100–2800** | n=3 SPV_PAYMENT |
| enqueueCommand | **~780–990** | |
| **orchestratorApi (CREATE)** | **14596** | Core sync HTTP |
| **enqueueAndRun.total** | **17956** | enqueue + API |
| loadDetail.master | **601** | |
| loadDetail.checklist | **829** | n=3 |
| loadDetail.parallel | **2404** | WI+Act+Rev+Docs |
| **loadDetail ≈** | **~3.8s** | sum sau CREATE |

**Gói 2 trên tenant: OK** — Title/Amount/RoutePlanJson đúng; ChecklistItems=3 = templates (`DOC_REQUEST`, `DOC_INVOICE`, `DOC_CONTRACT`).

### Đọc nhanh

- CREATE end-to-end lệnh ≈ **18s** (Flow ~**14.6s** là nút thắt).
- Boot cfg list vẫn ~**3s** (song song SPFx Gói 1 sẽ thấp hơn script tuần tự).
- Gói 3 (1.0.0.16): concurrency 5 + Dedupe/ETag — đo song song bằng `11_PERF_Goi3_Concurrent.ps1` sau Import.

### Sau Import 1.0.0.16

```powershell
.\11_PERF_Goi3_Concurrent.ps1 -OrchestratorUrl '<url EMI-Pay>' -Parallel 3
.\10_PERF_Measure_Create.ps1 -OrchestratorUrl '<url>'
```