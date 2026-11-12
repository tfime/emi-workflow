# EMI PAY – Đặc tả toàn bộ tính năng hệ thống theo vai trò người sử dụng

> **Trạng thái:** Bản tổng hợp để rà soát và phê duyệt nghiệp vụ; chưa phải đặc tả cuối cùng.
>
> **Hệ thống:** Quy trình hồ sơ thanh toán SPV trên SharePoint CECM.
>
> **Căn cứ:** Những nội dung đã trao đổi trong dự án EMI PAY, sơ đồ BPMN hồ sơ thanh toán SPV mới nhất và thiết kế EMI PAY V1.0.
>
> **Lưu ý:** Nội dung dưới đây mô tả **chức năng mục tiêu khi phần mềm hoàn chỉnh**, không đồng nghĩa các tính năng đã được lập trình. RBAC tĩnh 23/23 Lists/Libraries đã PASS; phân quyền động, Power Automate và SPFx chưa được nghiệm thu vận hành đầu cuối. Các điểm có khác biệt giữa những lần trao đổi được đưa vào mục 7 để duyệt lại.

## 1. Những nguyên tắc nghiệp vụ cần giữ

| STT | Nguyên tắc | Nội dung |
|---:|---|---|
| 1 | Một hồ sơ duy nhất | Mỗi yêu cầu thanh toán có một **Master Record** xuyên suốt toàn bộ quy trình. |
| 2 | BPCM1 tạo hồ sơ | Nhân sự BPCM1 được tự tạo và gửi hồ sơ trực tiếp, **không cần Trưởng phòng duyệt**. |
| 3 | Tiếp nhận theo phòng ban | Mỗi bước BPCM chọn một phòng tiếp nhận từ danh mục phòng ban được cấu hình. |
| 4 | Trưởng phòng chịu trách nhiệm | Trưởng phòng là người quyết định cuối cùng đối với kết quả xử lý của bộ phận. |
| 5 | Phân công linh hoạt | Trưởng phòng được tự xử lý hoặc phân công **một hay nhiều nhân sự** cùng xử lý hồ sơ. |
| 6 | Thay đổi người thực hiện | Trưởng phòng được thêm hoặc bỏ nhân sự khi bước xử lý chưa chốt. |
| 7 | Bảo toàn kết quả | Thay đổi nhân sự không làm mất checklist, nhận xét hoặc kết quả kiểm tra đã thực hiện. |
| 8 | Checklist dùng chung | BPCM2, BPCM3 và TCKT cùng kiểm tra trên checklist hồ sơ, nhưng ghi kết quả theo từng bộ phận và từng lượt xử lý. |
| 9 | Quyền quyết định | Chỉ Trưởng phòng hoặc người được ủy quyền mới được chốt chuyển tiếp hoặc trả hồ sơ ở các bước kiểm tra. |
| 10 | Quyền kiểm tra của Trưởng phòng | Trưởng phòng có quyền xác nhận, chỉnh sửa và quyết định kết quả kiểm tra cuối cùng của bộ phận. |
| 11 | Truy vết | Mọi thay đổi phân công, kết quả kiểm tra và quyết định đều phải được ghi lịch sử. |
| 12 | Không nhân bản hồ sơ | Hồ sơ bị trả về để điều chỉnh vẫn giữ nguyên Master Record và lưu các lượt kiểm tra trước. |

## 2. Hai chiều vai trò cần phân biệt

- **Vai trò tổ chức:** Trưởng phòng, Nhân sự, Quản trị quy trình, Quản trị hệ thống, Kiểm toán.
- **Vai trò nghiệp vụ trong hồ sơ:** BPCM1, BPCM2, BPCM3, TCKT kiểm tra, CT.HĐQT, TCKT thanh toán.

Một người là Trưởng phòng không mặc nhiên được quyết định mọi hồ sơ. Quyền phải gắn với **phòng ban tiếp nhận, hồ sơ cụ thể, bước đang xử lý và ủy quyền hợp lệ**.

## 3. Chức năng theo từng vai trò

### 3.1. Nhân sự BPCM1 – Người khởi tạo hồ sơ

| Thao tác | Mô tả chức năng |
|---|---|
| Tạo hồ sơ mới | Khởi tạo yêu cầu thanh toán và cấp định danh hồ sơ duy nhất. |
| Chọn loại hồ sơ | Chọn loại thanh toán từ danh mục cấu hình. |
| Nhập thông tin | Khai báo đề nghị thanh toán, pháp nhân, dự án và các thông tin liên quan. |
| Xem checklist | Hệ thống tự hiển thị thành phần tài liệu theo loại hồ sơ. |
| Tải tài liệu | Upload đề nghị thanh toán, hợp đồng, chứng từ và tài liệu theo checklist. |
| Quản lý bản nháp | Lưu và hoàn thiện thông tin trước khi gửi. |
| Kiểm tra tính đầy đủ | Xem tài liệu đã có, còn thiếu và điều kiện bắt buộc. |
| Gửi hồ sơ | Tự gửi sang BPCM2, không cần Trưởng phòng BPCM1 phê duyệt. |
| Theo dõi hồ sơ | Xem vị trí, trạng thái, lịch sử và người đang xử lý. |
| Tiếp nhận hồ sơ trả lại | Nhận lại kèm lý do, nhận xét và tài liệu cần bổ sung. |
| Điều chỉnh, bổ sung | Chỉnh sửa thông tin được phép, bổ sung hoặc thay phiên bản tài liệu. |
| Gửi lại hồ sơ | Gửi lại **cùng Master Record** từ BPCM2 theo sơ đồ BPMN mới nhất. |
| Tra cứu lịch sử | Xem các lần gửi, trả lại, điều chỉnh và kết quả trước đó. |

**Giới hạn:** Sau khi hồ sơ đã gửi, nhân sự BPCM1 không được tùy ý sửa dữ liệu đang được bộ phận khác kiểm tra. Việc chỉnh sửa mở lại theo trạng thái được phép.

### 3.2. Nhân sự BPCM2, BPCM3 và TCKT kiểm tra

| Thao tác | Mô tả chức năng |
|---|---|
| Xem công việc được giao | Danh sách hồ sơ mình được phân công. |
| Mở hồ sơ | Đọc thông tin, tài liệu, lịch sử và checklist liên quan trong phạm vi được cấp. |
| Kiểm tra tài liệu | Xem xét từng chứng từ và nội dung thuộc bước. |
| Đánh dấu Đạt/Không đạt | Ghi kết quả kiểm tra cho từng tài liệu hoặc mục checklist. |
| Ghi nhận xét | Ghi rõ nội dung và lý do tài liệu không đạt. |
| Xác định thiếu sót | Đánh dấu tài liệu thiếu, sai, cần bổ sung. |
| Bổ sung tài liệu nội bộ | Upload tài liệu do bộ phận mình phụ trách nếu có yêu cầu. |
| Cập nhật kết quả cá nhân | Điều chỉnh phần việc chưa chốt trong phạm vi được phép. |
| Theo dõi kết quả chung | Xem tiến độ và những phần đã kiểm tra của bộ phận theo thẩm quyền. |
| Báo hoàn thành phần việc | Chuyển kết quả cho Trưởng phòng xem xét. |

**Không mặc nhiên được:** Chấp nhận để chuyển bước; trả hồ sơ về BPCM1; sửa quyết định cuối của Trưởng phòng; xóa kết quả của nhân sự khác. Người được ủy quyền hợp lệ có thể nhận thêm quyền quyết định trong phạm vi ủy quyền.

### 3.3. Trưởng phòng BPCM2, BPCM3 và TCKT kiểm tra

| Nhóm | Tính năng | Mô tả |
|---|---|---|
| Tiếp nhận | Nhận hồ sơ của phòng | Nhìn thấy hồ sơ chuyển tới bộ phận. |
| Tiếp nhận | Xem toàn bộ hồ sơ liên quan | Xem thông tin, tài liệu, checklist, lịch sử theo thẩm quyền. |
| Phân công | Giao nhân sự | Chọn một hoặc nhiều nhân sự cùng kiểm tra. |
| Phân công | Tự xử lý | Trưởng phòng có thể trực tiếp kiểm tra. |
| Phân công | Bổ sung nhân sự | Thêm người khi bước chưa chốt. |
| Phân công | Thu hồi phân công | Bỏ người khỏi công việc chưa chốt nhưng bảo toàn kết quả đã ghi. |
| Giám sát | Theo dõi tiến độ | Biết ai phụ trách, hạng mục đã/chưa kiểm tra. |
| Kiểm tra | Xem kết quả nhân sự | Đọc đánh giá, nhận xét, chứng từ. |
| Kiểm tra | Trực tiếp kiểm tra | Thực hiện đánh giá từng tài liệu. |
| Kiểm tra | Chỉnh sửa kết quả | Chỉnh kết quả trước khi chốt, có lịch sử. |
| Quyết định | Chấp nhận hồ sơ | Chốt kết quả đạt và chuyển sang bước tiếp theo. |
| Quyết định | Trả lại hồ sơ | Chốt không đạt, ghi lý do bắt buộc và trả về BPCM1 theo BPMN hiện tại. |
| Quản lý | Xem lịch sử phân công | Tra cứu thời điểm, người thêm/bỏ, sự thay đổi. |
| Quản lý | Xem lịch sử quyết định | Tra cứu kết quả qua các lượt xử lý. |

**Nguyên tắc:** Nhiều người cùng kiểm tra nhưng **mỗi bộ phận có một quyết định chốt cho mỗi lượt xử lý**. Trưởng phòng hoặc người được ủy quyền là chủ thể quyết định cuối cùng.

**Ví dụ:** Trưởng phòng BPCM2 giao ba người kiểm tra các nhóm tài liệu khác nhau; sau khi xem các nhận xét, Trưởng phòng chốt Đạt/Không đạt. Thay người kiểm tra không xóa dữ liệu do người cũ đã thực hiện.

### 3.4. Người được Trưởng phòng ủy quyền

| Tình huống | Nguyên tắc |
|---|---|
| Chỉ được giao kiểm tra | Chỉ xử lý phần việc được phân công; không tự có quyền chốt. |
| Được ủy quyền quản lý bước | Có thể tiếp nhận, phân công hoặc quyết định **theo phạm vi ủy quyền**. |
| Trưởng phòng tự xử lý | Không cần phân công sang người khác. |
| Đổi người được giao | Không làm mất checklist, kết quả hay nhận xét trước. |
| Bước đã chốt | Không tùy ý phân công lại hoặc sửa kết quả bằng thao tác thường. |

**Chưa đặc tả chi tiết:** Màn hình ủy quyền, thời hạn hiệu lực, mẫu/văn bản ủy quyền và nguyên tắc thu hồi ủy quyền.

### 3.5. CT.HĐQT – Người phê duyệt thanh toán

| Thao tác | Mô tả |
|---|---|
| Xem hồ sơ chờ duyệt | Hồ sơ đã vượt qua BPCM2, BPCM3 và TCKT kiểm tra. |
| Xem thông tin, chứng từ | Đọc bộ hồ sơ, checklist và lịch sử thuộc phạm vi phê duyệt. |
| Xem kết quả các bộ phận | Xem đánh giá, lý do và nhận xét trước đó. |
| Xem nhật ký xử lý | Tra cứu hoạt động trên hồ sơ. |
| Duyệt | Quyết định phê duyệt, chuyển sang TCKT thực hiện thanh toán. |
| Không duyệt | Ghi lý do bắt buộc và trả về BPCM1 theo BPMN hiện tại. |
| Cập nhật thời hạn thanh toán | Cập nhật hạn thanh toán ở nhánh được duyệt. |

**Không làm:** Trực tiếp sửa chứng từ, đánh dấu checklist hay thay kết quả kiểm tra của phòng ban.

### 3.6. TCKT – Người thực hiện thanh toán

| Thao tác | Mô tả |
|---|---|
| Nhận hồ sơ đã duyệt | Tiếp nhận công việc thanh toán sau CT.HĐQT. |
| Xem thời hạn thanh toán | Xem hạn thanh toán đã cập nhật. |
| Thực hiện thanh toán bên ngoài | Thực hiện giao dịch theo quy trình tài chính/ngân hàng ngoài SharePoint. |
| Tải UNC | Đính kèm ủy nhiệm chi hoặc chứng từ xác nhận thanh toán. |
| Xác nhận kết quả | Ghi nhận đã thanh toán khi có chứng từ đáp ứng điều kiện. |
| Chọn người nhận thông báo | Chọn người tạo, phòng liên quan và CT.HĐQT theo phạm vi cần thông báo. |
| Theo dõi lưu trữ | Xem trạng thái chuyển sang kho hoàn tất. |

**Ranh giới:** BPMN mới nhất không thể hiện bước Giám đốc SPV ký chi trong phần mềm V1.0. EMI PAY không trực tiếp chuyển tiền; thanh toán và việc ký chứng từ ngân hàng là hoạt động bên ngoài.

### 3.7. Quản trị quy trình – `GR-PAY-PROCADM`

| Tính năng | Nội dung |
|---|---|
| Danh mục loại thanh toán | Quản lý loại hồ sơ, cấu hình nghiệp vụ liên quan. |
| Danh mục phòng ban | Quản lý OU/phòng tham gia workflow. |
| Nhân sự phòng ban | Quản lý thành viên và quan hệ phòng ban. |
| Các bước workflow | Cấu hình thứ tự bước, loại bước và nơi tiếp nhận. |
| Phiên bản workflow | Quản lý phiên bản và hiệu lực. |
| Mẫu checklist | Thiết lập tài liệu cần có theo loại hồ sơ. |
| Phòng/người tiếp nhận | Cấu hình bộ phận nhận tại từng bước. |
| Theo dõi thay đổi | Tra cứu thay đổi cấu hình quy trình. |

Không tự được thay quyết định phê duyệt hay sửa hồ sơ đang xử lý. Cần thực thi đúng RBAC tĩnh và các giới hạn nghiệp vụ đã thiết kế.

### 3.8. Quản trị hệ thống và kiểm toán

- **Quản trị hệ thống `GR-PAY-SYSADM`:** Quản lý quyền SharePoint, cấu hình kỹ thuật, kết nối Power Automate, giám sát lỗi, kiểm tra và phục hồi thao tác hệ thống có kiểm soát.
- **Kiểm toán `GR-PAY-AUDIT`:** Xem nhật ký và hồ sơ trong phạm vi được cấp, không sửa chứng từ, trạng thái hay quyết định nghiệp vụ.

Quyền kỹ thuật/quyền xem không tự động tạo quyền phê duyệt nghiệp vụ.

## 4. Các chức năng dùng chung toàn hệ thống

### 4.1. Công việc, tiếp nhận, thời hạn và gia hạn

| Chức năng | Quy tắc |
|---|---|
| Tiếp nhận hồ sơ | Trưởng phòng hoặc người được ủy quyền tiếp nhận phần việc của phòng. |
| Đặt thời hạn xử lý | Khi tiếp nhận, cần xác định thời hạn theo nguyên tắc đã thảo luận. |
| Phân công nhân sự | Một hoặc nhiều người; Trưởng phòng được tự xử lý. |
| Điều chỉnh phân công | Thêm/bỏ người khi bước chưa chốt; giữ lịch sử và kết quả. |
| Gia hạn | Trưởng phòng có thể gia hạn và phải ghi lý do. |
| Lịch sử gia hạn | Lưu hạn cũ, hạn mới, lý do, thời điểm, người thực hiện. |
| Nhắc việc | Nhắc các công việc đang chờ theo lịch cấu hình. |
| Cảnh báo quá hạn | Cảnh báo, không tự động chuyển bước hoặc từ chối hồ sơ. |

Phần nhắc việc và kiểm tra theo lịch có thể tách thành Scheduled Subflow sau; thao tác đặt/gia hạn và phân công là nghiệp vụ người dùng cần có.

### 4.2. Checklist và quản lý tài liệu

| Chức năng | Mô tả |
|---|---|
| Checklist theo loại hồ sơ | Sinh danh mục yêu cầu từ cấu hình. |
| Trạng thái tài liệu | Có/thiếu tài liệu; kết quả kiểm tra. |
| Kiểm tra theo mục | Đạt/Không đạt, người thực hiện, thời điểm. |
| Lý do không đạt | Nhận xét rõ nguyên nhân đối với tài liệu. |
| Nhận xét toàn hồ sơ | Ghi đánh giá tổng hợp của từng bộ phận. |
| Bổ sung tài liệu | Upload chứng từ cần bổ sung. |
| Quản lý phiên bản | Giữ phiên bản cũ khi thay tài liệu. |
| Lịch sử kiểm tra | Theo người, bộ phận, lượt `ReviewRound`. |
| Nhiều người cùng kiểm tra | Phân công nhiều nhân sự cùng một bước. |
| Chốt kết quả | Trưởng phòng/người ủy quyền chốt kết quả cuối. |

**Checklist được dùng chung, nhưng kết quả từng bộ phận/từng lượt phải tách biệt và được bảo toàn.** Tài liệu được BPCM2 đánh giá Đạt không có nghĩa BPCM3/TCKT mặc nhiên phải đánh giá Đạt.

### 4.3. Hồ sơ bị trả về, điều chỉnh và gửi lại

- Các bước BPCM2, BPCM3, TCKT kiểm tra và CT.HĐQT khi không đạt/không duyệt trả về **BPCM1** theo BPMN mới nhất.
- Phải ghi lý do ở cấp hồ sơ và lý do của chứng từ không đạt.
- BPCM1 bổ sung/chỉnh sửa theo quyền, sau đó gửi lại từ BPCM2.
- Giữ nguyên Master Record; lưu kết quả các lượt trước, tăng `ReviewRound` theo quy tắc khi gửi lại.
- **Cần duyệt lại:** Quy tắc này khác mô tả cũ về trả về bước ngay trước.

### 4.4. Hủy hồ sơ

| Nội dung | Quy tắc tổng hợp để duyệt |
|---|---|
| Người được hủy | Chỉ người khởi tạo. |
| Trạng thái được hủy | Nháp hoặc đã trả về BPCM1. |
| Lý do hủy | Bắt buộc nhập. |
| Sau hủy | Khóa hồ sơ, không gửi lại hoặc chỉnh sửa bình thường. |
| Master Record | Giữ bản ghi; không xóa. |
| Chứng từ và kết quả | Giữ lịch sử, checklist và Activity Log. |
| Kho lưu trữ | Chuyển theo quy trình tới `EMI_PAY_ArchiveCancelled`. |
| Tra cứu | Tiếp tục tra cứu theo quyền. |
| Khôi phục | Không qua luồng nghiệp vụ thông thường. |
| Thông báo | Không gửi thông báo tự động khi hủy. |

**Không tự động phát hiện/chặn hồ sơ trùng nội dung thanh toán.** Tuy nhiên hệ thống vẫn phải chống xử lý trùng cùng một lệnh kỹ thuật (`DedupeKey`) để không tạo hai Master Record do chạy lại.

### 4.5. Thanh toán, hoàn tất và lưu trữ

| Nội dung | Kết quả kỳ vọng |
|---|---|
| Ghi nhận thanh toán | TCKT xác nhận kèm UNC/bằng chứng hợp lệ. |
| Trạng thái chờ lưu trữ | Có thể dùng `ARCHIVE_PENDING` khi thanh toán đã xác nhận nhưng chưa lưu trữ. |
| Master Record | Giữ nguyên một bản ghi duy nhất. |
| Tài liệu | Chuyển tới kho hoàn tất theo cấu hình. |
| Checklist & Activity Log | Giữ đầy đủ lịch sử các bước và lượt. |
| Khóa hồ sơ | Sau hoàn tất không được chỉnh sửa bằng thao tác thường. |
| Quyền xem sau hoàn tất | Theo đối tượng liên quan và phạm vi RBAC động. |
| Lỗi lưu trữ | Ghi lỗi, thử lại có kiểm soát; nếu kéo dài báo quản trị. |
| Hoàn tất | Chỉ đánh dấu `COMPLETED` khi lưu trữ thành công. |

Các thành phần liên quan: `EMI_PAY_ArchiveJobs`, `EMI_PAY_ArchiveCompleted`, `EMI_PAY_ArchiveCancelled`.

### 4.6. Thông báo, nhật ký và tra cứu

| Tính năng | Nội dung |
|---|---|
| Thông báo giao việc | Cho phòng/người được giao khi hồ sơ chuyển đến. |
| Thông báo trả lại | BPCM1 nhận lý do và nội dung cần bổ sung. |
| Nhắc việc | Nhắc theo lịch cấu hình. |
| Cảnh báo quá hạn | Hiển thị công việc trễ. |
| Thông báo thanh toán | Cho người được TCKT chỉ định trong phạm vi hợp lệ. |
| Nhật ký hồ sơ | Toàn bộ sự kiện nghiệp vụ. |
| Nhật ký phân công | Người thêm/bỏ, ủy quyền, thay người. |
| Nhật ký kiểm tra | Kết quả, nhận xét, bộ phận, lượt, người thực hiện. |
| Nhật ký thời hạn | Hạn cũ/mới, lý do gia hạn, người thực hiện. |
| Tra cứu | Theo mã, pháp nhân, đơn vị, loại, trạng thái và thẩm quyền. |

**Ngoại lệ:** Không tự động gửi thông báo khi người tạo hủy hồ sơ (theo phương án đã được tổng hợp trước đó, cần duyệt cuối trong tài liệu này).

### 4.7. Màn hình SPFx và Dashboard

Những mục dự kiến xuất hiện theo quyền vai trò:

1. Tổng quan.
2. Tạo hồ sơ.
3. Công việc của tôi.
4. Công việc của phòng (Trưởng phòng/người ủy quyền).
5. Quản lý hồ sơ.
6. Kiểm tra & phê duyệt.
7. Theo dõi thời hạn.
8. Kho lưu trữ.
9. Báo cáo.
10. Quản trị.

**Màn hình hồ sơ 360°** hiển thị một Master Record với thông tin chung, tài liệu, checklist, người thực hiện, phân công, hạn xử lý, lịch sử quyết định, Activity Log và tiến trình.

**Dashboard dự kiến:** Hồ sơ theo trạng thái, phòng ban, pháp nhân; hồ sơ chờ xử lý, quá hạn, bị trả, đã thanh toán, đã lưu trữ. Chỉ số/bộ lọc báo cáo chi tiết **chưa được chốt cuối**.

## 5. Ma trận tóm tắt quyền thao tác theo vai trò

| Hành động | NS BPCM1 | NS kiểm tra | Trưởng phòng kiểm tra | CT.HĐQT | TCKT thanh toán |
|---|:---:|:---:|:---:|:---:|:---:|
| Tạo hồ sơ | ✓ | — | — | — | — |
| Gửi hồ sơ ban đầu | ✓ | — | — | — | — |
| Upload tài liệu thuộc phạm vi | ✓ | ✓ | ✓ | — | ✓ |
| Kiểm tra checklist | — | ✓ | ✓ | — | — |
| Ghi nhận xét kiểm tra | — | ✓ | ✓ | — | — |
| Tiếp nhận bước của phòng | — | — | ✓ | — | Theo phân công |
| Đặt/gia hạn hạn xử lý | — | — | ✓ | — | Theo vai trò quản lý |
| Giao nhiều nhân sự | — | — | ✓ | — | Theo vai trò quản lý |
| Chấp nhận/chuyển bước | — | Ủy quyền | ✓ | Duyệt | — |
| Trả hồ sơ | — | Ủy quyền | ✓ | Không duyệt | — |
| Điều chỉnh hồ sơ bị trả | ✓ | — | — | — | — |
| Hủy hồ sơ đủ điều kiện | ✓ | — | — | — | — |
| Xem toàn bộ hồ sơ trình duyệt | — | — | — | ✓ | — |
| Xác nhận thanh toán và UNC | — | — | — | — | ✓ |

> **Cách hiểu:** ✓ là quyền nghiệp vụ trong đúng phạm vi; không tự động đồng nghĩa với quyền SharePoint thực tế. — là không có quyền mặc định ở vai trò đang xét. Một cá nhân có thể kiêm vai trò nếu được phân công hợp lệ.

## 6. Các nội dung chưa đầy đủ trong Main Flow Core hiện tại

Bộ lệnh lõi đang đề xuất `CREATE_REQUEST`, `SUBMIT`, `DECIDE`, `CONFIRM_PAYMENT` mới giải quyết phần điều phối chính. Để hoàn thiện sản phẩm, còn phải làm rõ hoặc bổ sung:

| STT | Chức năng chưa đầy đủ | Hướng bổ sung |
|---:|---|---|
| 1 | Trưởng phòng tiếp nhận và bắt buộc đặt hạn | Quản lý tiếp nhận WorkItem. |
| 2 | Giao một/nhiều nhân sự | Quản lý Assignments. |
| 3 | Thêm/bỏ người nhưng giữ kết quả đã kiểm tra | Quản lý thay đổi phân công. |
| 4 | Ủy quyền quyết định | Kiểm soát thẩm quyền theo bước/hồ sơ. |
| 5 | Nhân sự lưu checklist, nhận xét | Document & Checklist. |
| 6 | Trưởng phòng chốt/chỉnh sửa đánh giá | Kiểm soát quyết định của bộ phận. |
| 7 | Gia hạn có lý do, lịch sử | Quản lý thời hạn. |
| 8 | BPCM1 điều chỉnh hồ sơ trả lại | Cập nhật hồ sơ có kiểm soát. |
| 9 | Người tạo hủy hồ sơ khi đủ điều kiện | Nghiệp vụ hủy và Archive Manager. |
| 10 | TCKT chọn người nhận thông báo | Notification Manager. |
| 11 | Quyền đọc/sửa theo hồ sơ, pháp nhân | Dynamic Permission. |
| 12 | Lưu trữ hoàn tất/hủy, retry và khóa | Archive Manager. |

**Điểm bắt buộc khi triển khai:** Nhân sự xử lý – Trưởng phòng quyết định. Không được chỉ kiểm tra người dùng thuộc phòng mà cho phép người đó thực hiện lệnh `DECIDE`.

## 7. Các vấn đề cần phê duyệt lại

| Vấn đề | Cách hiểu đang được tổng hợp | Trạng thái |
|---|---|---|
| Vai trò Trưởng phòng/Nhân sự | Trưởng phòng nhận việc, đặt hạn, phân công nhiều người, kiểm tra và chốt; nhân sự chỉ xử lý phần được giao. BPCM1 tự gửi không cần duyệt nội bộ. | Đề nghị xác nhận |
| Nhánh trả hồ sơ | Theo BPMN mới nhất: tất cả bước không đạt/không duyệt trả về BPCM1 và gửi lại từ BPCM2, khác quy tắc cũ về bước liền trước. | **Cần duyệt thống nhất** |
| Thanh toán ngoài hệ thống | Sau CT.HĐQT duyệt, TCKT thanh toán ngoài hệ thống, tải UNC, xác nhận. Không có bước Giám đốc SPV ký chi trong app V1.0. | Đề nghị xác nhận |
| Phân công, ủy quyền | Nhiều người có thể kiểm tra; chỉ Trưởng phòng hoặc người ủy quyền chốt. Chi tiết thời hạn/phạm vi ủy quyền chưa đặc tả. | Cần làm rõ chi tiết |
| Hủy hồ sơ | Chỉ người tạo, ở Nháp/trả về BPCM1; giữ Master Record và lịch sử; không gửi thông báo hủy. | Đề nghị xác nhận |
| Thời hạn xử lý | Trưởng phòng đặt hạn khi tiếp nhận; gia hạn có lý do; quá hạn cảnh báo, không tự chốt. | Đề nghị xác nhận |
| Kho lưu trữ | `COMPLETED` chỉ sau khi lưu trữ thành công. | Đề nghị xác nhận |

## 8. Phân biệt hiện trạng triển khai và chức năng mục tiêu

| Hạng mục | Tình trạng |
|---|---|
| 19 SharePoint Lists + 4 Document Libraries | Đã tạo |
| RBAC tĩnh cho 23/23 thành phần | Đã PASS kiểm chứng |
| Main Flow Core | Đã có kế hoạch/định nghĩa và gói Solution để thử import; chưa nghiệm thu chạy thật |
| Quyền động theo từng hồ sơ | Chưa nghiệm thu |
| Giao diện SPFx | Chưa triển khai |
| Document/Checklist, Archive, Notification Subflows | Chưa triển khai đầy đủ |
| UAT bằng người dùng và hồ sơ thực tế | Chưa thực hiện |

---

## Kết luận trình duyệt

EMI PAY là **hệ thống quản lý công việc và hồ sơ thanh toán đa vai trò**, không đơn thuần là chuỗi phê duyệt tuần tự. Thiết kế đặc biệt chú trọng:

1. **Nhân sự BPCM1** tự lập, gửi, theo dõi, điều chỉnh và gửi lại hồ sơ.
2. **Nhân sự kiểm tra** thực hiện phần việc và checklist được giao.
3. **Trưởng phòng/người được ủy quyền** tiếp nhận, giao việc cho nhiều người, quản lý thời hạn, xem xét và chốt kết quả của bộ phận.
4. **CT.HĐQT** quyết định phê duyệt thanh toán.
5. **TCKT thanh toán** thực hiện thanh toán ngoài hệ thống, tải UNC và xác nhận.
6. **Hệ thống** quản lý một Master Record, nhật ký, quyền truy cập và vòng đời lưu trữ.

**Đề nghị rà soát và chốt các điểm ở mục 7 trước khi coi tài liệu là đặc tả nghiệp vụ cuối cùng.**
