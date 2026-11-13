import * as React from 'react';
import { PrimaryButton, Stack, Text, TextField } from '@fluentui/react';
import { IOrgUnit, IStepRecipient } from '../../services/ConfigService';
import { IRequestMaster } from '../../services/RequestService';
import SearchableSelect from '../forms/SearchableSelect';
import { actionBtnStyles, cardStack } from './detailStyles';

export interface IEditRouteStep {
  key: string;
  label: string;
}

export interface IEditBusinessFieldsProps {
  master: IRequestMaster;
  busy: boolean;
  editTitle: string;
  editAmount: string;
  editExpl: string;
  editOu: string;
  editRoutePlan: Record<string, string>;
  orgUnits: IOrgUnit[];
  stepRecipients: IStepRecipient[];
  routeStepsUi: IEditRouteStep[];
  actorOuCode: string;
  defaultOuForStep: (stepKey: string, recipients: IStepRecipient[]) => string;
  onTitleChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onExplChange: (v: string) => void;
  onOuChange: (v: string) => void;
  onRouteChange: (stepKey: string, ouCode: string) => void;
  onSave: () => void;
}

const EditBusinessFields: React.FC<IEditBusinessFieldsProps> = (props) => {
  const ouOptions =
    props.orgUnits.length === 0
      ? [
          {
            value: props.editOu || 'OU_TONGHOP',
            label: props.editOu || 'OU_TONGHOP',
            hint: props.editOu || 'OU_TONGHOP'
          }
        ]
      : props.orgUnits.map((o) => ({
          value: o.ouCode,
          label: o.ouName || o.ouCode,
          hint: o.ouCode
        }));

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={cardStack}>
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
        <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
          Sửa thông tin hồ sơ
        </Text>
        <Text variant="small" styles={{ root: { color: '#92400e', fontWeight: 600 } }}>
          {props.master.status === 'Returned' ? 'Đã trả về' : 'Nháp'}
        </Text>
      </Stack>

      <TextField
        label="Tiêu đề hồ sơ"
        value={props.editTitle}
        onChange={(_, v) => props.onTitleChange(v || '')}
        placeholder="Ví dụ: Thanh toán công tác tháng 11…"
        disabled={props.busy}
      />

      <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
        <TextField
          label="Số tiền đề nghị (VND)"
          value={props.editAmount}
          onChange={(_, v) => props.onAmountChange(v || '')}
          inputMode="decimal"
          placeholder="Ví dụ: 1.000.000,50"
          disabled={props.busy}
          styles={{ root: { minWidth: 200, flex: 1 } }}
        />
        <Stack styles={{ root: { minWidth: 200, flex: 1 } }}>
          <Text variant="small" styles={{ root: { fontWeight: 600, marginBottom: 5 } }}>
            Đơn vị khởi tạo
          </Text>
          <SearchableSelect
            options={ouOptions}
            value={props.editOu}
            disabled={props.busy || !!props.actorOuCode}
            placeholder="Gõ tên phòng…"
            emptyText="Không tìm thấy phòng"
            onChange={props.onOuChange}
          />
        </Stack>
      </Stack>

      <Stack tokens={{ childrenGap: 8 }}>
        <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
          Phòng nhận kiểm tra
        </Text>
        <Stack horizontal tokens={{ childrenGap: 12 }} wrap>
          {props.routeStepsUi.map((rs) => {
            const opts = props.stepRecipients.filter((r) => r.stepKey === rs.key);
            const selected =
              props.editRoutePlan[rs.key] || props.defaultOuForStep(rs.key, props.stepRecipients);
            const options = opts.length
              ? opts.map((o) => {
                  const ou = props.orgUnits.filter((u) => u.ouCode === o.ouCode)[0];
                  return {
                    value: o.ouCode,
                    label: ou ? ou.ouName : o.ouCode,
                    hint: o.ouCode
                  };
                })
              : [{ value: '', label: '—', hint: '' }];
            return (
              <Stack key={rs.key} styles={{ root: { minWidth: 160, flex: '1 1 160px' } }}>
                <Text
                  variant="small"
                  styles={{ root: { color: '#4b5563', marginBottom: 4 } }}
                >
                  {rs.label}
                </Text>
                <SearchableSelect
                  options={options}
                  value={selected}
                  disabled={props.busy}
                  placeholder="Gõ để tìm phòng…"
                  emptyText="Không có phòng"
                  onChange={(v) => props.onRouteChange(rs.key, v)}
                />
              </Stack>
            );
          })}
        </Stack>
        <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
          Loại hồ sơ: {props.master.paymentTypeCode} (không đổi).
        </Text>
      </Stack>

      <TextField
        label="Diễn giải"
        multiline
        rows={2}
        value={props.editExpl}
        onChange={(_, v) => props.onExplChange(v || '')}
        disabled={props.busy}
      />

      <Stack horizontal tokens={{ childrenGap: 8 }}>
        <PrimaryButton
          text="Lưu thông tin"
          disabled={props.busy}
          onClick={props.onSave}
          styles={actionBtnStyles}
        />
      </Stack>
    </Stack>
  );
};

export default EditBusinessFields;
