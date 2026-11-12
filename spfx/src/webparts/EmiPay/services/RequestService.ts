import { CORE_STEPS, PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, getItems, mergeItem } from './SpRest';
import { PayStateKey } from '../components/types';

export interface IRequestMaster {
  id: number;
  requestKey: string;
  title: string;
  status: string;
  currentStepKey: string;
  currentStepInstanceKey: string;
  currentOUCode: string;
  reviewRound: number;
  paymentTypeCode: string;
  creatorUPN: string;
  createdOUCode: string;
  explanation: string;
  amount?: number;
  paymentDueAt?: string;
  paidAt?: string;
  archiveStatus?: string;
  isLocked?: boolean;
}

export interface IWorkItemRow {
  id: number;
  stepKey: string;
  state: string;
  decision: string;
  stepInstanceKey: string;
}

function choiceVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || '');
  }
  return String(v);
}

function mapMaster(r: Record<string, unknown>): IRequestMaster {
  return {
    id: Number(r.Id),
    requestKey: String(r.RequestKey || ''),
    title: String(r.Title || r.RequestKey || ''),
    status: choiceVal(r.Status),
    currentStepKey: String(r.CurrentStepKey || ''),
    currentStepInstanceKey: String(r.CurrentStepInstanceKey || ''),
    currentOUCode: String(r.CurrentOUCode || ''),
    reviewRound: Number(r.ReviewRound || 1),
    paymentTypeCode: String(r.PaymentTypeCode || ''),
    creatorUPN: String(r.CreatorUPN || ''),
    createdOUCode: String(r.CreatedOUCode || ''),
    explanation: String(r.Explanation || ''),
    amount: r.Amount !== undefined && r.Amount !== null ? Number(r.Amount) : undefined,
    paymentDueAt: r.PaymentDueAt ? String(r.PaymentDueAt) : undefined,
    paidAt: r.PaidAt ? String(r.PaidAt) : undefined,
    archiveStatus: choiceVal(r.ArchiveStatus),
    isLocked: !!r.IsLocked
  };
}

export async function getRequestByKey(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IRequestMaster | undefined> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.Requests,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$top=2`
  );
  if (!rows.length) return undefined;
  return mapMaster(rows[0]);
}

/**
 * Flow CREATE (1.0.0.9) ghi Title=RequestKey, Explanation cứng, không ghi Amount.
 * SPFx bổ sung các trường nghiệp vụ sau khi Command Succeeded — không đổi Core Flow.
 */
export async function patchRequestAfterCreate(
  ctx: ISpRestContext,
  requestKey: string,
  fields: { title?: string; amount?: number; explanation?: string }
): Promise<void> {
  const master = await getRequestByKey(ctx, requestKey);
  if (!master) {
    throw new Error(`Không thấy hồ sơ ${requestKey} sau CREATE`);
  }
  const body: Record<string, unknown> = {};
  if (fields.title) body.Title = fields.title;
  if (fields.explanation !== undefined) body.Explanation = fields.explanation;
  if (fields.amount !== undefined && !isNaN(fields.amount)) body.Amount = fields.amount;
  if (!Object.keys(body).length) return;
  await mergeItem(ctx, PAY_LISTS.Requests, master.id, body);
}

export async function listRecentRequests(
  ctx: ISpRestContext,
  opts?: { creatorUPN?: string; top?: number }
): Promise<IRequestMaster[]> {
  const top = opts?.top ?? 40;
  let filter = '';
  if (opts?.creatorUPN) {
    filter = `$filter=CreatorUPN eq '${escapeOData(opts.creatorUPN)}'&`;
  }
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.Requests,
    `${filter}$orderby=Id desc&$top=${top}`
  );
  return rows.map(mapMaster);
}

export async function listWorkItems(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IWorkItemRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.WorkItems,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$top=50`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      stepKey: String(r.StepKey || ''),
      state: choiceVal(r.State),
      decision: choiceVal(r.Decision),
      stepInstanceKey: String(r.StepInstanceKey || '')
    }))
    .sort((a, b) => a.id - b.id);
}

export function stepIndex(stepKey: string): number {
  const i = CORE_STEPS.indexOf(stepKey as (typeof CORE_STEPS)[number]);
  return i >= 0 ? i : 0;
}

export function mapToUiState(master: IRequestMaster): PayStateKey {
  const step = master.currentStepKey;
  const status = master.status;
  if (status === 'Returned' || (step === 'BPCM1_PREPARE' && status === 'Returned')) {
    return 'returned';
  }
  if (step === 'BPCM1_PREPARE') return 'draft';
  if (step === 'CHAIR_APPROVE') return 'chair';
  if (step === 'TCKT_PAY') return 'payment';
  if (step === 'SYSTEM_ARCHIVE' || status === 'Archiving') return 'archivePending';
  if (
    step === 'BPCM2_TECH' ||
    step === 'BPCM3_PRICE' ||
    step === 'TCKT_CHECK'
  ) {
    return 'review';
  }
  return 'review';
}

export function stepLabel(stepKey: string): string {
  const map: Record<string, string> = {
    BPCM1_PREPARE: 'BPCM1 · Khởi tạo',
    BPCM2_TECH: 'BPCM2 · KT kỹ thuật',
    BPCM3_PRICE: 'BPCM3 · KT giá',
    TCKT_CHECK: 'TCKT · Kiểm tra',
    CHAIR_APPROVE: 'CT.HĐQT · Phê duyệt',
    TCKT_PAY: 'TCKT · Thanh toán / UNC',
    SYSTEM_ARCHIVE: 'Hệ thống · Lưu trữ'
  };
  return map[stepKey] || stepKey;
}
