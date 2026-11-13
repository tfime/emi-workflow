import * as React from 'react';
import {
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  PrimaryButton,
  SelectionMode,
  Stack,
  Text,
  TextField,
  ThemeProvider
} from '@fluentui/react';
import {
  IPaymentType,
  IOrgUnit,
  IStepRecipient,
  IChecklistTemplate
} from '../../services/ConfigService';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import {
  actionBtnStyles,
  cardStack,
  fillStack,
  themeHostStyle
} from '../detail/detailStyles';
import { badgeBg, badgeColor } from '../detail/fluentBadge';
import SearchableSelect from '../forms/SearchableSelect';
import { amountError, formatAmountInput, parseAmountInput } from './amountValidate';

export interface ICreateRouteStep {
  key: string;
  label: string;
}

export interface ICreateRequestPageProps {
  busy: boolean;
  createTitle: string;
  createAmount: string;
  createExpl: string;
  createOu: string;
  actorOuCode: string;
  selectedType: string;
  paymentTypes: IPaymentType[];
  orgUnits: IOrgUnit[];
  stepRecipients: IStepRecipient[];
  routePlan: Record<string, string>;
  routeStepsUi: ICreateRouteStep[];
  templates: IChecklistTemplate[];
  defaultOuForStep: (stepKey: string, recipients: IStepRecipient[]) => string;
  onTitleChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onExplChange: (v: string) => void;
  onOuChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onRouteChange: (stepKey: string, ouCode: string) => void;
  onBack: () => void;
  onCreate: () => void;
}

const CreateRequestPage: React.FC<ICreateRequestPageProps> = (props) => {
  const amountCheck = parseAmountInput(props.createAmount);
  const amountMsg = amountError(props.createAmount);
  const lockedOu = !!props.actorOuCode;
  const createOuCode = props.actorOuCode || props.createOu;
  const requiredTplCount = props.templates.filter((t) => t.isRequired).length;
  const totalTplCount = props.templates.length;
  const sortedTemplates = props.templates.slice().sort((a, b) => {
    const ar = a.isRequired ? 0 : 1;
    const br = b.isRequired ? 0 : 1;
    if (ar !== br) return ar - br;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return (a.itemLabel || '').localeCompare(b.itemLabel || '');
  });

  const typeOptions = props.paymentTypes.map((t) => ({
    value: t.code,
    label: t.title,
    hint: t.code
  }));

  const ouOptions = (
    lockedOu
      ? props.orgUnits.filter((o) => o.ouCode === props.actorOuCode)
      : props.orgUnits
  ).map((o) => ({
    value: o.ouCode,
    label: o.ouName || o.ouCode,
    hint: o.ouCode
  }));
  if (lockedOu && ouOptions.length === 0 && props.actorOuCode) {
    ouOptions.push({
      value: props.actorOuCode,
      label: props.actorOuCode,
      hint: props.actorOuCode
    });
  }

  const canSubmit =
    !props.busy &&
    !!props.selectedType &&
    amountCheck.ok &&
    !!(props.createTitle || '').trim();

  const tplColumns: IColumn[] = [
    {
      key: 'stt',
      name: 'STT',
      minWidth: 40,
      maxWidth: 50,
      onRender: (_t: IChecklistTemplate, idx?: number) => (idx !== undefined ? idx + 1 : '')
    },
    {
      key: 'label',
      name: 'Mục tài liệu',
      minWidth: 160,
      isResizable: true,
      onRender: (t: IChecklistTemplate) => (
        <Text styles={{ root: { fontWeight: 600 } }}>{t.itemLabel}</Text>
      )
    },
    {
      key: 'req',
      name: 'Bắt buộc',
      minWidth: 90,
      maxWidth: 110,
      onRender: (t: IChecklistTemplate) => {
        const kind = t.isRequired ? 'warn' : 'mute';
        return (
          <Text
            variant="small"
            styles={{
              root: {
                fontWeight: '600',
                color: badgeColor(kind),
                background: badgeBg(kind),
                borderRadius: 4,
                padding: '2px 8px'
              }
            }}
          >
            {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
          </Text>
        );
      }
    },
    {
      key: 'min',
      name: 'Tối thiểu',
      minWidth: 70,
      maxWidth: 90,
      onRender: (t: IChecklistTemplate) =>
        t.isRequired || t.minFileCount > 0 ? `${t.minFileCount || 1} tệp` : '—'
    }
  ];

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 14 }} styles={fillStack}>
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          wrap
          tokens={{ childrenGap: 12 }}
          styles={cardStack}
        >
          <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
            Tạo hồ sơ thanh toán
          </Text>
          <DefaultButton text="Quay lại" onClick={props.onBack} styles={actionBtnStyles} />
        </Stack>

        <Stack tokens={{ childrenGap: 12 }} styles={cardStack}>
          <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
            Thông tin hồ sơ
          </Text>
          <TextField
            label="Tiêu đề hồ sơ"
            value={props.createTitle}
            onChange={(_, v) => props.onTitleChange(v || '')}
            placeholder="Ví dụ: Thanh toán đợt 2 theo HĐ…"
            disabled={props.busy}
          />
          <Stack horizontal wrap tokens={{ childrenGap: 12 }}>
            <TextField
              label="Số tiền đề nghị (VND)"
              value={props.createAmount}
              onChange={(_, v) => props.onAmountChange(formatAmountInput(v || ''))}
              inputMode="decimal"
              placeholder="Ví dụ: 1.000.000,50"
              errorMessage={amountMsg || undefined}
              description={
                amountMsg
                  ? undefined
                  : 'Dấu chấm phân nghìn, dấu phẩy thập phân (tối đa 2 số).'
              }
              disabled={props.busy}
              styles={{ root: { flex: '1 1 200px', minWidth: 180 } }}
            />
            <Stack styles={{ root: { flex: '1 1 200px', minWidth: 180 } }}>
              <Text
                variant="small"
                styles={{ root: { fontWeight: 600, marginBottom: 5 } }}
              >
                Đơn vị khởi tạo
              </Text>
              <SearchableSelect
                options={ouOptions}
                value={createOuCode}
                disabled={lockedOu || props.busy}
                placeholder="Gõ tên phòng…"
                emptyText="Không tìm thấy phòng"
                onChange={props.onOuChange}
              />
            </Stack>
          </Stack>
          <Stack>
            <Text variant="small" styles={{ root: { fontWeight: 600, marginBottom: 5 } }}>
              Loại hồ sơ
            </Text>
            <SearchableSelect
              options={typeOptions}
              value={props.selectedType}
              disabled={props.busy}
              placeholder="Gõ để tìm loại hồ sơ…"
              emptyText="Không tìm thấy loại hồ sơ"
              onChange={props.onTypeChange}
            />
          </Stack>
          <Stack tokens={{ childrenGap: 8 }}>
            <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
              Phòng nhận kiểm tra
            </Text>
            <Stack horizontal wrap tokens={{ childrenGap: 12 }}>
              {props.routeStepsUi.map((rs) => {
                const opts = props.stepRecipients.filter((r) => r.stepKey === rs.key);
                const selected =
                  props.routePlan[rs.key] ||
                  props.defaultOuForStep(rs.key, props.stepRecipients);
                const options = opts.map((o) => {
                  const ou = props.orgUnits.filter((u) => u.ouCode === o.ouCode)[0];
                  return {
                    value: o.ouCode,
                    label: ou ? ou.ouName : o.ouCode,
                    hint: o.ouCode
                  };
                });
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
              TCKT / CT.HĐQT lấy mặc định từ cấu hình.
            </Text>
          </Stack>
          <TextField
            label="Diễn giải"
            multiline
            rows={2}
            value={props.createExpl}
            onChange={(_, v) => props.onExplChange(v || '')}
            placeholder="Mô tả ngắn nội dung đề nghị thanh toán"
            disabled={props.busy}
          />
        </Stack>

        <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center" wrap>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              Checklist sẽ yêu cầu
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  fontWeight: '600',
                  color: badgeColor('info'),
                  background: badgeBg('info'),
                  borderRadius: 4,
                  padding: '2px 8px'
                }
              }}
            >
              {totalTplCount} mục · {requiredTplCount} bắt buộc
            </Text>
          </Stack>
          {sortedTemplates.length === 0 ? (
            <Text styles={{ root: { color: '#4b5563' } }}>
              Chưa có mẫu checklist cho loại này.
            </Text>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <DetailsList
                items={sortedTemplates}
                columns={tplColumns}
                selectionMode={SelectionMode.none}
                layoutMode={DetailsListLayoutMode.justified}
                compact={true}
              />
            </div>
          )}
        </Stack>

        <Stack horizontal tokens={{ childrenGap: 8 }}>
          <PrimaryButton
            text="Tạo hồ sơ"
            disabled={!canSubmit}
            onClick={props.onCreate}
            styles={actionBtnStyles}
          />
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default CreateRequestPage;
