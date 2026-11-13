import { PAY_LISTS, escapeOData } from './PayLists';
import { ISpRestContext, getItems } from './SpRest';

function choiceVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v && 'Value' in (v as object)) {
    return String((v as { Value?: string }).Value || '');
  }
  return String(v);
}

export interface IPaymentType {
  id: number;
  code: string;
  title: string;
  checklistVersion: number;
  workflowCode: string;
  isActive: boolean;
}

export interface IChecklistTemplate {
  id: number;
  paymentTypeCode: string;
  versionNo: number;
  itemCode: string;
  itemLabel: string;
  isRequired: boolean;
  minFileCount: number;
  displayOrder: number;
}

export interface IOrgUnit {
  id: number;
  ouCode: string;
  ouName: string;
  homeLECode: string;
  managerUPN: string;
  isActive: boolean;
}

export interface IWorkflowVersion {
  id: number;
  workflowCode: string;
  versionNo: number;
  lifecycle: string;
  publishedAt?: string;
  effectiveAt?: string;
}

export interface IWorkflowStep {
  id: number;
  workflowCode: string;
  versionNo: number;
  stepKey: string;
  stepOrder: number;
  stepName: string;
  stepKind: string;
  isActive: boolean;
}

export interface IStepRecipient {
  id: number;
  workflowCode: string;
  versionNo: number;
  stepKey: string;
  ouCode: string;
  isDefault: boolean;
}

/** Active payment types for create form. CFG ghi qua seed / Site Contents. */
export async function listPaymentTypes(ctx: ISpRestContext): Promise<IPaymentType[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.PaymentTypes,
    `$select=Id,Title,PaymentTypeCode,ChecklistVersion,WorkflowCode,IsActive&$top=200`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      code: String(r.PaymentTypeCode || ''),
      title: String(r.Title || r.PaymentTypeCode || ''),
      checklistVersion: Number(r.ChecklistVersion || 1),
      workflowCode: String(r.WorkflowCode || ''),
      isActive: r.IsActive !== false
    }))
    .filter((r) => r.isActive && !!r.code)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function listChecklistTemplates(
  ctx: ISpRestContext,
  paymentTypeCode: string,
  versionNo: number
): Promise<IChecklistTemplate[]> {
  const filter =
    `PaymentTypeCode eq '${escapeOData(paymentTypeCode)}' and VersionNo eq ${Number(versionNo) || 1}`;
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.ChecklistTemplates,
    `$filter=${filter}&$select=Id,PaymentTypeCode,VersionNo,ItemCode,ItemLabel,IsRequired,MinFileCount,DisplayOrder&$top=100`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      paymentTypeCode: String(r.PaymentTypeCode || ''),
      versionNo: Number(r.VersionNo || 1),
      itemCode: String(r.ItemCode || ''),
      itemLabel: String(r.ItemLabel || r.ItemCode || ''),
      isRequired: !!r.IsRequired,
      minFileCount: Number(r.MinFileCount || 0),
      displayOrder: Number(r.DisplayOrder || 0)
    }))
    .filter((r) => !!r.itemCode)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export interface IOrgMember {
  id: number;
  ouCode: string;
  memberUPN: string;
  displayName: string;
  memberRole: 'Manager' | 'Member';
  isActive: boolean;
}

export async function listOrgMembers(ctx: ISpRestContext): Promise<IOrgMember[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.OrgMembers,
    `$select=Id,Title,OUCode,MemberUPN,MemberRole,IsActive&$top=500`
  );
  return rows
    .map((r) => {
      const role = choiceVal(r.MemberRole);
      return {
        id: Number(r.Id),
        ouCode: String(r.OUCode || ''),
        memberUPN: String(r.MemberUPN || ''),
        displayName: String(r.Title || r.MemberUPN || ''),
        memberRole: (role === 'Manager' ? 'Manager' : 'Member') as 'Manager' | 'Member',
        isActive: r.IsActive !== false
      };
    })
    .filter((r) => r.isActive && !!r.memberUPN && !!r.ouCode)
    .sort((a, b) => a.ouCode.localeCompare(b.ouCode) || a.memberRole.localeCompare(b.memberRole));
}

export async function listOrgUnits(ctx: ISpRestContext): Promise<IOrgUnit[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.OrgUnits,
    `$select=Id,Title,OUCode,OUName,HomeLECode,ManagerUPN,IsActive&$top=200`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      ouCode: String(r.OUCode || ''),
      ouName: String(r.OUName || r.Title || r.OUCode || ''),
      homeLECode: String(r.HomeLECode || ''),
      managerUPN: String(r.ManagerUPN || ''),
      isActive: r.IsActive !== false
    }))
    .filter((r) => !!r.ouCode)
    .sort((a, b) => a.ouCode.localeCompare(b.ouCode));
}

export async function listWorkflowVersions(ctx: ISpRestContext): Promise<IWorkflowVersion[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.WorkflowVersions,
    `$select=Id,Title,WorkflowCode,VersionNo,Lifecycle,PublishedAt,EffectiveAt&$top=100`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      workflowCode: String(r.WorkflowCode || ''),
      versionNo: Number(r.VersionNo || 1),
      lifecycle: choiceVal(r.Lifecycle) || String(r.Lifecycle || ''),
      publishedAt: r.PublishedAt ? String(r.PublishedAt) : undefined,
      effectiveAt: r.EffectiveAt ? String(r.EffectiveAt) : undefined
    }))
    .filter((r) => !!r.workflowCode)
    .sort(
      (a, b) =>
        a.workflowCode.localeCompare(b.workflowCode) || b.versionNo - a.versionNo
    );
}

export async function listWorkflowSteps(ctx: ISpRestContext): Promise<IWorkflowStep[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.WorkflowSteps,
    `$select=Id,Title,WorkflowCode,VersionNo,StepKey,StepOrder,StepName,StepKind,IsActive&$top=200`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      workflowCode: String(r.WorkflowCode || ''),
      versionNo: Number(r.VersionNo || 1),
      stepKey: String(r.StepKey || ''),
      stepOrder: Number(r.StepOrder || 0),
      stepName: String(r.StepName || r.Title || r.StepKey || ''),
      stepKind: choiceVal(r.StepKind) || String(r.StepKind || ''),
      isActive: r.IsActive !== false
    }))
    .filter((r) => !!r.stepKey)
    .sort(
      (a, b) =>
        a.workflowCode.localeCompare(b.workflowCode) ||
        a.versionNo - b.versionNo ||
        a.stepOrder - b.stepOrder
    );
}

export async function listStepRecipients(ctx: ISpRestContext): Promise<IStepRecipient[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.StepRecipients,
    `$select=Id,Title,WorkflowCode,VersionNo,StepKey,OUCode,IsDefault&$top=200`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      workflowCode: String(r.WorkflowCode || ''),
      versionNo: Number(r.VersionNo || 1),
      stepKey: String(r.StepKey || ''),
      ouCode: String(r.OUCode || ''),
      isDefault: !!r.IsDefault
    }))
    .filter((r) => !!r.stepKey)
    .sort(
      (a, b) =>
        a.workflowCode.localeCompare(b.workflowCode) ||
        a.versionNo - b.versionNo ||
        a.stepKey.localeCompare(b.stepKey)
    );
}

export interface ISystemSetting {
  id: number;
  settingKey: string;
  settingValue: string;
  settingDescription: string;
  title: string;
}

/** Ngưỡng Dashboard — đọc từ EMI_PAY_SystemSettings; thiếu key → fallback. */
export interface IDashboardThresholds {
  dueSoonDays: number;
  paymentDueSoonDays: number;
  overloadWaitingAccept: number;
  overloadOverdueWi: number;
  alertReviewRound: number;
}

export const DASHBOARD_THRESHOLD_DEFAULTS: IDashboardThresholds = {
  dueSoonDays: 3,
  paymentDueSoonDays: 7,
  overloadWaitingAccept: 5,
  overloadOverdueWi: 3,
  alertReviewRound: 3
};

export async function listSystemSettings(
  ctx: ISpRestContext
): Promise<ISystemSetting[]> {
  const rows = await getItems<Record<string, unknown>>(
    ctx,
    PAY_LISTS.SystemSettings,
    `$select=Id,Title,SettingKey,SettingValue,SettingDescription&$top=200`
  );
  return rows
    .map((r) => ({
      id: Number(r.Id),
      settingKey: String(r.SettingKey || ''),
      settingValue: String(r.SettingValue || ''),
      settingDescription: String(r.SettingDescription || ''),
      title: String(r.Title || r.SettingKey || '')
    }))
    .filter((r) => !!r.settingKey);
}

function parsePositiveInt(raw: string, fallback: number): number {
  const n = parseInt((raw || '').trim(), 10);
  if (isNaN(n) || n < 0) return fallback;
  return n;
}

export function resolveDashboardThresholds(
  settings: ISystemSetting[]
): IDashboardThresholds {
  const map: { [key: string]: string } = {};
  for (let i = 0; i < settings.length; i++) {
    map[settings[i].settingKey] = settings[i].settingValue;
  }
  const d = DASHBOARD_THRESHOLD_DEFAULTS;
  return {
    dueSoonDays: parsePositiveInt(map.DASH_DUE_SOON_DAYS, d.dueSoonDays),
    paymentDueSoonDays: parsePositiveInt(
      map.DASH_PAYMENT_DUE_SOON_DAYS,
      d.paymentDueSoonDays
    ),
    overloadWaitingAccept: parsePositiveInt(
      map.DASH_OVERLOAD_WAITING_ACCEPT,
      d.overloadWaitingAccept
    ),
    overloadOverdueWi: parsePositiveInt(
      map.DASH_OVERLOAD_OVERDUE_WI,
      d.overloadOverdueWi
    ),
    alertReviewRound: parsePositiveInt(
      map.DASH_ALERT_REVIEW_ROUND,
      d.alertReviewRound
    )
  };
}

export async function getDashboardThresholds(
  ctx: ISpRestContext
): Promise<IDashboardThresholds> {
  try {
    const rows = await listSystemSettings(ctx);
    return resolveDashboardThresholds(rows);
  } catch {
    return { ...DASHBOARD_THRESHOLD_DEFAULTS };
  }
}
