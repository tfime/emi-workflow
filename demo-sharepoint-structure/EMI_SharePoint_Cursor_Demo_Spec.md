# EMI SHAREPOINT — ĐẶC TẢ CURSOR TRIỂN KHAI DEMO ECM PHÒNG TỔNG HỢP

> **Phiên bản:** 1.0 — 19/11/2026  
> **Mục đích:** Giao cho Cursor lập trình, kết nối SharePoint Online và **tạo dữ liệu mẫu thật**, phân quyền mẫu, kiểm tra kết quả trên **hai Site đã có**.  
> **Phạm vi:** Chỉ `eecm-demo` (Hub Site) và `cecm` (Site pháp nhân EMI); chỉ dựng nghiệp vụ **Phòng Tổng hợp** gồm **Chuyển đổi số (CĐS), ISO, Pháp lý, Công nghệ**.  
> **Không nằm trong phạm vi:** UI SPFx, trang dashboard tùy biến, tạo Site mới, thay đổi cấu trúc phòng ban ngoài Phòng Tổng hợp, triển khai tự động toàn tenant.

---

## 0. CHỈ THỊ BẮT BUỘC DÀNH CHO CURSOR

Đây là yêu cầu **triển khai thực**, không phải chỉ sinh mã minh họa. Hãy:

1. Đọc toàn bộ tài liệu này, kiểm tra phiên bản và tham số của công cụ SharePoint định sử dụng.
2. Tạo dự án mã nguồn và script có thể chạy lại (idempotent).
3. Chạy **Preflight → Dry Run → Apply → Verify** theo đúng nguyên tắc an toàn, **chỉ Apply sau khi người vận hành xác nhận bằng lệnh rõ ràng**.
4. Tạo thư viện, cột metadata, folder, Document Set, nhóm SharePoint và dữ liệu mẫu **trên tenant thực** khi có quyền hợp lệ.
5. Xuất báo cáo cuối cùng: URL của từng Library/List/Folder/Document Set; ma trận quyền thực tế; số bản ghi/tệp; những mục thành công/thất bại/cần kiểm thử thủ công.
6. Nếu gặp lỗi đăng nhập hoặc thiếu quyền, dừng ở đúng bước, báo nguyên nhân và lệnh khắc phục; **không báo thành công khi chưa thực hiện**.
7. **Không xóa/sửa thư viện, hồ sơ, nhóm quyền hoặc quyền truy cập hiện hữu không thuộc demo.** Không suy đoán danh tính nhân sự hay tự gán quyền cho toàn tenant.

### Thông tin Site đã xác nhận về nghiệp vụ

| Thành phần | URL dự kiến để kiểm tra | Trạng thái người dùng đã xác nhận | Việc Cursor phải làm |
|---|---|---|---|
| Hub Site | `https://emicomvn.sharepoint.com/sites/eecm-demo` | **Đã là Hub Site** | Xác minh Hub registration; không đăng ký lại, không tạo Site mới |
| Site EMI | `https://emicomvn.sharepoint.com/sites/cecm` | **Đã tồn tại, đã liên kết vào Hub** | Xác minh URL và Hub association; không liên kết lại nếu đúng |

**Quan trọng:** Đường dẫn `/sites/cecm` là giả định từ tên Site được cung cấp, **không phải kết quả đọc tenant**. Preflight phải xác minh URL thực và cho phép sửa qua cấu hình. Nếu không khớp, dừng. Không tự sửa tên, URL, Hub registration hay Hub association.

---

## 1. MỤC TIÊU NGHIỆP VỤ DEMO

Sau khi triển khai, người dùng nhìn thấy trực tiếp trên SharePoint:

- **EMI Hub** có Document Libraries dành cho tài liệu chính thức **dùng chung toàn hệ thống**.
- **Site EMI / cecm** có các Document Libraries của **Phòng Tổng hợp** và 4 bộ phận CĐS, ISO, Pháp lý, Công nghệ.
- **Mỗi bộ phận có Library riêng và nhóm RBAC riêng**; người dùng của CĐS không mặc nhiên được vào Library Pháp lý hay ISO.
- Cấu trúc tài liệu bên trong Library sử dụng **Folder** khi cần, **Metadata/Views** để phân loại và **Document Set** cho một bộ hồ sơ nhiều tệp.
- Có một ví dụ nghiệp vụ rõ ràng: hồ sơ **Đào tạo CĐS 2026** được soạn trong Library CĐS; **bản phát hành chính thức** được lưu trong Library tài liệu dùng chung của Hub.
- Không xây UI mới. Người dùng thao tác trực tiếp bằng giao diện SharePoint mặc định để đánh giá **kiến trúc thật, dữ liệu thật và quyền thật**.

### Nguyên tắc kiến trúc

- Hub Site **cũng là một SharePoint Site** có Pages, Lists, Libraries và permission riêng.
- `cecm` và `eecm-demo` là **hai Site độc lập**. Hub association **không tạo quan hệ Subsite**, không tự động cấp quyền truy cập chéo.
- "Phòng Tổng hợp" ở đây là **nhóm nghiệp vụ/đơn vị tổ chức**, **không** là một Folder hoặc Subsite buộc phải tồn tại.
- Các Library của Tổng hợp nằm **trực tiếp trong Site EMI**; không có Library lồng trong Library.
- Quyền tại Library phải được thực thi bằng **SharePoint permissions** (không bằng việc ẩn menu).
- **Folder thông thường mặc định kế thừa quyền Library**; chỉ tạo quyền riêng khi có kịch bản demo chia sẻ rõ ràng và được bật tùy chọn.
- Pháp lý/nhân sự nhạy cảm trong bản này dùng **dữ liệu giả lập**, tuyệt đối không đưa hồ sơ thật lên môi trường demo.

---

## 2. SƠ ĐỒ CẤU TRÚC MỤC TIÊU

> Đây là **sơ đồ logic triển khai**. Library được đặt trực tiếp dưới Site; các nút `PHÒNG` chỉ là chú thích nghiệp vụ, không phải đối tượng cha chứa Library trong SharePoint.

```text
MICROSOFT 365 / SHAREPOINT ONLINE
│
├── SITE eecm-demo  [COMMUNICATION/TEAM SITE hiện hữu — HUB SITE]
│   │
│   ├── LIB  EMI - Tai lieu dung chung        [Ban cong bo / huong dan]
│   ├── LIB  EMI - Quy trinh ISO chuan       [Tai lieu chuan dung chung]
│   ├── LIB  EMI - Bieu mau chuan            [Bieu mau phat hanh]
│   └── LIST EMI_DEMO_DanhMucChung           [Danh muc mau, chi phuc vu demo]
│
└── SITE cecm  [SITE PHÁP NHÂN EMI — ĐÃ ASSOCIATE VỚI eecm-demo]
    │
    └── (Nhóm nghiệp vụ: PHÒNG TỔNG HỢP — LOGIC)
        │
        ├── LIB  TH - Dung chung
        │
        ├── LIB  TH - Chuyen doi so
        │    └── FOLDER Dao tao
        │         └── FOLDER Dao tao CDS 2026
        │              ├── Ke hoach dao tao CDS 2026.docx
        │              ├── Danh sach tham du 2026.xlsx    [DU LIEU GIA]
        │              └── Tai lieu huong dan noi bo.docx
        │
        ├── LIB  TH - ISO thuc hien
        │    ├── DOCUMENT SET ISO-DGNB-2026-01
        │    │    ├── Ke hoach danh gia noi bo.docx
        │    │    ├── Checklist danh gia.xlsx
        │    │    └── Bao cao danh gia.docx
        │    └── (Các hồ sơ ISO khác phân loại bằng metadata/view)
        │
        ├── LIB  TH - Phap ly
        │    └── (Ho so phap ly DEMO, KHONG dung du lieu that)
        │
        ├── LIB  TH - Cong nghe
        │    └── (Tai lieu ha tang, danh muc he thong DEMO)
        │
        └── LIST EMI_DEMO_DanhMucHoSo
             └── (Danh muc minh hoa liên kết đến một số hồ sơ)
```

**Tên hiển thị** trên giao diện SharePoint có thể dùng đầy đủ dấu tiếng Việt. **URL nội bộ** của Library/List ưu tiên ASCII không dấu, cố định ngay lúc tạo; không phụ thuộc việc đổi tên hiển thị về sau.

---

## 3. KHAI BÁO TÀI NGUYÊN CHI TIẾT

### 3.1. Hub `eecm-demo`

Tạo **chỉ nếu chưa tồn tại** và kiểm tra không trùng mục hiện có:

| Library/List | URL name đề xuất | Chức năng | Quyền mục tiêu |
|---|---|---|---|
| EMI - Tài liệu dùng chung | `EMI-SharedDocs` | Tài liệu phát hành toàn hệ thống: hướng dẫn, đào tạo, công bố | GR-EMI-ALL-READ: Read; nhóm quản trị phát hành: Contribute |
| EMI - Quy trình ISO chuẩn | `EMI-ISO-Standards` | Quy trình ISO chuẩn phiên bản chính thức; không lưu chứng cứ thực hiện ISO của phòng ban | GR-EMI-ALL-READ: Read; nhóm quản trị phát hành: Contribute |
| EMI - Biểu mẫu chuẩn | `EMI-Templates` | Biểu mẫu thống nhất, kiểm soát phiên bản | GR-EMI-ALL-READ: Read; nhóm quản trị phát hành: Contribute |
| List EMI_DEMO_DanhMucChung | `Lists/EMI_DEMO_DanhMucChung` | Mã tài liệu, loại tài liệu, phiên bản, thư viện chính thức, URL | Quản trị demo; đọc theo chính sách Hub |

Lưu ý: `GR-EMI-ALL-READ` là nhóm **cần được ánh xạ đúng** đến toàn bộ nhân sự trong phạm vi EMI mong muốn. Không tự ý dùng `Everyone`, `Everyone except external users` hoặc mở ẩn danh. Nếu chưa có nhóm/phạm vi đã xác minh, tạo nhóm demo rỗng và **ghi trạng thái “chưa gán thành viên / chưa công bố toàn EMI”**, không tuyên bố rằng tất cả nhân sự đã xem được.

### 3.2. Site EMI `cecm` — Phòng Tổng hợp

| Library/List | URL name đề xuất | Nội dung | Quyền chỉnh sửa chính |
|---|---|---|---|
| TH - Dùng chung | `TH-Shared` | Kế hoạch phòng, báo cáo tổng hợp, văn bản phối hợp | GR-E-TH-SHARED-EDIT |
| TH - Chuyển đổi số | `TH-Digital` | Kế hoạch CĐS, chuyển đổi quy trình, tài liệu đào tạo đang xử lý | GR-E-TH-CDS-EDIT |
| TH - ISO thực hiện | `TH-ISO` | Đánh giá, chứng cứ thực hiện, khắc phục, cải tiến ISO | GR-E-TH-ISO-EDIT |
| TH - Pháp lý | `TH-Legal` | Hồ sơ xử lý pháp lý giả lập | GR-E-TH-LEGAL-EDIT |
| TH - Công nghệ | `TH-Tech` | Tài liệu ứng dụng/hạ tầng, đánh giá hệ thống giả lập | GR-E-TH-TECH-EDIT |
| List EMI_DEMO_DanhMucHoSo | `Lists/EMI_DEMO_DanhMucHoSo` | Đăng ký bộ hồ sơ mẫu, liên kết Library/Document Set | Chỉ nhóm quản trị demo chỉnh sửa; thành viên liên quan chỉ đọc nếu được phép |

**Không tạo Site phòng Tổng hợp, không tạo Site CĐS/ISO/Pháp lý/Công nghệ, không đặt thư viện này trong thư viện khác.**

### 3.3. Metadata thống nhất trên 5 Library của `cecm`

Tạo các cột (internal name ASCII, tên hiển thị tiếng Việt):

| Internal name | Display name | Kiểu | Ví dụ |
|---|---|---|---|
| `EMI_DemoCode` | Mã hồ sơ/tài liệu | Single line of text | `CDS-DT-2026-01` |
| `EMI_Department` | Phòng ban | Choice | `Tổng hợp` |
| `EMI_Function` | Bộ phận | Choice | `Dùng chung`, `CĐS`, `ISO`, `Pháp lý`, `Công nghệ` |
| `EMI_DocCategory` | Loại hồ sơ | Choice / text cấu hình | `Đào tạo`, `Đánh giá nội bộ`, `Kế hoạch`, `Pháp lý`, `Công nghệ` |
| `EMI_DocStatus` | Trạng thái hồ sơ | Choice | `Dự thảo`, `Đang xử lý`, `Hoàn thành`, `Đã phát hành` |
| `EMI_Year` | Năm | Number | `2026` |
| `EMI_DataClass` | Mức độ tài liệu | Choice | `Nội bộ`, `Dùng chung`, `Hạn chế` |
| `EMI_IsDemo` | Dữ liệu demo | Yes/No | `Yes` |

- Mỗi Library phải bật **version history**; không tự áp retention/sensitivity label thật nếu chưa được phê duyệt.
- Tạo tối thiểu 2 views: `Tất cả hồ sơ` và `Theo loại hồ sơ` (group theo `EMI_DocCategory`); tùy chọn `Theo năm`.
- Không dùng metadata như cơ chế cấp/từ chối quyền.
- Nếu cột đã có với **cùng internal name nhưng khác kiểu** thì **dừng và báo xung đột**, không sửa cột hiện hữu một cách âm thầm.

### 3.4. Document Set tại Library ISO

Tạo **Content Type kế thừa Document Set** mang tên `EMI - Hồ sơ đánh giá ISO` và thêm vào `TH - ISO thực hiện`.

- Tạo **01 Document Set thật** (không được thay thế âm thầm bằng Folder thường): `ISO-DGNB-2026-01`.
- Metadata bộ hồ sơ: `EMI_DemoCode=ISO-DGNB-2026-01`, `EMI_Department=Tổng hợp`, `EMI_Function=ISO`, `EMI_DocCategory=Đánh giá nội bộ`, `EMI_Year=2026`, `EMI_DocStatus=Đang xử lý`, `EMI_IsDemo=Yes`.
- Chỉ định tối thiểu 2 Shared Columns khả dụng (ví dụ `EMI_DemoCode`, `EMI_Year`) và kiểm tra nội dung con nhận giá trị sau khi cập nhật trên Document Set.
- Đưa vào ít nhất 3 tệp mẫu hợp lệ: kế hoạch đánh giá `.docx`, checklist `.xlsx`, báo cáo `.docx`.
- **Ghi kết quả kiểm tra:** có thực sự là Document Set Content Type không; metadata có đồng bộ không; đường dẫn mở bộ hồ sơ.
- Nếu tenant/permission không cho phép tạo hoặc cấu hình Document Set, báo **BLOCKED**, cung cấp bước xử lý; không giả vờ thành công, không tạo Folder có tên giống để thay thế.

---

## 4. RBAC — QUYỀN DEMO PHẢI TÁCH BIỆT

### 4.1. Nhóm quản lý quyền

Ưu tiên **SharePoint Groups trong Site `cecm`** để demo dễ triển khai bằng PnP.PowerShell, tránh đòi quyền tạo security group toàn tenant. Đây là **nhóm cấp quyền RBAC demo**, có thể thay bằng/ánh xạ tới Entra ID Security Groups khi triển khai chính thức.

Tạo hoặc đối chiếu các nhóm:

- `GR-E-TH-LEAD-READ` — lãnh đạo phòng, đọc tất cả Library của Phòng Tổng hợp (demo mặc định chỉ Read).
- `GR-E-TH-SHARED-EDIT` — sửa thư viện dùng chung của phòng.
- `GR-E-TH-CDS-EDIT` — sửa thư viện CĐS.
- `GR-E-TH-ISO-EDIT` — sửa thư viện ISO.
- `GR-E-TH-LEGAL-EDIT` — sửa thư viện Pháp lý.
- `GR-E-TH-TECH-EDIT` — sửa thư viện Công nghệ.
- Nhóm `GR-EMI-ALL-READ` / nhóm phát hành tài liệu Hub: kiểm tra và quản lý riêng trên Site `eecm-demo` (SharePoint Groups là **site-collection scoped**; không giả định cùng một group dùng trực tiếp xuyên hai Site).

**Không tự tạo tài khoản người dùng**. Lấy người dùng thật cho test qua file ánh xạ do quản trị viên nhập. Nhóm để trống vẫn cho phép provision cấu trúc, nhưng phần **UAT thực tế với danh tính sẽ ở trạng thái PENDING**.

### 4.2. Ma trận ACL chuẩn

| Library trên `cecm` | TH-LEAD-READ | SHARED-EDIT | CDS-EDIT | ISO-EDIT | LEGAL-EDIT | TECH-EDIT |
|---|---|---|---|---|---|---|
| TH - Dùng chung | Read | Contribute | Read | Read | Read | Read |
| TH - Chuyển đổi số | Read | — | Contribute | — | — | — |
| TH - ISO thực hiện | Read | — | — | Contribute | — | — |
| TH - Pháp lý | Read | — | — | — | Contribute | — |
| TH - Công nghệ | Read | — | — | — | — | Contribute |

Quy ước: `—` = không cấp quyền; `Contribute` hoặc cấp tương đương cho phép thêm/sửa file, **không cấp Full Control/Edit ở mức quản lý Library** cho nhân sự thông thường nếu không cần. Kiểm tra tên/ID permission level thực tế của Site vì có thể bản địa hóa.

**Cách thực thi bắt buộc:**

1. Trước khi sửa quyền, kiểm tra hiện trạng Site Owners/Members/Visitors và xem Site có gắn Microsoft 365 Group/Teams hay không.
2. **Chỉ ngắt kế thừa trên 5 Library mới do script tạo.** Không thay đổi permission gốc của Site `cecm`.
3. Đảm bảo các Library mới **không giữ lại quyền đọc/sửa rộng** từ Site Members, Site Visitors hoặc nhóm khác ngoài ACL mục tiêu; giữ nguyên quyền quản trị hợp pháp (Site Collection Admins/Site Owners theo yêu cầu nền tảng), không khóa tài khoản vận hành.
4. Gán đúng nhóm/permission theo ma trận. **Quyền SharePoint là cộng dồn**; phải audit toàn bộ nguồn quyền hiệu lực, không chỉ nhìn nhóm RBAC vừa tạo.
5. Không sử dụng cấu hình UI, menu hay metadata để giả lập quyền.
6. Ghi lại trước/sau ACL, `HasUniqueRoleAssignments`, role bindings, đối tượng được cấp quyền và kết quả kiểm tra truy cập.
7. Nếu Library trùng tên nhưng **không do demo tạo**: dừng từng hạng mục, không ngắt kế thừa hoặc xóa quyền của người dùng thật.

### 4.3. Kiểm thử dự kiến với người dùng

| Định danh thử nghiệm (chỉ có khi admin nhập) | TH chung | CĐS | ISO | Pháp lý | Công nghệ |
|---|---|---|---|---|---|
| `cds_user` | Read | Contribute | Denied | Denied | Denied |
| `iso_user` | Read | Denied | Contribute | Denied | Denied |
| `legal_user` | Read | Denied | Denied | Contribute | Denied |
| `tech_user` | Read | Denied | Denied | Denied | Contribute |
| `th_lead` | Read | Read | Read | Read | Read |
| `outside_th_user` (ví dụ người TCKT) | Denied | Denied | Denied | Denied | Denied |

**Đặc biệt:** `outside_th_user` phải là tài khoản bình thường, **không** là Site Owner/Site Collection Admin hoặc thành viên các nhóm được cấp quyền. Nếu dùng tài khoản quản trị làm test âm tính thì kết quả không có giá trị.

---

## 5. DỮ LIỆU MẪU PHẢI TẠO (KHÔNG DÙNG DỮ LIỆU THẬT)

Tạo tệp Office **hợp lệ** (.docx/.xlsx, có nội dung có thể mở và chỉnh sửa; không đổi đuôi file giả). Có thể tạo qua Python (`python-docx`, `openpyxl`) hoặc công cụ tương đương của máy Cursor, rồi upload lên SharePoint bằng API/PnP.

### 5.1. Trên Hub `eecm-demo`

| Library | Dữ liệu mẫu | Metadata |
|---|---|---|
| EMI - Tài liệu dùng chung | `Huong dan su dung SharePoint EMI.docx` | Đã phát hành, Dùng chung, 2026 |
| EMI - Tài liệu dùng chung | `Tai lieu dao tao CDS 2026 - Ban phat hanh.docx` | Đã phát hành, Dùng chung, 2026 |
| EMI - Quy trình ISO chuẩn | `Quy trinh quan ly tai lieu DEMO.docx` | Đã phát hành, ISO, 2026 |
| EMI - Biểu mẫu chuẩn | `Bieu mau bien ban hop DEMO.docx` | Đã phát hành, Biểu mẫu, 2026 |

Không công bố tài liệu có tính chất quy định thật. Tiêu đề và nội dung bên trong ghi rõ **`DỮ LIỆU DEMO — KHÔNG CÓ HIỆU LỰC ÁP DỤNG`**.

### 5.2. Trên Site `cecm`

| Library | Folder/Document Set | Tệp mẫu tối thiểu | Mục tiêu thử nghiệm |
|---|---|---|---|
| TH - Dùng chung | Root | `Ke hoach cong tac phong Tong hop 2026.docx`; `Bao cao tong hop thang 11-2026.docx` | Nhóm các bộ phận cùng đọc |
| TH - Chuyển đổi số | `Dao tao/Dao tao CDS 2026` | `Ke hoach dao tao CDS 2026.docx`; `Danh sach tham du DEMO.xlsx`; `Tai lieu huong dan noi bo.docx` | Hai tầng folder; cùng quyền Library |
| TH - Chuyển đổi số | Root | `Danh muc sang kien CDS.xlsx` | Tìm qua metadata |
| TH - ISO thực hiện | **Document Set `ISO-DGNB-2026-01`** | `Ke hoach danh gia noi bo.docx`; `Checklist danh gia.xlsx`; `Bao cao danh gia.docx` | Gom bộ hồ sơ; Shared Columns |
| TH - Pháp lý | Root | `Danh muc van ban phap ly DEMO.xlsx`; `Phieu ra soat hop dong DEMO.docx` | Kiểm thử quyền bộ phận Pháp lý |
| TH - Công nghệ | Root | `Danh muc ung dung DEMO.xlsx`; `Ke hoach bao tri he thong DEMO.docx` | Kiểm thử quyền bộ phận Công nghệ |

Yêu cầu dữ liệu mẫu có **nội dung riêng biệt, hợp lý theo tên file, số liệu giả rõ ràng**, mỗi loại tài liệu đủ để người dùng hiểu mục đích. Gắn metadata phù hợp. `EMI_IsDemo = Yes` cho toàn bộ file demo tại `cecm`.

### 5.3. Liên kết tài liệu phát hành từ CĐS sang Hub

Mẫu mô phỏng vòng đời:

- File soạn/đang xử lý ở: `cecm` → `TH - Chuyển đổi số` → `Dao tao/Dao tao CDS 2026`.
- **Bản phát hành** ở: `eecm-demo` → `EMI - Tài liệu dùng chung` → `Tai lieu dao tao CDS 2026 - Ban phat hanh.docx`.
- Trong `EMI_DEMO_DanhMucHoSo` của `cecm`, có một item gồm mã hồ sơ, URL file nguồn, URL file phát hành, trạng thái `Đã phát hành`.
- Đây là **tài liệu đang làm việc** và **bản công bố** ở hai trạng thái nghiệp vụ khác nhau; không coi hai bản là hai “nguồn chính thức” đồng thời.

**Không tự mở quyền toàn bộ Library CĐS chỉ để nhân sự khác xem bản đào tạo.** Quyền xem bản phát hành tại Hub được quản lý riêng.

### 5.4. Lists mẫu

**`EMI_DEMO_DanhMucHoSo`** (tại `cecm`) chứa tối thiểu 5 items, gồm:

- `Title` (tên bộ hồ sơ)
- `EMI_DemoCode` (mã)
- `EMI_Function` (bộ phận)
- `EMI_Year` (năm)
- `EMI_DocStatus` (trạng thái)
- `EMI_SourceUrl` (URL tệp/thư mục gốc)
- `EMI_PublishedUrl` (URL phát hành nếu có)
- `EMI_IsDemo` (Yes/No)

**`EMI_DEMO_DanhMucChung`** (tại Hub) chứa tối thiểu 3 items chỉ về tài liệu chuẩn/dùng chung, với mã, loại, thư viện, URL file chính thức. Chỉ đưa các metadata được phép công bố vào List dùng chung.

---

## 6. TÌNH HUỐNG CHIA SẺ FOLDER RIÊNG (TÙY CHỌN, MẶC ĐỊNH TẮT)

Yêu cầu đã thống nhất: tài liệu cần phổ biến toàn EMI thì **ưu tiên xuất bản tại Hub**. Tuy nhiên, để kiểm chứng quyền SharePoint có thể bổ sung một bài test riêng, **chỉ chạy khi tham số `-EnableFolderShareDemo` được bật và đã có nhóm người đọc được duyệt**:

- Chọn Folder `Dao tao/Dao tao CDS 2026` trong Library CĐS.
- Cấp `Read` cho nhóm demo đã xác minh đại diện nhân sự toàn EMI (không tạo link ẩn danh).
- Người được cấp quyền xem Folder và các file kế thừa, nhưng **không xem được các Folder khác trong Library CĐS**.
- Kiểm tra Limited Access cần thiết ở các cấp cha.
- Đảm bảo folder chia sẻ là đối tượng do demo tạo; không chạm các permission scope khác.
- Ghi rõ ACL riêng của Folder và kịch bản hủy quyền demo.

**Nếu không bật tham số này, Folder phải kế thừa quyền Library CĐS, không phát sinh quyền chia sẻ ngoại lệ.**

---

## 7. YÊU CẦU KỸ THUẬT CHO PROJECT CURSOR

### 7.1. Công nghệ triển khai

Khuyến nghị **PowerShell 7 + PnP.PowerShell** với đăng nhập tương tác bằng Entra ID App Registration phù hợp. Có thể kết hợp Microsoft Graph/SharePoint REST/CSOM khi cần cho Document Set hoặc ACL, nhưng phải document rõ API/quyền ứng dụng.

- Không dùng username/password hard-coded, không tự động bỏ qua MFA.
- Với PnP.PowerShell hiện đại, sử dụng `ClientId` của Entra ID app được cấp quyền khi dùng `Connect-PnPOnline -Interactive`.
- Tránh yêu cầu quyền tenant-wide không cần thiết; ưu tiên quyền đúng hai Site, giải thích quyền phải cấp nếu thiếu.
- Không chạy script thiết lập App Catalog, SPFx, hub registration, hub association.
- Kiểm tra nhóm thực tế, quyền user hiện hữu và nhóm Microsoft 365 Group trước khi thao tác ACL.
- Không sử dụng URL/file path đoán để ghi dữ liệu. Lấy ID/ServerRelativeUrl thật sau khi tạo.

Ví dụ lệnh kết nối tham khảo (phải thay client ID do admin cung cấp):

```powershell
Connect-PnPOnline -Url "https://emicomvn.sharepoint.com/sites/cecm" `
  -Interactive -ClientId "<ENTRA-APP-CLIENT-ID>"
```

### 7.2. Tổ chức project đầu ra mà Cursor cần tạo

```text
emi-sharepoint-demo/
├── README.md
├── config/
│   ├── settings.example.json
│   └── members.example.json
├── scripts/
│   ├── 00-preflight.ps1
│   ├── 01-provision-hub.ps1
│   ├── 02-provision-cecm.ps1
│   ├── 03-provision-permissions.ps1
│   ├── 04-seed-content.ps1
│   ├── 05-verify.ps1
│   ├── invoke-demo.ps1
│   └── rollback-demo.ps1          # chỉ xóa các object do demo tạo, có xác nhận
├── seed/
│   ├── libraries.json
│   ├── permissions.json
│   ├── files.json
│   └── lists.json
├── sample-files/                 # file mẫu được sinh đúng định dạng
└── reports/                      # bản ghi JSON/CSV/Markdown sau khi chạy
```

Được phép thay đổi cấu trúc file nếu hợp lý hơn, nhưng **phải tách rõ cấu hình / provisioning / seed / permissions / verification**.

### 7.3. File cấu hình bắt buộc

Ví dụ `config/settings.example.json`:

```json
{
  "hubSiteUrl": "https://emicomvn.sharepoint.com/sites/eecm-demo",
  "emiSiteUrl": "https://emicomvn.sharepoint.com/sites/cecm",
  "clientId": "REPLACE_WITH_APPROVED_ENTRA_APP_CLIENT_ID",
  "mode": "DryRun",
  "createNewSites": false,
  "changeHubRegistration": false,
  "changeHubAssociation": false,
  "enableFolderShareDemo": false,
  "preserveExistingObjects": true,
  "seedPrefix": "EMI-DEMO-2026"
}
```

Ví dụ `config/members.example.json` (không tự điền địa chỉ người thật):

```json
{
  "th_lead": [],
  "shared_edit": [],
  "cds_user": [],
  "iso_user": [],
  "legal_user": [],
  "tech_user": [],
  "outside_th_user": [],
  "hub_publisher": [],
  "emi_all_read_group": null
}
```

File cấu hình thật cần loại khỏi source control nếu có dữ liệu nhạy cảm; **không lưu token, secret hay cookie** trong repo/báo cáo.

### 7.4. Ba chế độ chạy

| Chế độ | Mục tiêu | Được thay đổi SharePoint? |
|---|---|---|
| `Preflight` | Kiểm tra URL, Hub/Association, quyền admin, app auth, tình trạng trùng lặp, site type | Không |
| `DryRun` | In kế hoạch tạo mới/giữ nguyên/xung đột, dự kiến ACL và số file | Không |
| `Apply` | Tạo đúng các object demo mới sau xác nhận | Có, chỉ trong phạm vi cho phép |
| `Verify` | Đọc lại từng object/ACL/file/Content Type, xuất báo cáo | Không |

Đề xuất giao diện chạy:

```powershell
pwsh ./scripts/invoke-demo.ps1 -Mode Preflight -Config ./config/settings.json
pwsh ./scripts/invoke-demo.ps1 -Mode DryRun   -Config ./config/settings.json
pwsh ./scripts/invoke-demo.ps1 -Mode Apply    -Config ./config/settings.json -ConfirmApply
pwsh ./scripts/invoke-demo.ps1 -Mode Verify   -Config ./config/settings.json
```

**Không tự chạy `Apply` chỉ vì có file cấu hình.** Không gọi Apply từ DryRun. Không có thông số `-Force` để xóa quyền hiện hữu của người dùng thật.

### 7.5. Idempotency và an toàn dữ liệu

- Mỗi lần chạy phải tìm object theo **Site + server relative URL/ID + tên + metadata sở hữu demo**.
- Nếu cùng mã DEMO đã tồn tại và cấu hình khớp, **skip**; không nhân bản Library, nhóm hoặc file.
- Nếu tên/URL trùng nhưng thiếu bằng chứng thuộc demo, **ghi conflict và dừng hạng mục**.
- Không ghi đè file trùng tên không do demo tạo; không reset version history.
- Giữ `manifest.json` local ghi ID, GUID, đường dẫn và thời điểm tạo từng resource. Nếu muốn rollback phải dựa trên manifest và yêu cầu chuỗi xác nhận cụ thể, không xóa Site/Hub hay object không do script quản lý.
- Kiểm tra quyền cuối cùng thực tế chứ không chỉ kiểm tra script chạy không lỗi.
- Với site kết nối Microsoft 365 Group, phải tính đầy đủ nhóm Members/Owners/Visitors và **quyền cộng dồn**.
- Demo không được làm gián đoạn nghiệp vụ đang hoạt động trên hai Site.

---

## 8. CHECKLIST NGHIỆM THU BẮT BUỘC

### A. Hai Site hiện hữu

- [ ] `eecm-demo` tồn tại và **đang là Hub Site**.
- [ ] `cecm` tồn tại, URL xác minh đúng, đã association vào `eecm-demo`.
- [ ] Không tạo thêm Site, không đăng ký Hub/associate lại, không sửa quyền gốc cả Site.

### B. Cấu trúc lưu trữ

- [ ] Hub có 3 Library demo và 1 List danh mục chung.
- [ ] Site `cecm` có 5 Library đúng tên và 1 List danh mục hồ sơ.
- [ ] Tất cả Library trực tiếp trong đúng Site, không có "Library con" giả lập bằng Folder.
- [ ] Có folder hai cấp `Dao tao/Dao tao CDS 2026` trong Library CĐS.
- [ ] Có tối thiểu 2 Views trong mỗi Library nghiệp vụ; versioning bật.
- [ ] Có Document Set **thật** `ISO-DGNB-2026-01`, chứa đúng 3 tệp, Shared Columns hoạt động.

### C. Quyền

- [ ] 6 nhóm RBAC demo trên `cecm` được tạo/đối chiếu.
- [ ] 5 Library trên `cecm` **đã ngắt kế thừa** và có ACL đúng ma trận.
- [ ] Không còn quyền rộng (trừ quyền quản trị hợp pháp) cấp qua Site Members/Visitors trên Library nghiệp vụ sau khi break inheritance.
- [ ] `cds_user` không có quyền sửa/xem Library Pháp lý hoặc ISO nếu không được cấp chéo.
- [ ] `outside_th_user` bị từ chối ở các Library bộ phận; test âm tính bằng tài khoản không phải admin.
- [ ] Nội dung công bố trên Hub có nhóm đọc được xác minh; nếu chưa có nhóm thì trạng thái "PENDING", không ghi PASS.
- [ ] Nếu `EnableFolderShareDemo=false`, Folder đào tạo không có ACL riêng; nếu bật thì chỉ đúng Folder được mở Read.

### D. Dữ liệu demo

- [ ] Hub: ít nhất 4 file Office hợp lệ.
- [ ] `cecm`: ít nhất 12 file Office hợp lệ, nằm đúng Library/Folder/Document Set.
- [ ] Mỗi file có metadata có thể lọc trên SharePoint; dữ liệu cá nhân, số liệu đều giả lập.
- [ ] Có một tài liệu đào tạo bản phát hành trên Hub, liên kết từ danh mục tại `cecm`.
- [ ] Lists có ít nhất 5 + 3 items như chỉ định; hyperlink mở đúng nơi.

### E. Báo cáo bàn giao

Cursor phải sinh:

1. `reports/preflight-<timestamp>.md` — tình trạng Site, quyền, Hub association, xung đột.
2. `reports/apply-<timestamp>.json` — tài nguyên được tạo/skip/blocked, ID, URL, lỗi.
3. `reports/permission-matrix-<timestamp>.csv` — Library × principal × role thực tế.
4. `reports/verify-<timestamp>.md` — checklist PASS/FAIL/PENDING, số file, URL từng Library, một Document Set và hai Folder đào tạo.
5. `reports/manifest.json` — danh sách resources **do script tạo** để dọn demo có kiểm soát.
6. `README.md` — cách kết nối, chạy, kiểm chứng bằng giao diện, xử lý lỗi, giới hạn còn lại.

**Không đánh PASS cho kiểm thử tài khoản nếu chưa đăng nhập thử bằng tài khoản đúng vai trò hoặc chưa có bằng chứng kiểm tra quyền hiệu lực đủ tin cậy.**

---

## 9. NGUYÊN TẮC QUYẾT ĐỊNH KHI GẶP TÌNH HUỐNG CHƯA RÕ

- Chỉ có quyền triển khai trong hai Site được chỉ định, không được thay đổi Site khác.
- Không có tài khoản test? Vẫn có thể tạo Library/nhóm/tệp, **nhưng báo chưa kiểm chứng được quyền theo người dùng**.
- Không có quyền thêm thành viên nhóm toàn EMI? Không tự dùng `Everyone except external users` thay thế; báo cần ánh xạ nhóm được phê duyệt.
- Có Library trùng tên? Không ghi đè hoặc thay đổi quyền. Dừng hạng mục và báo conflict.
- Không tạo được Document Set? Dừng riêng hạng mục này, báo blocker và hướng giải quyết; không tự thay bằng Folder.
- Không thể xác minh Hub association? Không thực hiện Apply trước khi xác minh.
- Nội dung pháp lý/ISO chuẩn chỉ là demo, không có hiệu lực quản trị thật.

---

## 10. TÀI LIỆU KỸ THUẬT ĐỂ CURSOR ĐỐI CHIẾU

1. Microsoft — Planning SharePoint hub sites: https://learn.microsoft.com/en-us/sharepoint/planning-hub-sites
2. Microsoft — Create a SharePoint hub site: https://learn.microsoft.com/en-us/sharepoint/create-hub-site
3. Microsoft — SharePoint permission levels: https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels
4. Microsoft — Manage permission scopes: https://learn.microsoft.com/en-us/sharepoint/manage-permission-scope
5. Microsoft Support — Customize list/library permissions: https://support.microsoft.com/en-us/sharepoint/lists/sharepoint-sharing-and-permissions/customize-permissions-for-a-sharepoint-list-or-library
6. Microsoft Support — Create and configure Document Set content type: https://support.microsoft.com/en-us/sharepoint/libraries/create-and-configure-a-new-document-set-content-type
7. PnP.PowerShell authentication: https://pnp.github.io/powershell/articles/authentication.html
8. PnP.PowerShell Set-PnPList: https://pnp.github.io/powershell/cmdlets/Set-PnPList.html
9. PnP.PowerShell Set-PnPListPermission: https://pnp.github.io/powershell/cmdlets/Set-PnPListPermission.html
10. PnP.PowerShell Add-PnPFile: https://pnp.github.io/powershell/cmdlets/Add-PnPFile.html

---

## 11. KẾT QUẢ MONG ĐỢI (DEFINITION OF DONE)

**Chỉ coi demo hoàn thành khi** khi mở SharePoint thật, người vận hành nhìn thấy:

- `eecm-demo`: là Hub Site hiện hữu, có **thư viện tài liệu dùng chung / ISO chuẩn / biểu mẫu**, có file demo phát hành;
- `cecm`: là Site EMI liên kết với Hub, có **5 Library Phòng Tổng hợp**, được cách ly quyền giữa **CĐS, ISO, Pháp lý, Công nghệ**;
- CĐS có Folder đào tạo hai cấp, ISO có Document Set đúng nghĩa, tất cả có metadata/versions;
- Đã đối chiếu ACL và có báo cáo kiểm tra quyền; người thử ở bộ phận A không tự nhiên truy cập được bộ phận B;
- Có báo cáo URL/ID và checklist đầy đủ, **không tác động dữ liệu/permission ngoài demo**.

**Ưu tiên số 1: đúng kiến trúc và quyền SharePoint. Ưu tiên số 2: dữ liệu mẫu có ý nghĩa. Chưa xây dựng UI SPFx tại giai đoạn này.**
