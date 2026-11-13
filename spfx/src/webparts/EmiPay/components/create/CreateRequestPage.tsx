import * as React from 'react';
import {
  DefaultButton,
  MessageBar,
  MessageBarType,
  PrimaryButton,
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
import { IPartyBizInfo, partyBizDenial } from '../../services/partyBiz';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { payTokens } from '../../theme/payTokens';
import {
  actionBtnStyles,
  cardStack,
  fillStack,
  themeHostStyle
} from '../detail/detailStyles';
import PartyBizFields from '../forms/PartyBizFields';
import SearchableSelect from '../forms/SearchableSelect';
import { amountError, formatAmountInput, parseAmountInput } from './amountValidate';
import {
  createMultilineStyles,
  createTextFieldStyles,
  formCellClass,
  formFieldGap,
  formGrid2Class,
  formSectionGap,
  groupLabel,
  hintText,
  sectionTitle
} from './createFormStyles';

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
  createPartyBiz: IPartyBizInfo;
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
  onPartyBizChange: (v: IPartyBizInfo) => void;
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

  const partyDeny = partyBizDenial(props.createPartyBiz);
  const canSubmit =
    !props.busy &&
    !!props.selectedType &&
    amountCheck.ok &&
    !!(props.createTitle || '').trim() &&
    !partyDeny;

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: formSectionGap }} styles={fillStack}>
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          wrap
          tokens={{ childrenGap: formFieldGap }}
        >
          <Stack tokens={{ childrenGap: 2 }}>
            <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
              Tạo hồ sơ thanh toán
            </Text>
            <Text variant="small" styles={hintText}>
              Điền tiêu đề, số tiền rồi chọn loại hồ sơ và phòng nhận.
            </Text>
          </Stack>
          <DefaultButton text="Quay lại" onClick={props.onBack} styles={actionBtnStyles} />
        </Stack>

        {/* 1. Identity trước — Fluent: primary fields trên cùng */}
        <Stack tokens={{ childrenGap: formFieldGap }} styles={cardStack}>
          <Text variant="mediumPlus" styles={sectionTitle}>
            1. Thông tin hồ sơ
          </Text>

          <TextField
            label="Tiêu đề hồ sơ"
            required
            value={props.createTitle}
            onChange={(_, v) => props.onTitleChange(v || '')}
            placeholder="Ví dụ: Thanh toán đợt 2 theo HĐ…"
            disabled={props.busy}
            styles={createTextFieldStyles}
          />

          <div className={formGrid2Class}>
            <div className={formCellClass}>
              <TextField
                label="Số tiền đề nghị (VND)"
                required
                value={props.createAmount}
                onChange={(_, v) => props.onAmountChange(formatAmountInput(v || ''))}
                inputMode="decimal"
                placeholder="1.000.000"
                errorMessage={amountMsg || undefined}
                description={
                  amountMsg ? undefined : 'Dấu chấm phân nghìn, phẩy thập phân (tối đa 2 số).'
                }
                disabled={props.busy}
                styles={createTextFieldStyles}
              />
            </div>
            <div className={formCellClass}>
              <SearchableSelect
                label="Đơn vị khởi tạo"
                required
                options={ouOptions}
                value={createOuCode}
                disabled={lockedOu || props.busy}
                placeholder="Gõ tên phòng…"
                emptyText="Không tìm thấy phòng"
                onChange={props.onOuChange}
              />
            </div>
          </div>

          <TextField
            label="Diễn giải"
            multiline
            rows={3}
            resizable={false}
            value={props.createExpl}
            onChange={(_, v) => props.onExplChange(v || '')}
            placeholder="Mô tả ngắn nội dung đề nghị thanh toán"
            disabled={props.busy}
            styles={createMultilineStyles}
          />
        </Stack>

        {/* 2. Đối tượng — phụ sau identity */}
        <Stack tokens={{ childrenGap: formFieldGap }} styles={cardStack}>
          <Text variant="mediumPlus" styles={sectionTitle}>
            2. Đối tượng thanh toán
          </Text>
          <PartyBizFields
            value={props.createPartyBiz}
            disabled={props.busy}
            onChange={props.onPartyBizChange}
          />
        </Stack>

        {/* 3. Loại & phòng — lưới cột đều */}
        <Stack tokens={{ childrenGap: formFieldGap }} styles={cardStack}>
          <Text variant="mediumPlus" styles={sectionTitle}>
            3. Loại hồ sơ & phòng nhận
          </Text>

          <SearchableSelect
            label="Loại hồ sơ"
            required
            options={typeOptions}
            value={props.selectedType}
            disabled={props.busy}
            placeholder="Gõ để tìm loại hồ sơ…"
            emptyText="Không tìm thấy loại hồ sơ"
            onChange={props.onTypeChange}
          />

          <Stack tokens={{ childrenGap: 8 }}>
            <Text variant="small" styles={groupLabel}>
              Phòng nhận kiểm tra
            </Text>
            <div className={formGrid2Class}>
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
                  <div key={rs.key} className={formCellClass}>
                    <SearchableSelect
                      label={rs.label}
                      options={options}
                      value={selected}
                      disabled={props.busy}
                      placeholder="Gõ để tìm phòng…"
                      emptyText="Không có phòng"
                      onChange={(v) => props.onRouteChange(rs.key, v)}
                    />
                  </div>
                );
              })}
            </div>
            <Text variant="small" styles={hintText}>
              TCKT / CT.HĐQT lấy mặc định từ cấu hình StepRecipients.
            </Text>
          </Stack>
        </Stack>

        <Stack tokens={{ childrenGap: formFieldGap }} styles={cardStack}>
          <Stack
            horizontal
            horizontalAlign="space-between"
            verticalAlign="center"
            wrap
            tokens={{ childrenGap: 8 }}
          >
            <Text variant="mediumPlus" styles={sectionTitle}>
              4. Checklist sẽ yêu cầu
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  fontWeight: 600,
                  color: payTokens.brandDark,
                  background: payTokens.brandSoft,
                  borderRadius: 4,
                  padding: '3px 10px'
                }
              }}
            >
              {totalTplCount} mục · {requiredTplCount} bắt buộc
            </Text>
          </Stack>

          {!props.selectedType ? (
            <MessageBar messageBarType={MessageBarType.info}>
              Chọn loại hồ sơ để xem checklist mẫu.
            </MessageBar>
          ) : sortedTemplates.length === 0 ? (
            <MessageBar messageBarType={MessageBarType.warning}>
              Chưa có mẫu checklist cho loại này.
            </MessageBar>
          ) : (
            <Stack tokens={{ childrenGap: 0 }}>
              {sortedTemplates.map((t, idx) => (
                <Stack
                  key={t.itemCode || String(idx)}
                  horizontal
                  verticalAlign="center"
                  tokens={{ childrenGap: formFieldGap }}
                  styles={{
                    root: {
                      padding: '10px 0',
                      borderBottom:
                        idx < sortedTemplates.length - 1
                          ? `1px solid ${payTokens.line}`
                          : undefined
                    }
                  }}
                >
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        width: 28,
                        color: payTokens.muted,
                        fontWeight: 600,
                        flexShrink: 0
                      }
                    }}
                  >
                    {idx + 1}
                  </Text>
                  <Stack grow tokens={{ childrenGap: 2 }} styles={{ root: { minWidth: 0 } }}>
                    <Text styles={{ root: { fontWeight: 600 } }}>{t.itemLabel}</Text>
                    <Text variant="small" styles={hintText}>
                      {t.isRequired || t.minFileCount > 0
                        ? `Tối thiểu ${t.minFileCount || 1} tệp`
                        : 'Không bắt buộc tệp'}
                    </Text>
                  </Stack>
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        flexShrink: 0,
                        fontWeight: 600,
                        color: t.isRequired ? payTokens.warn : payTokens.muted,
                        background: t.isRequired ? payTokens.warnSoft : payTokens.surface,
                        borderRadius: 4,
                        padding: '2px 8px'
                      }
                    }}
                  >
                    {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
                  </Text>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>

        <Stack
          horizontal
          horizontalAlign="end"
          tokens={{ childrenGap: 8 }}
          wrap
          styles={{
            root: {
              position: 'sticky',
              bottom: 0,
              padding: '12px 0 4px',
              background: `linear-gradient(180deg, transparent, ${payTokens.surface} 28%)`
            }
          }}
        >
          <DefaultButton
            text="Huỷ"
            disabled={props.busy}
            onClick={props.onBack}
            styles={actionBtnStyles}
          />
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
