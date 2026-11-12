# EMI PAY — SPFx UI (live CECM)

Solution SPFx trong `emi-workflow`. Live mode ghi `EMI_PAY_Commands` cho Core Flow `EMI_PAY_CORE_V1` **1.0.0.9**.

| Mục | Giá trị |
|---|---|
| Site | `https://emicomvn.sharepoint.com/sites/cecm` |
| Trang app | [EMI-Pay.aspx](https://emicomvn.sharepoint.com/sites/cecm/SitePages/EMI-Pay.aspx) |
| Package | `sharepoint/solution/emi-pay.sppkg` (sau `npm run package`) |

## Yêu cầu

- Node **22** (`>=22.14 <23`)
- Script: `scripts/resolve-node22.ps1`
- Flow `EMI_PAY_CORE_Orchestrator_V1` **On** trên tenant
- Web part property **Demo mode = Off** (Live CECM)

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
| Tạo hồ sơ | Đọc `PaymentTypes` + `ChecklistTemplates` theo loại → `CREATE_REQUEST` → reconcile checklist thiếu |
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

## Full-bleed (như emi-uikit)

- Manifest: `supportsFullBleed` + `SharePointFullPage`.
- Trang: section **Full-width**, một web part.
- Runtime: `expandCanvasParents` (0 / 100 / 400 ms) + shell `calc(100vh - 48px)`.
- Feedback: Fluent **Dialog + Spinner** khi chờ; **MessageBar** khi xong/lỗi — không toast debug.

## Ghi chú

- `demoMode=true`: mock persona UI, không ghi Commands.
- UI ẩn/hiện nút ≠ bảo mật SharePoint. Trusted caller / Dynamic Permission làm sau.
- Dùng `ReactDOM.render` / `unmountComponentAtNode` (không `react-dom/client`).
