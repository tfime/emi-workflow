import * as React from 'react';
import { MessageBar, MessageBarType, ThemeProvider } from '@fluentui/react';
import { emiPayFluentTheme } from '../theme/fluentPayTheme';
import { themeHostStyle } from './detail/detailStyles';

export type PayNoticeKind = 'success' | 'error' | 'warning' | 'info';

export interface IPayNotice {
  kind: PayNoticeKind;
  text: string;
}

export interface IPayNoticeBarProps {
  notice?: IPayNotice;
  onDismiss?: () => void;
}

const mapType = (kind: PayNoticeKind): MessageBarType => {
  switch (kind) {
    case 'success':
      return MessageBarType.success;
    case 'error':
      return MessageBarType.error;
    case 'warning':
      return MessageBarType.warning;
    default:
      return MessageBarType.info;
  }
};

/** Persistent result / validation feedback (replaces debug toasts). */
const PayNoticeBar: React.FC<IPayNoticeBarProps> = ({ notice, onDismiss }) => {
  if (!notice || !notice.text) {
    return null;
  }

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <MessageBar
        messageBarType={mapType(notice.kind)}
        isMultiline={notice.text.length > 80}
        onDismiss={onDismiss}
        dismissButtonAriaLabel="Đóng thông báo"
        styles={{ root: { marginBottom: 4 } }}
      >
        {notice.text}
      </MessageBar>
    </ThemeProvider>
  );
};

export default PayNoticeBar;
