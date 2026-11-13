# EMI PAY — SPFx UI (live CECM)

Solution SPFx trong `emi-workflow`. Live mode ghi `EMI_PAY_Commands` rồi **POST HTTP** Core Flow `EMI_PAY_CORE_V1` **1.0.0.14** (CREATE đủ field + checklist template; AUTH; Response đồng bộ).

| Mục | Giá trị |
|---|---|
| Site | `https://emicomvn.sharepoint.com/sites/cecm` |
| Trang app | [EMI-Pay.aspx](https://emicomvn.sharepoint.com/sites/cecm/SitePages/EMI-Pay.aspx) |
| Package | `sharepoint/solution/emi-pay.sppkg` (sau `npm run package`) |

## Yêu cầu

- Node **22** (`>=22.14 <23`)
- Script: `scripts/resolve-node22.ps1`
- Flow `EMI_PAY_CORE_Orchestrator_V1` **1.0.0.14+** **On** (HTTP trigger)
- Flow trigger: **Who can trigger the flow** = **Any user in my tenant** (không để Anyone nếu tenant bắt OAuth)
- Web part: **Demo mode = Off** + dán **Orchestrator HTTP URL**
- **API access**: package xin `Microsoft Flow Service` / `User` → SharePoint Admin → Advanced → API access → **Approve** (cần 1 lần sau deploy/package)

## Live debug trên EMI-Pay.aspx

```powershell
cd F:\Projects\sharepoint\emi-workflow\spfx
.\scripts\gulp-serve.ps1
```

Mở (Chrome đã login M365):

```text
https://emicomvn.sharepoint.com/sites/cecm/SitePages/EMI-Pay.aspx?debug=true&noredir=true&debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js
```

1. Lần đầu: mở `https://localhost:4321/temp/build/manifests.js` và chấp nhận cert.
2. Trên trang: Edit web part → **Demo mode = Off**.
3. Nếu web part chưa có trên trang: Add **EMI PAY**.

Workbench (tuỳ chọn):

```text
https://emicomvn.sharepoint.com/sites/cecm/_layouts/15/workbench.aspx?debug=true&noredir=true&debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js
```

## Live UI làm gì

| Màn | Hành vi |
|---|---|
| Tạo hồ sơ | `CREATE_REQUEST` (Core seed checklist từ template + Title/Amount/RoutePlan) → mở detail |
| Sửa Draft/Returned | Form trên detail (BPCM1): title, số tiền, diễn giải, OU, RoutePlan → MERGE Requests |
| Checklist | Upload file thật → `EMI_PAY_DocsWorking` + `DocumentIndex` + cập nhật `ChecklistItems` |
| Gửi | `SUBMIT` (Flow chặn nếu thiếu file bắt buộc) |
| Xử lý bước | `DECIDE` PASS/REJECT; CHAIR cần `paymentDueAt` |
| TCKT | Upload UNC thật → `CONFIRM_PAYMENT` |

## UAT nhanh

1. Tạo hồ sơ loại `SPV_PAYMENT` → thấy checklist template.
2. Upload DOC_REQUEST + DOC_INVOICE → Gửi → `BPCM2_TECH`.
3. PASS tới CHAIR → nhập due → PASS → `TCKT_PAY`.
4. Upload UNC → Xác nhận → `SYSTEM_ARCHIVE` / Archiving.
5. File thử trong DocsWorking có thể xóa sau.

## UAT sửa thông tin Draft / Returned

1. Tạo hồ sơ → mở detail (Nháp) → đổi tiêu đề/số tiền → **Lưu thông tin** → Làm mới thấy đúng.
2. Trả hồ sơ về Returned → sửa diễn giải / RoutePlan → Lưu → Trình lại.
3. Hồ sơ đang BPCM2+: không còn form sửa.

## UAT checklist theo phòng (không Đạt hết)

1. CREATE full checklist; SUBMIT vẫn cần upload đủ mục bắt buộc.
2. BPCM2: đánh giá **một phần** mục (Đạt) → «Chuyển bước» được (không bắt Đạt hết).
3. Các mục vừa Đạt có badge **Đã khóa**; BPCM3 **xem** được nhưng không «Đánh giá» lại.
4. BPCM3 đánh giá mục còn mở → PASS; TCKT_CHECK tương tự.
5. Có mục **Không đạt** chưa khóa → chỉ «Trả về người tạo», ẩn/chặn chuyển bước.

## Full-bleed (như emi-uikit)

- Manifest: `supportsFullBleed` + `SharePointFullPage`.
- Trang: section **Full-width**, một web part.
- Runtime: `expandCanvasParents` (0 / 100 / 400 ms) + shell `calc(100vh - 48px)`.
- Feedback: Fluent **Dialog + Spinner** khi chờ; **MessageBar** khi xong/lỗi — không toast debug.

## Ghi chú

- `demoMode=true`: mock persona UI, không ghi Commands.
- UI ẩn/hiện nút ≠ bảo mật SharePoint. Trusted caller / Dynamic Permission làm sau.
- Dùng `ReactDOM.render` / `unmountComponentAtNode` (không `react-dom/client`).
