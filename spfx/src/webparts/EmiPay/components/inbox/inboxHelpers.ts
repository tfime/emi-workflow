import { IRequestMaster } from '../../services/RequestService';
import { IOrgMember } from '../../services/ConfigService';
import { IOrgUnit } from '../../services/ConfigService';
import { statusBadgeKind, statusVi, stepShortVi } from '../../services/viLabels';

export const INBOX_PAGE_SIZE = 10;

/** Tab id nội bộ — 'all' hoặc khóa status (gộp một số Choice). */
export type InboxStatusTabId = string;

export interface IInboxStatusTab {
  id: InboxStatusTabId;
  label: string;
  count: number;
  badgeKind: 'mute' | 'warn' | 'info' | 'ok' | 'danger';
}

/** Thứ tự ưu tiên tab (sau «Tất cả»). */
const STATUS_TAB_ORDER: { id: string; match: string[]; label: string }[] = [
  {
    id: 'WaitingAcceptance',
    match: ['WaitingAcceptance'],
    label: 'Cần tiếp nhận'
  },
  {
    id: 'AwaitingManager',
    match: ['AwaitingManager', 'AwaitManager'],
    label: 'Chờ duyệt gửi'
  },
  { id: 'Draft', match: ['Draft'], label: 'Nháp' },
  { id: 'Returned', match: ['Returned'], label: 'Đã trả về' },
  { id: 'InReview', match: ['InReview'], label: 'Đang xử lý' },
  {
    id: 'PendingPayment',
    match: ['PendingPayment'],
    label: 'Chờ thanh toán'
  },
  { id: 'Archiving', match: ['Archiving'], label: 'Chờ lưu trữ' },
  {
    id: 'Completed',
    match: ['Completed', 'Paid'],
    label: 'Hoàn tất'
  },
  { id: 'Cancelled', match: ['Cancelled'], label: 'Đã hủy' }
];

function statusMatchesTab(status: string, tabId: InboxStatusTabId): boolean {
  if (tabId === 'all') return true;
  for (let i = 0; i < STATUS_TAB_ORDER.length; i++) {
    if (STATUS_TAB_ORDER[i].id === tabId) {
      return STATUS_TAB_ORDER[i].match.indexOf(status) >= 0;
    }
  }
  return status === tabId;
}

export function filterByStatusTab(
  rows: IRequestMaster[],
  tabId: InboxStatusTabId
): IRequestMaster[] {
  if (!tabId || tabId === 'all') return rows;
  const out: IRequestMaster[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (statusMatchesTab(rows[i].status, tabId)) out.push(rows[i]);
  }
  return out;
}

export function countStatusExact(rows: IRequestMaster[], status: string): number {
  return countByStatus(rows, (s) => s === status);
}

/** Xây tab từ tập đã search — ẩn tab count=0 (trừ Tất cả). */
export function buildStatusTabs(rows: IRequestMaster[]): IInboxStatusTab[] {
  const tabs: IInboxStatusTab[] = [
    {
      id: 'all',
      label: 'Tất cả',
      count: rows.length,
      badgeKind: 'mute'
    }
  ];

  const covered: { [status: string]: boolean } = {};
  for (let i = 0; i < STATUS_TAB_ORDER.length; i++) {
    const def = STATUS_TAB_ORDER[i];
    let n = 0;
    for (let j = 0; j < rows.length; j++) {
      if (def.match.indexOf(rows[j].status) >= 0) n++;
    }
    for (let m = 0; m < def.match.length; m++) {
      covered[def.match[m]] = true;
    }
    if (n > 0) {
      tabs.push({
        id: def.id,
        label: def.label,
        count: n,
        badgeKind:
          def.id === 'WaitingAcceptance' ? 'warn' : statusBadgeKind(def.match[0])
      });
    }
  }

  const otherMap: { [status: string]: number } = {};
  for (let i = 0; i < rows.length; i++) {
    const st = rows[i].status || '';
    if (!st || covered[st]) continue;
    otherMap[st] = (otherMap[st] || 0) + 1;
  }
  const otherKeys = Object.keys(otherMap);
  otherKeys.sort();
  for (let i = 0; i < otherKeys.length; i++) {
    const st = otherKeys[i];
    tabs.push({
      id: st,
      label: statusVi(st),
      count: otherMap[st],
      badgeKind: statusBadgeKind(st)
    });
  }

  return tabs;
}

/** Todo: ưu tiên mở Cần tiếp nhận nếu có. */
export function defaultTodoStatusTab(rows: IRequestMaster[]): InboxStatusTabId {
  if (countStatusExact(rows, 'WaitingAcceptance') > 0) {
    return 'WaitingAcceptance';
  }
  return 'all';
}

export function creatorDisplayName(
  upn: string,
  members: IOrgMember[]
): string {
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

export function ouDisplayName(ouCode: string, units: IOrgUnit[]): string {
  if (!ouCode) return '—';
  for (let i = 0; i < units.length; i++) {
    if (units[i].ouCode === ouCode) {
      return units[i].ouName || ouCode;
    }
  }
  return ouCode;
}

export function formatCreatedAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export function sortByCreatedDesc(rows: IRequestMaster[]): IRequestMaster[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (b.id || 0) - (a.id || 0);
  });
  return copy;
}

export function filterInboxRows(
  rows: IRequestMaster[],
  query: string,
  members: IOrgMember[],
  units: IOrgUnit[]
): IRequestMaster[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return rows;
  const out: IRequestMaster[] = [];
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const creator = creatorDisplayName(item.creatorUPN, members).toLowerCase();
    const ou = ouDisplayName(item.createdOUCode, units).toLowerCase();
    const hay = [
      item.requestCode,
      item.requestKey,
      item.title,
      item.creatorUPN,
      creator,
      item.createdOUCode,
      ou,
      statusVi(item.status),
      item.status,
      stepShortVi(item.currentStepKey),
      item.currentStepKey
    ]
      .join(' ')
      .toLowerCase();
    if (hay.indexOf(q) >= 0) out.push(item);
  }
  return out;
}

export function paginateRows<T>(
  rows: T[],
  page: number,
  pageSize: number = INBOX_PAGE_SIZE
): { pageRows: T[]; page: number; pageCount: number; from: number; to: number; total: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  let p = page;
  if (p < 1) p = 1;
  if (p > pageCount) p = pageCount;
  const start = total === 0 ? 0 : (p - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    pageRows: rows.slice(start, end),
    page: p,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: end,
    total
  };
}

export function isInProgressStatus(status: string): boolean {
  return (
    status === 'InReview' ||
    status === 'WaitingAcceptance' ||
    status === 'AwaitingManager' ||
    status === 'AwaitManager' ||
    status === 'PendingPayment' ||
    status === 'Archiving'
  );
}

export function countByStatus(
  rows: IRequestMaster[],
  pred: (status: string) => boolean
): number {
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    if (pred(rows[i].status)) n++;
  }
  return n;
}
