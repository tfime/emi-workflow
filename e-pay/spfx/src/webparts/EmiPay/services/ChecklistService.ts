import { IChecklistTemplate } from './ConfigService';
import { PAY_LISTS, escapeOData } from './PayLists';
import {
  ISpRestContext,
  createItem,
  deleteItem,
  getItems,
  mapPool,
  mergeItem
} from './SpRest';

/** Giới hạn ghi song song ChecklistItems (nhiều user / nhiều mục). */
const CHECKLIST_WRITE_CONCURRENCY = 4;

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

/** Bắt buộc trước, tuỳ chọn sau; cùng nhóm thì theo nhãn. */
export function sortChecklistRequiredFirst<T extends { isRequired: boolean; itemLabel?: string }>(
  items: T[]
): T[] {
  return items.slice().sort((a, b) => {
    const ar = a.isRequired ? 0 : 1;
    const br = b.isRequired ? 0 : 1;
    if (ar !== br) return ar - br;
    return (a.itemLabel || '').localeCompare(b.itemLabel || '', 'vi');
  });
}

function choiceVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || '');
  }
  return String(v);
}

function boolVal(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === undefined) return false;
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return boolVal((v as { Value?: unknown }).Value);
  }
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'có';
}

function mapRow(r: Record<string, unknown>): IChecklistItemRow {
  return {
    id: Number(r.Id),
    requestKey: String(r.RequestKey || ''),
    checklistItemKey: String(r.ChecklistItemKey || ''),
    itemCode: String(r.ItemCode || ''),
    itemLabel: String(r.ItemLabel || r.ItemCode || ''),
    isRequired: boolVal(r.IsRequired),
    minFileCount: Number(r.MinFileCount || 0),
    uploadedCount: Number(r.UploadedCount || 0),
    itemStatus: choiceVal(r.ItemStatus) || 'Missing',
    isLocked: boolVal(r.IsLocked)
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
  return sortChecklistRequiredFirst(rows.map(mapRow));
}

/**
 * true nếu ChecklistItems đã khớp template (không cần create/merge/delete).
 * Tránh reconcile lặp khi mở Draft nhiều lần / sau CREATE vừa sync.
 */
export function checklistMatchesTemplates(
  items: IChecklistItemRow[],
  templates: IChecklistTemplate[]
): boolean {
  if (!templates.length) return true;
  const byCode: Record<string, IChecklistItemRow> = {};
  items.forEach((e) => {
    byCode[e.itemCode] = e;
  });
  const templateCodes: Record<string, true> = {};
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    templateCodes[t.itemCode] = true;
    const row = byCode[t.itemCode];
    if (!row) return false;
    if (row.uploadedCount > 0 || row.isLocked) continue;
    if (
      row.itemLabel !== t.itemLabel ||
      row.isRequired !== t.isRequired ||
      row.minFileCount !== t.minFileCount
    ) {
      return false;
    }
  }
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (templateCodes[e.itemCode]) continue;
    if (e.uploadedCount > 0 || e.isLocked) continue;
    return false;
  }
  return true;
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
  if (checklistMatchesTemplates(existing, templates)) {
    return existing;
  }

  const byCode: Record<string, IChecklistItemRow> = {};
  existing.forEach((e) => {
    byCode[e.itemCode] = e;
  });

  const templateCodes: Record<string, true> = {};
  const toCreate: IChecklistTemplate[] = [];
  const toPatch: { id: number; t: IChecklistTemplate }[] = [];

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    templateCodes[t.itemCode] = true;
    const row = byCode[t.itemCode];
    if (!row) {
      toCreate.push(t);
      continue;
    }
    if (row.uploadedCount > 0 || row.isLocked) continue;
    const needPatch =
      row.itemLabel !== t.itemLabel ||
      row.isRequired !== t.isRequired ||
      row.minFileCount !== t.minFileCount;
    if (needPatch) toPatch.push({ id: row.id, t });
  }

  const toDelete = existing.filter(
    (e) => !templateCodes[e.itemCode] && e.uploadedCount <= 0 && !e.isLocked
  );

  await mapPool(
    toCreate,
    async (t) => {
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
    },
    CHECKLIST_WRITE_CONCURRENCY
  );

  await mapPool(
    toPatch,
    async (p) => {
      await mergeItem(ctx, PAY_LISTS.ChecklistItems, p.id, {
        ItemLabel: p.t.itemLabel,
        IsRequired: p.t.isRequired,
        MinFileCount: p.t.minFileCount
      });
    },
    CHECKLIST_WRITE_CONCURRENCY
  );

  await mapPool(
    toDelete,
    async (e) => {
      await deleteItem(ctx, PAY_LISTS.ChecklistItems, e.id);
    },
    CHECKLIST_WRITE_CONCURRENCY
  );

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
  const targets = items.filter((row) => !row.isLocked);
  await mapPool(
    targets,
    async (row) => {
      await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: true });
    },
    CHECKLIST_WRITE_CONCURRENCY
  );
}

/**
 * Sau DECIDE PASS ở BPCM2/BPCM3/TCKT_CHECK: khóa mục đã Pass/Fail.
 * Mục Missing/Uploaded chưa đánh giá giữ mở cho bước sau.
 */
export async function lockReviewedItems(
  ctx: ISpRestContext,
  items: IChecklistItemRow[]
): Promise<void> {
  const targets = items.filter(
    (row) =>
      !row.isLocked && (row.itemStatus === 'Pass' || row.itemStatus === 'Fail')
  );
  await mapPool(
    targets,
    async (row) => {
      await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: true });
    },
    CHECKLIST_WRITE_CONCURRENCY
  );
}

/**
 * BPCM1 Draft/Returned (sửa lại): mở khóa để tải/xóa lại.
 * «Đã khóa» chỉ dành cho bước kiểm tra sau khi chốt.
 */
export async function unlockChecklistItems(
  ctx: ISpRestContext,
  items: IChecklistItemRow[]
): Promise<void> {
  const targets = items.filter((row) => row.isLocked);
  await mapPool(
    targets,
    async (row) => {
      await mergeItem(ctx, PAY_LISTS.ChecklistItems, row.id, { IsLocked: false });
    },
    CHECKLIST_WRITE_CONCURRENCY
  );
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
