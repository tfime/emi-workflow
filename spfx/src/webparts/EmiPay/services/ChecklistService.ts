import { IChecklistTemplate } from './ConfigService';
import { PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, createItem, getItems, mergeItem } from './SpRest';

export interface IChecklistItemRow {
  id: number;
  requestKey: string;
  checklistItemKey: string;
  itemCode: string;
  itemLabel: string;
  isRequired: boolean;
  minFileCount: number;
  uploadedCount: number;
  itemStatus: string;
  isLocked: boolean;
}

function choiceVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || '');
  }
  return String(v);
}

function mapRow(r: Record<string, unknown>): IChecklistItemRow {
  return {
    id: Number(r.Id),
    requestKey: String(r.RequestKey || ''),
    checklistItemKey: String(r.ChecklistItemKey || ''),
    itemCode: String(r.ItemCode || ''),
    itemLabel: String(r.ItemLabel || r.ItemCode || ''),
    isRequired: !!r.IsRequired,
    minFileCount: Number(r.MinFileCount || 0),
    uploadedCount: Number(r.UploadedCount || 0),
    itemStatus: choiceVal(r.ItemStatus) || 'Missing',
    isLocked: !!r.IsLocked
  };
}

export async function listChecklistItems(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IChecklistItemRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.ChecklistItems,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$top=50`
  );
  return rows.map(mapRow).sort((a, b) => a.id - b.id);
}

export async function reconcileChecklistFromTemplates(
  ctx: ISpRestContext,
  requestKey: string,
  templates: IChecklistTemplate[]
): Promise<IChecklistItemRow[]> {
  const existing = await listChecklistItems(ctx, requestKey);
  const byCode: Record<string, IChecklistItemRow> = {};
  existing.forEach((e) => {
    byCode[e.itemCode] = e;
  });

  for (const t of templates) {
    if (byCode[t.itemCode]) continue;
    await createItem(ctx, PAY_LISTS.ChecklistItems, {
      Title: `${requestKey}-${t.itemCode}`,
      RequestKey: requestKey,
      ChecklistItemKey: `${requestKey}|${t.itemCode}`,
      ItemCode: t.itemCode,
      ItemLabel: t.itemLabel,
      IsRequired: t.isRequired,
      MinFileCount: t.minFileCount,
      UploadedCount: 0,
      ItemStatus: 'Missing',
      IsLocked: false
    });
  }
  return listChecklistItems(ctx, requestKey);
}

export function requiredChecklistReady(items: IChecklistItemRow[]): boolean {
  const required = items.filter((i) => i.isRequired);
  if (!required.length) return false;
  return required.every((i) => {
    const min = i.minFileCount > 0 ? i.minFileCount : 1;
    return i.uploadedCount >= min;
  });
}

/** Mục cần đánh giá ở bước KT: bắt buộc hoặc đã có tệp. */
export function reviewableChecklistItems(items: IChecklistItemRow[]): IChecklistItemRow[] {
  return items.filter((i) => i.isRequired || i.uploadedCount > 0);
}

/** Đã Pass/Fail hết các mục cần đánh giá. */
export function checklistReviewComplete(items: IChecklistItemRow[]): boolean {
  const rows = reviewableChecklistItems(items);
  if (!rows.length) return false;
  return rows.every((i) => i.itemStatus === 'Pass' || i.itemStatus === 'Fail');
}

/** Đủ điều kiện chuyển bước (PASS): mọi mục cần đánh giá đều Đạt. */
export function checklistAllPass(items: IChecklistItemRow[]): boolean {
  const rows = reviewableChecklistItems(items);
  if (!rows.length) return false;
  return rows.every((i) => i.itemStatus === 'Pass');
}

export function checklistHasFail(items: IChecklistItemRow[]): boolean {
  return reviewableChecklistItems(items).some((i) => i.itemStatus === 'Fail');
}

export async function bumpChecklistUpload(
  ctx: ISpRestContext,
  item: IChecklistItemRow,
  addCount: number = 1
): Promise<IChecklistItemRow> {
  const next = item.uploadedCount + addCount;
  const min = item.minFileCount > 0 ? item.minFileCount : 1;
  const status = next >= min ? 'Uploaded' : 'Missing';
  await mergeItem(ctx, PAY_LISTS.ChecklistItems, item.id, {
    UploadedCount: next,
    ItemStatus: status
  });
  return { ...item, uploadedCount: next, itemStatus: status };
}

export async function setChecklistItemReview(
  ctx: ISpRestContext,
  item: IChecklistItemRow,
  result: 'Pass' | 'Fail'
): Promise<IChecklistItemRow> {
  if (item.isLocked) {
    throw new Error('Mục checklist đã khóa — không được đánh giá lại sau khi chuyển bước.');
  }
  await mergeItem(ctx, PAY_LISTS.ChecklistItems, item.id, {
    ItemStatus: result
  });
  return { ...item, itemStatus: result };
}

export async function lockChecklistItems(
  ctx: ISpRestContext,
  items: IChecklistItemRow[]
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (row.isLocked) continue;
    await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: true });
  }
}

export async function saveStepReview(
  ctx: ISpRestContext,
  opts: {
    requestKey: string;
    stepInstanceKey: string;
    reviewRound: number;
    checklistItemKey: string;
    result: 'Pass' | 'Fail';
    reason: string;
    reviewedByUPN: string;
  }
): Promise<void> {
  await createItem(ctx, PAY_LISTS.StepReviews, {
    Title: `${opts.requestKey}|${opts.checklistItemKey}|${opts.result}`,
    RequestKey: opts.requestKey,
    StepInstanceKey: opts.stepInstanceKey || '',
    ReviewRound: Number(opts.reviewRound) || 1,
    ChecklistItemKey: opts.checklistItemKey,
    Result: opts.result,
    Reason: opts.reason || '',
    ReviewedByUPN: opts.reviewedByUPN,
    ReviewedAt: new Date().toISOString()
  });
}
