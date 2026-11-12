import { IPayAction, PayPersona } from '../components/types';
import {
  IChecklistItemRow,
  checklistAllPass,
  requiredChecklistReady
} from './ChecklistService';
import { IRequestMaster } from './RequestService';

const STEP_PERSONAS: Record<string, PayPersona[]> = {
  BPCM1_PREPARE: ['creator', 'manager'],
  BPCM2_TECH: ['bpcm2'],
  BPCM3_PRICE: ['bpcm3'],
  TCKT_CHECK: ['tckt_check'],
  CHAIR_APPROVE: ['chair'],
  TCKT_PAY: ['tckt_pay']
};

/** Actions allowed by Core Flow — BA: AwaitingManager + RoutePlan. */
export function liveActionsFor(
  master: IRequestMaster,
  checklist: IChecklistItemRow[],
  hasUnc: boolean,
  persona?: PayPersona
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
        dialog: 'forward'
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

  if (step === 'BPCM2_TECH' || step === 'BPCM3_PRICE' || step === 'TCKT_CHECK') {
    const actions: IPayAction[] = [];
    if (checklistAllPass(checklist)) {
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
    return [
      { id: 'approve', label: 'Phê duyệt', primary: true, command: 'DECIDE', dialog: 'approve' },
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
