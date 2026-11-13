# Perf Gói 3 — Dedupe + ETag Master + concurrency HTTP

**Trạng thái:** DONE trong repo — Solution **1.0.0.19** (`EMI_PAY_CORE_V1_1_0_0_19.zip`). Cần Import + Flow On.

### Import fail log

| Ver | Lỗi XRM | Sửa |
|-----|---------|-----|
| 1.0.0.16 | `Until` expression object | Chuỗi `@or(...)` |
| 1.0.0.17 | `SetVariable` self-ref RequestKey | Chỉ lấy từ body Dedupe |
| 1.0.0.18 | `InvalidConcurrencyConfiguration` | **Bỏ** `trigger.concurrency.runs` — HTTP + **sync** `Response` (SPFx) không được bật concurrency control; song song vẫn mặc định; an toàn = Dedupe + ETag |

### Không làm / không làm lại

- `runtimeConfiguration.concurrency.runs` trên trigger Request khi còn Response sync  
- `Response` + `operationOptions: Asynchronous` (phá `enqueueAndRun` đồng bộ)  
**Phụ thuộc:** Gói 1–2 đã trên tenant (CREATE template OK).

## Mục tiêu

Cho phép nhiều lệnh Core chạy song song (HTTP trigger **runs=5**) mà không nhân đôi Master / bước khi:

- Hai POST cùng `commandId` (double-click / retry)
- Hai Commands cùng `DedupeKey` (SPFx idempotent key)
- Hai MERGE Master chồng (ETag)

## Thay đổi Core Flow

| Hạng mục | Chi tiết |
|----------|----------|
| Trigger | **Không** bật concurrency control (sync Response). Parallel HTTP vẫn chạy mặc định. |
| Dedupe | GET Commands theo `DedupeKey`; bản khác `Succeeded` → MERGE lệnh hiện tại `Succeeded` + `DEDUPE_NOOP` + Response |
| Claim | Bỏ qua nếu State đã `Processing` (Until terminal → Response); Claim `Pending→Processing` với `IF-MATCH` = etag lệnh |
| ETag Master | `MasterETag` từ `@odata.etag` sau FindMaster; MERGE Requests dùng `IF-MATCH` = `MasterETag` (không `*`) |
| Dyn ACL | **Không** gắn child Flow trong 1.0.0.16 — vẫn `10.EMI_PAY_Dynamic_Permission_V1` PnP Apply **sau** Response (async ngoài Core) |

## SPFx

`DedupeKey` idempotent theo lệnh nghiệp vụ (không chỉ `Type-CommandKey`):

- `SUBMIT-{requestKey}-r{expectedReviewRound}`
- `ACCEPT-{stepInstanceKey}`
- `DECIDE-{stepInstanceKey}-{decision}`
- `CONFIRM_PAYMENT-{requestKey}-{unc|file key}`
- `CREATE_REQUEST` vẫn unique theo CommandKey (mỗi hồ sơ mới)

## UAT / đo

```powershell
.\10_PERF_Measure_Create.ps1 -OrchestratorUrl '<url>'
.\11_PERF_Goi3_Concurrent.ps1 -OrchestratorUrl '<url>' -Parallel 3
```

Kỳ vọng: 3 CREATE song song → 3 RequestKey khác nhau, cả ba Succeeded; double POST cùng commandId → không tạo Master thứ hai.

### Baseline concurrent (2026-11-13, trước/không bắt buộc đã Import 16)

| Metric | Kết quả |
|--------|---------|
| Parallel 3 CREATE | **PASS** 3/3 Succeeded, 3 RequestKey |
| Wall clock | **~34s** (từng HTTP ~23–24s) |
| Double-invoke same commandId | **PASS** ~1.7s, không nhân Master |

Sau Import **1.0.0.16**: lặp lại script — xác nhận Dedupe `DEDUPE_NOOP` (hai Commands cùng DedupeKey) + không 412 Master khi chồng.

## Không làm trong Gói 3

- Child Flow Dyn ACL  
- Catch toàn cục → Commands `Failed` (PHASE2 #8)  
- Nới concurrency > 5 trước khi UAT song song PASS  
