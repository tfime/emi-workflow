# OrgMembers — field nghiệp vụ

| InternalName | Type | Values | Ghi chú |
|---|---|---|---|
| OUCode | Text | | Mã phòng ban |
| MemberUPN | Text | email | Tài khoản thành viên |
| MemberRole | Choice | `Manager`, `Member` | BA: Trưởng phòng / Thành viên |
| IsActive | Boolean | | |
| Title | Text | | Tên hiển thị (từ People Picker) |

`Manager` → đồng bộ `EMI_PAY_OrgUnits.ManagerUPN`.

Provision: `02_Add_OrgMembers_MemberRole.ps1 -Mode Apply`
