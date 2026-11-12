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
