import { PayView } from '../components/types';

export type PayInboxFilter = 'all' | 'todo' | 'mine';

export interface IPayRoute {
  view: PayView;
  inboxFilter: PayInboxFilter;
  requestKey?: string;
}

const LIVE_VIEWS: PayView[] = ['inbox', 'create', 'detail', 'audit', 'dashboard'];
const INBOX_FILTERS: PayInboxFilter[] = ['all', 'todo', 'mine'];
const RK_SAFE = /^[A-Za-z0-9._-]+$/;

function isLiveView(v: string): v is PayView {
  return LIVE_VIEWS.indexOf(v as PayView) >= 0;
}

function isInboxFilter(v: string): v is PayInboxFilter {
  return INBOX_FILTERS.indexOf(v as PayInboxFilter) >= 0;
}

/** Bỏ `#` và slash thừa. */
function hashBody(hash: string): string {
  let h = (hash || '').replace(/^#/, '');
  if (h.charAt(0) === '/') h = h.slice(1);
  return h;
}

/**
 * Parse `#emi/inbox/todo` | `#emi/detail/PAY-...` | `#emi/create` | `#emi/audit`.
 * Hash lạ / thiếu → inbox/all.
 */
export function parsePayHash(hash: string): IPayRoute {
  const body = hashBody(hash);
  const parts = body.split('/').filter((p) => !!p);
  if (!parts.length || parts[0].toLowerCase() !== 'emi') {
    return { view: 'inbox', inboxFilter: 'all' };
  }

  const viewRaw = (parts[1] || 'inbox').toLowerCase();
  if (!isLiveView(viewRaw)) {
    return { view: 'inbox', inboxFilter: 'all' };
  }

  if (viewRaw === 'inbox') {
    const f = (parts[2] || 'all').toLowerCase();
    // «todo» gộp vào «Việc của tôi» (all) — giữ parse cũ để bookmark không gãy.
    if (f === 'todo') {
      return { view: 'inbox', inboxFilter: 'all' };
    }
    return {
      view: 'inbox',
      inboxFilter: isInboxFilter(f) ? f : 'all'
    };
  }

  if (viewRaw === 'detail') {
    const rk = parts[2] || '';
    if (rk && RK_SAFE.test(rk)) {
      return { view: 'detail', inboxFilter: 'all', requestKey: rk };
    }
    return { view: 'inbox', inboxFilter: 'all' };
  }

  return { view: viewRaw, inboxFilter: 'all' };
}

export function buildPayHash(route: IPayRoute): string {
  const view = isLiveView(route.view) ? route.view : 'inbox';
  if (view === 'inbox') {
    const f = isInboxFilter(route.inboxFilter) ? route.inboxFilter : 'all';
    return `#emi/inbox/${f}`;
  }
  if (view === 'detail') {
    const rk = (route.requestKey || '').trim();
    if (rk && RK_SAFE.test(rk)) {
      return `#emi/detail/${rk}`;
    }
    return '#emi/inbox/all';
  }
  return `#emi/${view}`;
}

export function applyPayHash(
  route: IPayRoute,
  mode: 'push' | 'replace'
): void {
  const hash = buildPayHash(route);
  if (window.location.hash === hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (mode === 'replace') {
    window.history.replaceState(window.history.state, '', url);
  } else {
    window.history.pushState(window.history.state, '', url);
  }
}

export function samePayRoute(a: IPayRoute, b: IPayRoute): boolean {
  return (
    a.view === b.view &&
    a.inboxFilter === b.inboxFilter &&
    (a.requestKey || '') === (b.requestKey || '')
  );
}
