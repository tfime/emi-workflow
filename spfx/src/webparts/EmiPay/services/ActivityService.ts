import { PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, getItems } from './SpRest';
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
  COMMAND_FAILED: 'Lệnh lỗi'
};

function eventTitleVi(eventType: string): string {
  return EVENT_VI[eventType] || eventType || 'Sự kiện';
}

function eventKind(eventType: string): ITimelineItem['kind'] {
  if (eventType.indexOf('REJECT') >= 0 || eventType.indexOf('FAIL') >= 0) return 'danger';
  if (eventType === 'STEP_ACCEPTED' || eventType === 'SUBMITTED_TO_MANAGER') return 'info';
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
