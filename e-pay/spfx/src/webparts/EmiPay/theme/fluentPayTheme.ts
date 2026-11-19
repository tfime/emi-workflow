import { createTheme, ITheme } from '@fluentui/react';
import { payTokens } from './payTokens';

/** Theme Fluent 8 — Contoso teal, bán kính 4px (khớp payTokens). */
export const emiPayFluentTheme: ITheme = createTheme({
  defaultFontStyle: {
    fontFamily:
      '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif',
    fontWeight: 400
  },
  fonts: {
    medium: { fontSize: 14 },
    mediumPlus: { fontSize: 15 },
    large: { fontSize: 17 },
    xLarge: { fontSize: 20 },
    xxLarge: { fontSize: 24 }
  },
  palette: {
    themePrimary: payTokens.brand,
    themeLighterAlt: '#f3faf9',
    themeLighter: payTokens.brandSoft,
    themeLight: '#a7d9d3',
    themeTertiary: '#4fb8ad',
    themeSecondary: payTokens.brandMid,
    themeDarkAlt: '#0d6b64',
    themeDark: payTokens.brandDark,
    themeDarker: '#084540',
    neutralLighterAlt: '#fafafa',
    neutralLighter: payTokens.surface,
    neutralLight: payTokens.line,
    neutralQuaternaryAlt: '#e1e1e1',
    neutralQuaternary: '#d2d2d2',
    neutralTertiaryAlt: '#c8c8c8',
    neutralTertiary: '#a19f9d',
    neutralSecondary: payTokens.muted,
    neutralPrimaryAlt: '#3b3a39',
    neutralPrimary: payTokens.text,
    neutralDark: '#201f1e',
    black: '#000000',
    white: payTokens.card
  },
  effects: {
    roundedCorner2: '4px'
  },
  /** Input Fluent: border xám nhạt (không đen từ neutralSecondary). */
  semanticColors: {
    inputBorder: payTokens.line,
    inputBorderHovered: payTokens.brandMid,
    inputFocusBorderAlt: payTokens.brand,
    inputBackground: payTokens.card,
    inputBackgroundChecked: payTokens.brand,
    inputBackgroundCheckedHovered: payTokens.brandDark,
    inputForegroundChecked: payTokens.card,
    inputPlaceholderText: payTokens.muted,
    disabledBorder: payTokens.line,
    focusBorder: payTokens.brand,
    smallInputBorder: payTokens.line
  }
});
