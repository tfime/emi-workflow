# EMI PAY Core Orchestrator — Runbook

**Solution:** `EMI_PAY_CORE_V1` v`1.0.0.15`  
**Flow:** `EMI_PAY_CORE_Orchestrator_V1`  
**ZIP:** `EMI_PAY_CORE_V1_1_0_0_15.zip`  
**Trigger:** HTTP `POST { "commandId": <int> }` → sync JSON Response (CORS `*`)

**1.0.0.14:** CREATE ghi Title/Amount/Explanation/RoutePlanJson; seed ChecklistTemplates.  
**1.0.0.15:** `SET_AuthError_Clear` dùng `@string('')` (designer mới không nhận Value rỗng).

## API (SPFx / UAT)

| | |
|---|---|
| Request | `POST` body `{ "commandId": 123 }` |
| Response 200 | `{ commandId, state, requestKey, stepInstanceKey, errorMessage, commandType }` |
| `state` | `Succeeded` \| `Rejected` \| `Failed` \| … |

SPFx: tạo item `EMI_PAY_Commands` (`Pending`) → gọi URL → dùng Response (không poll phút).

Sau import:
1. Mở Flow → trigger HTTP → **Who can trigger the flow** = **Any user in my tenant**
2. Copy **HTTP POST URL** → dán property web part **Orchestrator HTTP URL**
3. SPFx gọi bằng `AadHttpClient` audience `https://service.flow.microsoft.com/` (Bearer). Anonymous `fetch` sẽ **401 DirectApiAuthorizationRequired**.
4. Approve API access «Microsoft Flow Service / User» trong SharePoint Admin (sau `package`/`deploy`).

```powershell
# Kick thủ công / UAT — bắt buộc Bearer (Flow = Any user in my tenant)
$token = Get-PnPAccessToken -ResourceTypeName PowerAutomate
Invoke-RestMethod -Method Post -Uri $OrchestratorUrl -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $token" } `
  -Body (@{ commandId = $cmdId } | ConvertTo-Json)
```

## Lệnh đã có (5)

| Lệnh | Kết quả |
|---|---|
| `CREATE_REQUEST` | Draft @ BPCM1 + WI + checklist + Activity `REQUEST_CREATED` |
| `SUBMIT` | Gate checklist → AwaitingManager (TP) + `SUBMITTED_TO_MANAGER` |
| `ACCEPT` | Bắt buộc `dueAt`; ghi WI `AcceptedAt`/`DueAt` + `STEP_ACCEPTED` |
| `DECIDE PASS` | Gate ACCEPT (BPCM2/3/TCKT) → bước sau; CHAIR: không due = duyệt hồ sơ (giữ CHAIR); có `paymentDueAt` = duyệt TT → TCKT_PAY |
| `DECIDE REJECT` | Về BPCM1 / Returned (hoặc Draft nếu đang AwaitingManager) |
| `CONFIRM_PAYMENT` | Gate ACCEPT + UNC → Archiving + `PAYMENT_CONFIRMED` |

Rejected/Failed → `EMI_PAY_ActivityInternal` (`COMMAND_REJECTED` / `COMMAND_FAILED`).

## Import

1. Import `EMI_PAY_CORE_V1_1_0_0_15.zip` (hoặc bản mới hơn).
2. **Fix connection** (bắt buộc sau Import nếu báo *broken connection for HTTP_LoadCommand*):
   - Solutions → `EMI_PAY_CORE_V1` → **Connection references** → `tfime_sharedsharepointonline_5e343` → gắn connection SharePoint (account Full Control trên site CECM).
   - Hoặc Edit Flow → action `HTTP_LoadCommand` → Change connection → Save.
3. Flow **On**. Copy HTTP POST URL → property SPFx **Orchestrator HTTP URL**.
4. UAT: enqueue Command rồi `Invoke-RestMethod` (list trigger đã bỏ — chỉ HTTP).

## UAT

```powershell
cd .../EMI_PAY_Core_Flow_Phase1/scripts

.\09_UAT_Phase2_ActivityAccept.ps1 -WaitSeconds 90
.\04_UAT_Phase1_HappyPath.ps1 -WaitSeconds 90
.\08_UAT_Phase2_ChairPaymentDueAt.ps1 -WaitSeconds 90
.\07_UAT_Phase2_UncGate.ps1 -WaitSeconds 90
.\06_UAT_Phase2_ChecklistGate.ps1 -WaitSeconds 90
.\05_UAT_Phase2_RejectResubmit.ps1 -WaitSeconds 90
```

## Backlog còn lại

Xem `PHASE2_BACKLOG.md` (trusted caller, dedupe, ETag…).
