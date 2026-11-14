import { IStepRecipient } from './ConfigService';
import { CORE_STEPS } from './PayLists';

/** UI chọn BPCM trung gian — có thể bỏ qua. */
export const ROUTE_STEPS_UI: { key: string; label: string }[] = [
  { key: 'BPCM2_TECH', label: 'BPCM2' },
  { key: 'BPCM3_PRICE', label: 'BPCM3' }
];

/** Luôn có trong RoutePlan (default StepRecipients). */
export const ROUTE_STEPS_AUTO = [
  'TCKT_CHECK',
  'CHAIR_APPROVE',
  'TCKT_PAY',
  'SYSTEM_ARCHIVE'
];

/** BPCM trung gian — chỉ hiện trên luồng nếu có trong RoutePlan. */
const OPTIONAL_ROUTE_STEPS = ['BPCM2_TECH', 'BPCM3_PRICE'];

/** Sentinel UI — không ghi key vào RoutePlanJson. */
export const ROUTE_STEP_SKIP = '__SKIP__';

export function isRouteStepSkipped(value: string | undefined | null): boolean {
  return !value || value === ROUTE_STEP_SKIP;
}

export function defaultOuForStep(
  stepKey: string,
  recipients: IStepRecipient[]
): string {
  const rows = recipients.filter((r) => r.stepKey === stepKey);
  const def = rows.filter((r) => r.isDefault)[0] || rows[0];
  return def ? def.ouCode : '';
}

/**
 * Mặc định tạo mới: BPCM2/3 = «Không qua» (opt-in).
 * User chọn phòng thì mới thêm bước vào RoutePlan.
 */
export function defaultRoutePlan(recipients: IStepRecipient[]): Record<string, string> {
  const plan: Record<string, string> = {};
  ROUTE_STEPS_UI.forEach((rs) => {
    plan[rs.key] = ROUTE_STEP_SKIP;
  });
  ROUTE_STEPS_AUTO.forEach((sk) => {
    const ou = defaultOuForStep(sk, recipients);
    if (ou) plan[sk] = ou;
  });
  return plan;
}

/**
 * Hydrate form sửa: key BPCM vắng trong JSON = «Không qua»;
 * AUTO thiếu thì điền default.
 */
export function hydrateRoutePlanForEdit(
  stored: Record<string, string>,
  recipients: IStepRecipient[]
): Record<string, string> {
  const next: Record<string, string> = { ...stored };
  ROUTE_STEPS_UI.forEach((rs) => {
    if (!(rs.key in stored) || isRouteStepSkipped(stored[rs.key])) {
      next[rs.key] = ROUTE_STEP_SKIP;
    }
  });
  ROUTE_STEPS_AUTO.forEach((sk) => {
    if (!next[sk]) next[sk] = defaultOuForStep(sk, recipients);
  });
  return next;
}

/** Chuẩn bị lưu / CREATE: bỏ key skip; luôn đủ AUTO. */
export function buildRoutePlanForSave(
  uiPlan: Record<string, string>,
  recipients: IStepRecipient[]
): Record<string, string> {
  const out: Record<string, string> = {};
  ROUTE_STEPS_UI.forEach((rs) => {
    const v = uiPlan[rs.key];
    if (!isRouteStepSkipped(v)) out[rs.key] = v;
  });
  ROUTE_STEPS_AUTO.forEach((sk) => {
    const v = uiPlan[sk] || defaultOuForStep(sk, recipients);
    if (v) out[sk] = v;
  });
  return out;
}

/** Bước kiểm tra tiếp sau TP (cho copy UI). */
export function nextStepAfterManager(plan: Record<string, string>): string {
  if (!isRouteStepSkipped(plan.BPCM2_TECH) && plan.BPCM2_TECH) return 'BPCM2';
  if (!isRouteStepSkipped(plan.BPCM3_PRICE) && plan.BPCM3_PRICE) return 'BPCM3';
  return 'TCKT';
}

/**
 * Tóm tắt tuyến kiểm tra — dùng tên phòng nếu có `ouLabel`.
 * Không truyền resolver thì vẫn hiện mã (create preview trước khi load OU).
 */
export function routeInspectSummary(
  plan: Record<string, string>,
  ouLabelFn?: (ouCode: string) => string
): string {
  const lab = (code: string): string =>
    ouLabelFn ? ouLabelFn(code) : code;
  const parts: string[] = [];
  if (!isRouteStepSkipped(plan.BPCM2_TECH) && plan.BPCM2_TECH) {
    parts.push(`KT kỹ thuật · ${lab(plan.BPCM2_TECH)}`);
  }
  if (!isRouteStepSkipped(plan.BPCM3_PRICE) && plan.BPCM3_PRICE) {
    parts.push(`KT giá · ${lab(plan.BPCM3_PRICE)}`);
  }
  if (!parts.length) return 'Thẳng TCKT kiểm tra (không qua BPCM2/3)';
  return parts.join(' → ') + ' → TCKT kiểm tra';
}

function parsePlanRecord(routePlanJson?: string): Record<string, unknown> | undefined {
  if (routePlanJson === undefined || routePlanJson === null) return undefined;
  const raw = String(routePlanJson).trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Một số bản ghi lưu chuỗi đã escape sẵn
    try {
      return JSON.parse(raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\')) as Record<
        string,
        unknown
      >;
    } catch {
      return undefined;
    }
  }
}

function stepsFromPlanObject(plan: Record<string, unknown>): string[] {
  const steps: string[] = ['BPCM1_PREPARE'];
  OPTIONAL_ROUTE_STEPS.forEach((sk) => {
    const v = plan[sk];
    if (typeof v === 'string' && !isRouteStepSkipped(v)) steps.push(sk);
  });
  ROUTE_STEPS_AUTO.forEach((sk) => steps.push(sk));
  return steps;
}

/**
 * Chuỗi bước hiển thị theo RoutePlan đã pin.
 * - Có JSON (kể cả `{}`): BPCM1 + BPCM đã chọn + TCKT/CHAIR/TT/Archive
 * - Không có field (hồ sơ cũ): fallback đủ CORE_STEPS
 */
export function stepsFromRoutePlan(routePlanJson?: string): string[] {
  if (routePlanJson === undefined || routePlanJson === null || !String(routePlanJson).trim()) {
    return [...CORE_STEPS];
  }
  const plan = parsePlanRecord(routePlanJson);
  if (!plan) return [...CORE_STEPS];
  return stepsFromPlanObject(plan);
}

/** Index trong chuỗi RoutePlan (không dùng CORE_STEPS cứng). */
export function routeStepIndex(currentStepKey: string, routePlanJson?: string): number {
  const steps = stepsFromRoutePlan(routePlanJson);
  const i = steps.indexOf(currentStepKey);
  return i >= 0 ? i : 0;
}
