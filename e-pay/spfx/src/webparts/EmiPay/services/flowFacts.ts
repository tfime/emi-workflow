import { IActivityPublicRow } from './ActivityService';
import { CORE_STEPS } from './PayLists';
import { IWorkItemRow } from './RequestService';

/**
 * Sự kiện DECIDE / CONFIRM — người thực hiện là người chốt bước.
 * Activity ghi StepInstanceKey của bước MỚI, nên gắn người chốt theo bước nguồn + thời điểm ClosedAt.
 */
const CHOT_EVENTS = new Set([
  'MANAGER_APPROVED',
  'MANAGER_REJECTED',
  'STEP_PASSED',
  'STEP_REJECTED',
  'CHAIR_APPROVED',
  'PAYMENT_CONFIRMED'
]);

const STEP_KEYS = new Set<string>(CORE_STEPS);

/** Activity được ghi ngay sau khi đóng WorkItem — cửa sổ đủ cho HTTP của Flow. */
const MATCH_BEFORE_MS = 20 * 1000;
const MATCH_AFTER_MS = 5 * 60 * 1000;

export interface IStepFlowFacts {
  /** WorkItems.AcceptedAt — thời gian tiếp nhận. */
  receivedAt?: string;
  /** WorkItems.ClosedAt — thời điểm kết thúc xử lý bước. */
  processedAt?: string;
  /** ActivityPublic.ActorUPN của lệnh chốt (DECIDE / xác nhận thanh toán). */
  closedBy?: string;
}

function eventStep(activity: IActivityPublicRow): string {
  if (
    activity.eventType === 'MANAGER_APPROVED' ||
    activity.eventType === 'MANAGER_REJECTED'
  ) {
    return 'BPCM1_PREPARE';
  }
  if (activity.eventType === 'PAYMENT_CONFIRMED') {
    return STEP_KEYS.has(activity.fromState) ? activity.fromState : 'TCKT_PAY';
  }
  if (STEP_KEYS.has(activity.fromState)) return activity.fromState;
  return '';
}

/** Người chốt gắn với WorkItem đã đóng. Không có sự kiện khớp thì bỏ trống. */
export function closedByForWorkItem(
  wi: IWorkItemRow,
  activities: IActivityPublicRow[]
): string | undefined {
  if (!wi.closedAt) return undefined;
  const closedMs = Date.parse(wi.closedAt);
  if (isNaN(closedMs)) return undefined;

  const ranked = activities
    .filter((a) => CHOT_EVENTS.has(a.eventType) && !!a.actorUPN)
    .map((a) => ({
      actor: a.actorUPN,
      dt: Date.parse(a.eventTime) - closedMs,
      step: eventStep(a)
    }))
    .filter(
      (x) => !isNaN(x.dt) && x.dt >= -MATCH_BEFORE_MS && x.dt <= MATCH_AFTER_MS
    )
    .filter((x) => x.step === wi.stepKey || x.step === '');

  const exact = ranked.filter((x) => x.step === wi.stepKey);
  const pool = exact.length ? exact : ranked;
  pool.sort((a, b) => a.dt - b.dt);
  return pool[0] ? pool[0].actor : undefined;
}

/**
 * Một dòng trên luồng duyệt.
 * Chỉ lấy WorkItem mới nhất của bước. Nếu bước còn mở (vd. CT.HĐQT sau duyệt hồ sơ)
 * mà cùng lượt đã có lần chốt trước, hiện thời điểm và người chốt của lần đó.
 */
export function stepFlowFacts(
  stepKey: string,
  workItems: IWorkItemRow[],
  activities: IActivityPublicRow[]
): IStepFlowFacts {
  const rows = workItems
    .filter((w) => w.stepKey === stepKey)
    .slice()
    .sort((a, b) => a.id - b.id);
  if (!rows.length) return {};

  const latest = rows[rows.length - 1];
  let closeWi: IWorkItemRow | undefined = latest.closedAt ? latest : undefined;
  if (!closeWi) {
    const round = latest.reviewRound ?? 1;
    for (let i = rows.length - 2; i >= 0; i--) {
      const prev = rows[i];
      if ((prev.reviewRound ?? 1) !== round || !prev.closedAt) continue;
      if (closedByForWorkItem(prev, activities)) {
        closeWi = prev;
        break;
      }
    }
  }

  return {
    receivedAt: latest.acceptedAt || undefined,
    processedAt: closeWi ? closeWi.closedAt : undefined,
    closedBy: closeWi ? closedByForWorkItem(closeWi, activities) : undefined
  };
}
