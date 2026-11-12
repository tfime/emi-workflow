import * as React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react';

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
    <MessageBar
      messageBarType={mapType(notice.kind)}
      isMultiline={notice.text.length > 80}
      onDismiss={onDismiss}
      dismissButtonAriaLabel="Đóng thông báo"
    >
      {notice.text}
    </MessageBar>
  );
};

export default PayNoticeBar;
