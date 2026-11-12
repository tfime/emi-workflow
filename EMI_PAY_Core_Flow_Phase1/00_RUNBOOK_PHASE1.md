# EMI PAY Core Orchestrator — Runbook

**Solution:** `EMI_PAY_CORE_V1` v`1.0.0.10`  
**Flow:** `EMI_PAY_CORE_Orchestrator_V1`  
**ZIP:** `EMI_PAY_CORE_V1_1_0_0_10.zip`  
**Trigger:** HTTP `POST { "commandId": <int> }` → sync JSON Response (CORS `*`)

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
# Kick thủ công / UAT
Invoke-RestMethod -Method Post -Uri $OrchestratorUrl -ContentType 'application/json' -Body (@{ commandId = $cmdId } | ConvertTo-Json)
```

## Lệnh đã có

| Lệnh | Kết quả |
|---|---|
| `CREATE_REQUEST` | Draft @ BPCM1 + WI + checklist DOC_REQUEST/DOC_INVOICE |
| `SUBMIT` | Gate checklist → AwaitingManager (TP) |
| `DECIDE PASS` | TP→BPCM2→…→TCKT_PAY; **CHAIR** bắt buộc `paymentDueAt` |
| `DECIDE REJECT` | Về BPCM1 / Returned (hoặc Draft nếu đang AwaitingManager) |
| `CONFIRM_PAYMENT` | Gate UNC DocumentIndex → Archiving |

## Import

1. Import `EMI_PAY_CORE_V1_1_0_0_10.zip` → connection CECM → Flow **On**.
2. Copy HTTP POST URL → cấu hình SPFx.
3. UAT: enqueue Command rồi `Invoke-RestMethod` (list trigger đã bỏ — chỉ HTTP).

## UAT

```powershell
cd F:\Projects\sharepoint\emi-workflow\EMI_PAY_Core_Flow_Phase1\scripts

# Sau khi enqueue, gọi HTTP URL (xem từng script / -OrchestratorUrl nếu có)
.\08_UAT_Phase2_ChairPaymentDueAt.ps1 -WaitSeconds 90
.\07_UAT_Phase2_UncGate.ps1 -WaitSeconds 90
.\04_UAT_Phase1_HappyPath.ps1 -WaitSeconds 90
.\06_UAT_Phase2_ChecklistGate.ps1 -WaitSeconds 90
.\05_UAT_Phase2_RejectResubmit.ps1 -WaitSeconds 90
```

> Script UAT cũ chờ poll list — với 1.0.0.10 cần thêm bước POST `commandId` sau mỗi enqueue (hoặc cập nhật script).

## Backlog còn lại

Xem [PHASE2_BACKLOG.md](PHASE2_BACKLOG.md) — kỹ thuật (dedupe/ETag/Activity) + seed + Archive Manager.
