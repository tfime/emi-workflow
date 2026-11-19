# EMI PAY — Ma trận Grant / Revoke (Dynamic ACL V1)

**Giữ nguyên RBAC tĩnh V1.9.1.** Không cấp `GR-PAY-USERS` / `CHAIR` / `TCKT` Contribute cấp List.  
Principal = **UPN cá nhân**. Khi Break item/folder: **CopyRoleAssignments = true** để giữ Owners + `GR-PAY-SYSADM` + `GR-PAY-FLOW-SVC`.

## Đối tượng Dyn

| Target | Cách gắn | Role user nghiệp vụ |
|---|---|---|
| Item `EMI_PAY_Requests` (đúng RequestKey) | Break item | **Read** (không Contribute) |
| Item `WorkItems`, `Assignments`, `ChecklistItems`, `DocumentIndex`, `ActivityPublic`, `StepReviews` cùng RequestKey | Break item | **Read** (pilot: assignee có thể **Contribute** ChecklistItems + StepReviews) |
| List `EMI_PAY_StepReviews` (theo UPN hồ sơ) | List permission **Contribute** cho principal đã tham gia | SPFx ghi đánh giá Pass/Fail + ghi chú (`ChecklistItemKey` chứa `USER_NOTE`). **Không** cấp qua nhóm `GR-PAY-USERS`. |
| Folder `EMI_PAY_DocsWorking/{RequestKey}` | Break folder | **Contribute** khi đang soạn/bổ sung; còn lại **Read** |
| Folder `EMI_PAY_DocsInternal/{RequestKey}/{OUCode}` | Break folder | **Contribute** chỉ OU/assignee bước (V1.1) |
| `ActivityInternal`, `Commands`, `SystemSettings`, ArchiveJobs | — | **Không cấp** user |
| Archive libraries | Sau CONFIRM | **Read** cho principal liên quan (V1.1) |

## Principal theo nguồn

| Nguồn | Field |
|---|---|
| Người tạo | `Requests.CreatorUPN` |
| TP phòng hiện tại | `OrgUnits.ManagerUPN` where `OUCode = Requests.CurrentOUCode` |
| TP phòng tạo | `OrgUnits.ManagerUPN` where `OUCode = Requests.CreatedOUCode` |
| Assignee | `Assignments` của WorkItem OPEN (khi có) |
| CHAIR / TCKT | Manager của OU default trong `StepRecipients` khi `CurrentStepKey` khớp |

## Theo sự kiện Core

| Event | Grant | Revoke / hạ quyền |
|---|---|---|
| **OnCreate** (`CREATE_REQUEST`) | Creator: Read items + **Contribute** DocsWorking folder; Ensure folder | — |
| **OnSubmit** | Manager `CreatedOUCode` (AwaitingManager): Read items + Read Docs | Creator Docs: Contribute → **Read** |
| **OnAccept** | Assignees (nếu có): Read items; Manager giữ Read | — |
| **OnDecidePass** | Manager / principals bước **mới** (`CurrentOUCode`): Read | Bước cũ: Docs Contribute → Read (nếu có) |
| **OnDecideReject** → BPCM1 | Creator: Docs **Contribute** lại; Read items | Principals bước bị trả: Docs → Read |
| **OnConfirm** (+ Archiving) | Mọi principal đã tham gia: **Read** items + Docs | Mọi Contribute Docs → **Read** |

## Quy tắc DocsWorking Contribute

| Điều kiện | DocsWorking role |
|---|---|
| `Status` ∈ { Draft, Returned } hoặc `CurrentStepKey` = `BPCM1_PREPARE` | Creator = **Contribute** |
| Bước kiểm tra / duyệt / thanh toán | Creator + others = **Read** (upload UNC/support: assignee bước hiện tại = Contribute — V1 script cấp Contribute cho current Manager khi step ∈ TCKT_PAY) |
| `Status` ∈ { Archiving, Completed, Cancelled } hoặc `IsLocked` | Tất cả = **Read** |

## Lớp nghiệp vụ (không phải ACL)

Flow vẫn phải kiểm tra `Manager` vs `Member` trước `ACCEPT`/`DECIDE` (OrgMembers). ACL chỉ cho **thấy/tải file**, không thay gate lệnh.

## Kiểm chứng UAT (user-level)

1. User A tạo hồ sơ → thấy Docs; user B cùng site nhưng khác OU → **403/empty**.  
2. Sau SUBMIT → A không upload checklist được; Manager OU thấy Read.  
3. Member gọi DECIDE → Flow reject dù vẫn Read được file.  
4. Sau CONFIRM → không ai Contribute Docs.
