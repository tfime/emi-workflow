# Cổng OrgMembers / người tạo hồ sơ (Core **1.0.0.23**)

Cùng quy tắc với SPFx `actorAuth.ts`. UI chỉ hỗ trợ UX; **Flow phải reject** lệnh sai vai trước khi đổi Master.

## Mô hình quyền (chốt 14/11)

| Ai | OrgMembers? | Được |
|---|---|---|
| **Người tạo hồ sơ** (mọi user đăng nhập site) | **Không bắt buộc** | Chọn phòng (`createdOUCode`) → `CREATE_REQUEST` → checklist → `SUBMIT` hồ sơ mình; xem/sửa Draft·Returned của mình |
| **Manager / Member** trong OrgMembers | Có | Chỉ **kiểm tra / duyệt / tiếp nhận / chốt** đúng OU + bước (ACCEPT / DECIDE / CONFIRM) |
| **SYSADM** | Allowlist | Tạo/trình được; đóng vai Manager để duyệt |

**Không** thêm Choice role «Requester». Ngoại lệ ACL (14/11, script `12_Grant_Users_CreateEnqueue.ps1`):
- `GR-PAY-USERS` **Đọc** CFG: PaymentTypes, OrgUnits, ChecklistTemplates, StepRecipients, WorkflowSteps
- `GR-PAY-USERS` **Đóng góp** `EMI_PAY_Commands` (enqueue; Flow vẫn AUTH)
- **Không** cấp Read rộng `Requests` — xem/sửa hồ sơ vẫn qua Dyn ACL theo RequestKey.

## Người gọi tin cậy

1. Đọc `Commands` item: `Author/EMail` (hoặc `Author/Email`).
2. Allowlist SYSADM: `tinh.pt@emi.com.vn`.
3. **EffectiveActorUPN**
   - Author ∈ allowlist → `coalesce(Payload.actorUPN, Payload.creatorUPN, Author)`.
   - Ngược lại → Author; nếu payload khai UPN khác Author → **Rejected**.

## Theo CommandType

| Lệnh | Điều kiện |
|---|---|
| `CREATE_REQUEST` | `createdOUCode` bắt buộc (phòng user chọn). **Không** đòi OrgMembers đúng OU. |
| `SUBMIT` | EffectiveActor = `Requests.CreatorUPN`; Status Draft/Returned; Step `BPCM1_PREPARE`. |
| `DECIDE` lúc `AwaitingManager` | OrgMembers: `OUCode = CreatedOUCode`, `MemberRole = Manager`, `MemberUPN = EffectiveActor`, `IsActive`. |
| `ACCEPT` | Step ∈ BPCM2/BPCM3/TCKT_CHECK/TCKT_PAY; Manager của `CurrentOUCode`. |
| `DECIDE` (bước phòng / CHAIR) | Manager của `CurrentOUCode`. |
| `CONFIRM_PAYMENT` | Step `TCKT_PAY`; Manager của `CurrentOUCode`. |

Member OrgMembers **không** ACCEPT / DECIDE / CONFIRM (chỉ checklist/ghi chú/đính kèm qua SP REST khi được cấp item).

## Reject

`Commands.State = Rejected`, `ErrorMessage` ngắn (vd. `AUTH: not Manager of CurrentOU`), ghi `ActivityInternal`, HTTP Response cùng state — **không** MERGE Requests/WorkItems.

## Triển khai

1. SPFx — chọn OU tự do khi tạo; `known: false` vẫn CREATE/SUBMIT.
2. Build/Import Core **`1.0.0.23`** (AUTH CREATE bỏ OrgMember-of-OU).
3. UAT: user không OrgMembers → tạo + trình OK; DECIDE vẫn Rejected nếu không phải Manager.
