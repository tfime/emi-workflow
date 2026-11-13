import { IRequestMaster, IWorkItemRow } from '../../services/RequestService';
import { IOrgUnit, IOrgMember, IDashboardThresholds } from '../../services/ConfigService';
import { IActivityPublicRow } from '../../services/ActivityService';
import { stepShortVi, statusVi } from '../../services/viLabels';
import { ACCEPT_STEPS } from '../../services/liveActions';

export type DashAlertKind =
  | 'wi_overdue'
  | 'wi_due_soon'
  | 'pay_overdue'
  | 'pay_due_soon'
  | 'ou_overload_accept'
  | 'ou_overload_overdue'
  | 'review_round';

export interface IDashAlert {
  id: string;
  kind: DashAlertKind;
  severity: 'danger' | 'warn' | 'info';
  title: string;
  detail: string;
  requestKey?: string;
  requestCode?: string;
  ouCode?: string;
}

export interface IOuLoadRow {
  ouCode: string;
  ouName: string;
  total: number;
  waitingAccept: number;
  inReview: number;
  returned: number;
  wiOverdue: number;
  wiDueSoon: number;
  overloaded: boolean;
  /** Câu ngắn: việc cần để ý của phòng. */
  attention: string;
}

/** Tỉ lệ hiệu suất theo ResponsibleOUCode (undefined = không có mẫu). */
export interface IOuRateRow {
  ouCode: string;
  ouName: string;
  acceptRate?: number;
  acceptHint?: string;
  onTimeRate?: number;
  onTimeHint?: string;
  lateRate?: number;
  lateHint?: string;
  approveRate?: number;
  approveHint?: string;
  returnRate?: number;
  returnHint?: string;
}

export interface IStepLoadRow {
  stepKey: string;
  label: string;
  count: number;
}

export interface ICreateOuRow {
  ouCode: string;
  ouName: string;
  count: number;
}

export interface IActorActivityRow {
  upn: string;
  displayName: string;
  count: number;
}

export interface IDashboardModel {
  ouRows: IOuLoadRow[];
  ouRateRows: IOuRateRow[];
  stepRows: IStepLoadRow[];
  createOuRows: ICreateOuRow[];
  actorRows: IActorActivityRow[];
  alerts: IDashAlert[];
  priorityAlerts: IDashAlert[];
  totals: {
    open: number;
    waitingAccept: number;
    wiOverdue: number;
    wiDueSoon: number;
    payOverdue: number;
    payDueSoon: number;
    attentionCount: number;
  };
  createMost?: ICreateOuRow;
  createLeast?: ICreateOuRow;
}

function pct(n: number, d: number): number | undefined {
  if (d <= 0) return undefined;
  return Math.round((n / d) * 100);
}

function isApproveDecision(d: string): boolean {
  const x = (d || '').toUpperCase();
  return x === 'PASS' || x === 'APPROVE' || x === 'APPROVED';
}

function isRejectDecision(d: string): boolean {
  const x = (d || '').toUpperCase();
  return x === 'REJECT' || x === 'REJECTED';
}

function isAcceptStep(stepKey: string): boolean {
  return ACCEPT_STEPS.indexOf(stepKey) >= 0;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function parseDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

export function ouNameOf(code: string, units: IOrgUnit[]): string {
  if (!code) return '(Chưa gán phòng)';
  for (let i = 0; i < units.length; i++) {
    if (units[i].ouCode === code) return units[i].ouName || code;
  }
  return code;
}

function memberNameOf(upn: string, members: IOrgMember[]): string {
  const needle = (upn || '').toLowerCase();
  if (!needle) return '—';
  for (let i = 0; i < members.length; i++) {
    if ((members[i].memberUPN || '').toLowerCase() === needle) {
      return members[i].displayName || upn;
    }
  }
  const at = upn.indexOf('@');
  return at > 0 ? upn.slice(0, at) : upn;
}

function alertKindLabel(kind: DashAlertKind): string {
  switch (kind) {
    case 'wi_overdue':
      return 'Quá hạn xử lý';
    case 'wi_due_soon':
      return 'Sắp hết hạn xử lý';
    case 'pay_overdue':
      return 'Quá hạn thanh toán';
    case 'pay_due_soon':
      return 'Sắp đến hạn thanh toán';
    case 'ou_overload_accept':
      return 'Phòng quá tải — chờ tiếp nhận';
    case 'ou_overload_overdue':
      return 'Phòng quá tải — việc quá hạn';
    case 'review_round':
      return 'Nhiều lượt xử lý lại';
    default:
      return 'Cảnh báo';
  }
}

function buildAttention(row: {
  waitingAccept: number;
  wiOverdue: number;
  wiDueSoon: number;
  returned: number;
}): string {
  const bits: string[] = [];
  if (row.wiOverdue > 0) bits.push(`${row.wiOverdue} quá hạn xử lý`);
  if (row.waitingAccept > 0) bits.push(`${row.waitingAccept} chờ tiếp nhận`);
  if (row.wiDueSoon > 0) bits.push(`${row.wiDueSoon} sắp hết hạn`);
  if (row.returned > 0) bits.push(`${row.returned} bị trả về`);
  if (!bits.length) return 'Không có điểm nóng';
  return bits.join(' · ');
}

/**
 * Aggregate dashboard: phòng / hạn / cảnh báo / tỉ lệ / tạo hồ sơ / hoạt động.
 * `workItems` gồm cả WI đã đóng (để tính tỉ lệ); hạn mở lọc ClosedAt rỗng.
 */
export function buildDashboardModel(
  requests: IRequestMaster[],
  workItems: IWorkItemRow[],
  orgUnits: IOrgUnit[],
  thresholds: IDashboardThresholds,
  activities: IActivityPublicRow[],
  members: IOrgMember[],
  nowInput?: Date
): IDashboardModel {
  const now = nowInput || new Date();
  const today = startOfDay(now);
  const dueSoonEnd = addDays(today, thresholds.dueSoonDays);
  const paySoonEnd = addDays(today, thresholds.paymentDueSoonDays);

  const reqByKey: { [k: string]: IRequestMaster } = {};
  for (let i = 0; i < requests.length; i++) {
    reqByKey[requests[i].requestKey] = requests[i];
  }

  const ouMap: {
    [ou: string]: {
      total: number;
      waitingAccept: number;
      inReview: number;
      returned: number;
      wiOverdue: number;
      wiDueSoon: number;
    };
  } = {};

  const ensureOu = (code: string): void => {
    const k = code || '';
    if (!ouMap[k]) {
      ouMap[k] = {
        total: 0,
        waitingAccept: 0,
        inReview: 0,
        returned: 0,
        wiOverdue: 0,
        wiDueSoon: 0
      };
    }
  };

  const stepMap: { [step: string]: number } = {};
  const createMap: { [ou: string]: number } = {};
  let waitingAccept = 0;
  let payOverdue = 0;
  let payDueSoon = 0;
  const alerts: IDashAlert[] = [];

  const isClosed = (status: string): boolean =>
    status === 'Completed' || status === 'Cancelled';

  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    const createdOu = r.createdOUCode || '';
    createMap[createdOu] = (createMap[createdOu] || 0) + 1;

    if (isClosed(r.status)) continue;

    const ou = r.currentOUCode || '';
    ensureOu(ou);
    ouMap[ou].total++;
    if (r.status === 'WaitingAcceptance') {
      ouMap[ou].waitingAccept++;
      waitingAccept++;
    }
    if (r.status === 'InReview') ouMap[ou].inReview++;
    if (r.status === 'Returned') ouMap[ou].returned++;

    const sk = r.currentStepKey || '';
    stepMap[sk] = (stepMap[sk] || 0) + 1;

    if (r.reviewRound >= thresholds.alertReviewRound) {
      alerts.push({
        id: `rr-${r.requestKey}`,
        kind: 'review_round',
        severity: 'warn',
        title: alertKindLabel('review_round'),
        detail: `Đã xử lý lại ${r.reviewRound} lượt · ${statusVi(r.status)} · ${stepShortVi(r.currentStepKey)}`,
        requestKey: r.requestKey,
        requestCode: r.requestCode || r.requestKey,
        ouCode: ou
      });
    }

    const payDue = parseDate(r.paymentDueAt);
    if (payDue) {
      const payDay = startOfDay(payDue);
      if (payDay.getTime() < today.getTime()) {
        payOverdue++;
        alerts.push({
          id: `pay-od-${r.requestKey}`,
          kind: 'pay_overdue',
          severity: 'danger',
          title: alertKindLabel('pay_overdue'),
          detail: `Hạn thanh toán ${payDue.toLocaleDateString('vi-VN')}`,
          requestKey: r.requestKey,
          requestCode: r.requestCode || r.requestKey,
          ouCode: ou
        });
      } else if (payDay.getTime() <= paySoonEnd.getTime()) {
        payDueSoon++;
        alerts.push({
          id: `pay-soon-${r.requestKey}`,
          kind: 'pay_due_soon',
          severity: 'warn',
          title: alertKindLabel('pay_due_soon'),
          detail: `Hạn thanh toán ${payDue.toLocaleDateString('vi-VN')}`,
          requestKey: r.requestKey,
          requestCode: r.requestCode || r.requestKey,
          ouCode: ou
        });
      }
    }
  }

  let wiOverdue = 0;
  let wiDueSoon = 0;

  const rateMap: {
    [ou: string]: {
      acceptOffer: number;
      acceptDone: number;
      closedWithDue: number;
      onTime: number;
      late: number;
      decided: number;
      approve: number;
      reject: number;
    };
  } = {};

  const ensureRate = (code: string): void => {
    const k = code || '';
    if (!rateMap[k]) {
      rateMap[k] = {
        acceptOffer: 0,
        acceptDone: 0,
        closedWithDue: 0,
        onTime: 0,
        late: 0,
        decided: 0,
        approve: 0,
        reject: 0
      };
    }
  };

  for (let i = 0; i < workItems.length; i++) {
    const w = workItems[i];
    const rk = w.requestKey || '';
    const master = rk ? reqByKey[rk] : undefined;
    if (rk && !master) continue;

    const ou = w.responsibleOUCode || (master && master.currentOUCode) || '';
    ensureRate(ou);

    if (isAcceptStep(w.stepKey || '')) {
      rateMap[ou].acceptOffer++;
      if (w.acceptedAt) rateMap[ou].acceptDone++;
    }

    const closed = !!w.closedAt;
    const due = parseDate(w.dueAt);
    if (closed && due) {
      const closedAt = parseDate(w.closedAt);
      if (closedAt) {
        rateMap[ou].closedWithDue++;
        if (startOfDay(closedAt).getTime() <= startOfDay(due).getTime()) {
          rateMap[ou].onTime++;
        } else {
          rateMap[ou].late++;
        }
      }
    }

    const decision = w.decision || '';
    if (closed && (isApproveDecision(decision) || isRejectDecision(decision))) {
      rateMap[ou].decided++;
      if (isApproveDecision(decision)) rateMap[ou].approve++;
      if (isRejectDecision(decision)) rateMap[ou].reject++;
    }

    // Hạn đang mở: có DueAt, chưa ClosedAt
    if (!w.closedAt && due) {
      const dueDay = startOfDay(due);
      const loadOu = (master && master.currentOUCode) || w.responsibleOUCode || '';
      ensureOu(loadOu);
      const code = master ? master.requestCode || master.requestKey : rk;

      if (dueDay.getTime() < today.getTime()) {
        wiOverdue++;
        ouMap[loadOu].wiOverdue++;
        alerts.push({
          id: `wi-od-${w.id}`,
          kind: 'wi_overdue',
          severity: 'danger',
          title: alertKindLabel('wi_overdue'),
          detail: `Hạn ${due.toLocaleDateString('vi-VN')} · ${stepShortVi(w.stepKey)}`,
          requestKey: rk || undefined,
          requestCode: code,
          ouCode: loadOu
        });
      } else if (dueDay.getTime() <= dueSoonEnd.getTime()) {
        wiDueSoon++;
        ouMap[loadOu].wiDueSoon++;
        alerts.push({
          id: `wi-soon-${w.id}`,
          kind: 'wi_due_soon',
          severity: 'warn',
          title: alertKindLabel('wi_due_soon'),
          detail: `Hạn ${due.toLocaleDateString('vi-VN')} · ${stepShortVi(w.stepKey)}`,
          requestKey: rk || undefined,
          requestCode: code,
          ouCode: loadOu
        });
      }
    }
  }

  const ouKeys = Object.keys(ouMap);
  const ouRows: IOuLoadRow[] = [];
  for (let i = 0; i < ouKeys.length; i++) {
    const code = ouKeys[i];
    const row = ouMap[code];
    const overloaded =
      row.waitingAccept >= thresholds.overloadWaitingAccept ||
      row.wiOverdue >= thresholds.overloadOverdueWi;
    if (row.waitingAccept >= thresholds.overloadWaitingAccept) {
      alerts.push({
        id: `ou-acc-${code}`,
        kind: 'ou_overload_accept',
        severity: 'danger',
        title: alertKindLabel('ou_overload_accept'),
        detail: `${ouNameOf(code, orgUnits)} đang có ${row.waitingAccept} hồ sơ chờ tiếp nhận (mức từ ${thresholds.overloadWaitingAccept})`,
        ouCode: code
      });
    }
    if (row.wiOverdue >= thresholds.overloadOverdueWi) {
      alerts.push({
        id: `ou-od-${code}`,
        kind: 'ou_overload_overdue',
        severity: 'danger',
        title: alertKindLabel('ou_overload_overdue'),
        detail: `${ouNameOf(code, orgUnits)} đang có ${row.wiOverdue} việc quá hạn xử lý (mức từ ${thresholds.overloadOverdueWi})`,
        ouCode: code
      });
    }
    ouRows.push({
      ouCode: code,
      ouName: ouNameOf(code, orgUnits),
      total: row.total,
      waitingAccept: row.waitingAccept,
      inReview: row.inReview,
      returned: row.returned,
      wiOverdue: row.wiOverdue,
      wiDueSoon: row.wiDueSoon,
      overloaded,
      attention: buildAttention(row)
    });
  }
  ouRows.sort((a, b) => {
    const ah = a.overloaded || a.wiOverdue > 0 || a.waitingAccept > 0 ? 1 : 0;
    const bh = b.overloaded || b.wiOverdue > 0 || b.waitingAccept > 0 ? 1 : 0;
    if (bh !== ah) return bh - ah;
    if (b.wiOverdue !== a.wiOverdue) return b.wiOverdue - a.wiOverdue;
    if (b.waitingAccept !== a.waitingAccept) return b.waitingAccept - a.waitingAccept;
    return b.total - a.total;
  });

  const rateKeys = Object.keys(rateMap);
  const ouRateRows: IOuRateRow[] = [];
  for (let i = 0; i < rateKeys.length; i++) {
    const code = rateKeys[i];
    const r = rateMap[code];
    if (
      r.acceptOffer === 0 &&
      r.closedWithDue === 0 &&
      r.decided === 0
    ) {
      continue;
    }
    ouRateRows.push({
      ouCode: code,
      ouName: ouNameOf(code, orgUnits),
      acceptRate: pct(r.acceptDone, r.acceptOffer),
      acceptHint:
        r.acceptOffer > 0 ? `${r.acceptDone}/${r.acceptOffer}` : undefined,
      onTimeRate: pct(r.onTime, r.closedWithDue),
      onTimeHint:
        r.closedWithDue > 0 ? `${r.onTime}/${r.closedWithDue}` : undefined,
      lateRate: pct(r.late, r.closedWithDue),
      lateHint: r.closedWithDue > 0 ? `${r.late}/${r.closedWithDue}` : undefined,
      approveRate: pct(r.approve, r.decided),
      approveHint: r.decided > 0 ? `${r.approve}/${r.decided}` : undefined,
      returnRate: pct(r.reject, r.decided),
      returnHint: r.decided > 0 ? `${r.reject}/${r.decided}` : undefined
    });
  }
  ouRateRows.sort((a, b) => a.ouName.localeCompare(b.ouName));

  const stepKeys = Object.keys(stepMap);
  const stepRows: IStepLoadRow[] = [];
  for (let i = 0; i < stepKeys.length; i++) {
    const sk = stepKeys[i];
    stepRows.push({
      stepKey: sk,
      label: stepShortVi(sk),
      count: stepMap[sk]
    });
  }
  stepRows.sort((a, b) => b.count - a.count);

  const createKeys = Object.keys(createMap);
  const createOuRows: ICreateOuRow[] = [];
  for (let i = 0; i < createKeys.length; i++) {
    const code = createKeys[i];
    createOuRows.push({
      ouCode: code,
      ouName: ouNameOf(code, orgUnits),
      count: createMap[code]
    });
  }
  createOuRows.sort((a, b) => b.count - a.count || a.ouName.localeCompare(b.ouName));

  const actorMap: { [upn: string]: number } = {};
  for (let i = 0; i < activities.length; i++) {
    const upn = (activities[i].actorUPN || '').trim();
    if (!upn) continue;
    actorMap[upn] = (actorMap[upn] || 0) + 1;
  }
  const actorKeys = Object.keys(actorMap);
  const actorRows: IActorActivityRow[] = [];
  for (let i = 0; i < actorKeys.length; i++) {
    const upn = actorKeys[i];
    actorRows.push({
      upn,
      displayName: memberNameOf(upn, members),
      count: actorMap[upn]
    });
  }
  actorRows.sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));

  alerts.sort((a, b) => {
    const rank = (s: string): number =>
      s === 'danger' ? 0 : s === 'warn' ? 1 : 2;
    return rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title);
  });

  const priorityAlerts = alerts.filter(
    (a) =>
      a.severity === 'danger' ||
      a.kind === 'wi_due_soon' ||
      a.kind === 'pay_due_soon' ||
      a.kind === 'ou_overload_accept' ||
      a.kind === 'ou_overload_overdue'
  );

  return {
    ouRows,
    ouRateRows,
    stepRows: stepRows.slice(0, 8),
    createOuRows: createOuRows.slice(0, 8),
    actorRows: actorRows.slice(0, 8),
    alerts,
    priorityAlerts,
    totals: {
      open: requests.filter((r) => !isClosed(r.status)).length,
      waitingAccept,
      wiOverdue,
      wiDueSoon,
      payOverdue,
      payDueSoon,
      attentionCount: priorityAlerts.length
    },
    createMost: createOuRows.length ? createOuRows[0] : undefined,
    createLeast: createOuRows.length
      ? createOuRows[createOuRows.length - 1]
      : undefined
  };
}
