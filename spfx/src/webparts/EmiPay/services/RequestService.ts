import { CORE_STEPS, PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, getItems, mergeItem } from './SpRest';
import { PayStateKey } from '../components/types';

export interface IRequestMaster {
  id: number;
  requestKey: string;
  /** Mã hiển thị (RequestCode); fallback RequestKey. */
  requestCode: string;
  /** Tiêu đề nghiệp vụ (Title) — không dùng RequestKey thay thế. */
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
  routePlanJson?: string;
}

export interface IWorkItemRow {
  id: number;
  stepKey: string;
  state: string;
  decision: string;
  stepInstanceKey: string;
  acceptedAt?: string;
  dueAt?: string;
  closedAt?: string;
  acceptedByUPN?: string;
  decisionNote?: string;
  responsibleOUCode?: string;
  reviewRound?: number;
}

function choiceVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || '');
  }
  return String(v);
}

function mapMaster(r: Record<string, unknown>): IRequestMaster {
  const requestKey = String(r.RequestKey || '');
  const rawTitle = String(r.Title || '');
  // Flow CREATE từng ghi Title=RequestKey — không coi đó là tiêu đề nghiệp vụ.
  const title = rawTitle && rawTitle !== requestKey ? rawTitle : '';
  return {
    id: Number(r.Id),
    requestKey,
    requestCode: String(r.RequestCode || requestKey),
    title,
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
    isLocked: !!r.IsLocked,
    routePlanJson: r.RoutePlanJson ? String(r.RoutePlanJson) : undefined
  };
}

export async function getRequestByKey(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IRequestMaster | undefined> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.Requests,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$select=Id,Title,RequestKey,RequestCode,Status,CurrentStepKey,CurrentStepInstanceKey,CurrentOUCode,ReviewRound,PaymentTypeCode,CreatorUPN,CreatedOUCode,Explanation,Amount,PaymentDueAt,PaidAt,ArchiveStatus,IsLocked,RoutePlanJson&$top=2`
  );
  if (!rows.length) return undefined;
  return mapMaster(rows[0]);
}

/** Được sửa Title/Amount/Explanation/OU/RoutePlan khi Nháp hoặc Đã trả (BPCM1). */
export function canEditRequestBusinessFields(master: IRequestMaster): boolean {
  if (master.isLocked) return false;
  if (master.currentStepKey !== 'BPCM1_PREPARE') return false;
  return master.status === 'Draft' || master.status === 'Returned';
}

export interface IRequestBusinessPatch {
  title?: string;
  amount?: number;
  explanation?: string;
  routePlanJson?: string;
  createdOUCode?: string;
}

/**
 * MERGE trường nghiệp vụ trên Requests — không đổi Status/Step (không qua Core).
 * Chỉ khi Draft/Returned + BPCM1_PREPARE.
 */
export async function patchRequestBusinessFields(
  ctx: ISpRestContext,
  requestKey: string,
  fields: IRequestBusinessPatch
): Promise<void> {
  const master = await getRequestByKey(ctx, requestKey);
  if (!master) {
    throw new Error(`Không thấy hồ sơ ${requestKey}`);
  }
  if (!canEditRequestBusinessFields(master)) {
    throw new Error(
      'Chỉ được sửa thông tin khi hồ sơ Nháp hoặc Đã trả về (bước BPCM1).'
    );
  }
  const body: Record<string, unknown> = {};
  if (fields.title !== undefined) {
    const t = String(fields.title).trim();
    if (!t) {
      throw new Error('Nhập tiêu đề hồ sơ (khác mã hồ sơ).');
    }
    if (t === master.requestKey) {
      throw new Error('Tiêu đề hồ sơ phải khác mã hồ sơ hệ thống.');
    }
    body.Title = t;
  }
  if (fields.explanation !== undefined) body.Explanation = fields.explanation;
  if (fields.amount !== undefined && !isNaN(fields.amount)) body.Amount = fields.amount;
  if (fields.routePlanJson !== undefined) body.RoutePlanJson = fields.routePlanJson;
  if (fields.createdOUCode !== undefined && fields.createdOUCode !== '') {
    body.CreatedOUCode = fields.createdOUCode;
  }
  // Đồng bộ mã hiển thị nếu trống
  if (!master.requestCode || master.requestCode === master.requestKey) {
    body.RequestCode = master.requestKey;
  }
  if (!Object.keys(body).length) return;
  await mergeItem(ctx, PAY_LISTS.Requests, master.id, body);
}

/** Tiêu đề hiển thị; không lẫn với mã hồ sơ. */
export function displayRequestTitle(master: IRequestMaster): string {
  if (master.title && master.title !== master.requestKey) return master.title;
  return 'Chưa đặt tiêu đề';
}

/**
 * Flow CREATE ghi Title=RequestKey, Explanation cứng, không ghi Amount.
 * SPFx bổ sung sau Command Succeeded — không đổi Core Flow.
 */
export async function patchRequestAfterCreate(
  ctx: ISpRestContext,
  requestKey: string,
  fields: IRequestBusinessPatch
): Promise<void> {
  await patchRequestBusinessFields(ctx, requestKey, fields);
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
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$select=Id,StepKey,State,Decision,StepInstanceKey,AcceptedAt,DueAt,ClosedAt,AcceptedByUPN,DecisionNote,ResponsibleOUCode,ReviewRound&$top=50`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      stepKey: String(r.StepKey || ''),
      state: choiceVal(r.State),
      decision: choiceVal(r.Decision),
      stepInstanceKey: String(r.StepInstanceKey || ''),
      acceptedAt: r.AcceptedAt ? String(r.AcceptedAt) : undefined,
      dueAt: r.DueAt ? String(r.DueAt) : undefined,
      closedAt: r.ClosedAt ? String(r.ClosedAt) : undefined,
      acceptedByUPN: r.AcceptedByUPN ? String(r.AcceptedByUPN) : undefined,
      decisionNote: r.DecisionNote ? String(r.DecisionNote) : undefined,
      responsibleOUCode: r.ResponsibleOUCode ? String(r.ResponsibleOUCode) : undefined,
      reviewRound: r.ReviewRound !== undefined && r.ReviewRound !== null ? Number(r.ReviewRound) : undefined
    }))
    .sort((a, b) => a.id - b.id);
}

/** WI hiện tại của hồ sơ (theo CurrentStepInstanceKey). */
export function currentWorkItem(
  items: IWorkItemRow[],
  currentStepInstanceKey: string
): IWorkItemRow | undefined {
  if (!currentStepInstanceKey) return undefined;
  return items.filter((w) => w.stepInstanceKey === currentStepInstanceKey)[0];
}

export function isWorkItemAccepted(wi: IWorkItemRow | undefined): boolean {
  return !!(wi && wi.acceptedAt);
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
