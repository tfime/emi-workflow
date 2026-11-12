export type PayView =
  | 'inbox'
  | 'create'
  | 'detail'
  | 'search'
  | 'audit'
  | 'features';

/** UI persona xem theo ma trận (không thay ACL SharePoint). */
export type PayPersona =
  | 'creator'
  | 'bpcm2'
  | 'bpcm3'
  | 'tckt_check'
  | 'chair'
  | 'tckt_pay'
  | 'procadm'
  | 'audit'
  /** Legacy mock personas (EmiPay.tsx demo) */
  | 'manager'
  | 'assignee'
  | 'tckt';

export type PayStateKey =
  | 'draft'
  | 'returned'
  | 'waiting'
  | 'review'
  | 'chair'
  | 'unc'
  | 'payment'
  | 'archivePending'
  | 'completed'
  | 'cancelled';

export type BadgeKind = 'mute' | 'warn' | 'ok' | 'info' | 'danger';

export type DialogKind =
  | 'submit'
  | 'accept'
  | 'assign'
  | 'checklist'
  | 'attach'
  | 'forward'
  | 'return'
  | 'withdraw'
  | 'cancel'
  | 'approve'
  | 'reject'
  | 'unc'
  | 'confirmPay'
  | 'review'
  | 'extendDeadline'
  | 'delegate'
  | undefined;

export interface IPayAction {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  ghost?: boolean;
  command?: string;
  dialog?: Exclude<DialogKind, undefined>;
}

export interface ICheckItem {
  code: string;
  label: string;
  meta: string;
  badge: string;
  kind: BadgeKind;
  required: boolean;
  editable: boolean;
  result?: 'Pass' | 'Fail' | 'Open' | 'Missing' | 'Uploaded';
}

export interface IAttachmentItem {
  name: string;
  by: string;
  scope: 'checklist' | 'supplement' | 'unc' | 'internal';
  locked: boolean;
}

export interface IActivityItem {
  type: string;
  text: string;
  scope: 'public' | 'internal';
}

export interface IAssignee {
  upn: string;
  name: string;
}

export interface IPayDetailState {
  title: string;
  sub: string;
  status: string;
  step: string;
  stepshort: string;
  ou: string;
  round: string;
  current: number;
  amount: string;
  creator: string;
  explanation: string;
  deadline?: string;
  paymentDueAt?: string;
  returnFromStepKey?: string;
  canEditMaster: boolean;
  canUploadChecklist: boolean;
  canUploadSupplement: boolean;
  banner?: { kind: 'warn' | 'info'; html: string };
  cmd: string;
  check: ICheckItem[];
  attachments: IAttachmentItem[];
  assignees: IAssignee[];
  act: IActivityItem[];
  nextOuOptions?: { code: string; name: string; isDefault?: boolean }[];
}

export interface IInboxItem {
  id: string;
  state: PayStateKey;
  swatch: string;
  swatchKind?: BadgeKind;
  title: string;
  meta: string;
  badge: string;
  badgeKind: BadgeKind;
  bucket: 'mine' | 'todo' | 'watch';
  personas: PayPersona[];
  overdue?: boolean;
}

export interface IPersonaOption {
  id: PayPersona;
  label: string;
  short: string;
}

export interface IFeatureRow {
  id: string;
  area: string;
  name: string;
  br?: string;
  covered: boolean;
  note: string;
}
