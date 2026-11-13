import * as React from 'react';
import { Stack, Text, ThemeProvider } from '@fluentui/react';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { cardStack, fillStack, themeHostStyle } from '../detail/detailStyles';

export interface ICreateRailProps {
  typeTitle: string;
  title: string;
  amountDisplay: string;
  ouCode: string;
  actorUPN: string;
  templateCount: number;
  requiredCount: number;
}

const kv = (label: string, value: React.ReactNode): React.ReactNode => (
  <Stack
    horizontal
    horizontalAlign="space-between"
    tokens={{ childrenGap: 8 }}
    styles={{
      root: {
        padding: '7px 0',
        borderBottom: '1px solid #e5e7eb'
      }
    }}
  >
    <Text variant="small" styles={{ root: { color: '#4b5563', fontWeight: 500 } }}>
      {label}
    </Text>
    <Text
      variant="small"
      styles={{ root: { textAlign: 'right', maxWidth: '62%', wordBreak: 'break-word' } }}
    >
      {value}
    </Text>
  </Stack>
);

const CreateRail: React.FC<ICreateRailProps> = (props) => {
  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 12 }} styles={fillStack}>
        <Stack tokens={{ childrenGap: 2 }} styles={cardStack}>
          <Text variant="mediumPlus" styles={{ root: { fontWeight: 600, marginBottom: 4 } }}>
            Xem trước
          </Text>
          {kv('Loại', props.typeTitle || '—')}
          {kv('Tiêu đề', props.title || '—')}
          {kv('Số tiền', props.amountDisplay)}
          {kv('Đơn vị', props.ouCode || '—')}
          {kv('Người tạo', props.actorUPN)}
          {kv('Checklist', `${props.templateCount} mục · ${props.requiredCount} bắt buộc`)}
        </Stack>
        <Stack tokens={{ childrenGap: 6 }} styles={cardStack}>
          <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
            Gợi ý
          </Text>
          <Text variant="small" styles={{ root: { color: '#4b5563', lineHeight: 1.45 } }}>
            Sau khi tạo: tải đủ tài liệu bắt buộc rồi mới «Gửi hồ sơ».
          </Text>
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default CreateRail;
