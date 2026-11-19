import * as React from 'react';
import { Dialog, DialogType, Spinner, SpinnerSize, ThemeProvider } from '@fluentui/react';
import { emiPayFluentTheme } from '../theme/fluentPayTheme';
import { themeHostStyle } from './detail/detailStyles';

export interface IBusyDialogProps {
  open: boolean;
  title?: string;
  message: string;
}

/** Blocking wait state — create / upload / command poll. Not a toast. */
const BusyDialog: React.FC<IBusyDialogProps> = ({ open, title, message }) => {
  if (!open) {
    return null;
  }

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Dialog
        hidden={false}
        dialogContentProps={{
          type: DialogType.normal,
          title: title || 'Đang xử lý'
        }}
        modalProps={{
          isBlocking: true,
          styles: { main: { maxWidth: 420 } }
        }}
      >
        <div style={{ padding: '12px 0 8px' }}>
          <Spinner size={SpinnerSize.large} label={message} ariaLive="assertive" />
        </div>
      </Dialog>
    </ThemeProvider>
  );
};

export default BusyDialog;
