import { IPayAction } from '../components/types';
import { IChecklistItemRow, requiredChecklistReady } from './ChecklistService';
import { IRequestMaster } from './RequestService';

/** Actions allowed by Core Flow 1.0.0.9 — derived from Master step/status */
export function liveActionsFor(
  master: IRequestMaster,
  checklist: IChecklistItemRow[],
  hasUnc: boolean
): IPayAction[] {
  const step = master.currentStepKey;
  const status = master.status;

  if (step === 'BPCM1_PREPARE' && (status === 'Draft' || status === 'Returned')) {
    const actions: IPayAction[] = [
      { id: 'upload', label: 'Tải checklist', ghost: true, dialog: 'attach' }
    ];
    if (requiredChecklistReady(checklist)) {
      actions.unshift({
        id: 'submit',
        label: status === 'Returned' ? 'Gửi lại' : 'Gửi hồ sơ',
        primary: true,
        command: 'SUBMIT',
        dialog: 'submit'
      });
    }
    return actions;
  }

  if (step === 'BPCM2_TECH' || step === 'BPCM3_PRICE' || step === 'TCKT_CHECK') {
    return [
      { id: 'forward', label: 'Gửi tiếp (PASS)', primary: true, command: 'DECIDE', dialog: 'forward' },
      { id: 'return', label: 'Trả hồ sơ', danger: true, command: 'DECIDE', dialog: 'return' }
    ];
  }

  if (step === 'CHAIR_APPROVE') {
    return [
      { id: 'approve', label: 'Duyệt', primary: true, command: 'DECIDE', dialog: 'approve' },
      { id: 'reject', label: 'Không duyệt', danger: true, command: 'DECIDE', dialog: 'reject' }
    ];
  }

  if (step === 'TCKT_PAY') {
    const actions: IPayAction[] = [
      { id: 'unc', label: hasUnc ? 'Tải / thay UNC' : 'Tải UNC', ghost: !hasUnc, primary: !hasUnc, dialog: 'unc' }
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
