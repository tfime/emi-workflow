import * as React from 'react';
import styles from '../EmiPay.module.scss';
import { IPaymentType, IOrgUnit, IStepRecipient, IChecklistTemplate } from '../../services/ConfigService';
import SearchableSelect from '../forms/SearchableSelect';
import { amountError, formatAmountInput, parseAmountInput } from './amountValidate';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

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

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2>Tạo hồ sơ thanh toán</h2>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={props.onBack}
          >
            Quay lại
          </button>
        </div>
      </div>

      <section className={styles.card}>
        <div className={styles.cardH}>
          <h3>Thông tin hồ sơ</h3>
        </div>
        <div className={styles.cardB}>
          <div className={styles.form}>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              Tiêu đề hồ sơ
              <input
                value={props.createTitle}
                onChange={(e) => props.onTitleChange(e.target.value)}
                placeholder="Ví dụ: Thanh toán đợt 2 theo HĐ…"
              />
            </label>

            <label className={styles.field}>
              Số tiền đề nghị (VND)
              <input
                value={props.createAmount}
                onChange={(e) => {
                  props.onAmountChange(formatAmountInput(e.target.value));
                }}
                inputMode="decimal"
                placeholder="Ví dụ: 1.000.000,50"
                aria-invalid={!amountCheck.ok}
              />
              {amountMsg ? (
                <span className={styles.fieldError}>{amountMsg}</span>
              ) : (
                <span className={styles.hint}>
                  Dấu chấm phân nghìn, dấu phẩy thập phân (tối đa 2 số).
                </span>
              )}
            </label>

            <label className={styles.field}>
              Đơn vị khởi tạo
              <SearchableSelect
                options={ouOptions}
                value={createOuCode}
                disabled={lockedOu}
                placeholder="Gõ tên phòng…"
                emptyText="Không tìm thấy phòng"
                onChange={props.onOuChange}
              />
            </label>

            <label className={`${styles.field} ${styles.fieldFull}`}>
              Loại hồ sơ
              <SearchableSelect
                options={typeOptions}
                value={props.selectedType}
                placeholder="Gõ để tìm loại hồ sơ…"
                emptyText="Không tìm thấy loại hồ sơ"
                onChange={props.onTypeChange}
              />
            </label>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <span>Phòng nhận kiểm tra</span>
              <div className={styles.routeRow}>
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
                    <label key={rs.key} className={styles.routeChip}>
                      <span>{rs.label}</span>
                      <SearchableSelect
                        options={options}
                        value={selected}
                        placeholder="Gõ để tìm phòng…"
                        emptyText="Không có phòng"
                        onChange={(v) => props.onRouteChange(rs.key, v)}
                      />
                    </label>
                  );
                })}
              </div>
              <p className={styles.hint}>TCKT / CT.HĐQT lấy mặc định từ cấu hình.</p>
            </div>

            <label className={`${styles.field} ${styles.fieldFull}`}>
              Diễn giải
              <textarea
                rows={2}
                value={props.createExpl}
                onChange={(e) => props.onExplChange(e.target.value)}
                placeholder="Mô tả ngắn nội dung đề nghị thanh toán"
              />
            </label>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardH}>
          <h3>Checklist sẽ yêu cầu</h3>
          <span className={badgeClass('info')}>
            {totalTplCount} mục · {requiredTplCount} bắt buộc
          </span>
        </div>
        <div className={styles.cardB} style={{ padding: 0 }}>
          {sortedTemplates.length === 0 ? (
            <p className={styles.empty}>Chưa có mẫu checklist cho loại này.</p>
          ) : (
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th style={{ width: 48 }}>STT</th>
                  <th>Mục tài liệu</th>
                  <th>Bắt buộc</th>
                  <th>Tối thiểu</th>
                </tr>
              </thead>
              <tbody>
                {sortedTemplates.map((t, idx) => (
                  <tr key={t.itemCode}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{t.itemLabel}</strong>
                    </td>
                    <td>
                      <span className={badgeClass(t.isRequired ? 'warn' : 'mute')}>
                        {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
                      </span>
                    </td>
                    <td>
                      {t.isRequired || t.minFileCount > 0
                        ? `${t.minFileCount || 1} tệp`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={!canSubmit}
          onClick={props.onCreate}
        >
          Tạo hồ sơ
        </button>
      </div>
    </>
  );
};

export default CreateRequestPage;
