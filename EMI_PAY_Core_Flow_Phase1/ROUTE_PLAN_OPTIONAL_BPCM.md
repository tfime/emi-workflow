# RoutePlan — chọn phòng kiểm tra BPCM (tuỳ hồ sơ)

> **Chốt lại 13/11/2026 (sửa hướng):** Không phải admin gắn cố định theo loại hồ sơ.
> Người tạo **chọn** phòng kiểm tra trung gian cho từng hồ sơ: có thể **cả BPCM2 + BPCM3**, **chỉ 1 trong 2**, hoặc **không qua** (TP duyệt → thẳng TCKT).
>
> Spec cũ `ROUTE_BY_PAYMENT_TYPE.md` (WorkflowCode rút gọn) — **bỏ hướng đó**.

## BA cần chỉnh nhẹ

Quy tắc V1.0 §03.4: «user không tự ý bỏ qua bước» — hiểu lại:

- **Không** tự bịa bước ngoài danh mục CFG.
- **Được** chọn subset các bước BPCM trung gian đã cấu hình (`StepRecipients`), pin vào `RoutePlanJson` lúc tạo/trình lại.
- TCKT_CHECK / CHAIR / TCKT_PAY vẫn bắt buộc theo quy trình khung.

## Khung bước

| Nhóm | StepKey | Bắt buộc? | Ai chọn OU |
|------|---------|-----------|------------|
| Đầu | `BPCM1_PREPARE` | Có | Đơn vị khởi tạo |
| Trung gian (tuỳ chọn) | `BPCM2_TECH`, `BPCM3_PRICE` | **Không** — 0 / 1 / 2 | Người tạo: chọn OU hoặc «Không qua» |
| Cố định sau | `TCKT_CHECK` → `CHAIR_APPROVE` → `TCKT_PAY` → `SYSTEM_ARCHIVE` | Có | Default `StepRecipients` (UI không bắt chọn) |

Thứ tự khi có mặt: luôn `BPCM2` trước `BPCM3` (theo `StepOrder`), rồi mới TCKT.

### Ví dụ

```
Cả hai:     TP → BPCM2(OU_A) → BPCM3(OU_B) → TCKT → CHAIR → TT
Chỉ BPCM2:  TP → BPCM2(OU_A) → TCKT → …
Chỉ BPCM3:  TP → BPCM3(OU_B) → TCKT → …
Không BPCM: TP → TCKT → CHAIR → TT
```

## `RoutePlanJson` (pin lúc CREATE / sửa Draft·Returned)

- Key có mặt = hồ sơ **có qua** bước đó + OU nhận.
- Key **vắng** với BPCM2/BPCM3 = **bỏ qua** bước đó.
- TCKT / CHAIR / Archive vẫn có trong plan (default), hoặc Flow tự lấy `StepRecipients.IsDefault` nếu thiếu.

```json
{
  "BPCM2_TECH": "OU_KYTHUAT",
  "TCKT_CHECK": "OU_TCKT",
  "CHAIR_APPROVE": "OU_CHAIR",
  "TCKT_PAY": "OU_TCKT"
}
```

(Ví dụ chỉ BPCM2 — không có `BPCM3_PRICE`.)

Schema: **không** thêm cột. Dùng `RoutePlanJson` + `StepRecipients` có sẵn.

## Core `DECIDE` PASS

1. Chuỗi ứng viên sort `StepOrder` (từ `WorkflowSteps` hoặc danh sách cố định Phase1).
2. Từ bước hiện tại, `NextStepKey` = bước kế **có trong RoutePlan** (với BPCM2/3) **hoặc** thuộc nhóm cố định (TCKT/CHAIR/PAY).
3. BPCM2/3 **không** có trong RoutePlan → nhảy qua.
4. CHAIR hai bước (`paymentDueAt`) giữ nguyên.
5. REJECT → BPCM1; gửi lại được sửa RoutePlan trước khi trình TP lại.

## SPFx (form tạo / sửa)

- Khối «Phòng nhận kiểm tra»: mỗi BPCM2 / BPCM3 = dropdown OU từ `StepRecipients` **+** option đầu «Không qua bước này».
- Không bắt buộc chọn cả hai.
- Hint: TCKT / CT.HĐQT lấy mặc định từ cấu hình.
- Rail xem trước: liệt kê các bước trung gian đã chọn (hoặc «Thẳng TCKT»).

## Không làm

- WorkflowCode riêng `EMI_PAY_DIRECT` chỉ để bỏ BPCM (hướng đã huỷ).
- Hardcode luôn bắt BPCM2 rồi BPCM3 trong Flow.
- Cho user bỏ TCKT / CHAIR / thanh toán.

## Trạng thái triển khai (13/11/2026)

1. ~~SPFx~~ — DONE (`routePlan.ts`, form tạo/sửa «Không qua», rail tuyến kiểm tra).
2. ~~Core~~ — DONE **1.0.0.22** (skip BPCM + fix CREATE `RoutePlanJson`/`_biz`). ZIP: `EMI_PAY_CORE_V1_1_0_0_22.zip`.
3. **Còn:** Import tenant + UAT 4 case (cả hai / chỉ 2 / chỉ 3 / không BPCM).
4. Cập nhật câu chữ BA §03.4 cho khớp (PROCADM / BA owner).
