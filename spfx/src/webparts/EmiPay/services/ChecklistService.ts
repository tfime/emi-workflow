import { IChecklistTemplate } from './ConfigService';
import { PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, createItem, deleteItem, getItems, mergeItem } from './SpRest';

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

/**
 * Đồng bộ ChecklistItems theo template loại hồ sơ.
 * Flow CREATE còn hardcode DOC_REQUEST/DOC_INVOICE (nhãn ASCII) — bước này
 * bổ sung mục thiếu, cập nhật nhãn từ template, và xóa mục thừa (chưa tải tệp).
 */
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

  const templateCodes: Record<string, true> = {};
  for (const t of templates) {
    templateCodes[t.itemCode] = true;
    const row = byCode[t.itemCode];
    if (!row) {
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
      continue;
    }
    // Cùng ItemCode (vd Flow stub DOC_REQUEST) → căn nhãn/required theo template nếu chưa có tệp.
    if (row.uploadedCount > 0 || row.isLocked) continue;
    const needPatch =
      row.itemLabel !== t.itemLabel ||
      row.isRequired !== t.isRequired ||
      row.minFileCount !== t.minFileCount;
    if (!needPatch) continue;
    await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, {
      ItemLabel: t.itemLabel,
      IsRequired: t.isRequired,
      MinFileCount: t.minFileCount
    });
  }

  // Xóa stub Flow / mục không thuộc loại hồ sơ (chỉ khi chưa tải tệp, chưa khóa).
  for (const e of existing) {
    if (templateCodes[e.itemCode]) continue;
    if (e.uploadedCount > 0 || e.isLocked) continue;
    await deleteItem(ctx, PAY_LISTS.ChecklistItems, e.id);
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

/** Mục có thể đánh giá: bắt buộc hoặc đã có tệp. */
export function reviewableChecklistItems(items: IChecklistItemRow[]): IChecklistItemRow[] {
  return items.filter((i) => i.isRequired || i.uploadedCount > 0);
}

/** Mục chưa khóa — phòng hiện tại được đánh giá / chốt. */
export function unlockedReviewableItems(items: IChecklistItemRow[]): IChecklistItemRow[] {
  return reviewableChecklistItems(items).filter((i) => !i.isLocked);
}

/** Đã Pass/Fail hết các mục chưa khóa (tuỳ chọn UX). */
export function checklistReviewComplete(items: IChecklistItemRow[]): boolean {
  const rows = unlockedReviewableItems(items);
  if (!rows.length) return true;
  return rows.every((i) => i.itemStatus === 'Pass' || i.itemStatus === 'Fail');
}

/**
 * @deprecated Không dùng để chặn DECIDE — phòng chỉ đánh giá subset mục.
 * Giữ để tương thích demo; ưu tiên unlocked + không Fail.
 */
export function checklistAllPass(items: IChecklistItemRow[]): boolean {
  const rows = unlockedReviewableItems(items);
  if (!rows.length) return true;
  return rows.every((i) => i.itemStatus === 'Pass');
}

/** Có mục Không đạt chưa khóa → không DECIDE PASS, phải trả BPCM1. */
export function checklistHasFail(items: IChecklistItemRow[]): boolean {
  return unlockedReviewableItems(items).some((i) => i.itemStatus === 'Fail');
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

/** Khóa mọi mục chưa khóa (dùng hạn chế — ưu tiên lockReviewedItems). */
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

/**
 * Sau DECIDE PASS ở BPCM2/BPCM3/TCKT_CHECK: khóa mục đã Pass/Fail.
 * Mục Missing/Uploaded chưa đánh giá giữ mở cho bước sau.
 */
export async function lockReviewedItems(
  ctx: ISpRestContext,
  items: IChecklistItemRow[]
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (row.isLocked) continue;
    if (row.itemStatus !== 'Pass' && row.itemStatus !== 'Fail') continue;
    await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: true });
  }
}

/**
 * BPCM1 Draft/Returned (sửa lại): mở khóa để tải/xóa lại.
 * «Đã khóa» chỉ dành cho bước kiểm tra sau khi chốt.
 */
export async function unlockChecklistItems(
  ctx: ISpRestContext,
  items: IChecklistItemRow[]
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    if (!row.isLocked) continue;
    await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: false });
  }
}

/** Reset đếm tệp / trạng thái sau khi xóa hồ sơ mục (tải lên mới). */
export async function resetChecklistItemFiles(
  ctx: ISpRestContext,
  item: IChecklistItemRow
): Promise<IChecklistItemRow> {
  await mergeItem(ctx, PAY_LISTS.ChecklistItems, item.id, {
    UploadedCount: 0,
    ItemStatus: 'Missing',
    IsLocked: false
  });
  return { ...item, uploadedCount: 0, itemStatus: 'Missing', isLocked: false };
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
