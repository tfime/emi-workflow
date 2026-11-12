import { DialogKind, IPayAction, PayPersona, PayStateKey } from './types';

/**
 * UX capability only — not SharePoint ACL.
 * Server must still authorize Commands; UI never trusts ActorUPN alone.
 */
export function actionsFor(persona: PayPersona, state: PayStateKey): IPayAction[] {
  const map: Record<PayPersona, Partial<Record<PayStateKey, IPayAction[]>>> = {
    creator: {
      draft: [
        { id: 'submit', label: 'Gửi hồ sơ', primary: true, command: 'SUBMIT', dialog: 'submit' },
        { id: 'upload', label: 'Tải checklist', ghost: true, dialog: 'attach' },
        { id: 'cancel', label: 'Hủy hồ sơ', danger: true, command: 'CANCEL', dialog: 'cancel' }
      ],
      returned: [
        { id: 'resubmit', label: 'Gửi lại', primary: true, command: 'SUBMIT', dialog: 'submit' },
        { id: 'upload', label: 'Sửa tài liệu không đạt', ghost: true, dialog: 'attach' },
        { id: 'cancel', label: 'Hủy hồ sơ', danger: true, command: 'CANCEL', dialog: 'cancel' }
      ],
      waiting: [
        { id: 'withdraw', label: 'Rút hồ sơ', danger: true, command: 'WITHDRAW', dialog: 'withdraw' }
      ],
      completed: [],
      cancelled: [],
      archivePending: []
    },
    manager: {
      waiting: [
        { id: 'accept', label: 'Tiếp nhận + đặt hạn', primary: true, command: 'ACCEPT', dialog: 'accept' },
        { id: 'delegate', label: 'Ủy quyền', ghost: true, dialog: 'delegate' }
      ],
      review: [
        { id: 'assign', label: 'Phân công', ghost: true, command: 'ASSIGN', dialog: 'assign' },
        { id: 'checklist', label: 'Sửa / chốt checklist', ghost: true, dialog: 'checklist' },
        { id: 'attach', label: 'Đính kèm bổ sung', ghost: true, dialog: 'attach' },
        { id: 'extend', label: 'Gia hạn', ghost: true, dialog: 'extendDeadline' },
        { id: 'forward', label: 'Gửi tiếp', primary: true, command: 'DECIDE', dialog: 'forward' },
        { id: 'return', label: 'Trả hồ sơ', danger: true, command: 'DECIDE', dialog: 'return' }
      ]
    },
    assignee: {
      review: [
        { id: 'checklist', label: 'Đánh giá checklist', primary: true, dialog: 'checklist' },
        { id: 'attach', label: 'Bổ sung đính kèm', ghost: true, dialog: 'attach' }
      ]
    },
    chair: {
      chair: [
        { id: 'approve', label: 'Duyệt', primary: true, command: 'DECIDE', dialog: 'approve' },
        { id: 'reject', label: 'Không duyệt', danger: true, command: 'DECIDE', dialog: 'reject' }
      ],
      completed: [],
      archivePending: []
    },
    tckt: {
      waiting: [
        { id: 'accept', label: 'Tiếp nhận + đặt hạn', primary: true, command: 'ACCEPT', dialog: 'accept' }
      ],
      review: [
        { id: 'checklist', label: 'Đánh giá checklist', ghost: true, dialog: 'checklist' },
        { id: 'attach', label: 'Đính kèm bổ sung', ghost: true, dialog: 'attach' },
        { id: 'forward', label: 'Gửi CT.HĐQT', primary: true, command: 'DECIDE', dialog: 'forward' },
        { id: 'return', label: 'Trả hồ sơ', danger: true, command: 'DECIDE', dialog: 'return' }
      ],
      unc: [
        { id: 'unc', label: 'Tải UNC', primary: true, dialog: 'unc' },
        { id: 'confirm', label: 'Xác nhận đã thanh toán', ghost: true, command: 'CONFIRM_PAYMENT', dialog: 'confirmPay' }
      ],
      payment: [
        { id: 'unc', label: 'Tải / thay UNC', ghost: true, dialog: 'unc' },
        { id: 'confirm', label: 'Xác nhận đã thanh toán', primary: true, command: 'CONFIRM_PAYMENT', dialog: 'confirmPay' }
      ],
      archivePending: []
    },
    procadm: {
      draft: [],
      completed: []
    },
    audit: {
      completed: [],
      cancelled: [],
      archivePending: []
    }
  };

  return (map[persona] && map[persona][state]) || [];
}

export function canViewInternal(persona: PayPersona): boolean {
  return (
    persona === 'chair' ||
    persona === 'manager' ||
    persona === 'assignee' ||
    persona === 'tckt' ||
    persona === 'audit' ||
    persona === 'procadm'
  );
}

export function canOpenConfig(persona: PayPersona): boolean {
  return persona === 'procadm';
}

export function dialogTitle(kind: Exclude<DialogKind, undefined>): string {
  const titles: Record<Exclude<DialogKind, undefined>, string> = {
    submit: 'Gửi / gửi lại hồ sơ',
    accept: 'Tiếp nhận xử lý',
    assign: 'Phân công nhân sự',
    checklist: 'Đánh giá checklist',
    attach: 'Tải / bổ sung tài liệu',
    forward: 'Gửi tiếp bước sau',
    return: 'Trả hồ sơ về BPCM 1',
    withdraw: 'Rút hồ sơ',
    cancel: 'Hủy hồ sơ',
    approve: 'CT.HĐQT — Duyệt',
    reject: 'CT.HĐQT — Không duyệt',
    unc: 'Tải UNC / chứng từ thanh toán',
    confirmPay: 'Xác nhận đã thanh toán',
    extendDeadline: 'Gia hạn xử lý',
    delegate: 'Ủy quyền Trưởng phòng'
  };
  return titles[kind];
}
