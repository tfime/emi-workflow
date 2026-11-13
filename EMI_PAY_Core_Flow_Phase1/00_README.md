# EMI PAY Core Flow — Phase 1

Cloud Flow Solution `EMI_PAY_CORE_V1` (version **1.0.0.14** — CREATE đủ field + checklist template; OrgMembers AUTH + CHAIR hai bước).

## File chính

| Path | Mục đích |
|---|---|
| `../EMI_PAY_CORE_V1_1_0_0_13.zip` | Solution import (Unmanaged) |
| `EMI_PAY_CORE_Orchestrator_V1.definition.json` | Definition đầy đủ (đối chiếu / rebuild) |
| `transitions.phase1.json` | Bảng bước + choice map + 5 lệnh |
| `00_RUNBOOK_PHASE1.md` | Import, gắn connection, UAT |
| `PHASE2_BACKLOG.md` | Việc làm sau khi happy path chạy |
| `scripts/Build-Phase1Solution.ps1` | Rebuild ZIP từ definition builder |
| `scripts/03_Enqueue_Phase1_Commands.ps1` | Enqueue lệnh lẻ |
| `scripts/04_UAT_Phase1_HappyPath.ps1` | UAT happy path (AwaitingManager + ACCEPT) |
| `scripts/05_UAT_Phase2_RejectResubmit.ps1` | UAT REJECT + SUBMIT lại (ReviewRound) |
| `scripts/09_UAT_Phase2_ActivityAccept.ps1` | UAT Activity + ACCEPT/DueAt gates |

## Lệnh Core (5)

`CREATE_REQUEST` | `SUBMIT` | `ACCEPT` | `DECIDE` | `CONFIRM_PAYMENT`

## Lệnh nhanh

```powershell
.\scripts\Build-Phase1Solution.ps1
.\scripts\04_UAT_Phase1_HappyPath.ps1 -WaitSeconds 90
.\scripts\09_UAT_Phase2_ActivityAccept.ps1 -WaitSeconds 90
```
