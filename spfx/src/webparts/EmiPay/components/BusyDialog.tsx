import * as React from 'react';
import { Dialog, DialogType, Spinner, SpinnerSize } from '@fluentui/react';

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
  );
};

export default BusyDialog;
