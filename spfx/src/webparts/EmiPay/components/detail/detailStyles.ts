import type * as React from 'react';
import { IStackStyles, IStyle } from '@fluentui/react';
import { payTokens } from '../../theme/payTokens';

/** ThemeProvider không đè nền xám của workspace. */
export const themeHostStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  background: 'transparent'
};

export const fillStack: IStackStyles = {
  root: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box'
  }
};

export const cardStack: IStackStyles = {
  root: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    background: payTokens.card,
    border: `1px solid ${payTokens.line}`,
    borderRadius: payTokens.radius,
    padding: '14px 16px'
  }
};

export const actionBtnStyles = {
  root: {
    minWidth: 0,
    height: 32,
    padding: '0 12px',
    borderRadius: payTokens.radius
  } as IStyle
};

export const compactBtnStyles = {
  root: {
    minWidth: 0,
    height: 28,
    padding: '0 10px',
    borderRadius: payTokens.radius
  } as IStyle
};
