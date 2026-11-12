# EMI PAY Core Orchestrator — Runbook

**Solution:** `EMI_PAY_CORE_V1` v`1.0.0.9`  
**Flow:** `EMI_PAY_CORE_Orchestrator_V1`  
**ZIP:** `EMI_PAY_CORE_V1_1_0_0_9.zip`

## Lệnh đã có

| Lệnh | Kết quả |
|---|---|
| `CREATE_REQUEST` | Draft @ BPCM1 + WI + checklist DOC_REQUEST/DOC_INVOICE |
| `SUBMIT` | Gate checklist → BPCM2; Returned → ReviewRound+1 |
| `DECIDE PASS` | BPCM2→…→TCKT_PAY; **CHAIR** bắt buộc `paymentDueAt` → ghi `PaymentDueAt` |
| `DECIDE REJECT` | Về BPCM1 / Returned |
| `CONFIRM_PAYMENT` | Gate UNC DocumentIndex → Archiving |

## Import

Import `EMI_PAY_CORE_V1_1_0_0_9.zip` → connection CECM → Flow **On**.

Lần đầu CHAIR: UAT có thể tạo cột `EMI_PAY_Requests.PaymentDueAt` (DateTime) nếu chưa có.

## UAT

```powershell
cd F:\Projects\sharepoint\emi-workflow\EMI_PAY_Core_Flow_Phase1\scripts

.\08_UAT_Phase2_ChairPaymentDueAt.ps1 -WaitSeconds 90
.\07_UAT_Phase2_UncGate.ps1 -WaitSeconds 90
.\04_UAT_Phase1_HappyPath.ps1 -WaitSeconds 90
.\06_UAT_Phase2_ChecklistGate.ps1 -WaitSeconds 90
.\05_UAT_Phase2_RejectResubmit.ps1 -WaitSeconds 90
```

## Backlog còn lại

Xem [PHASE2_BACKLOG.md](PHASE2_BACKLOG.md) — kỹ thuật (dedupe/ETag/Activity) + seed + Archive Manager.
