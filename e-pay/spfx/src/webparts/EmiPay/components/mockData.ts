import {
  IInboxItem,
  IPayDetailState,
  IPersonaOption,
  PayStateKey
} from './types';

/** Align labels with Core Flow 1.0.0.9 StepKeys */
export const WORKFLOW_STEPS: string[] = [
  'BPCM1_PREPARE',
  'BPCM2_TECH',
  'BPCM3_PRICE',
  'TCKT_CHECK',
  'CHAIR_APPROVE',
  'TCKT_PAY',
  'SYSTEM_ARCHIVE'
];

export const PERSONAS: IPersonaOption[] = [
  { id: 'creator', label: 'Người tạo (BPCM1)', short: 'NT' },
  { id: 'manager', label: 'Trưởng phòng BPCM', short: 'TP' },
  { id: 'assignee', label: 'Nhân sự phân công', short: 'NV' },
  { id: 'chair', label: 'CT.HĐQT', short: 'CT' },
  { id: 'tckt', label: 'TCKT', short: 'TK' },
  { id: 'procadm', label: 'Quản trị quy trình', short: 'AD' },
  { id: 'audit', label: 'Kiểm toán (đọc)', short: 'KT' }
];

export const STAFF_POOL: { upn: string; name: string }[] = [
  { upn: 'a.nguyen@emi.local', name: 'Nguyễn A' },
  { upn: 'b.tran@emi.local', name: 'Trần B' },
  { upn: 'c.le@emi.local', name: 'Lê C' }
];

export const NOTIFY_TARGETS: { id: string; label: string }[] = [
  { id: 'creator', label: 'Người tạo hồ sơ' },
  { id: 'chair', label: 'CT.HĐQT' },
  { id: 'ou_pbcm', label: 'OU_PBCM (đã tham gia)' },
  { id: 'ou_pbcm2', label: 'OU_PBCM2' },
  { id: 'ou_other', label: 'Phòng liên quan khác' }
];

export const INBOX_ITEMS: IInboxItem[] = [
  {
    id: '1',
    state: 'draft',
    swatch: 'PB',
    title: 'REQ-20261112-7a7287',
    meta: 'SPV_PAYMENT · 45.000.000 · checklist thiếu bắt buộc',
    badge: 'Nháp',
    badgeKind: 'mute',
    bucket: 'mine',
    personas: ['creator']
  },
  {
    id: '2',
    state: 'returned',
    swatch: 'RT',
    swatchKind: 'warn',
    title: 'REQ-20261111-91bc02',
    meta: 'Trả từ TCKT_REVIEW · thiếu hóa đơn · vòng 2',
    badge: 'Đã trả về',
    badgeKind: 'warn',
    bucket: 'mine',
    personas: ['creator']
  },
  {
    id: '3',
    state: 'waiting',
    swatch: 'P2',
    swatchKind: 'info',
    title: 'REQ-20261110-c4e19a',
    meta: 'PBCM2 · WaitingAcceptance',
    badge: 'Chờ nhận',
    badgeKind: 'info',
    bucket: 'todo',
    personas: ['manager', 'tckt']
  },
  {
    id: '4',
    state: 'review',
    swatch: 'P2',
    swatchKind: 'info',
    title: 'REQ-20261110-c4e19a',
    meta: 'PBCM2 · InProgress · hạn còn 1 ngày',
    badge: 'Cần xử lý',
    badgeKind: 'info',
    bucket: 'todo',
    personas: ['manager', 'assignee', 'tckt'],
    overdue: false
  },
  {
    id: '5',
    state: 'chair',
    swatch: 'CT',
    swatchKind: 'info',
    title: 'REQ-20261108-bb2201',
    meta: 'CHAIR_APPROVAL · chờ duyệt',
    badge: 'Chờ duyệt',
    badgeKind: 'info',
    bucket: 'todo',
    personas: ['chair']
  },
  {
    id: '6',
    state: 'unc',
    swatch: 'UN',
    title: 'REQ-20261109-aa11f0',
    meta: 'TCKT_UNC · đã duyệt · chờ tải UNC',
    badge: 'Tải UNC',
    badgeKind: 'info',
    bucket: 'todo',
    personas: ['tckt']
  },
  {
    id: '7',
    state: 'payment',
    swatch: 'TT',
    title: 'REQ-20261109-aa11f0',
    meta: 'PAYMENT_CONFIRM · PendingPayment',
    badge: 'Chờ xác nhận',
    badgeKind: 'info',
    bucket: 'todo',
    personas: ['tckt']
  },
  {
    id: '8',
    state: 'archivePending',
    swatch: 'AR',
    swatchKind: 'warn',
    title: 'REQ-20261105-zz1001',
    meta: 'Đã TT · chờ lưu trữ thành công',
    badge: 'Chờ archive',
    badgeKind: 'warn',
    bucket: 'watch',
    personas: ['creator', 'tckt', 'procadm', 'audit', 'chair', 'manager']
  },
  {
    id: '9',
    state: 'completed',
    swatch: 'OK',
    swatchKind: 'ok',
    title: 'REQ-20261001-ok9001',
    meta: 'Hoàn tất · chỉ xem',
    badge: 'Hoàn tất',
    badgeKind: 'ok',
    bucket: 'watch',
    personas: ['creator', 'manager', 'chair', 'tckt', 'audit', 'procadm']
  },
  {
    id: '10',
    state: 'cancelled',
    swatch: 'X',
    swatchKind: 'danger',
    title: 'REQ-20261107-xx9900',
    meta: 'Đã hủy · kho cancelled',
    badge: 'Đã hủy',
    badgeKind: 'danger',
    bucket: 'watch',
    personas: ['creator', 'audit', 'procadm']
  }
];

const baseCheckDraft = [
  {
    code: 'DOC_REQUEST',
    label: 'Đề nghị thanh toán',
    meta: 'Bắt buộc',
    badge: 'Missing',
    kind: 'warn' as const,
    required: true,
    editable: true,
    result: 'Missing' as const
  },
  {
    code: 'DOC_INVOICE',
    label: 'Hóa đơn / chứng từ',
    meta: 'Bắt buộc · 0/1',
    badge: 'Missing',
    kind: 'warn' as const,
    required: true,
    editable: true,
    result: 'Missing' as const
  },
  {
    code: 'DOC_CONTRACT',
    label: 'Hợp đồng liên quan',
    meta: 'Tùy chọn',
    badge: '—',
    kind: 'mute' as const,
    required: false,
    editable: true,
    result: 'Open' as const
  }
];

export const DETAIL_STATES: Record<PayStateKey, IPayDetailState> = {
  draft: {
    title: 'REQ-20261112-7a7287',
    sub: 'SPV_PAYMENT · vòng 1 · CurrentStepKey = PBCM',
    status: 'Nháp',
    step: 'PBCM · Khởi tạo / điều chỉnh',
    stepshort: 'PBCM',
    ou: 'OU_PBCM',
    round: '1',
    current: 0,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    canEditMaster: true,
    canUploadChecklist: true,
    canUploadSupplement: false,
    cmd: 'SUBMIT khi checklist bắt buộc đủ',
    check: baseCheckDraft,
    attachments: [],
    assignees: [],
    act: [{ type: 'CREATED', text: '→ Draft · PBCM', scope: 'public' }],
    nextOuOptions: [
      { code: 'OU_PBCM2', name: 'BPCM 2 — Kiểm tra kỹ thuật', isDefault: true }
    ]
  },
  returned: {
    title: 'REQ-20261111-91bc02',
    sub: 'SPV_PAYMENT · vòng 2 · returnFromStepKey = TCKT_REVIEW',
    status: 'Đã trả về',
    step: 'PBCM · điều chỉnh sau trả',
    stepshort: 'PBCM',
    ou: 'OU_PBCM',
    round: '2',
    current: 0,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Bổ sung hóa đơn theo yêu cầu TCKT',
    returnFromStepKey: 'TCKT_REVIEW',
    canEditMaster: true,
    canUploadChecklist: true,
    canUploadSupplement: false,
    banner: {
      kind: 'warn',
      html: '<strong>Đã trả về.</strong> Chỉ sửa mục Không đạt / thông tin chung. Gửi lại → ReviewRound +1, vào lại <b>BPCM2</b>.'
    },
    cmd: 'SUBMIT · gửi lại từ BPCM2',
    check: [
      {
        code: 'DOC_REQUEST',
        label: 'Đề nghị thanh toán',
        meta: 'Đã đạt lượt trước · giữ nguyên',
        badge: 'Pass',
        kind: 'ok',
        required: true,
        editable: false,
        result: 'Pass'
      },
      {
        code: 'DOC_INVOICE',
        label: 'Hóa đơn / chứng từ',
        meta: 'Không đạt · cần thay',
        badge: 'Fail',
        kind: 'danger',
        required: true,
        editable: true,
        result: 'Fail'
      },
      {
        code: 'DOC_CONTRACT',
        label: 'Hợp đồng liên quan',
        meta: 'Đã có',
        badge: 'Pass',
        kind: 'ok',
        required: false,
        editable: false,
        result: 'Pass'
      }
    ],
    attachments: [
      { name: 'de-nghi-v1.pdf', by: 'creator', scope: 'checklist', locked: true },
      { name: 'hoa-don-cu.pdf', by: 'creator', scope: 'checklist', locked: false }
    ],
    assignees: [],
    act: [
      { type: 'RETURNED', text: 'TCKT_REVIEW → Returned · thiếu hóa đơn', scope: 'public' },
      { type: 'STEP_COMPLETED', text: 'PBCM3 → TCKT_REVIEW', scope: 'public' }
    ],
    nextOuOptions: [
      { code: 'OU_PBCM2', name: 'BPCM 2 — Kiểm tra kỹ thuật', isDefault: true }
    ]
  },
  waiting: {
    title: 'REQ-20261110-c4e19a',
    sub: 'WaitingAcceptance · PBCM2 · bên gửi vẫn rút được',
    status: 'Chờ tiếp nhận',
    step: 'PBCM2 · Kiểm tra kỹ thuật',
    stepshort: 'PBCM2',
    ou: 'OU_PBCM2',
    round: '1',
    current: 1,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'info',
      html: 'Mở xem ≠ tiếp nhận. Trưởng phòng phải <b>đặt hạn</b> khi Tiếp nhận. Người gửi vẫn <b>rút</b> được.'
    },
    cmd: 'ACCEPT · đặt hạn bắt buộc',
    check: [
      {
        code: 'DOC_REQUEST',
        label: 'Đề nghị thanh toán',
        meta: 'Chỉ đọc',
        badge: 'Uploaded',
        kind: 'ok',
        required: true,
        editable: false,
        result: 'Uploaded'
      },
      {
        code: 'DOC_INVOICE',
        label: 'Hóa đơn / chứng từ',
        meta: 'Chỉ đọc',
        badge: 'Uploaded',
        kind: 'ok',
        required: true,
        editable: false,
        result: 'Uploaded'
      },
      {
        code: 'DOC_CONTRACT',
        label: 'Hợp đồng liên quan',
        meta: 'Chỉ đọc',
        badge: 'Uploaded',
        kind: 'ok',
        required: false,
        editable: false,
        result: 'Uploaded'
      }
    ],
    attachments: [
      { name: 'de-nghi-v1.pdf', by: 'creator', scope: 'checklist', locked: true }
    ],
    assignees: [],
    act: [{ type: 'SUBMITTED', text: '→ WaitingAcceptance · PBCM2', scope: 'public' }]
  },
  review: {
    title: 'REQ-20261110-c4e19a',
    sub: 'InProgress · PBCM2 · hạn 14/11/2026',
    status: 'Đang kiểm tra',
    step: 'PBCM2 · Kiểm tra kỹ thuật',
    stepshort: 'PBCM2',
    ou: 'OU_PBCM2',
    round: '1',
    current: 1,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    deadline: '14/11/2026 17:00',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: true,
    banner: {
      kind: 'info',
      html: 'Checklist chung của bước. TP chốt gửi tiếp / trả. Đính kèm bổ sung nội bộ chưa chốt: người tạo <b>không</b> xem.'
    },
    cmd: 'DECIDE · PASS / REJECT',
    check: [
      {
        code: 'DOC_REQUEST',
        label: 'Đề nghị thanh toán',
        meta: 'NV A đánh giá',
        badge: 'Pass',
        kind: 'ok',
        required: true,
        editable: true,
        result: 'Pass'
      },
      {
        code: 'DOC_INVOICE',
        label: 'Hóa đơn / chứng từ',
        meta: 'Đang mở',
        badge: 'Open',
        kind: 'warn',
        required: true,
        editable: true,
        result: 'Open'
      },
      {
        code: 'DOC_CONTRACT',
        label: 'Hợp đồng liên quan',
        meta: 'Pass',
        badge: 'Pass',
        kind: 'ok',
        required: false,
        editable: true,
        result: 'Pass'
      }
    ],
    attachments: [
      { name: 'de-nghi-v1.pdf', by: 'creator', scope: 'checklist', locked: true },
      { name: 'bien-ban-noi-bo.docx', by: 'NV A', scope: 'internal', locked: false },
      { name: 'phu-luc-gia.pdf', by: 'TP', scope: 'supplement', locked: false }
    ],
    assignees: [
      { upn: 'a.nguyen@emi.local', name: 'Nguyễn A' },
      { upn: 'b.tran@emi.local', name: 'Trần B' }
    ],
    act: [
      { type: 'ACCEPTED', text: 'PBCM2 tiếp nhận · hạn 3 ngày', scope: 'public' },
      { type: 'ASSIGNED', text: 'Giao Nguyễn A, Trần B', scope: 'internal' },
      { type: 'CHECK_EDIT', text: 'DOC_REQUEST → Pass', scope: 'internal' }
    ],
    nextOuOptions: [
      { code: 'OU_PBCM3', name: 'BPCM 3 — Kiểm tra giá', isDefault: true }
    ]
  },
  chair: {
    title: 'REQ-20261108-bb2201',
    sub: 'CHAIR_APPROVAL · chỉ Duyệt / Không duyệt',
    status: 'Chờ phê duyệt',
    step: 'CHAIR_APPROVAL · CT.HĐQT',
    stepshort: 'CHAIR',
    ou: 'OU_CHAIR',
    round: '1',
    current: 4,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'info',
      html: 'CT.HĐQT xem toàn bộ (kể cả nội bộ). <b>Không</b> checklist, không sửa thông tin, không upload.'
    },
    cmd: 'DECIDE · APPROVE / REJECT (+ paymentDueAt khi duyệt)',
    check: [
      {
        code: 'DOC_REQUEST',
        label: 'Đề nghị thanh toán',
        meta: 'Khóa',
        badge: 'Pass',
        kind: 'ok',
        required: true,
        editable: false,
        result: 'Pass'
      },
      {
        code: 'DOC_INVOICE',
        label: 'Hóa đơn / chứng từ',
        meta: 'Khóa',
        badge: 'Pass',
        kind: 'ok',
        required: true,
        editable: false,
        result: 'Pass'
      },
      {
        code: 'DOC_CONTRACT',
        label: 'Hợp đồng liên quan',
        meta: 'Khóa',
        badge: 'Pass',
        kind: 'ok',
        required: false,
        editable: false,
        result: 'Pass'
      }
    ],
    attachments: [
      { name: 'bo-ho-so.zip', by: 'system', scope: 'checklist', locked: true },
      { name: 'phu-luc-tckt.pdf', by: 'TCKT', scope: 'supplement', locked: true }
    ],
    assignees: [],
    act: [
      { type: 'STEP_COMPLETED', text: 'TCKT_REVIEW → CHAIR_APPROVAL', scope: 'public' },
      { type: 'INTERNAL', text: 'PBCM2 trao đổi nội bộ (CHAIR xem được)', scope: 'internal' }
    ]
  },
  unc: {
    title: 'REQ-20261109-aa11f0',
    sub: 'TCKT_UNC · sau CT.HĐQT duyệt',
    status: 'Chờ tải UNC',
    step: 'TCKT_UNC · Tải chứng từ',
    stepshort: 'UNC',
    ou: 'OU_TCKT',
    round: '1',
    current: 5,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    paymentDueAt: '20/11/2026',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'info',
      html: 'Thanh toán <b>ngoài</b> SharePoint. Tải UNC rồi xác nhận.'
    },
    cmd: 'Upload UNC → CONFIRM_PAYMENT',
    check: [
      {
        code: 'DOC_UNC',
        label: 'UNC / chứng từ TT',
        meta: 'Chưa có',
        badge: 'Missing',
        kind: 'warn',
        required: true,
        editable: true,
        result: 'Missing'
      }
    ],
    attachments: [
      { name: 'bo-ho-so.zip', by: 'system', scope: 'checklist', locked: true }
    ],
    assignees: [],
    act: [
      { type: 'APPROVED', text: 'CHAIR → TCKT_UNC · Due 20/11', scope: 'public' }
    ]
  },
  payment: {
    title: 'REQ-20261109-aa11f0',
    sub: 'PAYMENT_CONFIRM · UNC đã có · chọn người nhận TB',
    status: 'Chờ xác nhận TT',
    step: 'PAYMENT_CONFIRM',
    stepshort: 'CONFIRM',
    ou: 'OU_TCKT',
    round: '1',
    current: 6,
    amount: '45.000.000',
    creator: 'creator@emi.local',
    explanation: 'Thanh toán đợt 2 theo hợp đồng SPV-2026-014',
    paymentDueAt: '20/11/2026',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'info',
      html: 'Xác nhận ghi PaymentConfirmed + gửi thông báo ngay · sau đó chờ Archive.'
    },
    cmd: 'CONFIRM_PAYMENT',
    check: [
      {
        code: 'DOC_UNC',
        label: 'UNC / chứng từ TT',
        meta: 'unc-20261109.pdf',
        badge: 'Uploaded',
        kind: 'info',
        required: true,
        editable: false,
        result: 'Uploaded'
      }
    ],
    attachments: [
      { name: 'unc-20261109.pdf', by: 'TCKT', scope: 'unc', locked: false }
    ],
    assignees: [],
    act: [
      { type: 'UNC_UPLOADED', text: 'Tải UNC', scope: 'public' },
      { type: 'STEP_COMPLETED', text: 'CHAIR → TCKT_UNC', scope: 'public' }
    ]
  },
  archivePending: {
    title: 'REQ-20261105-zz1001',
    sub: 'PaymentConfirmed · ARCHIVE_PENDING',
    status: 'Chờ lưu trữ',
    step: 'Archive Manager',
    stepshort: 'ARCHIVE',
    ou: 'OU_TCKT',
    round: '1',
    current: 6,
    amount: '30.000.000',
    creator: 'creator@emi.local',
    explanation: 'Hồ sơ đã TT — chờ chuyển kho',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'warn',
      html: 'Chưa <b>COMPLETED</b> đến khi archive thành công. Lỗi kéo dài → báo PROCADM.'
    },
    cmd: 'ARCHIVE_RESULT (subflow)',
    check: [],
    attachments: [
      { name: 'unc.pdf', by: 'TCKT', scope: 'unc', locked: true }
    ],
    assignees: [],
    act: [
      { type: 'PAYMENT_CONFIRMED', text: '→ ARCHIVE_PENDING', scope: 'public' },
      { type: 'ARCHIVE_RETRY', text: 'Lỗi 1 file · thử lại', scope: 'internal' }
    ]
  },
  completed: {
    title: 'REQ-20261001-ok9001',
    sub: 'COMPLETED · chỉ đọc',
    status: 'Hoàn tất',
    step: 'Đã khóa',
    stepshort: 'DONE',
    ou: 'OU_TCKT',
    round: '1',
    current: 6,
    amount: '18.000.000',
    creator: 'creator@emi.local',
    explanation: 'Hồ sơ hoàn tất',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'info',
      html: 'BR-14: các BPCM đã tham gia chỉ xem theo quyền · không sửa.'
    },
    cmd: 'Không còn lệnh',
    check: [],
    attachments: [
      { name: 'archive-link', by: 'system', scope: 'checklist', locked: true }
    ],
    assignees: [],
    act: [
      { type: 'COMPLETED', text: 'Archive OK → COMPLETED', scope: 'public' }
    ]
  },
  cancelled: {
    title: 'REQ-20261107-xx9900',
    sub: 'Cancelled · không thông báo hủy',
    status: 'Đã hủy',
    step: 'PBCM · khóa',
    stepshort: 'CANCEL',
    ou: 'OU_PBCM',
    round: '1',
    current: 0,
    amount: '12.000.000',
    creator: 'creator@emi.local',
    explanation: 'Hủy vì chọn sai loại hồ sơ',
    canEditMaster: false,
    canUploadChecklist: false,
    canUploadSupplement: false,
    banner: {
      kind: 'warn',
      html: 'Đã hủy · không gửi lại. Không gửi thông báo hủy cho BPCM.'
    },
    cmd: 'Không còn lệnh',
    check: [],
    attachments: [],
    assignees: [],
    act: [
      { type: 'CANCELLED', text: 'Draft → Cancelled', scope: 'public' }
    ]
  }
};

export function getDetail(state: PayStateKey): IPayDetailState {
  return DETAIL_STATES[state];
}
