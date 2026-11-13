import * as React from 'react';
import { PrimaryButton, Stack, Text, TextField } from '@fluentui/react';
import { IOrgUnit, IStepRecipient } from '../../services/ConfigService';
import { IPartyBizInfo } from '../../services/partyBiz';
import { IRequestMaster } from '../../services/RequestService';
import {
  createMultilineStyles,
  createTextFieldStyles,
  formCellClass,
  formFieldGap,
  formGrid2Class,
  groupLabel,
  hintText
} from '../create/createFormStyles';
import { ROUTE_STEP_SKIP, isRouteStepSkipped } from '../../services/routePlan';
import PartyBizFields from '../forms/PartyBizFields';
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
  editPartyBiz: IPartyBizInfo;
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
  onPartyBizChange: (v: IPartyBizInfo) => void;
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
    <Stack tokens={{ childrenGap: formFieldGap }} styles={cardStack}>
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
        styles={createTextFieldStyles}
      />

      <div className={formGrid2Class}>
        <div className={formCellClass}>
          <TextField
            label="Số tiền đề nghị (VND)"
            value={props.editAmount}
            onChange={(_, v) => props.onAmountChange(v || '')}
            inputMode="decimal"
            placeholder="Ví dụ: 1.000.000,50"
            disabled={props.busy}
            styles={createTextFieldStyles}
          />
        </div>
        <div className={formCellClass}>
          <SearchableSelect
            label="Đơn vị khởi tạo"
            options={ouOptions}
            value={props.editOu}
            disabled={props.busy || !!props.actorOuCode}
            placeholder="Gõ tên phòng…"
            emptyText="Không tìm thấy phòng"
            onChange={props.onOuChange}
          />
        </div>
      </div>

      <PartyBizFields
        value={props.editPartyBiz}
        disabled={props.busy}
        onChange={props.onPartyBizChange}
      />

      <Stack tokens={{ childrenGap: 8 }}>
        <Text variant="small" styles={groupLabel}>
          Phòng nhận kiểm tra (tuỳ chọn)
        </Text>
        <div className={formGrid2Class}>
          {props.routeStepsUi.map((rs) => {
            const opts = props.stepRecipients.filter((r) => r.stepKey === rs.key);
            const raw = props.editRoutePlan[rs.key];
            const selected = isRouteStepSkipped(raw) ? ROUTE_STEP_SKIP : raw;
            const options = [
              {
                value: ROUTE_STEP_SKIP,
                label: 'Không qua bước này',
                hint: 'bỏ qua'
              },
              ...opts.map((o) => {
                const ou = props.orgUnits.filter((u) => u.ouCode === o.ouCode)[0];
                return {
                  value: o.ouCode,
                  label: ou ? ou.ouName : o.ouCode,
                  hint: o.ouCode
                };
              })
            ];
            return (
              <div key={rs.key} className={formCellClass}>
                <SearchableSelect
                  label={rs.label}
                  options={options}
                  value={selected || ROUTE_STEP_SKIP}
                  disabled={props.busy}
                  placeholder="Chọn phòng hoặc bỏ qua…"
                  emptyText="Không có phòng"
                  onChange={(v) => props.onRouteChange(rs.key, v)}
                />
              </div>
            );
          })}
        </div>
        <Text variant="small" styles={hintText}>
          Loại hồ sơ: {props.master.paymentTypeCode} (không đổi). Có thể bỏ BPCM2/3.
        </Text>
      </Stack>

      <TextField
        label="Diễn giải"
        multiline
        rows={2}
        resizable={false}
        value={props.editExpl}
        onChange={(_, v) => props.onExplChange(v || '')}
        disabled={props.busy}
        styles={createMultilineStyles}
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
