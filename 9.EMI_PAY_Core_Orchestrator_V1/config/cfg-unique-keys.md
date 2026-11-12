# Chống trùng list cấu hình (CFG)

## Cột `CfgKey` (Text, Indexed, EnforceUniqueValues)

| List | CfgKey = |
|---|---|
| EMI_PAY_PaymentTypes | `PaymentTypeCode` |
| EMI_PAY_OrgUnits | `OUCode` |
| EMI_PAY_OrgMembers | `OUCode\|MemberUPN` |
| EMI_PAY_WorkflowVersions | `WorkflowCode\|VersionNo` |
| EMI_PAY_WorkflowSteps | `WorkflowCode\|VersionNo\|StepKey` |
| EMI_PAY_ChecklistTemplates | `PaymentTypeCode\|VersionNo\|ItemCode` |
| EMI_PAY_StepRecipients | `WorkflowCode\|VersionNo\|StepKey\|OUCode` |

Chuẩn hóa: trim + lower-case.

## Lớp bảo vệ

1. **SharePoint** — `CfgKey` unique → Site Contents / list form cũng bị chặn.
2. **Seed** — upsert theo khóa; ghi `CfgKey` (sau khi đã có cột).
3. CFG chỉnh tay trên Site Contents — tôn trọng cùng công thức `CfgKey`.

## Trên CECM

```powershell
# 1) Liệt kê trùng (vd. PaymentTypes)
.\03_Enforce_Cfg_UniqueKeys.ps1 -Mode Validate

# 2) Xóa/gộp bản ghi trùng trên list

# 3) Tạo CfgKey + enforce unique + backfill
.\03_Enforce_Cfg_UniqueKeys.ps1 -Mode Apply
```
