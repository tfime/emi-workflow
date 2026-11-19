import type * as React from 'react';

/**
 * EMI PAY tokens — khớp ui-preview/emi-pay-v2.html
 */
export const payTokens = {
  brand: '#0f766e',
  brandDark: '#0c5f59',
  brandMid: '#1aa394',
  brandSoft: '#e7f5f3',
  surface: '#f3f4f6',
  card: '#ffffff',
  text: '#111111',
  muted: '#4b5563',
  line: '#e5e7eb',
  ok: '#166534',
  okSoft: '#dcfce7',
  warn: '#92400e',
  warnSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  info: '#1d4ed8',
  infoSoft: '#dbeafe',
  radius: '4px',
  navW: '232px',
  railW: '300px',
  suiteBarOffset: '48px'
} as const;

export const payThemeStyle: React.CSSProperties = {
  ['--emi-brand' as string]: payTokens.brand,
  ['--emi-brand-dark' as string]: payTokens.brandDark,
  ['--emi-brand-mid' as string]: payTokens.brandMid,
  ['--emi-brand-soft' as string]: payTokens.brandSoft,
  ['--emi-surface' as string]: payTokens.surface,
  ['--emi-card' as string]: payTokens.card,
  ['--emi-text' as string]: payTokens.text,
  ['--emi-muted' as string]: payTokens.muted,
  ['--emi-line' as string]: payTokens.line,
  ['--emi-ok' as string]: payTokens.ok,
  ['--emi-ok-soft' as string]: payTokens.okSoft,
  ['--emi-warn' as string]: payTokens.warn,
  ['--emi-warn-soft' as string]: payTokens.warnSoft,
  ['--emi-danger' as string]: payTokens.danger,
  ['--emi-danger-soft' as string]: payTokens.dangerSoft,
  ['--emi-info' as string]: payTokens.info,
  ['--emi-info-soft' as string]: payTokens.infoSoft,
  ['--emi-radius' as string]: payTokens.radius
};
