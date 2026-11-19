# EMI Hub Portal (SPFx)

Web part **EMI Hub Portal** — cổng truy cập trên Hub:

- Tài liệu dùng chung (`eecm-demo`)
- Phòng Tổng hợp (`cecm` / TH-*)
- Dự án DnDemo (1 Library = 1 dự án, 4 giai đoạn)

## Build

```powershell
cd demo-sharepoint-structure/spfx
$env:SPFX_OVERRIDE_NODE_VERSION_CHECK = 'true'   # nếu Node ngoài range 18/20/22
npx gulp bundle --ship
npx gulp package-solution --ship
```

Package: `sharepoint/solution/emi-hub-portal.sppkg`

## Deploy lên tenant + gắn trang EMI-Hub

```powershell
cd demo-sharepoint-structure
pwsh ./scripts/22-deploy-hub-portal-spfx.ps1 -ConfigPath ./config/settings.json -ConfirmDeploy
```

Hoặc upload thủ công `.sppkg` vào **Tenant App Catalog** (Deploy to all sites), rồi:

```powershell
pwsh ./scripts/22-deploy-hub-portal-spfx.ps1 -ConfigPath ./config/settings.json -ConfirmDeploy -SkipAppUpload
```

Trang: https://emicomvn.sharepoint.com/sites/eecm-demo/SitePages/EMI-Hub.aspx

Web part id: `7e4a91c2-3f8b-4d6e-9a1c-2b5d8e0f4a67`
