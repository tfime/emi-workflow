import { IPayAction, PayPersona } from '../components/types';
import {
  IChecklistItemRow,
  checklistHasFail,
  requiredChecklistReady
} from './ChecklistService';
import { IRequestMaster, IWorkItemRow, isWorkItemAccepted } from './RequestService';

const STEP_PERSONAS: Record<string, PayPersona[]> = {
  BPCM1_PREPARE: ['creator', 'manager'],
  BPCM2_TECH: ['bpcm2', 'manager'],
  BPCM3_PRICE: ['bpcm3', 'manager'],
  TCKT_CHECK: ['tckt_check', 'manager'],
  CHAIR_APPROVE: ['chair'],
  TCKT_PAY: ['tckt_pay', 'manager']
};

/** Bước bắt buộc ACCEPT (+DueAt) trước DECIDE / đánh giá checklist. */
export const ACCEPT_STEPS = ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'TCKT_PAY'];

export function needsAcceptFirst(
  master: IRequestMaster | undefined,
  currentWi: IWorkItemRow | undefined,
  workItems?: IWorkItemRow[]
): boolean {
  if (!master) return false;
  if (ACCEPT_STEPS.indexOf(master.currentStepKey) < 0) return false;
  if (isWorkItemAccepted(currentWi)) return false;
  // Fallback: WI cùng bước đã có AcceptedAt (tránh lệch CurrentStepInstanceKey).
  if (workItems && workItems.length) {
    const hit = workItems.some(
      (w) =>
        w.stepKey === master.currentStepKey &&
        !!(w.acceptedAt && String(w.acceptedAt).trim())
    );
    if (hit) return false;
  }
  return true;
}

/** Ghi chú tự do: chặn khi hồ sơ đã hoàn tất / hủy. */
export function canAddUserNote(master: IRequestMaster | undefined): boolean {
  if (!master) return false;
  const st = master.status || '';
  if (st === 'Completed' || st === 'Cancelled' || st === 'CancellationArchiving') {
    return false;
  }
  return true;
}

/** CHAIR đã duyệt hồ sơ (chưa PaymentDueAt) — WI CHAIR Decision=Approved đã đóng. */
export function isChairDossierApproved(
  master: IRequestMaster,
  workItems: IWorkItemRow[]
): boolean {
  if (master.currentStepKey !== 'CHAIR_APPROVE') return false;
  if (master.paymentDueAt) return false;
  return workItems.some(
    (w) =>
      w.stepKey === 'CHAIR_APPROVE' &&
      String(w.decision || '').toLowerCase() === 'approved' &&
      String(w.state || '').toLowerCase() === 'completed'
  );
}

/** Actions allowed by Core Flow — BA: AwaitingManager + RoutePlan + ACCEPT/DueAt. */
export function liveActionsFor(
  master: IRequestMaster,
  checklist: IChecklistItemRow[],
  hasUnc: boolean,
  persona?: PayPersona,
  currentWi?: IWorkItemRow,
  workItems?: IWorkItemRow[]
): IPayAction[] {
  const step = master.currentStepKey;
  const status = master.status;

  if (persona === 'procadm' || persona === 'audit') {
    return [];
  }

  const normalized: PayPersona | undefined =
    persona === 'assignee'
      ? 'bpcm2'
      : persona === 'tckt'
        ? 'tckt_check'
        : persona;

  // TP phòng tạo duyệt trình gửi
  if (
    step === 'BPCM1_PREPARE' &&
    status === 'AwaitingManager' &&
    (normalized === 'manager' || !normalized)
  ) {
    return [
      {
        id: 'mgrApprove',
        label: 'Duyệt gửi sang BPCM2',
        primary: true,
        command: 'DECIDE',
        dialog: 'mgrApprove'
      },
      {
        id: 'mgrReject',
        label: 'Từ chối — trả về nháp',
        danger: true,
        command: 'DECIDE',
        dialog: 'return'
      }
    ];
  }

  if (
    normalized &&
    STEP_PERSONAS[step] &&
    STEP_PERSONAS[step].indexOf(normalized) < 0
  ) {
    return [];
  }

  if (step === 'BPCM1_PREPARE' && (status === 'Draft' || status === 'Returned')) {
    const actions: IPayAction[] = [];
    if (requiredChecklistReady(checklist) && normalized !== 'manager') {
      actions.push({
        id: 'submit',
        label: status === 'Returned' ? 'Trình lại trưởng phòng' : 'Trình trưởng phòng',
        primary: true,
        command: 'SUBMIT',
        dialog: 'submit'
      });
    }
    return actions;
  }

  // BPCM2/3/TCKT: phải ACCEPT (+DueAt) trước DECIDE / CONFIRM
  if (ACCEPT_STEPS.indexOf(step) >= 0) {
    if (!isWorkItemAccepted(currentWi)) {
      return [
        {
          id: 'accept',
          label: 'Tiếp nhận và đặt hạn',
          primary: true,
          command: 'ACCEPT',
          dialog: 'accept'
        }
      ];
    }
  }

  if (step === 'BPCM2_TECH' || step === 'BPCM3_PRICE' || step === 'TCKT_CHECK') {
    // Phòng tự chọn mục chưa khóa để đánh giá — không đòi Đạt hết checklist.
    // Có Fail chưa khóa → chỉ trả BPCM1, không PASS.
    const actions: IPayAction[] = [];
    if (!checklistHasFail(checklist)) {
      actions.push({
        id: 'forward',
        label: 'Chuyển bước tiếp theo',
        primary: true,
        command: 'DECIDE',
        dialog: 'forward'
      });
    }
    actions.push({
      id: 'return',
      label: 'Trả về người tạo',
      danger: true,
      command: 'DECIDE',
      dialog: 'return'
    });
    return actions;
  }

  if (step === 'CHAIR_APPROVE') {
    const dossierDone = isChairDossierApproved(master, workItems || []);
    if (dossierDone) {
      return [
        {
          id: 'approvePay',
          label: 'Duyệt thanh toán',
          primary: true,
          command: 'DECIDE',
          dialog: 'approvePay'
        },
        {
          id: 'reject',
          label: 'Không phê duyệt',
          danger: true,
          command: 'DECIDE',
          dialog: 'reject'
        }
      ];
    }
    return [
      {
        id: 'approve',
        label: 'Phê duyệt hồ sơ',
        primary: true,
        command: 'DECIDE',
        dialog: 'approve'
      },
      {
        id: 'reject',
        label: 'Không phê duyệt',
        danger: true,
        command: 'DECIDE',
        dialog: 'reject'
      }
    ];
  }

  if (step === 'TCKT_PAY') {
    const actions: IPayAction[] = [
      {
        id: 'unc',
        label: hasUnc ? 'Tải lại ủy nhiệm chi (UNC)' : 'Tải ủy nhiệm chi (UNC)',
        ghost: !hasUnc,
        primary: !hasUnc,
        dialog: 'unc'
      }
    ];
    if (hasUnc) {
      actions.push({
        id: 'confirm',
        label: 'Xác nhận đã thanh toán',
        primary: true,
        command: 'CONFIRM_PAYMENT',
        dialog: 'confirmPay'
      });
    }
    return actions;
  }

  return [];
}
