# EMI PAY — Port UI preview → SPFx

> **Nguồn UI:** `ui-preview/emi-pay-v2.html` (source of truth)  
> **Ma trận:** `EMI_PAY_MaTran_VaiTro_HanhDong_ThanhPhan_V1.0.md`  
> **Commit nền:** `c18a43b`  
> **Nguyên tắc:** mỗi bước xong mới sang bước sau; không viết lại Flow; UI chỉ enqueue Commands + đọc Lists; layout/copy = preview.

## Kịch bản

| Bước | Việc | Kết quả | Trạng thái |
|---|---|---|---|
| **1** | Shell + token (SCSS/Fluent): full-bleed, nav, top bar, chữ đen, nút xanh/đỏ, radius 4px, BusyDialog + MessageBar | Mọi màn cùng khung | done |
| **2** | Việc của tôi — table inbox · Cần xử lý / Liên quan · lọc WorkItem/Assignment + StepKey | Click → chi tiết | done |
| **3** | Tạo hồ sơ — form + checklist template · right preview · `CREATE_REQUEST` + chờ Flow | Tạo xong vào chi tiết | done |
| **4** | Chi tiết khung — header/tags · Tài liệu 2 tab · Hoạt động 2 tab · Right: mã/tiền/tóm tắt + luồng duyệt | Layout = preview | done |
| **5** | Tài liệu thật — upload DocsWorking/Internal · DocumentIndex · drawer xem + comment | A05/A09/B03/F03 | done |
| **6** | Hành động theo bước — Edit Draft/Returned · SUBMIT · DECIDE · đánh giá checklist · UNC · CONFIRM · archive | R01–R06 | done |
| **7** | Vai trò UI — tách TCKT KT/TT · ẩn nút sai bước · PROCADM · AUDIT | Nav/nút theo role | done |
| **8** | UAT CECM — Demo Off · Full-width · happy + returned + UNC + archive | So khớp preview + Core | pending |
| **CFG** | Trang PROCADM — 7 Lists cấu hình (không SystemSettings) | Đọc/thêm danh mục CECM | done |

## 7 Lists cấu hình (PROCADM Contribute)

1. `EMI_PAY_PaymentTypes`
2. `EMI_PAY_OrgUnits`
3. `EMI_PAY_OrgMembers`
4. `EMI_PAY_WorkflowVersions`
5. `EMI_PAY_WorkflowSteps`
6. `EMI_PAY_ChecklistTemplates`
7. `EMI_PAY_StepRecipients`

`EMI_PAY_SystemSettings` = SYSADM only — UI chỉ nhắc, không mở sửa.

## Ghi chú UAT (bước 8)

- Page **Full-width**; property **Demo Off** → `LivePayApp`
- Kiểm tra: tạo → tải checklist → SUBMIT → DECIDE các bước → UNC → CONFIRM_PAYMENT
- Trả về (REJECT) → sửa → gửi lại
- Persona UI chỉ để xem đúng nút/nav; ACL SharePoint vẫn do tenant
- PROCADM: persona R08 → Cấu hình quy trình; cần user thuộc `GR-PAY-PROCADM`
