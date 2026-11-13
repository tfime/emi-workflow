import { PAY_LISTS, escapeOData, newKey } from './PayLists';
import { ISpRestContext, createItem, getItems } from './SpRest';
import { statusVi, stepShortVi } from './viLabels';

export interface IActivityPublicRow {
  id: number;
  activityKey: string;
  requestKey: string;
  stepInstanceKey: string;
  reviewRound: number;
  eventType: string;
  eventTime: string;
  actorUPN: string;
  fromState: string;
  toState: string;
  note: string;
}

export interface IStepReviewRow {
  id: number;
  requestKey: string;
  stepInstanceKey: string;
  reviewRound: number;
  checklistItemKey: string;
  result: string;
  reason: string;
  reviewedByUPN: string;
  reviewedAt: string;
}

export interface ITimelineItem {
  id: string;
  at: string;
  title: string;
  meta: string;
  badge: string;
  kind: 'ok' | 'warn' | 'mute' | 'danger' | 'info';
}

const EVENT_VI: Record<string, string> = {
  REQUEST_CREATED: 'Hồ sơ được tạo',
  SUBMITTED_TO_MANAGER: 'Trình trưởng phòng',
  STEP_ACCEPTED: 'Tiếp nhận bước (có hạn xử lý)',
  MANAGER_APPROVED: 'Trưởng phòng duyệt gửi',
  MANAGER_REJECTED: 'Trưởng phòng từ chối trình gửi',
  STEP_PASSED: 'Chuyển bước (Đạt)',
  STEP_REJECTED: 'Trả hồ sơ (Không đạt)',
  CHAIR_APPROVED: 'CT.HĐQT phê duyệt hồ sơ',
  PAYMENT_CONFIRMED: 'Xác nhận đã thanh toán',
  COMMAND_REJECTED: 'Lệnh bị từ chối',
  COMMAND_FAILED: 'Lệnh lỗi',
  USER_NOTE: 'Ghi chú'
};

export interface INoteListItem {
  id: string;
  at: string;
  title: string;
  body: string;
  actorUPN: string;
  kind: 'reject' | 'review' | 'user' | 'other';
  /** DocumentKey đã sanitize (khớp addUserNote); rỗng = ghi chú hồ sơ chung. */
  documentKey?: string;
}

export function isUserNoteReview(row: IStepReviewRow): boolean {
  return (row.checklistItemKey || '').indexOf('|USER_NOTE|') >= 0;
}

export function sanitizeDocKeyForNote(documentKey?: string): string {
  const raw = (documentKey || '').trim();
  if (!raw) return '-';
  return raw.replace(/\|/g, '_');
}

/** DocumentKey gắn USER_NOTE; '' nếu ghi chú chung. */
export function documentKeyFromUserNote(row: IStepReviewRow): string {
  const parts = (row.checklistItemKey || '').split('|');
  // RequestKey|USER_NOTE|docPart|suffix — RequestKey có thể chứa dấu '-' không có |
  // Dạng cố định: ...|USER_NOTE|<doc>|<suffix>
  let idx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'USER_NOTE') {
      idx = i;
      break;
    }
  }
  if (idx < 0 || idx + 1 >= parts.length) return '';
  const doc = parts[idx + 1] || '';
  if (!doc || doc === '-') return '';
  return doc;
}

export function notesForDocument(
  notes: INoteListItem[],
  documentKey?: string
): INoteListItem[] {
  const key = sanitizeDocKeyForNote(documentKey);
  if (key === '-') return [];
  const out: INoteListItem[] = [];
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].documentKey === key) out.push(notes[i]);
  }
  return out;
}

function eventTitleVi(eventType: string): string {
  return EVENT_VI[eventType] || eventType || 'Sự kiện';
}

function eventKind(eventType: string): ITimelineItem['kind'] {
  if (eventType.indexOf('REJECT') >= 0 || eventType.indexOf('FAIL') >= 0) return 'danger';
  if (
    eventType === 'STEP_ACCEPTED' ||
    eventType === 'SUBMITTED_TO_MANAGER' ||
    eventType === 'USER_NOTE'
  ) {
    return 'info';
  }
  if (
    eventType.indexOf('PASS') >= 0 ||
    eventType.indexOf('APPROV') >= 0 ||
    eventType === 'PAYMENT_CONFIRMED' ||
    eventType === 'REQUEST_CREATED'
  ) {
    return 'ok';
  }
  return 'mute';
}

export async function listActivityPublic(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IActivityPublicRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.ActivityPublic,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$select=Id,Title,ActivityKey,RequestKey,StepInstanceKey,ReviewRound,EventType,EventTime,ActorUPN,FromState,ToState,Note&$top=100`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      activityKey: String(r.ActivityKey || r.Title || ''),
      requestKey: String(r.RequestKey || ''),
      stepInstanceKey: String(r.StepInstanceKey || ''),
      reviewRound: Number(r.ReviewRound || 1),
      eventType: String(r.EventType || ''),
      eventTime: String(r.EventTime || ''),
      actorUPN: String(r.ActorUPN || ''),
      fromState: String(r.FromState || ''),
      toState: String(r.ToState || ''),
      note: String(r.Note || '')
    }))
    .sort((a, b) => String(b.eventTime).localeCompare(String(a.eventTime)));
}

export async function listStepReviews(
  ctx: ISpRestContext,
  requestKey: string
): Promise<IStepReviewRow[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.StepReviews,
    `$filter=RequestKey eq '${escapeOData(requestKey)}'&$select=Id,RequestKey,StepInstanceKey,ReviewRound,ChecklistItemKey,Result,Reason,ReviewedByUPN,ReviewedAt&$top=100`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      requestKey: String(r.RequestKey || ''),
      stepInstanceKey: String(r.StepInstanceKey || ''),
      reviewRound: Number(r.ReviewRound || 1),
      checklistItemKey: String(r.ChecklistItemKey || ''),
      result: String(r.Result || ''),
      reason: String(r.Reason || ''),
      reviewedByUPN: String(r.ReviewedByUPN || ''),
      reviewedAt: String(r.ReviewedAt || '')
    }))
    .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));
}

function routeLabelVi(fromState: string, toState: string): string {
  const label = (raw: string): string => {
    if (!raw) return '';
    // FromState/ToState có thể là Status hoặc StepKey
    const asStatus = statusVi(raw);
    if (asStatus !== raw) return asStatus;
    const asStep = stepShortVi(raw);
    if (asStep !== raw) return asStep;
    return raw;
  };
  const from = label(fromState);
  const to = label(toState);
  if (from && to) return `${from} → ${to}`;
  return to || from || '';
}

/** Ghép ActivityPublic + StepReviews thành timeline UI (mới nhất trước). */
export function buildTimeline(
  activities: IActivityPublicRow[],
  reviews: IStepReviewRow[]
): ITimelineItem[] {
  const items: ITimelineItem[] = [];

  activities.forEach((a) => {
    const route = routeLabelVi(a.fromState, a.toState);
    items.push({
      id: `act-${a.id}`,
      at: a.eventTime,
      title: eventTitleVi(a.eventType),
      meta: [a.actorUPN, route, a.note, a.reviewRound ? `Lượt ${a.reviewRound}` : '']
        .filter(Boolean)
        .join(' · '),
      badge: eventTitleVi(a.eventType),
      kind: eventKind(a.eventType)
    });
  });

  reviews.forEach((r) => {
    // Ghi chú USER_NOTE chỉ hiện ở tab Ghi chú — không đưa vào Nhật ký.
    if (isUserNoteReview(r)) return;
    const pass = (r.result || '').toLowerCase() === 'pass';
    items.push({
      id: `rev-${r.id}`,
      at: r.reviewedAt,
      title: pass ? 'Đánh giá checklist: Đạt' : 'Đánh giá checklist: Không đạt',
      meta: [r.checklistItemKey, r.reviewedByUPN, r.reason, r.reviewRound ? `Lượt ${r.reviewRound}` : '']
        .filter(Boolean)
        .join(' · '),
      badge: pass ? 'Đạt' : 'Không đạt',
      kind: pass ? 'ok' : 'danger'
    });
  });

  // Mới nhất lên trên
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * Tab Ghi chú — chỉ ghi chú người dùng (USER_NOTE).
 * Lý do REJECT / nhận xét Pass·Fail checklist thuộc Nhật ký (và banner Returned).
 */
export function buildNoteList(
  _activities: IActivityPublicRow[],
  reviews: IStepReviewRow[]
): INoteListItem[] {
  const items: INoteListItem[] = [];

  reviews.forEach((r) => {
    if (!isUserNoteReview(r)) return;
    const body = (r.reason || '').trim();
    if (!body) return;
    const docKey = documentKeyFromUserNote(r);
    items.push({
      id: `rev-note-${r.id}`,
      at: r.reviewedAt,
      title: docKey ? 'Ghi chú trên tài liệu' : 'Ghi chú',
      body,
      actorUPN: r.reviewedByUPN,
      kind: 'user',
      documentKey: docKey || undefined
    });
  });

  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Lý do trả về mới nhất (REJECT) — banner Returned. */
export function latestRejectNote(activities: IActivityPublicRow[]): string {
  // ES5 target: không dùng Array.find
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (
      (a.eventType === 'STEP_REJECTED' || a.eventType === 'MANAGER_REJECTED') &&
      (a.note || '').trim()
    ) {
      return a.note.trim();
    }
  }
  return '';
}

/**
 * Ghi chú người dùng → StepReviews (Result=Pending, ChecklistItemKey chứa USER_NOTE).
 * Không ghi ActivityPublic từ SPFx — RBAC/Flow: Activity do service ghi; user thường chỉ đọc.
 */
export async function addUserNote(
  ctx: ISpRestContext,
  opts: {
    requestKey: string;
    stepInstanceKey?: string;
    reviewRound?: number;
    actorUPN: string;
    note: string;
    documentKey?: string;
  }
): Promise<void> {
  const note = (opts.note || '').trim();
  if (!note) throw new Error('Nhập nội dung ghi chú');
  const suffix = newKey('N');
  const docPart = sanitizeDocKeyForNote(opts.documentKey);
  const checklistItemKey = `${opts.requestKey}|USER_NOTE|${docPart}|${suffix}`;
  await createItem(ctx, PAY_LISTS.StepReviews, {
    Title: `${opts.requestKey}|USER_NOTE`.slice(0, 255),
    RequestKey: opts.requestKey,
    StepInstanceKey: opts.stepInstanceKey || '',
    ReviewRound: Number(opts.reviewRound) || 1,
    ChecklistItemKey: checklistItemKey,
    Result: 'Pending',
    Reason: note,
    ReviewedByUPN: opts.actorUPN || '',
    ReviewedAt: new Date().toISOString()
  });
}
