# EMI PAY — Core Orchestrator V1 (code-first)

Xử lý quy trình hồ sơ thanh toán SPV bằng **PnP PowerShell**, không dựng Power Automate Cloud Flow trong Core V1.

## Đã chốt

- Trả hồ sơ → người tạo; `SUBMIT` lại → resume bước đã trả (`returnFromStepKey` trong `EMI_PAY_ActivityInternal`).
- Sau `TCKT_UNC` → `PendingPayment`; lệnh `CONFIRM_PAYMENT` ghi `PaymentConfirmed` + `PaidAt`.
- RBAC 23/23 không đụng. Schema không đổi.

## Chuẩn bị

```powershell
Connect-PnPOnline -Url 'https://emicomvn.sharepoint.com/sites/cecm' `
  -ClientId '5c1a7c4d-3b40-4938-821d-12f44ee316e5' -Interactive
```

(Tuỳ chọn) sửa `ManagerUPN` trong `config\seed-config.json` thay `TO_FILL`.

## 0) Preflight — chỉ đọc (không ghi)

Kiểm tra kết nối, đúng site CECM, mở được 15 list theo GUID, đủ cột orchestrator cần, CAML đọc được.

```powershell
cd F:\Projects\sharepoint\emi-workflow\9.EMI_PAY_Core_Orchestrator_V1
.\00_Preflight_ReadCheck.ps1
```

PASS mới nên Seed/Orchestrator. Báo cáo CSV: `preflight-report-*.csv`.

## 1) Seed cấu hình

```powershell
cd F:\Projects\sharepoint\emi-workflow\9.EMI_PAY_Core_Orchestrator_V1
.\01_Seed_Config.ps1 -Mode Validate
.\01_Seed_Config.ps1 -Mode Apply
```

## 2) Demo CREATE

```powershell
.\03_Enqueue_Demo_Commands.ps1 -Scenario CreateOnly
.\02_Run_Orchestrator.ps1
```

Ghi lại `RequestKey` từ output / list Commands.

## 3) SUBMIT → đi các bước

```powershell
# Dùng đúng RequestKey in ra ở bước 2 (ví dụ REQ-20261112023442-7a7287), không gõ literal REQ-...
.\04_Enqueue_Followup.ps1 -RequestKey 'REQ-20261112023442-7a7287' -CommandType SUBMIT -SkipChecklistForPilot
.\02_Run_Orchestrator.ps1

# Lặp COMPLETE_STEP cho PBCM2 → … → TCKT_UNC
.\04_Enqueue_Followup.ps1 -RequestKey 'REQ-20261112023442-7a7287' -CommandType COMPLETE_STEP
.\02_Run_Orchestrator.ps1

# Xác nhận thanh toán
.\04_Enqueue_Followup.ps1 -RequestKey 'REQ-20261112023442-7a7287' -CommandType CONFIRM_PAYMENT
.\02_Run_Orchestrator.ps1
```

## 4) Trả hồ sơ

```powershell
.\04_Enqueue_Followup.ps1 -RequestKey 'REQ-20261112023442-7a7287' -CommandType RETURN_STEP -Reason 'Thiếu chứng từ'
.\02_Run_Orchestrator.ps1
# Người tạo sửa rồi SUBMIT lại → resume đúng bước đã trả
.\04_Enqueue_Followup.ps1 -RequestKey 'REQ-20261112023442-7a7287' -CommandType SUBMIT -SkipChecklistForPilot
.\02_Run_Orchestrator.ps1
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `01_Seed_Config.ps1` | Validate/Apply OrgUnits, PaymentTypes, Workflow, Checklist |
| `src\EMI_PAY_Orchestrator.psm1` | Claim + handlers lệnh |
| `02_Run_Orchestrator.ps1` | Poll Pending hoặc 1 `CommandKey` |
| `03_Enqueue_Demo_Commands.ps1` / `04_Enqueue_Followup.ps1` | Tạo lệnh demo |

Pilot: OU `ManagerUPN=TO_FILL` và chưa có `OrgMembers` → authorize demo cho mọi `actorUPN`. Khi có UPN thật, cập nhật seed và bỏ cơ chế soft-allow.
