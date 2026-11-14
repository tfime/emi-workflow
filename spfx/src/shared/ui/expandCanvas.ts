/**
 * EMI PAY — phủ đúng vùng nhìn thấy của SharePoint, khóa cuộn trang.
 *
 * Cách làm chắc: `position: fixed` theo `contentScrollRegion` (không phụ thuộc
 * chuỗi flex ancestor / bản xem trước). Cuộn chỉ còn trong app.
 */

function classNameOf(node: HTMLElement): string {
  const raw: string | SVGAnimatedString | undefined = node.className as
    | string
    | SVGAnimatedString
    | undefined;
  if (typeof raw === 'string') {
    return raw;
  }
  return node.getAttribute('class') || '';
}

function findContentScrollRegion(from: HTMLElement): HTMLElement | undefined {
  const byAttr = document.querySelector(
    '[data-automation-id="contentScrollRegion"]'
  ) as HTMLElement | null;
  if (byAttr) return byAttr;

  let node: HTMLElement | null = from;
  while (node && node !== document.body) {
    const autoId = node.getAttribute('data-automation-id') || '';
    const cls = classNameOf(node);
    if (autoId === 'contentScrollRegion' || cls.indexOf('scrollRegion') >= 0) {
      return node;
    }
    node = node.parentElement;
  }
  return undefined;
}

const FULL_BLEED_STYLE_ID: string = 'emi-pay-full-bleed-style';
const BODY_LOCK_CLASS: string = 'emi-pay-viewport-lock';
const SPACER_ATTR: string = 'data-emi-pay-spacer';

function ensureFullBleedStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(FULL_BLEED_STYLE_ID)) {
    return;
  }
  const style: HTMLStyleElement = document.createElement('style');
  style.id = FULL_BLEED_STYLE_ID;
  style.textContent = `
    body.${BODY_LOCK_CLASS} [data-automation-id="contentScrollRegion"],
    body.${BODY_LOCK_CLASS} [class*="scrollRegion_"] {
      overflow: hidden !important;
      overflow-x: hidden !important;
      overflow-y: hidden !important;
    }

    body.${BODY_LOCK_CLASS} [data-automation-id="pageHeader"],
    body.${BODY_LOCK_CLASS} [data-automation-id="titleRegion"],
    body.${BODY_LOCK_CLASS} [data-automation-id="CanvasControl"] > div[class*="comments"],
    body.${BODY_LOCK_CLASS} div[class*="commentsWrapper"],
    body.${BODY_LOCK_CLASS} div[class*="CommentsWrapper"] {
      display: none !important;
      height: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    body.${BODY_LOCK_CLASS} #workbenchPageContent,
    body.${BODY_LOCK_CLASS} #spPageCanvasContent,
    body.${BODY_LOCK_CLASS} .CanvasZone,
    body.${BODY_LOCK_CLASS} .CanvasSection,
    body.${BODY_LOCK_CLASS} .ControlZone,
    body.${BODY_LOCK_CLASS} [data-automation-id="CanvasZone"],
    body.${BODY_LOCK_CLASS} [data-automation-id="CanvasSection"],
    body.${BODY_LOCK_CLASS} [data-automation-id="CanvasControl"] {
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }

    .emiPayHost {
      display: flex !important;
      flex-direction: column !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: #f3f4f6;
    }

    .emiPayHost > div {
      flex: 1 1 auto !important;
      width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      max-height: 100% !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }
  `;
  document.head.appendChild(style);
}

function ensureSpacer(domElement: HTMLElement): HTMLElement {
  const parent = domElement.parentElement;
  if (!parent) {
    const fake = document.createElement('div');
    return fake;
  }
  let spacer = parent.querySelector(`[${SPACER_ATTR}]`) as HTMLElement | null;
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.setAttribute(SPACER_ATTR, '1');
    spacer.style.cssText =
      'width:100%;margin:0;padding:0;border:0;pointer-events:none;visibility:hidden;';
    parent.insertBefore(spacer, domElement);
  }
  return spacer;
}

/** Đáy chrome SP/Workbench dính phía trên — tránh pin host dưới suite/command bar che tên app. */
function stickyChromeBottom(): number {
  const selectors = [
    '#SuiteNavWrapper',
    '#spSiteHeader',
    '#spCommandBar',
    '[data-automationid="TopBar"]',
    '[data-automation-id="TopBar"]',
    '[data-automation-id="pageCommandBar"]',
    '.spAppBar',
    '[class*="commandBarWrapper"]',
    '[class*="simpleHeader"]'
  ];
  let bottom = 0;
  for (let i = 0; i < selectors.length; i++) {
    const nodes = document.querySelectorAll(selectors[i]);
    for (let j = 0; j < nodes.length; j++) {
      const el = nodes[j] as HTMLElement;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < 40) continue;
      // Chỉ tính thanh nằm sát mép trên viewport.
      if (r.top > 8 || r.bottom > 200) continue;
      if (r.bottom > bottom) bottom = r.bottom;
    }
  }
  return Math.round(bottom);
}

function pinHostToRegion(domElement: HTMLElement, region: HTMLElement): void {
  domElement.classList.add('emiPayHost');

  const rect = region.getBoundingClientRect();
  const chrome = stickyChromeBottom();
  const top = Math.max(0, Math.round(Math.max(rect.top, chrome)));
  const left = Math.max(0, Math.round(rect.left));
  const width = Math.max(320, Math.round(rect.width));
  const height = Math.max(280, Math.round(Math.min(rect.bottom, window.innerHeight) - top));

  const spacer = ensureSpacer(domElement);
  spacer.style.height = `${height}px`;

  domElement.style.setProperty('position', 'fixed', 'important');
  domElement.style.setProperty('top', `${top}px`, 'important');
  domElement.style.setProperty('left', `${left}px`, 'important');
  domElement.style.setProperty('right', 'auto', 'important');
  domElement.style.setProperty('bottom', 'auto', 'important');
  domElement.style.setProperty('width', `${width}px`, 'important');
  domElement.style.setProperty('height', `${height}px`, 'important');
  domElement.style.setProperty('max-width', `${width}px`, 'important');
  domElement.style.setProperty('max-height', `${height}px`, 'important');
  domElement.style.setProperty('min-height', `${height}px`, 'important');
  domElement.style.setProperty('margin', '0', 'important');
  domElement.style.setProperty('z-index', '3', 'important');
  domElement.style.setProperty('overflow', 'hidden', 'important');
  domElement.style.setProperty('--emi-sp-top', `${top}px`);

  const app = domElement.querySelector(
    '[class*="app_"], [class^="app"], [class*=" app"]'
  ) as HTMLElement | null;
  const first = (app || domElement.firstElementChild) as HTMLElement | null;
  if (first) {
    first.style.setProperty('height', '100%', 'important');
    first.style.setProperty('min-height', '0', 'important');
    first.style.setProperty('max-height', '100%', 'important');
    first.style.setProperty('width', '100%', 'important');
    first.style.setProperty('overflow', 'hidden', 'important');
  }
}

function lockRegion(region: HTMLElement): void {
  region.style.setProperty('overflow', 'hidden', 'important');
  region.style.setProperty('overflow-x', 'hidden', 'important');
  region.style.setProperty('overflow-y', 'hidden', 'important');
  region.scrollTop = 0;
}

let resizeObserver: ResizeObserver | undefined;
let pinnedHost: HTMLElement | undefined;

function observeAndPin(region: HTMLElement, host: HTMLElement): void {
  const apply = (): void => {
    lockRegion(region);
    pinHostToRegion(host, region);
  };

  if (typeof ResizeObserver !== 'undefined') {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => apply());
    resizeObserver.observe(region);
    resizeObserver.observe(document.documentElement);
  }

  window.requestAnimationFrame(() => {
    apply();
    window.setTimeout(apply, 50);
    window.setTimeout(apply, 250);
    window.setTimeout(apply, 800);
  });
}

/** Phủ full vùng cuộn SP + khóa scroll trang. */
export function expandCanvasParents(domElement: HTMLElement): void {
  ensureFullBleedStyles();
  document.body.classList.add(BODY_LOCK_CLASS);
  pinnedHost = domElement;

  const region = findContentScrollRegion(domElement);
  if (!region) {
    // Fallback: fill tới đáy viewport, dưới chrome SP nếu có.
    const chrome = stickyChromeBottom();
    const top = Math.max(
      chrome,
      Math.round(domElement.getBoundingClientRect().top)
    );
    const h = Math.max(280, Math.round(window.innerHeight - top));
    domElement.classList.add('emiPayHost');
    domElement.style.setProperty('position', 'fixed', 'important');
    domElement.style.setProperty('top', `${top}px`, 'important');
    domElement.style.setProperty('left', '0', 'important');
    domElement.style.setProperty('width', '100%', 'important');
    domElement.style.setProperty('height', `${h}px`, 'important');
    domElement.style.setProperty('max-height', `${h}px`, 'important');
    domElement.style.setProperty('overflow', 'hidden', 'important');
    domElement.style.setProperty('--emi-sp-top', `${top}px`);
    return;
  }

  lockRegion(region);
  observeAndPin(region, domElement);
}

/** Gỡ khi dispose webpart. */
export function releaseCanvasParents(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.remove(BODY_LOCK_CLASS);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = undefined;
  }

  if (pinnedHost) {
    const parent = pinnedHost.parentElement;
    if (parent) {
      const spacer = parent.querySelector(`[${SPACER_ATTR}]`);
      if (spacer && spacer.parentElement) {
        spacer.parentElement.removeChild(spacer);
      }
    }
    pinnedHost.classList.remove('emiPayHost');
    pinnedHost.style.removeProperty('position');
    pinnedHost.style.removeProperty('top');
    pinnedHost.style.removeProperty('left');
    pinnedHost.style.removeProperty('right');
    pinnedHost.style.removeProperty('bottom');
    pinnedHost.style.removeProperty('width');
    pinnedHost.style.removeProperty('height');
    pinnedHost.style.removeProperty('max-width');
    pinnedHost.style.removeProperty('max-height');
    pinnedHost.style.removeProperty('min-height');
    pinnedHost.style.removeProperty('z-index');
    pinnedHost = undefined;
  }
}
