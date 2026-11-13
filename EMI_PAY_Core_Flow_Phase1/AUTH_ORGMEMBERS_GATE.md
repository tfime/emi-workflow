# Cổng OrgMembers (Core **1.0.0.13** — đã gắn trong `Build-Phase1Solution.ps1`)

Cùng quy tắc với SPFx `actorAuth.ts`. UI chỉ hỗ trợ UX; **Flow phải reject** lệnh sai vai trước khi đổi Master.

## Người gọi tin cậy

1. Đọc `Commands` item: `Author/EMail` (hoặc `Author/Email`).
2. Allowlist SYSADM: `tinh.pt@emi.com.vn`.
3. **EffectiveActorUPN**
   - Author ∈ allowlist → `coalesce(Payload.actorUPN, Payload.creatorUPN, Author)`.
   - Ngược lại → Author; nếu payload khai UPN khác Author → **Rejected**.

## Theo CommandType

| Lệnh | Điều kiện |
|---|---|
| `CREATE_REQUEST` | EffectiveActor ∈ `OrgMembers` active **hoặc** Author ∈ allowlist. `createdOUCode` bắt buộc. Nếu không phải SYSADM: có dòng OrgMembers đúng OU. |
| `SUBMIT` | EffectiveActor = `Requests.CreatorUPN`; Status Draft/Returned; Step `BPCM1_PREPARE`. |
| `DECIDE` lúc `AwaitingManager` | OrgMembers: `OUCode = CreatedOUCode`, `MemberRole = Manager`, `MemberUPN = EffectiveActor`, `IsActive`. |
| `ACCEPT` | Step ∈ BPCM2/BPCM3/TCKT_CHECK/TCKT_PAY; Manager của `CurrentOUCode`. |
| `DECIDE` (bước phòng / CHAIR) | Manager của `CurrentOUCode`. |
| `CONFIRM_PAYMENT` | Step `TCKT_PAY`; Manager của `CurrentOUCode`. |

Member **không** ACCEPT / DECIDE / CONFIRM (chỉ làm checklist/ghi chú/đính kèm qua SP REST, không qua 5 lệnh Core).

## Reject

`Commands.State = Rejected`, `ErrorMessage` ngắn (vd. `AUTH: not Manager of CurrentOU`), ghi `ActivityInternal`, HTTP Response cùng state — **không** MERGE Requests/WorkItems.

## Triển khai

1. SPFx + seed Member tạm — **đã làm** (dev).
2. ~~Patch Build~~ → `EMI_PAY_CORE_V1_1_0_0_13.zip` → Import Solution → Flow On.
3. UAT: đóng vai Member → DECIDE Rejected (`AUTH: not Manager…`); đóng vai Manager đúng OU → Succeeded.
