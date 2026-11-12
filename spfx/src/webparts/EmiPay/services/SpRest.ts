import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

export interface ISpRestContext {
  spHttpClient: SPHttpClient;
  webUrl: string;
}

async function readJson<T>(res: SPHttpClientResponse): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SharePoint ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return (await res.json()) as T;
}

function siteRootFromWebUrl(webUrl: string): string {
  // https://tenant.sharepoint.com/sites/cecm -> /sites/cecm
  const m = webUrl.match(/https?:\/\/[^/]+(\/sites\/[^/]+)/i);
  return m ? m[1] : '/sites/cecm';
}

export async function getItems<T = Record<string, unknown>>(
  ctx: ISpRestContext,
  listGuid: string,
  query: string
): Promise<T[]> {
  const url = `${ctx.webUrl}/_api/web/lists(guid'${listGuid}')/items?${query}`;
  const res = await ctx.spHttpClient.get(url, SPHttpClient.configurations.v1, {
    headers: { Accept: 'application/json;odata=nometadata' }
  });
  const body = await readJson<{ value: T[] }>(res);
  return body.value || [];
}

export async function getItemById<T = Record<string, unknown>>(
  ctx: ISpRestContext,
  listGuid: string,
  id: number
): Promise<T> {
  const url = `${ctx.webUrl}/_api/web/lists(guid'${listGuid}')/items(${id})`;
  const res = await ctx.spHttpClient.get(url, SPHttpClient.configurations.v1, {
    headers: { Accept: 'application/json;odata=nometadata' }
  });
  return readJson<T>(res);
}

export async function createItem(
  ctx: ISpRestContext,
  listGuid: string,
  fields: Record<string, unknown>
): Promise<{ Id: number }> {
  const url = `${ctx.webUrl}/_api/web/lists(guid'${listGuid}')/items`;
  const res = await ctx.spHttpClient.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata'
    },
    body: JSON.stringify(fields)
  });
  return readJson<{ Id: number }>(res);
}

export async function mergeItem(
  ctx: ISpRestContext,
  listGuid: string,
  id: number,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `${ctx.webUrl}/_api/web/lists(guid'${listGuid}')/items(${id})`;
  const res = await ctx.spHttpClient.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE'
    },
    body: JSON.stringify(fields)
  });
  await readJson(res);
}

export async function ensureFolder(
  ctx: ISpRestContext,
  libraryTitle: string,
  folderPath: string
): Promise<string> {
  const siteRoot = siteRootFromWebUrl(ctx.webUrl);
  const parts = folderPath.split('/').filter(Boolean);
  let currentRel = `${siteRoot}/${libraryTitle}`;

  for (const part of parts) {
    const childRel = `${currentRel}/${part}`;
    const getUrl =
      `${ctx.webUrl}/_api/web/GetFolderByServerRelativeUrl('${childRel.replace(/'/g, "''")}')`;
    const getRes = await ctx.spHttpClient.get(getUrl, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    if (getRes.ok) {
      currentRel = childRel;
      continue;
    }
    const addUrl =
      `${ctx.webUrl}/_api/web/GetFolderByServerRelativeUrl('${currentRel.replace(/'/g, "''")}')/folders`;
    const addRes = await ctx.spHttpClient.post(addUrl, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata'
      },
      body: JSON.stringify({ ServerRelativeUrl: childRel })
    });
    if (!addRes.ok) {
      const t = await addRes.text();
      if (addRes.status !== 409 && !/exist/i.test(t)) {
        throw new Error(`Create folder failed ${addRes.status}: ${t.slice(0, 300)}`);
      }
    }
    currentRel = childRel;
  }
  return currentRel;
}

export async function uploadFileToLibrary(
  ctx: ISpRestContext,
  libraryTitle: string,
  folderPath: string,
  fileName: string,
  content: ArrayBuffer
): Promise<{ ServerRelativeUrl: string; AbsoluteUrl: string }> {
  const folderRel = await ensureFolder(ctx, libraryTitle, folderPath);
  const url =
    `${ctx.webUrl}/_api/web/GetFolderByServerRelativeUrl('${folderRel.replace(/'/g, "''")}')` +
    `/Files/add(url='${fileName.replace(/'/g, "''")}',overwrite=true)`;
  const res = await ctx.spHttpClient.post(url, SPHttpClient.configurations.v1, {
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/octet-stream'
    },
    body: content
  });
  const body = await readJson<{ ServerRelativeUrl: string }>(res);
  const origin = ctx.webUrl.replace(/\/sites\/[^/]+.*/i, '');
  return {
    ServerRelativeUrl: body.ServerRelativeUrl,
    AbsoluteUrl: `${origin}${body.ServerRelativeUrl}`
  };
}
