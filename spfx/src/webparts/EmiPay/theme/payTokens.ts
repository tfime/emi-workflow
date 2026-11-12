import type * as React from 'react';

/**
 * EMI PAY design lock (aligned with emi-uikit Contoso).
 *
 * Shell: full-bleed canvas + topBar + leftNav + scrollable main (100vh − suite bar).
 * Color: brand teal, light surface, white cards, Segoe UI.
 * Feedback: Fluent Dialog + Spinner for waiting; MessageBar for result/error.
 * Never use debug toasts for create / upload / command wait.
 * Copy: Vietnamese with diacritics; role sees only their work + allowed actions.
 */
export const payTokens = {
  brand: '#0f766e',
  brandDark: '#0c5f59',
  brandMid: '#1aa394',
  brandSoft: '#e7f5f3',
  surface: '#eef1f4',
  card: '#ffffff',
  text: '#1f2328',
  muted: '#5c6570',
  line: '#e2e6ea',
  ok: '#0b6a0b',
  okSoft: '#dff6dd',
  warn: '#8a6116',
  warnSoft: '#fff4ce',
  danger: '#a4262c',
  dangerSoft: '#fde7e9',
  info: '#0f6cbd',
  infoSoft: '#e8f3fc',
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
  ['--emi-line' as string]: payTokens.line
};
