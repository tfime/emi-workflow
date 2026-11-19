# EMI SharePoint Demo — Phòng Tổng hợp (ECM)

Triển khai **dữ liệu + quyền thật** trên hai Site hiện hữu:

- Hub: `https://emicomvn.sharepoint.com/sites/eecm-demo`
- EMI: `https://emicomvn.sharepoint.com/sites/cecm`

Theo đặc tả: `EMI_SharePoint_Cursor_Demo_Spec.md`.

**Không** tạo Site mới, không đăng ký Hub, không SPFx. **Không** tự chạy Apply.

## Chuẩn bị

1. PowerShell 7 + `PnP.PowerShell`
2. Entra App `ClientId` được phép `Connect-PnPOnline -Interactive`
3. Sao chép cấu hình:

```powershell
Copy-Item .\config\settings.example.json .\config\settings.json
Copy-Item .\config\members.example.json .\config\members.json
# Sửa clientId; (tuỳ chọn) điền UPN test vào members.json
```

## Chạy

```powershell
cd demo-sharepoint-structure

pwsh ./scripts/invoke-demo.ps1 -Mode Preflight -Config ./config/settings.json
pwsh ./scripts/invoke-demo.ps1 -Mode DryRun    -Config ./config/settings.json

# Chỉ khi Preflight/DryRun OK và người vận hành xác nhận:
pwsh ./scripts/invoke-demo.ps1 -Mode Apply -Config ./config/settings.json -ConfirmApply

pwsh ./scripts/invoke-demo.ps1 -Mode Verify -Config ./config/settings.json
```

Rollback (chỉ object trong `reports/manifest.json`):

```powershell
pwsh ./scripts/rollback-demo.ps1 -ConfirmRollback -ConfirmPhrase 'DELETE-EMI-DEMO-2026'
```

## Báo cáo

Thư mục `reports/`: preflight, apply/provision, permission-matrix, verify, `manifest.json`.

## Phạm vi object

| Site | Objects |
|---|---|
| Hub | `EMI-SharedDocs`, `EMI-ISO-Standards`, `EMI-Templates`, `Lists/EMI_DEMO_DanhMucChung` |
| cecm | `TH-Shared`, `TH-Digital`, `TH-ISO`, `TH-Legal`, `TH-Tech`, `Lists/EMI_DEMO_DanhMucHoSo` |
| DnDemo | `DA-CDS-Portal-2026`, `DA-ISO-DGNB-2026`, `DA-Infra-Wifi-2026` (mỗi lib = 1 dự án, 4 giai đoạn) |

## Trang cổng người dùng (Hub) — SPFx

- URL: https://emicomvn.sharepoint.com/sites/eecm-demo/SitePages/EMI-Hub.aspx  
- Web part: **EMI Hub Portal** (`demo-sharepoint-structure/spfx`)  
- Package: `spfx/sharepoint/solution/emi-hub-portal.sppkg`  
- Build / deploy: xem `spfx/README.md` và `scripts/22-deploy-hub-portal-spfx.ps1`

Không đụng `EMI_PAY_*` hay object ngoài demo.
