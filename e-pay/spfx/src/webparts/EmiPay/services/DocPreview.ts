import { SPHttpClient } from '@microsoft/sp-http';
import { ISpRestContext } from './SpRest';

function escapeODataPath(value: string): string {
  return (value || '').replace(/'/g, "''");
}

/** Absolute SharePoint file URL → server-relative path. */
export function serverRelativeFromAbsolute(fileUrl: string, webUrl: string): string {
  if (!fileUrl) return '';
  if (fileUrl.charAt(0) === '/') return fileUrl.split('?')[0];
  try {
    const u = new URL(fileUrl);
    return u.pathname;
  } catch {
    const origin = webUrl.replace(/\/sites\/[^/]+.*/i, '');
    if (fileUrl.indexOf(origin) === 0) {
      return fileUrl.slice(origin.length).split('?')[0];
    }
    return '';
  }
}

export function fileExt(fileName: string): string {
  const m = (fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isImageExt(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].indexOf(ext) >= 0;
}

export function isPdfExt(ext: string): boolean {
  return ext === 'pdf';
}

export function isOfficeExt(ext: string): boolean {
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].indexOf(ext) >= 0;
}

export interface IResolvedPreview {
  uniqueId?: string;
  embedUrl?: string;
  blobUrl?: string;
  mode: 'embed' | 'image' | 'pdf' | 'none';
  error?: string;
}

/**
 * Resolve in-app preview:
 * - Office / PDF → SharePoint Embed.aspx (cookie auth, same tenant)
 * - Image → blob object URL via authenticated REST download
 */
export async function resolveDocPreview(
  ctx: ISpRestContext,
  fileUrl: string,
  fileName: string
): Promise<IResolvedPreview> {
  if (!fileUrl) {
    return { mode: 'none', error: 'Không có URL tệp.' };
  }

  const ext = fileExt(fileName || fileUrl);
  const serverRel = serverRelativeFromAbsolute(fileUrl, ctx.webUrl);
  if (!serverRel) {
    return { mode: 'none', error: 'Không đọc được đường dẫn tệp.' };
  }

  let uniqueId = '';
  try {
    const metaUrl =
      `${ctx.webUrl}/_api/web/GetFileByServerRelativeUrl('${escapeODataPath(serverRel)}')` +
      `?$select=UniqueId,Name,ServerRelativeUrl`;
    const metaRes = await ctx.spHttpClient.get(metaUrl, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { UniqueId?: string };
      uniqueId = String(meta.UniqueId || '');
    }
  } catch {
    // continue with fallbacks
  }

  if (uniqueId && (isOfficeExt(ext) || isPdfExt(ext) || !ext)) {
    const embedUrl =
      `${ctx.webUrl.replace(/\/$/, '')}/_layouts/15/Embed.aspx?UniqueId=${encodeURIComponent(uniqueId)}`;
    return { uniqueId, embedUrl, mode: 'embed' };
  }

  if (isImageExt(ext) || isPdfExt(ext)) {
    try {
      const dlUrl =
        `${ctx.webUrl}/_api/web/GetFileByServerRelativeUrl('${escapeODataPath(serverRel)}')/$value`;
      const dlRes = await ctx.spHttpClient.get(dlUrl, SPHttpClient.configurations.v1);
      if (!dlRes.ok) {
        throw new Error(`Tải tệp thất bại (${dlRes.status})`);
      }
      const buf = await dlRes.arrayBuffer();
      const mime = isPdfExt(ext)
        ? 'application/pdf'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const blob = new Blob([buf], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      return {
        uniqueId: uniqueId || undefined,
        blobUrl,
        mode: isPdfExt(ext) ? 'pdf' : 'image'
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (uniqueId) {
        const embedUrl =
          `${ctx.webUrl.replace(/\/$/, '')}/_layouts/15/Embed.aspx?UniqueId=${encodeURIComponent(uniqueId)}`;
        return { uniqueId, embedUrl, mode: 'embed', error: msg };
      }
      return { mode: 'none', error: msg };
    }
  }

  if (uniqueId) {
    const embedUrl =
      `${ctx.webUrl.replace(/\/$/, '')}/_layouts/15/Embed.aspx?UniqueId=${encodeURIComponent(uniqueId)}`;
    return { uniqueId, embedUrl, mode: 'embed' };
  }

  return {
    mode: 'none',
    error: 'Không xem trước được định dạng này trong khung. Dùng «Tải xuống».'
  };
}

export function isChecklistDocClass(docClass: string): boolean {
  return (docClass || '').trim().toLowerCase() === 'checklist';
}

/** Tài liệu hỗ trợ = không phải Checklist (StepAttachment / UNC / …). */
export function isSupportingDoc(doc: { docClass: string }): boolean {
  return !isChecklistDocClass(doc.docClass);
}

export function docClassVi(docClass: string): string {
  const map: Record<string, string> = {
    Checklist: 'Checklist',
    StepAttachment: 'Đính kèm bước',
    UNC: 'Ủy nhiệm chi (UNC)'
  };
  return map[docClass] || docClass || 'Hỗ trợ';
}
