import * as React from 'react';
import {
  ChoiceGroup,
  IChoiceGroupOption,
  IChoiceGroupStyles,
  Stack,
  Text,
  TextField
} from '@fluentui/react';
import { IPartyBizInfo, PartyKind } from '../../services/partyBiz';
import {
  createTextFieldStyles,
  formCellClass,
  formFieldGap,
  formGrid2Class,
  formGrid3Class,
  hintText
} from '../create/createFormStyles';
import { payTokens } from '../../theme/payTokens';

export interface IPartyBizFieldsProps {
  value: IPartyBizInfo;
  disabled?: boolean;
  onChange: (next: IPartyBizInfo) => void;
}

const KIND_OPTIONS: IChoiceGroupOption[] = [
  { key: 'CBNV', text: 'CBNV — Cán bộ nhân viên' },
  { key: 'NCC', text: 'NCC — Nhà cung cấp' }
];

const choiceStyles: IChoiceGroupStyles = {
  root: { marginTop: 0 },
  label: {
    fontWeight: 600,
    fontSize: 12,
    color: payTokens.text,
    paddingBottom: 6
  },
  flexContainer: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    selectors: {
      '& > *': { marginRight: 24, marginBottom: 4 }
    }
  }
};

const PartyBizFields: React.FC<IPartyBizFieldsProps> = (props) => {
  const v = props.value;
  const selected: PartyKind = v.partyKind === 'NCC' ? 'NCC' : 'CBNV';

  const set = (patch: Partial<IPartyBizInfo>): void => {
    props.onChange({ ...v, ...patch });
  };

  return (
    <Stack tokens={{ childrenGap: formFieldGap }}>
      <ChoiceGroup
        label="Đối tượng thanh toán"
        selectedKey={selected}
        options={KIND_OPTIONS}
        styles={choiceStyles}
        disabled={props.disabled}
        onChange={(_, opt) => {
          const kind = (opt?.key || 'CBNV') as PartyKind;
          if (kind === 'CBNV') {
            props.onChange({
              partyKind: 'CBNV',
              project: '',
              packageItem: '',
              contractNo: '',
              currency: '',
              paymentTimes: ''
            });
            return;
          }
          set({ partyKind: 'NCC' });
        }}
      />

      {selected === 'NCC' && (
        <Stack tokens={{ childrenGap: formFieldGap }}>
          <Text variant="small" styles={hintText}>
            Điền thông tin hợp đồng (text tạm, chưa liên kết danh mục).
          </Text>
          <div className={formGrid2Class}>
            <div className={formCellClass}>
              <TextField
                label="Dự án"
                required
                value={v.project}
                disabled={props.disabled}
                placeholder="Tên dự án"
                onChange={(_, t) => set({ project: t || '' })}
                styles={createTextFieldStyles}
              />
            </div>
            <div className={formCellClass}>
              <TextField
                label="Hạng mục / gói thầu / KMCP"
                required
                value={v.packageItem}
                disabled={props.disabled}
                placeholder="Hạng mục hoặc mã KMCP"
                onChange={(_, t) => set({ packageItem: t || '' })}
                styles={createTextFieldStyles}
              />
            </div>
          </div>
          <div className={formGrid3Class}>
            <div className={formCellClass}>
              <TextField
                label="Hợp đồng số"
                required
                value={v.contractNo}
                disabled={props.disabled}
                placeholder="Số hợp đồng"
                onChange={(_, t) => set({ contractNo: t || '' })}
                styles={createTextFieldStyles}
              />
            </div>
            <div className={formCellClass}>
              <TextField
                label="Loại tiền"
                required
                value={v.currency}
                disabled={props.disabled}
                placeholder="VND"
                onChange={(_, t) => set({ currency: t || '' })}
                styles={createTextFieldStyles}
              />
            </div>
            <div className={formCellClass}>
              <TextField
                label="Lần thanh toán"
                required
                value={v.paymentTimes}
                disabled={props.disabled}
                placeholder="Đợt 1"
                onChange={(_, t) => set({ paymentTimes: t || '' })}
                styles={createTextFieldStyles}
              />
            </div>
          </div>
        </Stack>
      )}
    </Stack>
  );
};

export default PartyBizFields;
