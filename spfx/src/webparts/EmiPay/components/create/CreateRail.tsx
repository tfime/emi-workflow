import * as React from 'react';
import { Separator, Stack, Text, ThemeProvider } from '@fluentui/react';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { payTokens } from '../../theme/payTokens';
import { cardStack, fillStack, themeHostStyle } from '../detail/detailStyles';
import { hintText, sectionTitle } from './createFormStyles';

export interface ICreateRailProps {
  typeTitle: string;
  title: string;
  amountDisplay: string;
  ouCode: string;
  actorUPN: string;
  partyKindLabel: string;
  nccSummary?: string;
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
        padding: '8px 0',
        borderBottom: `1px solid ${payTokens.line}`
      }
    }}
  >
    <Text variant="small" styles={{ root: { color: payTokens.muted, fontWeight: 500 } }}>
      {label}
    </Text>
    <Text
      variant="small"
      styles={{
        root: {
          textAlign: 'right',
          maxWidth: '62%',
          wordBreak: 'break-word',
          fontWeight: 600
        }
      }}
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
          <Text variant="mediumPlus" styles={{ ...sectionTitle, root: { ...sectionTitle.root, marginBottom: 4 } }}>
            Xem trước
          </Text>
          {kv('Tiêu đề', props.title || '—')}
          {kv('Số tiền', props.amountDisplay)}
          {kv('Đơn vị', props.ouCode || '—')}
          {kv('Đối tượng', props.partyKindLabel || '—')}
          {!!props.nccSummary && kv('NCC', props.nccSummary)}
          {kv('Loại', props.typeTitle || '—')}
          {kv('Người tạo', props.actorUPN)}
          {kv('Checklist', `${props.templateCount} mục · ${props.requiredCount} bắt buộc`)}
        </Stack>
        <Stack tokens={{ childrenGap: 8 }} styles={cardStack}>
          <Text variant="mediumPlus" styles={sectionTitle}>
            Tiếp theo
          </Text>
          <Separator />
          <Text variant="small" styles={hintText}>
            Sau khi tạo: tải đủ tài liệu bắt buộc rồi «Trình trưởng phòng».
          </Text>
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default CreateRail;
