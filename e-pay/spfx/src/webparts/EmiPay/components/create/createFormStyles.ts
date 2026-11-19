import { IComboBoxStyles, ITextFieldStyles, mergeStyles } from '@fluentui/react';
import { payTokens } from '../../theme/payTokens';

/** Khoảng cách Fluent 4px grid. */
export const formSectionGap = 16;
export const formFieldGap = 12;

const fieldHeight = 32;

/** TextField / ComboBox đồng bộ Contoso teal + radius 4 + chiều cao 32. */
export const createTextFieldStyles: Partial<ITextFieldStyles> = {
  root: { width: '100%', minWidth: 0 },
  fieldGroup: {
    borderRadius: 4,
    borderColor: payTokens.line,
    minHeight: fieldHeight,
    selectors: {
      ':hover': { borderColor: payTokens.brandMid },
      '&.is-active': { borderColor: payTokens.brand },
      ':after': { borderRadius: 4, borderColor: payTokens.brand }
    }
  },
  field: { fontSize: 14 },
  subComponentStyles: {
    label: {
      root: {
        fontWeight: 600,
        fontSize: 12,
        color: payTokens.text,
        paddingBottom: 4
      }
    }
  }
};

/** Multiline giữ chiều cao tự nhiên, không ép 32. */
export const createMultilineStyles: Partial<ITextFieldStyles> = {
  ...createTextFieldStyles,
  fieldGroup: {
    borderRadius: 4,
    borderColor: payTokens.line,
    minHeight: 72,
    height: 'auto',
    selectors: {
      ':hover': { borderColor: payTokens.brandMid },
      '&.is-active': { borderColor: payTokens.brand },
      ':after': { borderRadius: 4, borderColor: payTokens.brand }
    }
  }
};

/**
 * ComboBox v8 vẽ border thật trên root `::after` (không phải container).
 * Phải override ::after — borderColor trên container không ăn, dễ còn viền đen.
 */
export const createComboStyles: Partial<IComboBoxStyles> = {
  root: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    selectors: {
      '::after': {
        borderRadius: 4,
        borderColor: payTokens.line,
        borderWidth: 1
      },
      ':hover::after': {
        borderColor: payTokens.brandMid
      },
      '&.is-open::after, &.is-focused::after': {
        borderColor: payTokens.brand,
        borderWidth: 2
      }
    }
  },
  input: { fontSize: 14 },
  label: {
    fontWeight: 600,
    fontSize: 12,
    color: payTokens.text,
    paddingBottom: 4
  },
  optionsContainerWrapper: {
    maxHeight: 280
  },
  container: {
    borderRadius: 4,
    border: 'none',
    minHeight: fieldHeight
  }
};

export const sectionTitle = {
  root: { fontWeight: 600 as const, color: payTokens.text }
};

export const hintText = {
  root: { color: payTokens.muted, lineHeight: 1.45 }
};

export const groupLabel = {
  root: {
    fontWeight: 600 as const,
    fontSize: 12,
    color: payTokens.text
  }
};

/** Ô trong CSS grid — luôn full width. */
export const formCellClass = mergeStyles({
  minWidth: 0,
  width: '100%'
});

/** Hàng 2 cột đều (Fluent khuyến nghị CSS Grid thay Stack wrap lệch). */
export const formGrid2Class = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: formFieldGap,
  width: '100%',
  selectors: {
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr'
    }
  }
});

/** Hàng 3 cột đều. */
export const formGrid3Class = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: formFieldGap,
  width: '100%',
  selectors: {
    '@media (max-width: 720px)': {
      gridTemplateColumns: '1fr'
    }
  }
});
