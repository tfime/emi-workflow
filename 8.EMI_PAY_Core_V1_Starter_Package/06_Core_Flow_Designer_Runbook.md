# EMI PAY — Core Orchestrator V1 (code-first)

**Cập nhật:** Core V1 chuyển sang **PnP PowerShell** trong gói `9.EMI_PAY_Core_Orchestrator_V1`. Không dựng Automated Cloud Flow trên Power Automate designer cho logic nghiệp vụ.

Xem hướng dẫn chạy: [`../9.EMI_PAY_Core_Orchestrator_V1/00_README.md`](../9.EMI_PAY_Core_Orchestrator_V1/00_README.md).

## Hợp đồng lệnh

Trigger logic = item `EMI_PAY_Commands` với `State=Pending`. Orchestrator claim → `Processing` → `Succeeded` | `Rejected` | `Failed`.

| CommandType | Hành vi |
|---|---|
| `CREATE_REQUEST` | Master `Draft` + checklist + WorkItem `PBCM` |
| `SUBMIT` | Pin version; lần đầu → `PBCM2`; sau `Returned` → resume `returnFromStepKey` |
| `COMPLETE_STEP` | Đóng WI; tới bước kế; sau `TCKT_UNC` → `PendingPayment` + WI `PAYMENT_CONFIRM` |
| `RETURN_STEP` | Về người tạo `Returned`; ghi `returnFromStepKey` vào ActivityInternal |
| `CONFIRM_PAYMENT` | `PaymentConfirmed` + `PaidAt` |

## InternalName chính (đã đối chiếu export)

- Commands: `CommandKey`, `CommandType`, `PayloadJson`, `State`, `DedupeKey`, `RequestKey`, `StepInstanceKey`, `ProcessedAt`, `ErrorMessage`
- Requests: `RequestKey`, `Status`, `CurrentStepKey`, `CurrentOUCode`, `WorkflowVersion`, `ReviewRound`, `PaidAt`, `IsLocked`
- WorkItems: `StepInstanceKey`, `StepKey`, `State`, `Decision`, `ResponsibleOUCode`
- ActivityInternal: `EventType`, `DetailsJson` (chứa `returnFromStepKey` khi `RETURNED`)

List GUID: `config/list-guids.json` trong gói 9.
