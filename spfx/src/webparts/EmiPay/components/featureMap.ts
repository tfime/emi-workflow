import { IFeatureRow } from './types';

/** Đối chiếu quy tắc V1.0 — UI demo phải bao quát các mục covered=true */
export const FEATURE_MAP: IFeatureRow[] = [
  { id: 'f01', area: 'Khởi tạo', name: 'Tạo Master Record + thông tin chung', br: '§04', covered: true, note: 'Màn Tạo hồ sơ' },
  { id: 'f02', area: 'Khởi tạo', name: 'Checklist bắt buộc theo loại hồ sơ', br: 'BR-01', covered: true, note: 'Gate trước Gửi' },
  { id: 'f03', area: 'Khởi tạo', name: 'Sửa thông tin khi Draft/Returned', br: '§4.3', covered: true, note: 'Khóa khi đang ở bước khác' },
  { id: 'f04', area: 'Gửi', name: 'Chọn đúng 1 phòng bước kế tiếp', br: 'BR-02', covered: true, note: 'Dialog Gửi' },
  { id: 'f05', area: 'Gửi', name: 'Rút hồ sơ khi chưa tiếp nhận', br: 'BR-03', covered: true, note: 'Dialog Rút' },
  { id: 'f06', area: 'Tiếp nhận', name: 'Tiếp nhận + bắt buộc đặt hạn', br: 'BR-04 / §7.1', covered: true, note: 'Dialog Tiếp nhận' },
  { id: 'f07', area: 'BPCM', name: 'Phân công nhiều nhân sự', br: '§7.2', covered: true, note: 'Dialog Phân công' },
  { id: 'f08', area: 'BPCM', name: 'Checklist chung · Đạt/Không đạt', br: 'BR-05', covered: true, note: 'Dialog Checklist' },
  { id: 'f09', area: 'BPCM', name: 'Đính kèm bổ sung nội bộ / chốt khi gửi', br: '§05', covered: true, note: 'Tab Đính kèm + scope' },
  { id: 'f10', area: 'BPCM', name: 'Gửi tiếp chỉ khi checklist Đạt', br: 'BR-06', covered: true, note: 'Dialog Gửi tiếp' },
  { id: 'f11', area: 'BPCM', name: 'Trả BPCM1 dù checklist Đạt (lý do)', br: 'BR-07', covered: true, note: 'Dialog Trả' },
  { id: 'f12', area: 'Từ chối', name: 'Trả thẳng BPCM1 từ mọi bước', br: 'BR-08', covered: true, note: 'Không qua trung gian' },
  { id: 'f13', area: 'Gửi lại', name: 'ReviewRound mới · vào lại BPCM2', br: 'BR-09', covered: true, note: 'Banner returned' },
  { id: 'f14', area: 'CT.HĐQT', name: 'Chỉ Duyệt / Không duyệt', br: '§09', covered: true, note: 'Không checklist/upload' },
  { id: 'f15', area: 'Thanh toán', name: 'Tải UNC + chọn người nhận TB', br: '§10', covered: true, note: 'Dialog UNC / Confirm' },
  { id: 'f16', area: 'Thanh toán', name: 'Xác nhận đã thanh toán', br: 'BR-11', covered: true, note: 'CONFIRM_PAYMENT' },
  { id: 'f17', area: 'Hủy', name: 'Hủy Draft/Returned + lý do · không TB', br: 'BR-13', covered: true, note: 'Dialog Hủy' },
  { id: 'f18', area: 'Hạn', name: 'Hiển thị hạn · gia hạn có lý do', br: '§12', covered: true, note: 'Dialog Gia hạn' },
  { id: 'f19', area: 'Ủy quyền', name: 'Ủy quyền Trưởng phòng (demo)', br: '§7.4', covered: true, note: 'Dialog Ủy quyền' },
  { id: 'f20', area: 'Hiển thị', name: 'Activity public vs nội bộ', br: '§13.2', covered: true, note: 'Theo persona' },
  { id: 'f21', area: 'Tra cứu', name: 'Hồ sơ hoàn tất / hủy · chỉ xem', br: 'BR-14', covered: true, note: 'Màn Tra cứu' },
  { id: 'f22', area: 'Lưu trữ', name: 'Trạng thái chờ archive / completed', br: '§15', covered: true, note: 'States archivePending' },
  { id: 'f23', area: 'Config', name: 'OU · WF · checklist · recipients', br: '§06', covered: true, note: 'Màn Cấu hình PROCADM' },
  { id: 'f24', area: 'Ngoài V1 UI', name: 'Cảnh báo trùng hồ sơ tự động', br: 'BR-15', covered: false, note: 'Không làm V1' },
  { id: 'f25', area: 'Ngoài V1 UI', name: 'Tích hợp ngân hàng / OCR', br: '—', covered: false, note: 'Ngoài phạm vi' },
  { id: 'f26', area: 'Ngoài V1 UI', name: 'Dynamic Permission / Commands thật', br: 'KeHoach', covered: false, note: 'Backend sau demo' }
];
