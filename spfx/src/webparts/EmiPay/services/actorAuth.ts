import { IOrgMember } from './ConfigService';
import { IRequestMaster } from './RequestService';

/**
 * Quyền lệnh theo OrgMembers (phòng + MemberRole + bước hồ sơ).
 * Dev: SYSADM đóng vai một dòng OrgMembers; payload actorUPN = UPN dòng đó.
 * User thật sau này: đăng nhập trùng MemberUPN, không cần đóng vai.
 * Flow 1.0.0.12 chưa đối chiếu OrgMembers — SPFx chặn enqueue trong lúc dev
 * vì chỉ SYSADM ghi được EMI_PAY_Commands. Trước khi user thường ghi lệnh, cổng này phải vào Flow.
 */
export const SYSADM_UPN = 'tinh.pt@emi.com.vn';

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

/** SYSADM + actAsKey = đóng vai. User thường = đúng dòng OrgMembers của họ. */
export function resolveActor(
  signedInUPN: string,
  members: IOrgMember[],
  actAsKey: string
): ICommandActor {
  const active = members.filter((m) => m.isActive && m.memberUPN && m.ouCode);
  if (isSysAdmin(signedInUPN)) {
    const hit = actAsKey ? active.filter((m) => memberKey(m) === actAsKey)[0] : undefined;
    return hit ? fromMember(hit, true) : sysAdminActor(signedInUPN);
  }
  const mine = active.filter((m) => sameUpn(m.memberUPN, signedInUPN));
  const hit = (actAsKey && mine.filter((m) => memberKey(m) === actAsKey)[0]) || mine[0];
  if (!hit) {
    return {
      upn: signedInUPN,
      displayName: signedInUPN,
      ouCode: '',
      memberRole: 'Member',
      acting: false,
      known: false
    };
  }
  return fromMember(hit, false);
}

export function actorLabel(actor: ICommandActor, ouName?: string): string {
  if (actor.memberRole === 'SysAdmin') {
    return 'Quản trị — tạo/trình được; đóng vai để duyệt xử lý';
  }
  const ou = ouName || actor.ouCode;
  const role = actor.memberRole === 'Manager' ? 'Trưởng phòng' : 'Thành viên';
  return `${role} · ${ou}`;
}

function managerOf(actor: ICommandActor, ouCode: string): boolean {
  return actor.memberRole === 'Manager' && !!ouCode && sameOu(actor.ouCode, ouCode);
}

/**
 * Rỗng = được enqueue. Có chữ = lý do chặn.
 * CREATE/SUBMIT: mọi nhân sự (kể cả SysAdmin) — vai trò chỉ siết ACCEPT/DECIDE/CONFIRM.
 */
export function commandDenial(
  actor: ICommandActor,
  command: CommandKind,
  master?: IRequestMaster,
  createdOu?: string
): string {
  if (!actor.known) return 'Tài khoản chưa có trong danh sách nhân sự phòng ban.';

  const isCreateOrSubmit = command === 'CREATE_REQUEST' || command === 'SUBMIT';
  if (actor.memberRole === 'SysAdmin' && !isCreateOrSubmit) {
    return 'Hãy đóng vai trưởng phòng / nhân sự bước xử lý trước khi duyệt hoặc chốt.';
  }

  if (command === 'CREATE_REQUEST') {
    if (!(createdOu || '').trim()) {
      return 'Chọn đơn vị khởi tạo.';
    }
    if (actor.memberRole === 'SysAdmin') {
      return '';
    }
    if (!actor.ouCode || !sameOu(actor.ouCode, createdOu || '')) {
      return 'Chỉ tạo hồ sơ cho đúng phòng của nhân sự đang dùng.';
    }
    return '';
  }
  if (!master) return 'Không thấy hồ sơ để kiểm tra quyền.';

  if (command === 'SUBMIT') {
    const stepOk =
      master.currentStepKey === 'BPCM1_PREPARE' &&
      (master.status === 'Draft' || master.status === 'Returned') &&
      sameUpn(actor.upn, master.creatorUPN);
    if (!stepOk) {
      return 'Chỉ người tạo hồ sơ, khi nháp hoặc bị trả, được trình trưởng phòng.';
    }
    if (actor.memberRole !== 'SysAdmin' && !sameOu(actor.ouCode, master.createdOUCode)) {
      return 'Chỉ người tạo hồ sơ, khi nháp hoặc bị trả, được trình trưởng phòng.';
    }
    return '';
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

/** Mọi nhân sự (Member/Manager) và SysAdmin được tạo hồ sơ. */
export function canCreateInOu(actor: ICommandActor, ouCodes: string[]): boolean {
  if (!actor.known) return false;
  if (actor.memberRole === 'SysAdmin') {
    return ouCodes.length > 0;
  }
  return !!actor.ouCode;
}

export function isRequestCreator(actor: ICommandActor, master: IRequestMaster): boolean {
  return sameUpn(actor.upn, master.creatorUPN);
}

/** Inbox: SYSADM thấy mọi hồ sơ (Full Control). Vai trò chỉ thấy hồ sơ phòng mình / hồ sơ mình tạo. */
export function requestVisibleTo(actor: ICommandActor, item: IRequestMaster): boolean {
  if (actor.memberRole === 'SysAdmin') return true;
  if (!actor.known) return false;
  if (sameUpn(actor.upn, item.creatorUPN)) return true;
  if (actor.memberRole === 'Manager') {
    return sameOu(actor.ouCode, item.createdOUCode) || sameOu(actor.ouCode, item.currentOUCode);
  }
  return false;
}

export function isActorTodo(actor: ICommandActor, item: IRequestMaster): boolean {
  if (!actor.known) return false;
  if (
    sameUpn(actor.upn, item.creatorUPN) &&
    item.currentStepKey === 'BPCM1_PREPARE' &&
    (item.status === 'Draft' || item.status === 'Returned')
  ) {
    return true;
  }
  if (actor.memberRole === 'SysAdmin') return false;
  if (
    managerOf(actor, item.createdOUCode) &&
    item.status === 'AwaitingManager' &&
    item.currentStepKey === 'BPCM1_PREPARE'
  ) {
    return true;
  }
  if (
    managerOf(actor, item.currentOUCode) &&
    item.currentStepKey !== 'BPCM1_PREPARE' &&
    TERMINAL.indexOf(item.status) < 0
  ) {
    return true;
  }
  return false;
}
