import * as React from 'react';
import styles from './EmiPay.module.scss';
import { dialogTitle } from './capability';
import { NOTIFY_TARGETS, STAFF_POOL } from './mockData';
import { DialogKind, ICheckItem, IPayDetailState } from './types';

export interface IActionDialogProps {
  kind: Exclude<DialogKind, undefined>;
  detail: IPayDetailState;
  onClose: () => void;
  onConfirm: (summary: string) => void;
}

const ActionDialog: React.FC<IActionDialogProps> = (props) => {
  const { kind, detail, onClose, onConfirm } = props;
  const [reason, setReason] = React.useState('');
  const [deadline, setDeadline] = React.useState('2026-11-15T17:00');
  const [nextOu, setNextOu] = React.useState(
    (detail.nextOuOptions && detail.nextOuOptions[0] && detail.nextOuOptions[0].code) || ''
  );
  const [paymentDue, setPaymentDue] = React.useState('2026-11-20');
  const [selectedStaff, setSelectedStaff] = React.useState<string[]>(
    detail.assignees.map((a) => a.upn)
  );
  const [notify, setNotify] = React.useState<string[]>(['creator']);
  const [checks, setChecks] = React.useState<ICheckItem[]>(detail.check.slice());
  const [fileName, setFileName] = React.useState('');

  const toggleStaff = (upn: string): void => {
    if (selectedStaff.indexOf(upn) >= 0) {
      setSelectedStaff(selectedStaff.filter((x) => x !== upn));
    } else {
      setSelectedStaff(selectedStaff.concat([upn]));
    }
  };

  const toggleNotify = (id: string): void => {
    if (notify.indexOf(id) >= 0) {
      setNotify(notify.filter((x) => x !== id));
    } else {
      setNotify(notify.concat([id]));
    }
  };

  const setCheckResult = (code: string, result: 'Pass' | 'Fail' | 'Open'): void => {
    setChecks(
      checks.map((c) =>
        c.code === code
          ? {
              ...c,
              result,
              badge: result,
              kind: result === 'Pass' ? 'ok' : result === 'Fail' ? 'danger' : 'warn'
            }
          : c
      )
    );
  };

  const missingRequired = (): boolean => {
    for (let i = 0; i < detail.check.length; i++) {
      const c = detail.check[i];
      if (c.required && (c.result === 'Missing' || c.result === 'Fail' || c.result === 'Open')) {
        if (c.result === 'Missing' || c.result === 'Fail') {
          return true;
        }
      }
    }
    return detail.check.some((c) => c.required && c.result === 'Missing');
  };

  const checklistHasFailOpen = (): boolean => {
    return checks.some((c) => c.result === 'Fail');
  };

  const confirm = (): void => {
    switch (kind) {
      case 'submit':
        if (missingRequired()) {
          onConfirm('Chặn gửi: thiếu checklist bắt buộc (BR-01)');
          return;
        }
        onConfirm(`SUBMIT → ${nextOu || 'OU kế tiếp'} · round giữ/tăng theo Core`);
        return;
      case 'accept':
        if (!deadline) {
          onConfirm('Bắt buộc đặt hạn khi tiếp nhận (BR-04)');
          return;
        }
        onConfirm(`ACCEPT · hạn ${deadline}`);
        return;
      case 'assign':
        onConfirm(`ASSIGN · ${selectedStaff.length} người`);
        return;
      case 'checklist':
        onConfirm(
          `CHECKLIST cập nhật · hasFail=${String(checklistHasFailOpen())}`
        );
        return;
      case 'attach':
        onConfirm(`UPLOAD · ${fileName || 'file-demo.pdf'}`);
        return;
      case 'forward':
        if (checklistHasFailOpen()) {
          onConfirm('Chặn gửi tiếp: có mục Không đạt — trả BPCM1');
          return;
        }
        onConfirm(`DECIDE PASS → ${nextOu} · khóa mục đã đánh giá`);
        return;
      case 'return':
        if (!reason.trim()) {
          onConfirm('Bắt buộc lý do trả hồ sơ');
          return;
        }
        onConfirm(`DECIDE REJECT → BPCM1 · ${reason}`);
        return;
      case 'withdraw':
        onConfirm('WITHDRAW · thu hồi WI chờ nhận · không +round');
        return;
      case 'cancel':
        if (!reason.trim()) {
          onConfirm('Bắt buộc lý do hủy');
          return;
        }
        onConfirm(`CANCEL · ${reason} · không thông báo BPCM`);
        return;
      case 'approve':
        onConfirm(`DECIDE APPROVE · paymentDueAt=${paymentDue}`);
        return;
      case 'reject':
        if (!reason.trim()) {
          onConfirm('Bắt buộc lý do không duyệt');
          return;
        }
        onConfirm(`DECIDE REJECT (CHAIR) → BPCM1 · ${reason}`);
        return;
      case 'unc':
        onConfirm(`UNC uploaded · ${fileName || 'unc-demo.pdf'}`);
        return;
      case 'confirmPay':
        if (notify.length === 0) {
          onConfirm('Chọn ít nhất một đối tượng nhận thông báo (§10.2)');
          return;
        }
        onConfirm(`CONFIRM_PAYMENT · notify=[${notify.join(', ')}]`);
        return;
      case 'extendDeadline':
        if (!reason.trim() || !deadline) {
          onConfirm('Gia hạn cần hạn mới + lý do (§12)');
          return;
        }
        onConfirm(`EXTEND · ${deadline} · ${reason}`);
        return;
      case 'delegate':
        onConfirm(`DELEGATE · ${selectedStaff[0] || STAFF_POOL[0].upn}`);
        return;
      default:
        onConfirm(kind);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalH}>
          <h3>{dialogTitle(kind)}</h3>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className={styles.modalB}>
          {(kind === 'submit' || kind === 'forward') && (
            <>
              <label className={styles.field}>
                Phòng bước kế tiếp (chỉ 1)
                <select value={nextOu} onChange={(e) => setNextOu(e.target.value)}>
                  {(detail.nextOuOptions || []).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.name}
                      {o.isDefault ? ' (mặc định)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {kind === 'submit' && missingRequired() && (
                <p className={styles.warnBox}>BR-01: còn mục checklist bắt buộc thiếu / không đạt.</p>
              )}
              {kind === 'forward' && checklistHasFailOpen() && (
                <p className={styles.warnBox}>
                  Có mục Không đạt — trả BPCM1. Không cần Đạt hết checklist để chuyển bước.
                </p>
              )}
              {kind === 'forward' && !checklistHasFailOpen() && (
                <p className={styles.hint}>
                  Phòng đánh giá mục phù hợp; sau PASS khóa mục đã Đạt/Không đạt.
                </p>
              )}
              <p className={styles.hint}>BR-02: không gửi đồng thời hai phòng cùng bước.</p>
            </>
          )}

          {kind === 'accept' && (
            <label className={styles.field}>
              Hạn hoàn thành (bắt buộc)
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          )}

          {kind === 'assign' && (
            <div className={styles.checkList}>
              {STAFF_POOL.map((s) => (
                <label key={s.upn} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={selectedStaff.indexOf(s.upn) >= 0}
                    onChange={() => toggleStaff(s.upn)}
                  />
                  {s.name} · {s.upn}
                </label>
              ))}
              <p className={styles.hint}>Nhiều NV dùng một checklist chung (§7.2).</p>
            </div>
          )}

          {kind === 'checklist' && (
            <div className={styles.checkList}>
              {checks.map((c) => (
                <div key={c.code} className={styles.checkEditRow}>
                  <div>
                    <strong>{c.label}</strong>
                    <span className={styles.meta}>{c.meta}</span>
                  </div>
                  <div className={styles.actions}>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setCheckResult(c.code, 'Pass')}>
                      Đạt
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setCheckResult(c.code, 'Fail')}>
                      Không đạt
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setCheckResult(c.code, 'Open')}>
                      Mở
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(kind === 'attach' || kind === 'unc') && (
            <>
              <label className={styles.field}>
                Tên file (demo)
                <input
                  value={fileName}
                  placeholder={kind === 'unc' ? 'unc-20261112.pdf' : 'tai-lieu.pdf'}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </label>
              <p className={styles.hint}>
                {kind === 'unc'
                  ? 'UNC thuộc chứng từ thanh toán TCKT.'
                  : detail.canUploadSupplement
                  ? 'Đính kèm bổ sung — nội bộ chưa chốt thì người tạo không xem (§13.2).'
                  : 'Checklist đầu vào — chỉ mục được phép sửa.'}
              </p>
            </>
          )}

          {(kind === 'return' || kind === 'reject' || kind === 'cancel' || kind === 'extendDeadline') && (
            <label className={styles.field}>
              Lý do (bắt buộc)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </label>
          )}

          {kind === 'extendDeadline' && (
            <label className={styles.field}>
              Hạn mới
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          )}

          {kind === 'withdraw' && (
            <p className={styles.hint}>
              Chỉ khi bên nhận chưa Tiếp nhận (BR-03). Sau Accept → không rút (BR-04). Không tăng
              ReviewRound.
            </p>
          )}

          {kind === 'approve' && (
            <label className={styles.field}>
              Thời hạn thanh toán (paymentDueAt)
              <input type="date" value={paymentDue} onChange={(e) => setPaymentDue(e.target.value)} />
            </label>
          )}

          {kind === 'confirmPay' && (
            <div className={styles.checkList}>
              <p className={styles.hint}>§10.2 — TCKT chọn người nhận thông báo (không cố định).</p>
              {NOTIFY_TARGETS.map((t) => (
                <label key={t.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={notify.indexOf(t.id) >= 0}
                    onChange={() => toggleNotify(t.id)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          )}

          {kind === 'delegate' && (
            <label className={styles.field}>
              Người được ủy quyền
              <select
                value={selectedStaff[0] || STAFF_POOL[0].upn}
                onChange={(e) => setSelectedStaff([e.target.value])}
              >
                {STAFF_POOL.map((s) => (
                  <option key={s.upn} value={s.upn}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className={styles.modalF}>
          <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={onClose}>
            Hủy
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={confirm}>
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionDialog;
