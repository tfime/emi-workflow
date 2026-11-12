##Các bước cần triển khai tiếp theo
1. Data Models	Tạo Lists, Libraries và cột	Đã tạo
2. RBAC tĩnh	Nhóm và ACL 23 List/Library	Đã xong (V1.9.1)
3. Configuration	Cấu hình phòng ban, trưởng phòng, loại hồ sơ, checklist, quy trình	Một phần (seed gói 9; seed EMI_PAY_SPV kit còn lại)
4. Core Orchestrator	PA Solution `EMI_PAY_CORE_V1` (Phase1+2 gates)	Đã xong tới 1.0.0.9 (UAT PASS)
5. SPFx	Giao diện tạo hồ sơ, xử lý công việc, quản trị cấu hình	Chưa làm
6. Kiểm thử	Chạy hồ sơ thanh toán từ đầu đến cuối	UAT Core PASS; UI/e2e còn lại

### Core Flow đã chốt trên tenant (1.0.0.9)
- CREATE → checklist → SUBMIT gate → DECIDE PASS/REJECT → CHAIR `paymentDueAt` → UNC gate → CONFIRM → Archiving
- REJECT về BPCM1; SUBMIT lại tăng `ReviewRound`, vào lại BPCM2
- ZIP/runbook/UAT: `EMI_PAY_Core_Flow_Phase1/`
