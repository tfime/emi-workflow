# Thiết kế Site dự án — `DnDemo`

**Site:** `https://emicomvn.sharepoint.com/sites/DnDemo`  
**Nguyên tắc:** **1 Document Library = 1 dự án**. Không dùng 1 Library chứa nhiều dự án bằng Folder gốc.

---

## 1. Mô hình

```text
SITE DnDemo
├── LIB  DA-CDS-Portal-2026          [Dự án Cổng thông tin CĐS]
│   ├── 01-Khoi tao
│   ├── 02-Ke hoach
│   ├── 03-Thuc hien
│   └── 04-Nghiem thu-Dong
├── LIB  DA-ISO-DGNB-2026            [Dự án Đánh giá nội bộ ISO]
│   └── (cùng 4 giai đoạn)
└── LIB  DA-Infra-Wifi-2026          [Dự án Hạ tầng Wi‑Fi]
    └── (cùng 4 giai đoạn)
```

- **URL Library** (ASCII, cố định): `DA-{MaNgan}-{Nam}`  
- **Title** (tiếng Việt): tên dự án đầy đủ  
- **4 giai đoạn** = 4 Folder cố định trong mọi Library dự án (không phải 4 Library)

---

## 2. Bốn giai đoạn (chuẩn mọi dự án)

| # | Folder URL | Tên hiển thị | Nội dung điển hình |
|---|---|---|---|
| 1 | `01-Khoi tao` | 01. Khởi tạo | Tờ trình, phạm vi, phê duyệt mở dự án, charter |
| 2 | `02-Ke hoach` | 02. Kế hoạch | Kế hoạch tổng thể, ngân sách, phân công, lịch |
| 3 | `03-Thuc hien` | 03. Thực hiện | Deliverable, biên bản họp, báo cáo tiến độ, chứng từ |
| 4 | `04-Nghiem thu-Dong` | 04. Nghiệm thu & Đóng | Biên bản NT, bàn giao, bài học, hồ sơ đóng |

Folder **kế thừa quyền Library** (mặc định). Không break inheritance theo giai đoạn trừ khi có kịch bản riêng.

---

## 3. Metadata (cột thống nhất trên mọi Library dự án)

| Internal | Display | Kiểu | Ghi chú |
|---|---|---|---|
| `EMI_ProjectCode` | Mã dự án | Text | Trùng mã Library, vd. `DA-CDS-Portal-2026` |
| `EMI_Phase` | Giai đoạn | Choice | `Khởi tạo` \| `Kế hoạch` \| `Thực hiện` \| `Nghiệm thu & Đóng` |
| `EMI_DocCategory` | Loại tài liệu | Choice | Tờ trình, Kế hoạch, Biên bản, Deliverable, Báo cáo, Khác |
| `EMI_DocStatus` | Trạng thái | Choice | Dự thảo, Đang xử lý, Hoàn thành, Đã ban hành |
| `EMI_Year` | Năm | Number | 2026 |
| `EMI_IsDemo` | Dữ liệu demo | Yes/No | Yes cho seed |

Views tối thiểu mỗi Library: **Tất cả tài liệu**, **Theo giai đoạn** (group `EMI_Phase`). Versioning bật.

---

## 4. Dự án mẫu (seed demo)

| URL Library | Title | Mô tả ngắn |
|---|---|---|
| `DA-CDS-Portal-2026` | DA — Cổng thông tin CĐS 2026 | Dự án chuyển đổi số cổng thông tin |
| `DA-ISO-DGNB-2026` | DA — Đánh giá nội bộ ISO 2026 | Dự án đánh giá / cải tiến ISO |
| `DA-Infra-Wifi-2026` | DA — Hạ tầng Wi‑Fi 2026 | Dự án hạ tầng mạng demo |

Mỗi dự án seed tối thiểu **1 file / giai đoạn** (Office hợp lệ, ghi rõ DỮ LIỆU DEMO).

---

## 5. Quyền (phase 1 — đơn giản)

- Phase 1: Library **kế thừa** quyền Site `DnDemo` (Owners/Members/Visitors).  
- Phase 2 (sau): nhóm `GR-DA-{Ma}-EDIT` / `GR-DA-{Ma}-READ` + break inheritance từng Library — giống mô hình TH trên `cecm`.

Không đụng Site khác (`cecm`, `eecm-demo`). Không tạo Subsite theo dự án.

---

## 6. Ranh giới

- Không SPFx / dashboard.  
- Không đổi Hub registration.  
- Idempotent: trùng URL demo → skip; trùng tên lạ → conflict, dừng hạng mục.  
- Prefight URL `DnDemo` trước Apply.
