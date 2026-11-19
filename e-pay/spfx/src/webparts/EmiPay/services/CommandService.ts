import { PAY_LISTS, escapeOData, newKey } from './PayLists';
import { ISpRestContext, createItem, getItemById } from './SpRest';
import { perfLog, perfNow } from './perfMark';

export type CommandType =
  | 'CREATE_REQUEST'
  | 'SUBMIT'
  | 'ACCEPT'
  | 'DECIDE'
  | 'CONFIRM_PAYMENT';
export type CommandState = 'Pending' | 'Processing' | 'Succeeded' | 'Rejected' | 'Failed';

export interface IEnqueueResult {
  id: number;
  commandKey: string;
  requestKey: string;
}

export interface ICommandResult {
  id: number;
  state: CommandState;
  errorMessage: string;
  requestKey: string;
  stepInstanceKey: string;
}

export interface IOrchestratorApiResult extends ICommandResult {
  commandKey: string;
  commandType?: string;
}

function choiceState(v: unknown): CommandState {
  if (v === null || v === undefined) return 'Pending';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || 'Pending') as CommandState;
  }
  return String(v || 'Pending') as CommandState;
}

/** Idempotent DedupeKey (Perf Gói 3) — trùng key + Succeeded → Flow no-op. */
export function buildDedupeKey(
  type: CommandType,
  commandKey: string,
  payload: Record<string, unknown>,
  options?: { requestKey?: string; stepInstanceKey?: string }
): string {
  const rk = (options?.requestKey || '').trim();
  const sik = (
    options?.stepInstanceKey ||
    String(payload.expectedStepInstanceKey || '')
  ).trim();
  switch (type) {
    case 'CREATE_REQUEST':
      return `CREATE_REQUEST-${commandKey}`;
    case 'SUBMIT':
      return `SUBMIT-${rk}-r${String(payload.expectedReviewRound ?? '')}`;
    case 'ACCEPT':
      return `ACCEPT-${sik || rk}`;
    case 'DECIDE':
      return `DECIDE-${sik || rk}-${String(payload.decision || '')}`;
    case 'CONFIRM_PAYMENT':
      return `CONFIRM_PAYMENT-${rk}-${String(
        payload.uncDocumentKey || payload.fileUrl || 'UNC'
      )}`;
    default:
      return `${type}-${commandKey}`;
  }
}

export async function enqueueCommand(
  ctx: ISpRestContext,
  type: CommandType,
  payload: Record<string, unknown>,
  options?: { requestKey?: string; stepInstanceKey?: string; title?: string }
): Promise<IEnqueueResult> {
  const commandKey = newKey('CMD');
  const requestKey = options?.requestKey || '';
  const stepInstanceKey = options?.stepInstanceKey || '';
  const created = await createItem(ctx, PAY_LISTS.Commands, {
    Title: options?.title || `UI-${type}-${commandKey}`,
    CommandKey: commandKey,
    CommandType: type,
    PayloadJson: JSON.stringify(payload),
    State: 'Pending',
    DedupeKey: buildDedupeKey(type, commandKey, payload, options),
    RequestKey: requestKey,
    StepInstanceKey: stepInstanceKey
  });
  return {
    id: created.Id,
    commandKey,
    requestKey: type === 'CREATE_REQUEST' ? `PAY-${commandKey}` : requestKey
  };
}

export async function getCommand(
  ctx: ISpRestContext,
  id: number
): Promise<ICommandResult> {
  const row = await getItemById<{
    Id: number;
    State?: unknown;
    ErrorMessage?: string;
    RequestKey?: string;
    StepInstanceKey?: string;
  }>(ctx, PAY_LISTS.Commands, id, 'Id,State,ErrorMessage,RequestKey,StepInstanceKey');
  return {
    id: row.Id,
    state: choiceState(row.State),
    errorMessage: row.ErrorMessage || '',
    requestKey: row.RequestKey || '',
    stepInstanceKey: row.StepInstanceKey || ''
  };
}

export async function waitCommand(
  ctx: ISpRestContext,
  id: number,
  opts?: { timeoutMs?: number; pollMs?: number; accept?: CommandState[] }
): Promise<ICommandResult> {
  const timeoutMs = opts?.timeoutMs ?? 120000;
  const pollMs = opts?.pollMs ?? 1500;
  const accept = opts?.accept ?? ['Succeeded'];
  const deadline = Date.now() + timeoutMs;
  let delay = 0;
  let last: ICommandResult | undefined;
  while (Date.now() < deadline) {
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    last = await getCommand(ctx, id);
    if (['Succeeded', 'Rejected', 'Failed'].indexOf(last.state) >= 0) {
      if (accept.indexOf(last.state) < 0) {
        throw new Error(
          `Command ${id} ${last.state}: ${last.errorMessage || '(no message)'}`
        );
      }
      return last;
    }
    delay = pollMs;
  }
  throw new Error(
    `Timeout chờ Command ${id} (State=${last?.state || '?'}` +
      `${last?.errorMessage ? '; ' + last.errorMessage : ''}). ` +
      `Kiểm tra Orchestrator URL / Flow ON.`
  );
}

/** POST commandId → Flow HTTP (OAuth AAD); nhận State/requestKey đồng bộ. */
export async function invokeOrchestratorApi(
  orchestratorUrl: string,
  enq: IEnqueueResult,
  postToOrchestrator?: ISpRestContext['postToOrchestrator']
): Promise<IOrchestratorApiResult> {
  const url = orchestratorUrl.trim();
  if (!url) {
    throw new Error('Thiếu Orchestrator URL (property web part).');
  }
  const body = { commandId: enq.id };
  let status: number;
  let ok: boolean;
  let raw: string;
  if (postToOrchestrator) {
    const res = await postToOrchestrator(url, body);
    status = res.status;
    ok = res.ok;
    raw = res.text;
  } else {
    // Chỉ dùng khi Flow = Anyone (anonymous). Tenant hiện tại thường bắt OAuth → 401.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    status = res.status;
    ok = res.ok;
    raw = await res.text();
  }
  let data: {
    commandId?: number;
    state?: unknown;
    requestKey?: string;
    stepInstanceKey?: string;
    errorMessage?: string;
    commandType?: string;
    error?: { code?: string; message?: string };
  } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      throw new Error(
        `Orchestrator HTTP ${status}: phản hồi không phải JSON (${raw.slice(0, 180)})`
      );
    }
  }
  if (!ok) {
    const detail =
      data.errorMessage ||
      data.error?.message ||
      (data.error?.code ? `${data.error.code}: ${raw.slice(0, 240)}` : raw) ||
      `HTTP ${status}`;
    if (status === 401 || data.error?.code === 'DirectApiAuthorizationRequired') {
      throw new Error(
        `Orchestrator HTTP 401 (cần OAuth). Kiểm tra: (1) Flow «Who can trigger» = Any user in my tenant; ` +
          `(2) API access «Microsoft Flow Service / User» đã Approve; (3) serve/package có AadHttpClient. Chi tiết: ${detail}`
      );
    }
    throw new Error(`Orchestrator HTTP ${status}: ${detail}`);
  }
  const state = choiceState(data.state);
  if (state === 'Rejected' || state === 'Failed') {
    throw new Error(
      `Command ${enq.id} ${state}: ${data.errorMessage || '(no message)'}`
    );
  }
  if (state !== 'Succeeded') {
    throw new Error(
      `Orchestrator trả State=${state} cho Command ${enq.id} (kỳ vọng Succeeded).`
    );
  }
  return {
    id: enq.id,
    commandKey: enq.commandKey,
    state,
    errorMessage: data.errorMessage || '',
    requestKey: data.requestKey || enq.requestKey,
    stepInstanceKey: data.stepInstanceKey || '',
    commandType: data.commandType
  };
}

/**
 * Ghi Commands (Pending) rồi gọi API Flow đồng bộ.
 * Không có orchestratorUrl → fallback poll waitCommand (chậm, chỉ khi chưa cấu hình).
 */
export async function enqueueAndRun(
  ctx: ISpRestContext,
  type: CommandType,
  payload: Record<string, unknown>,
  options?: {
    requestKey?: string;
    stepInstanceKey?: string;
    title?: string;
    orchestratorUrl?: string;
  }
): Promise<IOrchestratorApiResult> {
  const t0 = perfNow();
  const enq = await enqueueCommand(ctx, type, payload, options);
  perfLog('enqueueCommand', t0, { type, commandId: enq.id });
  const url = (options?.orchestratorUrl || '').trim();
  if (url) {
    const tApi = perfNow();
    const result = await invokeOrchestratorApi(url, enq, ctx.postToOrchestrator);
    perfLog('orchestratorApi', tApi, {
      type,
      commandId: enq.id,
      state: result.state,
      requestKey: result.requestKey
    });
    perfLog('enqueueAndRun.total', t0, {
      type,
      mode: 'api',
      requestKey: result.requestKey
    });
    return result;
  }
  const tPoll = perfNow();
  const waited = await waitCommand(ctx, enq.id, { pollMs: 1000 });
  perfLog('waitCommand.poll', tPoll, { type, commandId: enq.id, state: waited.state });
  perfLog('enqueueAndRun.total', t0, {
    type,
    mode: 'poll',
    requestKey: waited.requestKey || enq.requestKey
  });
  return {
    id: enq.id,
    commandKey: enq.commandKey,
    state: waited.state,
    errorMessage: waited.errorMessage,
    requestKey: waited.requestKey || enq.requestKey,
    stepInstanceKey: waited.stepInstanceKey
  };
}

export function createRequestKeyFromCommandKey(commandKey: string): string {
  return `PAY-${commandKey}`;
}

/** unused helper kept for filters */
export function commandFilterByKey(commandKey: string): string {
  return `$filter=CommandKey eq '${escapeOData(commandKey)}'&$top=1`;
}
