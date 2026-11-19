# Perf Gói 2 — CREATE đủ field + checklist từ template (đề xuất)

**Trạng thái:** DONE trong repo — Solution `1.0.0.14` (`EMI_PAY_CORE_V1_1_0_0_14.zip`). Cần Import Flow + bật On trên tenant.  
**Phụ thuộc:** Perf Gói 1 (SPFx) đã làm.  
**Mục tiêu:** Cắt công việc sau `CREATE_REQUEST` trên UI khi nhiều user tạo hồ sơ đồng thời.

## Gap hiện tại

| Bước | Ai làm | Vấn đề |
|---|---|---|
| Flow CREATE | Master `Title=RequestKey`, `Explanation` cố định; không Amount/RoutePlanJson | SPFx phải `patchRequestAfterCreate` |
| Flow CREATE | Chỉ stub `DOC_REQUEST` + `DOC_INVOICE` | SPFx `reconcileChecklistFromTemplates` (N POST/MERGE/DELETE) |
| SPFx sau lệnh | Patch + reconcile rồi mới vào detail | Latency + tải list ChecklistItems khi đông user |

## Đề xuất thay đổi Flow (`CREATE_REQUEST`)

1. **HTTP_CreateMaster** — ghi từ payload:
   - `Title` ← `payload.title` (fallback RequestKey nếu trống)
   - `Explanation` ← `payload.explanation`
   - `Amount` ← `payload.amount` (nếu cột có trên list)
   - `RoutePlanJson` ← `string(payload.routePlan)` hoặc `payload.routePlanJson`
   - Giữ `CreatedOUCode`, `CreatorUPN`, `PaymentTypeCode` như hiện tại
2. **Checklist** — thay 2 stub cứng:
   - GET `EMI_PAY_ChecklistTemplates` theo `PaymentTypeCode` (+ Version)
   - Foreach tạo `EMI_PAY_ChecklistItems` (ItemCode/Label/IsRequired/MinFileCount)
   - Fallback: nếu không có template → giữ 2 stub DOC_* (an toàn pilot)
3. **Version bump** Solution (đề xuất `1.0.0.14` hoặc gắn cùng đợt AUTH nếu gộp) + UAT script CREATE assert field + số mục checklist = template

## Đề xuất SPFx sau khi Flow lên

- Bỏ `patchRequestAfterCreate` trên đường CREATE (hoặc no-op nếu field đã đủ).
- Bỏ / thu hẹp `reconcileChecklistFromTemplates` sau CREATE (`skipReconcile` mặc định).
- Giữ `checklistMatchesTemplates` khi mở Draft cũ (hồ sơ tạo trước Gói 2).

## Không làm trong Gói 2

- Nâng concurrency trigger (Gói 3 — cần Dedupe + ETag trước).
- Dyn ACL trong đường sync Response.
- Đổi 5 lệnh Core / schema list mới.

## UAT tối thiểu

1. CREATE từ SPFx với title/amount/route khác mặc định → Master đúng, không cần đợi patch UI.
2. ChecklistItems = đủ template loại `SPV_PAYMENT` (không chỉ 2 stub).
3. SUBMIT gate checklist vẫn Pass với mục required đã upload.
4. Hai user tạo 2 hồ sơ gần như cùng lúc → cả hai Succeeded, không lẫn RequestKey.

## Duyệt / triển khai

- [x] Duyệt đề xuất
- [x] Sửa Build + ZIP `1.0.0.14` (gồm AUTH 1.0.0.13)
- [x] SPFx CREATE bỏ patch/reconcile; gửi `routePlanJson` + `checklistVersion`
- [ ] Import ZIP trên tenant + Flow On
- [ ] UAT CREATE (field + số mục checklist = template)
