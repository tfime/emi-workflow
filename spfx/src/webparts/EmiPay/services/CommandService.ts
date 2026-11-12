import { PAY_LISTS, escapeOData, newKey } from './PayLists';
import { ISpRestContext, createItem, getItemById } from './SpRest';

export type CommandType = 'CREATE_REQUEST' | 'SUBMIT' | 'DECIDE' | 'CONFIRM_PAYMENT';
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
    DedupeKey: `${type}-${commandKey}`,
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
    State: string;
    ErrorMessage?: string;
    RequestKey?: string;
    StepInstanceKey?: string;
  }>(ctx, PAY_LISTS.Commands, id);
  return {
    id: row.Id,
    state: (row.State || 'Pending') as CommandState,
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
  const timeoutMs = opts?.timeoutMs ?? 90000;
  const pollMs = opts?.pollMs ?? 4000;
  const accept = opts?.accept ?? ['Succeeded'];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    const cur = await getCommand(ctx, id);
    if (['Succeeded', 'Rejected', 'Failed'].indexOf(cur.state) >= 0) {
      if (accept.indexOf(cur.state) < 0) {
        throw new Error(`Command ${id} ${cur.state}: ${cur.errorMessage || '(no message)'}`);
      }
      return cur;
    }
  }
  throw new Error(`Timeout waiting command ${id} (Flow ON?)`);
}

export function createRequestKeyFromCommandKey(commandKey: string): string {
  return `PAY-${commandKey}`;
}

/** unused helper kept for filters */
export function commandFilterByKey(commandKey: string): string {
  return `$filter=CommandKey eq '${escapeOData(commandKey)}'&$top=1`;
}
