# EMI PAY — Dynamic Permission V1

Cấp / thu hồi **ACL theo hồ sơ** (item + folder). **Không** đụng RBAC tĩnh 23/23.

## Ba lớp (nhắc lại)

1. **OrgUnits / OrgMembers** — ai được làm hành động (Manager/Member).  
2. **GR-PAY-*** list ACL — đã PASS V1.9.1.  
3. **Gói này** — ai đọc/ghi đúng `RequestKey`.

Chi tiết: [GRANT_REVOKE_MATRIX.md](GRANT_REVOKE_MATRIX.md).

## Chạy trên CECM

```powershell
cd F:\Projects\sharepoint\emi-workflow\10.EMI_PAY_Dynamic_Permission_V1

# ClientId CECM mặc định: 5c1a7c4d-3b40-4938-821d-12f44ee316e5
# UAT Happy Path mẫu: PAY-CMD-20261112162811-39705a

.\01_Apply_DynAcl_For_Request.ps1 -RequestKey 'PAY-CMD-20261112162811-39705a' -Mode Validate -Connect
.\01_Apply_DynAcl_For_Request.ps1 -RequestKey 'PAY-CMD-20261112162811-39705a' -Mode Apply -Event OnConfirm -Connect
```

Dùng **`-Connect` (Interactive)** — không dùng DeviceLogin với ClientId này (AADSTS7000218).
```

`-Event` gợi ý Docs Contribute (vd. `OnCreate`, `OnDecideReject`); `Auto` suy từ `Status` / `CurrentStepKey`.

## Hook sau Core (chưa gắn vào Flow 1.0.0.12)

Sau mỗi lệnh Core **Succeeded**, gọi Apply với Event tương ứng:

| Core command | Event gợi ý |
|---|---|
| `CREATE_REQUEST` | `OnCreate` |
| `SUBMIT` | `OnSubmit` |
| `ACCEPT` | `OnAccept` |
| `DECIDE` PASS | `OnDecidePass` |
| `DECIDE` REJECT | `OnDecideReject` |
| `CONFIRM_PAYMENT` | `OnConfirm` |

Cách gắn (chọn một, làm ở bước sau):

- Child Flow «Dyn ACL» HTTP + SharePoint REST, hoặc  
- Azure Function / Runbook gọi script này, hoặc  
- Tạm vận hành: chạy `01_Apply_... -Mode Apply` sau UAT từng hồ sơ.

**Không** mở Contribute cấp List cho cả nhóm `GR-PAY-USERS`.  
Ngoại lệ V1: Apply cấp **Contribute list theo UPN** trên `EMI_PAY_StepReviews` (đánh giá checklist + ghi chú USER_NOTE); item vẫn Break → Read.

## An toàn

- Safety: chỉ site CECM.  
- Break inheritance qua PnP `Set-PnPListItemPermission` / `Set-PnPFolderPermission` (giữ role list đã unique: Owners/SYSADM/FLOW-SVC khi copy).  
- Không cấp user vào `ActivityInternal` / `Commands` / `SystemSettings`.  
- Seed `ManagerUPN` thật trước khi UAT persona — `TO_FILL` → không resolve được TP.

## Phạm vi V1 / chưa làm

- DocsInternal theo OU  
- Archive library ACL  
- Gỡ sạch user không còn trong plan (reconcile remove) — V1 chủ yếu **Add/Set** role  
- Trusted caller trong Core (PHASE2 #10) — song song, không thay Dyn ACL  
