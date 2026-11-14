import * as React from 'react';
import {
  Dropdown,
  IDropdownOption,
  Stack,
  Text,
  ThemeProvider
} from '@fluentui/react';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import {
  ACT_AS_REQUESTER,
  SYSADM_UPN,
  memberKey
} from '../../services/actorAuth';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { themeHostStyle } from '../detail/detailStyles';

export interface IAppHeaderProps {
  title: string;
  isSysAdmin: boolean;
  actAsValue: string;
  orgMembers: IOrgMember[];
  orgUnits: IOrgUnit[];
  onActAsChange: (key: string) => void;
}

const AppHeader: React.FC<IAppHeaderProps> = (props) => {
  const options: IDropdownOption[] = [
    {
      key: '',
      text: `Quản trị (${SYSADM_UPN}) — không thao tác hồ sơ`
    },
    {
      key: ACT_AS_REQUESTER,
      text: 'Người tạo hồ sơ (tạm) — chọn phòng, không duyệt/chốt'
    },
    ...props.orgMembers.map((m) => {
      const ou = props.orgUnits.filter((u) => u.ouCode === m.ouCode)[0];
      const role = m.memberRole === 'Manager' ? 'Trưởng phòng' : 'Thành viên kiểm tra';
      return {
        key: memberKey(m),
        text: `${m.displayName} · ${role} · ${ou ? ou.ouName : m.ouCode}`
      };
    })
  ];

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="center"
        tokens={{ childrenGap: 12 }}
        styles={{
          root: {
            flexShrink: 0,
            padding: '10px 16px',
            background: '#fff',
            borderBottom: '1px solid #e5e7eb',
            zIndex: 2,
            minWidth: 0
          }
        }}
      >
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }} styles={{ root: { minWidth: 0 } }}>
          <Stack
            horizontalAlign="center"
            verticalAlign="center"
            styles={{
              root: {
                width: 36,
                height: 36,
                borderRadius: 4,
                background: '#0f766e',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.04em',
                flexShrink: 0
              }
            }}
          >
            PAY
          </Stack>
          <Stack tokens={{ childrenGap: 2 }} styles={{ root: { minWidth: 0 } }}>
            <Text
              styles={{
                root: {
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: '22px',
                  color: '#111111',
                  whiteSpace: 'nowrap'
                }
              }}
            >
              {props.title || 'EMI PAY'}
            </Text>
            <Text
              variant="small"
              styles={{ root: { color: '#4b5563', lineHeight: '16px' } }}
            >
              Hồ sơ thanh toán
            </Text>
          </Stack>
        </Stack>

        {props.isSysAdmin && (
          <Stack
            horizontal
            verticalAlign="center"
            tokens={{ childrenGap: 8 }}
            styles={{ root: { flexShrink: 0, minWidth: 0 } }}
          >
            <Text variant="small" styles={{ root: { color: '#4b5563', whiteSpace: 'nowrap' } }}>
              Đóng vai
            </Text>
            <Dropdown
              id="emiPayActAs"
              selectedKey={props.actAsValue}
              options={options}
              onChange={(_, opt) => props.onActAsChange(opt ? String(opt.key) : '')}
              styles={{
                root: { minWidth: 220, maxWidth: 360 },
                dropdown: { borderRadius: 4 }
              }}
            />
          </Stack>
        )}
      </Stack>
    </ThemeProvider>
  );
};

export default AppHeader;
