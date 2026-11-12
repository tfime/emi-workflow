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

function isCanvasChrome(node: HTMLElement): boolean {
  const id: string = node.id || '';
  const cls: string = classNameOf(node);
  const autoId: string = node.getAttribute('data-automation-id') || '';
  return (
    id === 'workbenchPageContent' ||
    id === 'spPageCanvasContent' ||
    cls.indexOf('SPCanvas') >= 0 ||
    cls.indexOf('CanvasComponent') >= 0 ||
    cls.indexOf('CanvasZone') >= 0 ||
    cls.indexOf('CanvasSection') >= 0 ||
    cls.indexOf('ControlZone') >= 0 ||
    autoId === 'CanvasZone' ||
    autoId === 'CanvasSection' ||
    autoId === 'CanvasControl' ||
    autoId === 'contentScrollRegion' ||
    autoId.indexOf('CanvasZone') === 0
  );
}

const FULL_BLEED_STYLE_ID: string = 'emi-pay-full-bleed-style';

function ensureFullBleedStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(FULL_BLEED_STYLE_ID)) {
    return;
  }
  const style: HTMLStyleElement = document.createElement('style');
  style.id = FULL_BLEED_STYLE_ID;
  style.textContent = `
    #workbenchPageContent,
    #spPageCanvasContent,
    .SPCanvas,
    .CanvasComponent,
    .CanvasZone,
    .CanvasSection,
    .ControlZone,
    .ControlZone--clean,
    [data-automation-id="CanvasZone"],
    [data-automation-id="CanvasSection"],
    [data-automation-id="CanvasControl"],
    [data-automation-id="contentScrollRegion"],
    [data-automation-id^="CanvasZone"] {
      max-width: none !important;
      width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
}

function flushToFrame(domElement: HTMLElement, section: HTMLElement | undefined): void {
  const frame: HTMLElement = section || domElement.parentElement || domElement;
  const hostRect: DOMRect = domElement.getBoundingClientRect();
  const frameRect: DOMRect = frame.getBoundingClientRect();
  const leftGap: number = Math.round(hostRect.left - frameRect.left);

  if (leftGap > 0) {
    domElement.style.marginLeft = `-${leftGap}px`;
    domElement.style.width = `calc(100% + ${leftGap}px)`;
    domElement.style.maxWidth = 'none';
  } else {
    domElement.style.marginLeft = '0';
    domElement.style.width = '100%';
    domElement.style.maxWidth = 'none';
  }
}

/** Stretch SharePoint canvas so EMI PAY uses full section width (same as emi-uikit). */
export function expandCanvasParents(domElement: HTMLElement): void {
  ensureFullBleedStyles();

  domElement.style.marginLeft = '0';
  domElement.style.marginRight = '0';
  domElement.style.width = '100%';
  domElement.style.maxWidth = 'none';
  domElement.style.boxSizing = 'border-box';

  let section: HTMLElement | undefined = undefined;
  let node: HTMLElement | undefined = domElement.parentElement || undefined;
  while (node && node !== document.body) {
    if (isCanvasChrome(node)) {
      node.style.setProperty('padding-left', '0', 'important');
      node.style.setProperty('padding-right', '0', 'important');
      node.style.setProperty('margin-left', '0', 'important');
      node.style.setProperty('margin-right', '0', 'important');
      node.style.setProperty('max-width', 'none', 'important');
      node.style.setProperty('width', '100%', 'important');
      section = node;
    }
    if (
      classNameOf(node).indexOf('CanvasZone') >= 0 ||
      node.id === 'workbenchPageContent' ||
      node.id === 'spPageCanvasContent'
    ) {
      section = node;
      break;
    }
    node = node.parentElement || undefined;
  }

  window.requestAnimationFrame(() => {
    flushToFrame(domElement, section);
    window.setTimeout(() => flushToFrame(domElement, section), 50);
    window.setTimeout(() => flushToFrame(domElement, section), 250);
  });
}
