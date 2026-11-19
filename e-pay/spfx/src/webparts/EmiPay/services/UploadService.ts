import {
  IChecklistItemRow,
  bumpChecklistUpload,
  resetChecklistItemFiles
} from './ChecklistService';
import { DOCS_WORKING_TITLE, PAY_LISTS, newKey } from './PayLists';
import { ISpRestContext, createItem, getItems, mergeItem, uploadFileToLibrary } from './SpRest';
import { escapeOData } from './PayLists';

export interface IUploadResult {
  documentKey: string;
  fileUrl: string;
  fileName: string;
}

export async function uploadChecklistFile(
  ctx: ISpRestContext,
  opts: {
    requestKey: string;
    item: IChecklistItemRow;
    fileName: string;
    content: ArrayBuffer;
    uploadedByUPN: string;
  }
): Promise<IUploadResult> {
  const safeName = opts.fileName.replace(/[\\/:*?"<>|]/g, '_');
  const uploaded = await uploadFileToLibrary(
    ctx,
    DOCS_WORKING_TITLE,
    `${opts.requestKey}/${opts.item.itemCode}`,
    safeName,
    opts.content
  );
  const documentKey = `${opts.requestKey}|${opts.item.itemCode}|${newKey('DOC')}`;
  await createItem(ctx, PAY_LISTS.DocumentIndex, {
    Title: `${opts.requestKey}-${opts.item.itemCode}`,
    RequestKey: opts.requestKey,
    DocumentKey: documentKey,
    ChecklistItemKey: opts.item.checklistItemKey || `${opts.requestKey}|${opts.item.itemCode}`,
    DocClass: 'Checklist',
    Visibility: 'Published',
    FileName: safeName,
    LibraryName: DOCS_WORKING_TITLE,
    FileUrl: { Url: uploaded.AbsoluteUrl, Description: safeName },
    UploadedByUPN: opts.uploadedByUPN,
    UploadedAt: new Date().toISOString(),
    IsCurrent: true,
    IsArchived: false
  });
  await bumpChecklistUpload(ctx, opts.item, 1);
  return { documentKey, fileUrl: uploaded.AbsoluteUrl, fileName: safeName };
}

/** Tài liệu hỗ trợ theo bước — DocClass=StepAttachment (schema CECM). */
export async function uploadStepAttachment(
  ctx: ISpRestContext,
  opts: {
    requestKey: string;
    stepKey?: string;
    fileName: string;
    content: ArrayBuffer;
    uploadedByUPN: string;
  }
): Promise<IUploadResult> {
  const safeName = opts.fileName.replace(/[\\/:*?"<>|]/g, '_');
  const folder = opts.stepKey
    ? `${opts.requestKey}/Support/${opts.stepKey}`
    : `${opts.requestKey}/Support`;
  const uploaded = await uploadFileToLibrary(
    ctx,
    DOCS_WORKING_TITLE,
    folder,
    safeName,
    opts.content
  );
  const documentKey = `${opts.requestKey}|StepAttachment|${newKey('SA')}`;
  await createItem(ctx, PAY_LISTS.DocumentIndex, {
    Title: `${opts.requestKey}-Support-${safeName}`.slice(0, 255),
    RequestKey: opts.requestKey,
    DocumentKey: documentKey,
    DocClass: 'StepAttachment',
    Visibility: 'Published',
    FileName: safeName,
    LibraryName: DOCS_WORKING_TITLE,
    FileUrl: { Url: uploaded.AbsoluteUrl, Description: safeName },
    UploadedByUPN: opts.uploadedByUPN,
    UploadedAt: new Date().toISOString(),
    IsCurrent: true,
    IsArchived: false
  });
  return { documentKey, fileUrl: uploaded.AbsoluteUrl, fileName: safeName };
}

export async function uploadUncFile(
  ctx: ISpRestContext,
  opts: {
    requestKey: string;
    fileName: string;
    content: ArrayBuffer;
    uploadedByUPN: string;
  }
): Promise<IUploadResult> {
  const safeName = opts.fileName.replace(/[\\/:*?"<>|]/g, '_');
  const uploaded = await uploadFileToLibrary(
    ctx,
    DOCS_WORKING_TITLE,
    `${opts.requestKey}/UNC`,
    safeName,
    opts.content
  );
  const documentKey = `${opts.requestKey}|UNC`;
  // Replace prior current UNC rows for this key if any — mark new as current
  const existing = await getItems<{ Id: number }>(
    ctx,
    PAY_LISTS.DocumentIndex,
    `$filter=DocumentKey eq '${escapeOData(documentKey)}'&$top=5`
  );
  if (existing.length) {
    // keep simple: add new unique key with timestamp suffix if exists
    const documentKey2 = `${opts.requestKey}|UNC|${newKey('U')}`;
    await createItem(ctx, PAY_LISTS.DocumentIndex, {
      Title: `${opts.requestKey}-UNC`,
      RequestKey: opts.requestKey,
      DocumentKey: documentKey2,
      DocClass: 'UNC',
      Visibility: 'Published',
      FileName: safeName,
      LibraryName: DOCS_WORKING_TITLE,
      FileUrl: { Url: uploaded.AbsoluteUrl, Description: safeName },
      UploadedByUPN: opts.uploadedByUPN,
      UploadedAt: new Date().toISOString(),
      IsCurrent: true,
      IsArchived: false
    });
    return { documentKey: documentKey2, fileUrl: uploaded.AbsoluteUrl, fileName: safeName };
  }
  await createItem(ctx, PAY_LISTS.DocumentIndex, {
    Title: `${opts.requestKey}-UNC`,
    RequestKey: opts.requestKey,
    DocumentKey: documentKey,
    DocClass: 'UNC',
    Visibility: 'Published',
    FileName: safeName,
    LibraryName: DOCS_WORKING_TITLE,
    FileUrl: { Url: uploaded.AbsoluteUrl, Description: safeName },
    UploadedByUPN: opts.uploadedByUPN,
    UploadedAt: new Date().toISOString(),
    IsCurrent: true,
    IsArchived: false
  });
  return { documentKey, fileUrl: uploaded.AbsoluteUrl, fileName: safeName };
}

export interface IDocumentIndexRow {
  id: number;
  documentKey: string;
  fileUrl: string;
  fileName: string;
  docClass: string;
  visibility: string;
  checklistItemKey: string;
  uploadedByUPN: string;
  uploadedAt: string;
  libraryName: string;
}

function mapFileUrl(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    return String((raw as { Url?: string }).Url || '');
  }
  return '';
}

function mapDocRow(r: Record<string, unknown>): IDocumentIndexRow {
  return {
    id: Number(r.Id),
    documentKey: String(r.DocumentKey || ''),
    fileUrl: mapFileUrl(r.FileUrl),
    fileName: String(r.FileName || ''),
    docClass: String(r.DocClass || ''),
    visibility: String(r.Visibility || ''),
    checklistItemKey: String(r.ChecklistItemKey || ''),
    uploadedByUPN: String(r.UploadedByUPN || ''),
    uploadedAt: r.UploadedAt ? String(r.UploadedAt) : '',
    libraryName: String(r.LibraryName || '')
  };
}

export async function listUncDocuments(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IDocumentIndexRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.DocumentIndex,
    `$filter=RequestKey eq '${escapeOData(requestKey)}' and DocClass eq 'UNC' and IsCurrent eq 1&$top=20`
  );
  return rows.map(mapDocRow);
}

export async function listDocumentsForRequest(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IDocumentIndexRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.DocumentIndex,
    `$filter=RequestKey eq '${escapeOData(requestKey)}' and IsCurrent eq 1&$orderby=Id desc&$top=100`
  );
  return rows.map(mapDocRow);
}

/**
 * Soft-delete toàn bộ tệp checklist hiện tại của một mục (IsCurrent=false)
 * và reset UploadedCount → Missing để tải lên mới hoàn toàn.
 */
export async function clearChecklistItemFiles(
  ctx: ISpRestContext,
  item: IChecklistItemRow
): Promise<void> {
  const key = item.checklistItemKey || `${item.requestKey}|${item.itemCode}`;
  const code = (item.itemCode || '').toLowerCase();
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.DocumentIndex,
    `$filter=RequestKey eq '${escapeOData(item.requestKey)}' and DocClass eq 'Checklist' and IsCurrent eq 1&$top=50`
  );
  const matched = rows.filter((r) => {
    const ck = String(r.ChecklistItemKey || '').toLowerCase();
    const dk = String(r.DocumentKey || '').toLowerCase();
    if (ck && (ck === key.toLowerCase() || ck.indexOf(`|${code}`) >= 0)) return true;
    return dk.indexOf(`|${code}|`) >= 0 || dk.indexOf(`|${code}`) >= 0;
  });
  for (let i = 0; i < matched.length; i++) {
    await mergeItem(ctx, PAY_LISTS.DocumentIndex, Number(matched[i].Id), { IsCurrent: false });
  }
  await resetChecklistItemFiles(ctx, item);
}
