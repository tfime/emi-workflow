import { IChecklistItemRow, bumpChecklistUpload } from './ChecklistService';
import { DOCS_WORKING_TITLE, PAY_LISTS, newKey } from './PayLists';
import { ISpRestContext, createItem, getItems, uploadFileToLibrary } from './SpRest';
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

export async function listUncDocuments(
  ctx: ISpRestContext,
  requestKey: string
): Promise<{ id: number; documentKey: string; fileUrl: string; fileName: string }[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.DocumentIndex,
    `$filter=RequestKey eq '${escapeOData(requestKey)}' and DocClass eq 'UNC' and IsCurrent eq 1&$top=20`
  );
  return rows.map((r) => {
    const fileUrlRaw = r.FileUrl;
    let fileUrl = '';
    if (typeof fileUrlRaw === 'string') fileUrl = fileUrlRaw;
    else if (fileUrlRaw && typeof fileUrlRaw === 'object') {
      fileUrl = String((fileUrlRaw as { Url?: string }).Url || '');
    }
    return {
      id: Number(r.Id),
      documentKey: String(r.DocumentKey || ''),
      fileUrl,
      fileName: String(r.FileName || '')
    };
  });
}
