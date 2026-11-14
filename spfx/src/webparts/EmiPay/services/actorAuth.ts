import { IOrgMember } from './ConfigService';
import { IRequestMaster } from './RequestService';
import { isRouteStepSkipped } from './routePlan';

/**
 * Quyền lệnh theo OrgMembers (phòng + MemberRole + bước hồ sơ).
 * Dev: SYSADM đóng vai một dòng OrgMembers; payload actorUPN = UPN dòng đó.
 * User thật sau này: đăng nhập trùng MemberUPN, không cần đóng vai.
 * Flow 1.0.0.12 chưa đối chiếu OrgMembers — SPFx chặn enqueue trong lúc dev
 * vì chỉ SYSADM ghi được EMI_PAY_Commands. Trước khi user thường ghi lệnh, cổng này phải vào Flow.
 */
export const SYSADM_UPN = 'tinh.pt@emi.com.vn';

/**
 * Đóng vai tạm (chỉ SYSADM): góc nhìn người tạo hồ sơ công khai —
 * không OrgMembers, chọn phòng tự do, chỉ CREATE/SUBMIT hồ sơ mình.
 */
export const ACT_AS_REQUESTER = '__REQUESTER__';

export type CommandKind =
  | 'CREATE_REQUEST'
  | 'SUBMIT'
  | 'ACCEPT'
  | 'DECIDE'
  | 'CONFIRM_PAYMENT';

export interface ICommandActor {
  upn: string;
  displayName: string;
  ouCode: string;
  memberRole: 'Manager' | 'Member' | 'SysAdmin';
  acting: boolean;
  known: boolean;
}

const ACT_AS_STORAGE = 'emiPay.actAs';
const ACCEPT_STEPS = ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'TCKT_PAY'];
const DECIDE_STEPS = ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'CHAIR_APPROVE'];
const TERMINAL = ['Completed', 'Cancelled', 'Archiving', 'CancellationArchiving'];

export function sameUpn(a: string, b: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function sameOu(a: string, b: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

export function isSysAdmin(upn: string): boolean {
  return sameUpn(upn, SYSADM_UPN);
}

export function memberKey(m: Pick<IOrgMember, 'memberUPN' | 'ouCode' | 'memberRole'>): string {
  return `${(m.memberUPN || '').toLowerCase()}|${m.ouCode}|${m.memberRole}`;
}

export function readActAsKey(): string {
  try {
    return sessionStorage.getItem(ACT_AS_STORAGE) || '';
  } catch {
    return '';
  }
}

export function writeActAsKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(ACT_AS_STORAGE, key);
    else sessionStorage.removeItem(ACT_AS_STORAGE);
  } catch {
    /* private mode */
  }
}

function sysAdminActor(signedIn: string): ICommandActor {
  return {
    upn: signedIn,
    displayName: 'Quản trị hệ thống',
    ouCode: '',
    memberRole: 'SysAdmin',
    acting: false,
    known: true
  };
}

function fromMember(m: IOrgMember, acting: boolean): ICommandActor {
  return {
    upn: m.memberUPN,
    displayName: m.displayName || m.memberUPN,
    ouCode: m.ouCode,
    memberRole: m.memberRole,
    acting,
    known: true
  };
}

/** Vai đóng tạm «Người tạo hồ sơ» (không cần dòng OrgMembers). */
export function isActAsRequester(actAsKey: string): boolean {
  return (actAsKey || '').trim() === ACT_AS_REQUESTER;
}

function requesterActor(signedIn: string, acting: boolean): ICommandActor {
  return {
    upn: signedIn,
    displayName: acting ? 'Người tạo hồ sơ (tạm)' : signedIn,
    ouCode: '',
    memberRole: 'Member',
    acting,
    known: false
  };
}

/** SYSADM + actAsKey = đóng vai. User thường = đúng dòng OrgMembers của họ. */
export function resolveActor(
  signedInUPN: string,
  members: IOrgMember[],
  actAsKey: string
): ICommandActor {
  const active = members.filter((m) => m.isActive && m.memberUPN && m.ouCode);
  if (isSysAdmin(signedInUPN)) {
    if (isActAsRequester(actAsKey)) {
      return requesterActor(signedInUPN, true);
    }
    const hit = actAsKey ? active.filter((m) => memberKey(m) === actAsKey)[0] : undefined;
    return hit ? fromMember(hit, true) : sysAdminActor(signedInUPN);
  }
  const mine = active.filter((m) => sameUpn(m.memberUPN, signedInUPN));
  const hit = (actAsKey && mine.filter((m) => memberKey(m) === actAsKey)[0]) || mine[0];
  if (!hit) {
    // Người tạo hồ sơ công khai — không cần OrgMembers; chỉ CREATE/SUBMIT hồ sơ mình.
    return requesterActor(signedInUPN, false);
  }
  return fromMember(hit, false);
}

export function actorLabel(actor: ICommandActor, ouName?: string): string {
  if (actor.memberRole === 'SysAdmin') {
    return 'Quản trị — tạo/trình được; đóng vai để duyệt xử lý';
  }
  if (!actor.known) {
    return actor.acting
      ? 'Đóng vai người tạo — chọn phòng khi tạo; không duyệt/chốt'
      : 'Người tạo hồ sơ — chọn phòng khi tạo';
  }
  const ou = ouName || actor.ouCode;
  const role = actor.memberRole === 'Manager' ? 'Trưởng phòng' : 'Thành viên kiểm tra';
  return `${role} · ${ou}`;
}

function managerOf(actor: ICommandActor, ouCode: string): boolean {
  return actor.memberRole === 'Manager' && !!ouCode && sameOu(actor.ouCode, ouCode);
}

/** Nhân sự thuộc phòng (Member hoặc Manager) — làm việc kiểm tra, không mặc nhiên chốt. */
export function staffOf(actor: ICommandActor, ouCode: string): boolean {
  return (
    (actor.memberRole === 'Member' || actor.memberRole === 'Manager') &&
    !!ouCode &&
    sameOu(actor.ouCode, ouCode)
  );
}

/**
 * Sau ACCEPT: TP phòng bước được đánh giá (tự xử lý).
 * Member chờ Assignments — không mở review chỉ vì cùng phòng.
 */
export function canReviewAtStep(actor: ICommandActor, master: IRequestMaster): boolean {
  const step = master.currentStepKey || '';
  if (['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK'].indexOf(step) < 0) return false;
  return managerOf(actor, master.currentOUCode);
}

/**
 * Rỗng = được enqueue. Có chữ = lý do chặn.
 * CREATE/SUBMIT: mọi user đăng nhập (kể cả chưa OrgMembers) — chọn phòng tự do.
 * ACCEPT/DECIDE/CONFIRM: chỉ Manager trong OrgMembers (hoặc SysAdmin đóng vai).
 */
export function commandDenial(
  actor: ICommandActor,
  command: CommandKind,
  master?: IRequestMaster,
  createdOu?: string
): string {
  const isCreateOrSubmit = command === 'CREATE_REQUEST' || command === 'SUBMIT';

  if (actor.memberRole === 'SysAdmin' && !isCreateOrSubmit) {
    return 'Hãy đóng vai trưởng phòng / nhân sự bước xử lý trước khi duyệt hoặc chốt.';
  }

  if (command === 'CREATE_REQUEST') {
    if (!(createdOu || '').trim()) {
      return 'Chọn đơn vị khởi tạo.';
    }
    return '';
  }
  if (!master) return 'Không thấy hồ sơ để kiểm tra quyền.';

  if (command === 'SUBMIT') {
    const stepOk =
      master.currentStepKey === 'BPCM1_PREPARE' &&
      (master.status === 'Draft' || master.status === 'Returned') &&
      sameUpn(actor.upn, master.creatorUPN);
    return stepOk
      ? ''
      : 'Chỉ người tạo hồ sơ, khi nháp hoặc bị trả, được trình trưởng phòng.';
  }

  if (!actor.known) {
    return 'Chỉ nhân sự phòng kiểm tra/duyệt (OrgMembers) được thao tác lệnh này.';
  }

  if (command === 'DECIDE' && master.status === 'AwaitingManager' && master.currentStepKey === 'BPCM1_PREPARE') {
    return managerOf(actor, master.createdOUCode)
      ? ''
      : 'Chỉ trưởng phòng đơn vị tạo hồ sơ được duyệt trình.';
  }

  if (command === 'ACCEPT') {
    const ok =
      ACCEPT_STEPS.indexOf(master.currentStepKey) >= 0 &&
      managerOf(actor, master.currentOUCode);
    return ok ? '' : 'Chỉ trưởng phòng đang giữ bước được tiếp nhận.';
  }

  if (command === 'DECIDE') {
    const ok =
      DECIDE_STEPS.indexOf(master.currentStepKey) >= 0 &&
      managerOf(actor, master.currentOUCode);
    return ok ? '' : 'Chỉ trưởng phòng đang giữ bước được chốt hồ sơ.';
  }

  if (command === 'CONFIRM_PAYMENT') {
    const ok = master.currentStepKey === 'TCKT_PAY' && managerOf(actor, master.currentOUCode);
    return ok ? '' : 'Chỉ trưởng phòng bước thanh toán được xác nhận đã thanh toán.';
  }

  return 'Lệnh không nằm trong quyền của nhân sự đang đóng vai.';
}

/** Mọi user đăng nhập được tạo khi đã có danh mục phòng. */
export function canCreateInOu(_actor: ICommandActor, ouCodes: string[]): boolean {
  return ouCodes.length > 0;
}

export function isRequestCreator(actor: ICommandActor, master: IRequestMaster): boolean {
  return sameUpn(actor.upn, master.creatorUPN);
}

/**
 * Quyền cộng dồn (UI):
 * - Nền: mọi user → «Hồ sơ của tôi» + «Tạo hồ sơ».
 * - + OrgMembers Member/Manager → thêm «Việc của tôi» (hàng đợi kiểm tra/duyệt).
 * - + Manager/SysAdmin → thêm «Tổng quan» (và SysADM: nhật ký).
 */
export function canSeeWorkQueue(actor: ICommandActor): boolean {
  if (actor.memberRole === 'SysAdmin' && !actor.acting) return true;
  return actor.known;
}

/**
 * Inbox / dashboard: SYSADM thấy mọi hồ sơ.
 * Người tạo thấy hồ sơ mình (kể cả chưa OrgMembers).
 * Manager/Member OrgMembers: thêm việc phải xử lý (todo).
 */
export function requestVisibleTo(actor: ICommandActor, item: IRequestMaster): boolean {
  if (actor.memberRole === 'SysAdmin') return true;
  if (sameUpn(actor.upn, item.creatorUPN)) return true;
  if (!actor.known) return false;
  return isActorTodo(actor, item);
}

/** OU pin trong RoutePlan cho một StepKey (bỏ sentinel skip). */
function routeOuForStep(routePlanJson: string | undefined, stepKey: string): string {
  if (!routePlanJson || !String(routePlanJson).trim()) return '';
  try {
    const plan = JSON.parse(routePlanJson) as Record<string, unknown>;
    const v = plan[stepKey];
    if (typeof v === 'string' && !isRouteStepSkipped(v)) return v;
  } catch {
    /* ignore */
  }
  return '';
}

/** TP phòng TCKT (kiểm tra và/hoặc thanh toán) theo RoutePlan hồ sơ. */
function isTcktRouteManager(actor: ICommandActor, item: IRequestMaster): boolean {
  if (!managerOf(actor, actor.ouCode)) return false;
  const checkOu = routeOuForStep(item.routePlanJson, 'TCKT_CHECK');
  const payOu = routeOuForStep(item.routePlanJson, 'TCKT_PAY');
  return (
    (!!checkOu && managerOf(actor, checkOu)) || (!!payOu && managerOf(actor, payOu))
  );
}

/**
 * Hàng đợi kiểm tra/duyệt — không gồm nháp/trả về của người tạo
 * (nháp nằm ở «Hồ sơ của tôi»).
 */
export function isActorTodo(actor: ICommandActor, item: IRequestMaster): boolean {
  if (!actor.known) return false;
  if (actor.memberRole === 'SysAdmin') return false;
  if (
    managerOf(actor, item.createdOUCode) &&
    item.status === 'AwaitingManager' &&
    item.currentStepKey === 'BPCM1_PREPARE'
  ) {
    return true;
  }
  // Manager: việc phòng đang giữ (tiếp nhận / chốt) — trách nhiệm bước, không phải «cùng phòng xem».
  if (
    managerOf(actor, item.currentOUCode) &&
    item.currentStepKey !== 'BPCM1_PREPARE' &&
    TERMINAL.indexOf(item.status) < 0
  ) {
    return true;
  }
  // TCKT theo dõi hồ sơ đang ở CT.HĐQT — phối hợp thúc đẩy (chưa tới TCKT_PAY).
  if (
    item.currentStepKey === 'CHAIR_APPROVE' &&
    TERMINAL.indexOf(item.status) < 0 &&
    isTcktRouteManager(actor, item)
  ) {
    return true;
  }
  // Member: chờ Assignments Core — không tự thấy mọi hồ sơ phòng đang giữ.
  return false;
}
