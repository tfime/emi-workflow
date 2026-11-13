import * as React from 'react';
import { MessageBar, MessageBarType, Stack, Text, ThemeProvider } from '@fluentui/react';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import { IRequestMaster } from '../../services/RequestService';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { cardStack, fillStack, themeHostStyle } from '../detail/detailStyles';
import InboxTable from '../inbox/InboxTable';

export interface IAuditPageProps {
  inbox: IRequestMaster[];
  orgMembers: IOrgMember[];
  orgUnits: IOrgUnit[];
  onOpen: (requestKey: string) => void;
}

const AuditPage: React.FC<IAuditPageProps> = (props) => {
  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 14 }} styles={fillStack}>
        <Stack styles={cardStack} tokens={{ childrenGap: 8 }}>
          <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
            Nhật ký nội bộ
          </Text>
          <MessageBar messageBarType={MessageBarType.info}>
            Chỉ đọc ActivityInternal khi quyền cho phép. Khung UI sẵn — nối list nhật ký khi
            kiểm thử trên CECM.
          </MessageBar>
        </Stack>

        <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
          <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
            Hồ sơ gần đây (đối chiếu)
          </Text>
          <InboxTable
            rows={props.inbox}
            searchQuery=""
            orgMembers={props.orgMembers}
            orgUnits={props.orgUnits}
            onOpen={props.onOpen}
            resetToken="audit"
          />
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default AuditPage;
