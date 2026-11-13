/** Thông tin đối tượng TT — tạm nhúng RoutePlanJson._biz (text), chưa cột schema. */

export type PartyKind = 'NCC' | 'CBNV';

export const PARTY_BIZ_ROUTE_KEY = '_biz';

export interface IPartyBizInfo {
  partyKind: PartyKind | '';
  project: string;
  packageItem: string;
  contractNo: string;
  currency: string;
  paymentTimes: string;
}

export function emptyPartyBiz(kind: PartyKind | '' = 'CBNV'): IPartyBizInfo {
  return {
    partyKind: kind,
    project: '',
    packageItem: '',
    contractNo: '',
    currency: '',
    paymentTimes: ''
  };
}

export function partyKindLabel(kind: PartyKind | '' | undefined): string {
  if (kind === 'NCC') return 'Nhà cung cấp (NCC)';
  if (kind === 'CBNV') return 'Cán bộ nhân viên (CBNV)';
  return '—';
}

export function parsePartyBizFromRouteJson(
  routePlanJson?: string
): IPartyBizInfo {
  const empty = emptyPartyBiz();
  if (!routePlanJson) return empty;
  try {
    const plan = JSON.parse(routePlanJson) as Record<string, unknown>;
    const raw = plan[PARTY_BIZ_ROUTE_KEY];
    if (raw === null || raw === undefined) return empty;
    const obj =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>);
    const kind = String(obj.partyKind || '').toUpperCase();
    return {
      partyKind: kind === 'NCC' || kind === 'CBNV' ? kind : '',
      project: String(obj.project || ''),
      packageItem: String(obj.packageItem || ''),
      contractNo: String(obj.contractNo || ''),
      currency: String(obj.currency || ''),
      paymentTimes: String(obj.paymentTimes || '')
    };
  } catch {
    return empty;
  }
}

/** Gắn / gỡ `_biz` trên RoutePlan (chỉ step keys là OU string). */
export function withPartyBizOnRoute(
  plan: Record<string, string>,
  biz: IPartyBizInfo
): Record<string, string> {
  const next: Record<string, string> = { ...plan };
  delete next[PARTY_BIZ_ROUTE_KEY];
  if (!biz.partyKind) return next;
  const payload: Record<string, string> = { partyKind: biz.partyKind };
  if (biz.partyKind === 'NCC') {
    payload.project = (biz.project || '').trim();
    payload.packageItem = (biz.packageItem || '').trim();
    payload.contractNo = (biz.contractNo || '').trim();
    payload.currency = (biz.currency || '').trim();
    payload.paymentTimes = (biz.paymentTimes || '').trim();
  }
  next[PARTY_BIZ_ROUTE_KEY] = JSON.stringify(payload);
  return next;
}

/** Rỗng = hợp lệ. Có chữ = lý do chặn. */
export function partyBizDenial(biz: IPartyBizInfo): string {
  if (biz.partyKind !== 'NCC' && biz.partyKind !== 'CBNV') {
    return 'Chọn đối tượng thanh toán: NCC hoặc CBNV.';
  }
  if (biz.partyKind === 'CBNV') return '';
  if (!(biz.project || '').trim()) return 'Nhập Dự án (hồ sơ NCC).';
  if (!(biz.packageItem || '').trim()) {
    return 'Nhập Hạng mục / gói thầu / KMCP (hồ sơ NCC).';
  }
  if (!(biz.contractNo || '').trim()) return 'Nhập Số hợp đồng (hồ sơ NCC).';
  if (!(biz.currency || '').trim()) return 'Nhập Loại tiền (hồ sơ NCC).';
  if (!(biz.paymentTimes || '').trim()) return 'Nhập Lần thanh toán (hồ sơ NCC).';
  return '';
}
