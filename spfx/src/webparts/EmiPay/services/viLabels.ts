/** Nhãn tiếng Việt có dấu — hiển thị UI (không đổi giá trị API/Choice). */

export function statusVi(status: string): string {
  const map: Record<string, string> = {
    Draft: 'Nháp',
    InReview: 'Đang xử lý',
    AwaitingManager: 'Chờ trưởng phòng duyệt gửi',
    AwaitManager: 'Chờ phê duyệt',
    WaitingAcceptance: 'Chờ tiếp nhận',
    Returned: 'Đã trả về',
    PendingPayment: 'Chờ thanh toán',
    Archiving: 'Chờ lưu trữ',
    Completed: 'Hoàn tất',
    Paid: 'Đã thanh toán',
    Cancelled: 'Đã hủy'
  };
  return map[status] || status || '—';
}

/** Badge tone cho Status hồ sơ (map → class badge* trong SCSS). */
export function statusBadgeKind(
  status: string
): 'mute' | 'warn' | 'info' | 'ok' | 'danger' {
  switch (status) {
    case 'Draft':
      return 'mute';
    case 'Returned':
      return 'warn';
    case 'WaitingAcceptance':
    case 'AwaitingManager':
    case 'AwaitManager':
    case 'PendingPayment':
    case 'InReview':
    case 'Archiving':
      return 'info';
    case 'Completed':
    case 'Paid':
      return 'ok';
    case 'Cancelled':
      return 'danger';
    default:
      return 'mute';
  }
}

/** Nhãn chi tiết khi CHAIR đã duyệt hồ sơ nhưng chưa duyệt thanh toán. */
export function chairStatusDetailVi(
  stepKey: string,
  status: string,
  paymentDueAt: string | undefined,
  dossierApproved: boolean
): string {
  if (
    stepKey === 'CHAIR_APPROVE' &&
    dossierApproved &&
    !paymentDueAt
  ) {
    return 'Đã phê duyệt hồ sơ — chưa duyệt thanh toán';
  }
  return statusVi(status);
}

export function stepVi(stepKey: string): string {
  const map: Record<string, string> = {
    BPCM1_PREPARE: 'BPCM 1 · Khởi tạo / điều chỉnh',
    BPCM2_TECH: 'BPCM 2 · Kiểm tra kỹ thuật',
    BPCM3_PRICE: 'BPCM 3 · Kiểm tra giá',
    TCKT_CHECK: 'TCKT · Kiểm tra hồ sơ',
    CHAIR_APPROVE: 'CT.HĐQT · Phê duyệt',
    TCKT_PAY: 'TCKT · Thanh toán & UNC',
    SYSTEM_ARCHIVE: 'Hệ thống · Lưu trữ'
  };
  return map[stepKey] || stepKey || '—';
}

export function stepShortVi(stepKey: string): string {
  const map: Record<string, string> = {
    BPCM1_PREPARE: 'Khởi tạo',
    BPCM2_TECH: 'KT kỹ thuật',
    BPCM3_PRICE: 'KT giá',
    TCKT_CHECK: 'TCKT kiểm tra',
    CHAIR_APPROVE: 'CT.HĐQT',
    TCKT_PAY: 'Thanh toán',
    SYSTEM_ARCHIVE: 'Lưu trữ'
  };
  return map[stepKey] || stepKey || '—';
}

export function checklistStatusVi(status: string): string {
  const map: Record<string, string> = {
    Missing: 'Thiếu tài liệu',
    Uploaded: 'Đã tải đủ',
    Pass: 'Đạt',
    Fail: 'Không đạt',
    Open: 'Chưa đánh giá'
  };
  return map[status] || status || '—';
}

export function commandStateVi(state: string): string {
  const map: Record<string, string> = {
    Pending: 'Chờ xử lý',
    Processing: 'Đang chạy Flow',
    Succeeded: 'Thành công',
    Rejected: 'Từ chối',
    Failed: 'Lỗi'
  };
  return map[state] || state || '—';
}

export function moneyVi(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '—';
  try {
    return amount.toLocaleString('vi-VN') + ' ₫';
  } catch {
    return String(amount) + ' ₫';
  }
}

/** Rút gọn tên tệp: giữ đầu + đuôi (phần mở rộng). */
export function shortFileName(name: string, head: number = 16, tail: number = 10): string {
  const raw = (name || '').trim();
  if (!raw) return '—';
  if (raw.length <= head + tail + 1) return raw;
  return `${raw.slice(0, head)}…${raw.slice(raw.length - tail)}`;
}
