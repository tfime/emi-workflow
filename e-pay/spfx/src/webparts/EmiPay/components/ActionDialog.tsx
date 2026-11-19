import * as React from 'react';
import {
  Checkbox,
  DatePicker,
  DayOfWeek,
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
  Dropdown,
  IDropdownOption,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  Stack,
  Text,
  TextField,
  ThemeProvider
} from '@fluentui/react';
import { dialogTitle } from './capability';
import { NOTIFY_TARGETS, STAFF_POOL } from './mockData';
import { DialogKind, ICheckItem, IPayDetailState } from './types';
import { emiPayFluentTheme } from '../theme/fluentPayTheme';
import { actionBtnStyles, compactBtnStyles, themeHostStyle } from './detail/detailStyles';

export interface IActionDialogProps {
  kind: Exclude<DialogKind, undefined>;
  detail: IPayDetailState;
  onClose: () => void;
  onConfirm: (summary: string) => void;
}

function parseLocalDateTime(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function toLocalDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${p(m)}-${p(day)}T${p(hh)}:${p(mm)}`;
}

function toIsoDate(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const p = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${p(m)}-${p(day)}`;
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
        onConfirm(`CHECKLIST cập nhật · hasFail=${String(checklistHasFailOpen())}`);
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

  const ouOptions: IDropdownOption[] = (detail.nextOuOptions || []).map((o) => ({
    key: o.code,
    text: `${o.name}${o.isDefault ? ' (mặc định)' : ''}`
  }));

  const staffOptions: IDropdownOption[] = STAFF_POOL.map((s) => ({
    key: s.upn,
    text: `${s.name} · ${s.upn}`
  }));

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Dialog
        hidden={false}
        onDismiss={onClose}
        dialogContentProps={{
          type: DialogType.normal,
          title: dialogTitle(kind)
        }}
        modalProps={{ isBlocking: true, styles: { main: { maxWidth: 560 } } }}
      >
        <Stack tokens={{ childrenGap: 12 }} styles={{ root: { padding: '4px 0 8px' } }}>
          {(kind === 'submit' || kind === 'forward') && (
            <>
              <Dropdown
                label="Phòng bước kế tiếp (chỉ 1)"
                selectedKey={nextOu}
                options={ouOptions}
                onChange={(_, opt) => opt && setNextOu(String(opt.key))}
              />
              {kind === 'submit' && missingRequired() && (
                <MessageBar messageBarType={MessageBarType.error}>
                  BR-01: còn mục checklist bắt buộc thiếu / không đạt.
                </MessageBar>
              )}
              {kind === 'forward' && checklistHasFailOpen() && (
                <MessageBar messageBarType={MessageBarType.warning}>
                  Có mục Không đạt — trả BPCM1. Không cần Đạt hết checklist để chuyển bước.
                </MessageBar>
              )}
              {kind === 'forward' && !checklistHasFailOpen() && (
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  Phòng đánh giá mục phù hợp; sau PASS khóa mục đã Đạt/Không đạt.
                </Text>
              )}
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                BR-02: không gửi đồng thời hai phòng cùng bước.
              </Text>
            </>
          )}

          {kind === 'accept' && (
            <DatePicker
              label="Hạn hoàn thành (bắt buộc)"
              firstDayOfWeek={DayOfWeek.Monday}
              value={parseLocalDateTime(deadline)}
              onSelectDate={(d) => setDeadline(toLocalDateTime(d))}
              formatDate={(d) => (d ? d.toLocaleString('vi-VN') : '')}
            />
          )}

          {kind === 'assign' && (
            <Stack tokens={{ childrenGap: 8 }}>
              {STAFF_POOL.map((s) => (
                <Checkbox
                  key={s.upn}
                  label={`${s.name} · ${s.upn}`}
                  checked={selectedStaff.indexOf(s.upn) >= 0}
                  onChange={() => toggleStaff(s.upn)}
                />
              ))}
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                Nhiều NV dùng một checklist chung (§7.2).
              </Text>
            </Stack>
          )}

          {kind === 'checklist' && (
            <Stack tokens={{ childrenGap: 10 }}>
              {checks.map((c) => (
                <Stack
                  key={c.code}
                  tokens={{ childrenGap: 6 }}
                  styles={{
                    root: {
                      padding: '8px 0',
                      borderBottom: '1px solid #e5e7eb'
                    }
                  }}
                >
                  <Text styles={{ root: { fontWeight: 600 } }}>{c.label}</Text>
                  <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                    {c.meta}
                  </Text>
                  <Stack horizontal tokens={{ childrenGap: 6 }} wrap>
                    <DefaultButton
                      text="Đạt"
                      onClick={() => setCheckResult(c.code, 'Pass')}
                      styles={compactBtnStyles}
                    />
                    <DefaultButton
                      text="Không đạt"
                      onClick={() => setCheckResult(c.code, 'Fail')}
                      styles={{
                        root: {
                          minWidth: 0,
                          height: 28,
                          padding: '0 10px',
                          borderRadius: 4,
                          borderColor: '#b91c1c',
                          color: '#b91c1c'
                        }
                      }}
                    />
                    <DefaultButton
                      text="Mở"
                      onClick={() => setCheckResult(c.code, 'Open')}
                      styles={compactBtnStyles}
                    />
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}

          {(kind === 'attach' || kind === 'unc') && (
            <>
              <TextField
                label="Tên file (demo)"
                value={fileName}
                placeholder={kind === 'unc' ? 'unc-20261112.pdf' : 'tai-lieu.pdf'}
                onChange={(_, v) => setFileName(v || '')}
              />
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                {kind === 'unc'
                  ? 'UNC thuộc chứng từ thanh toán TCKT.'
                  : detail.canUploadSupplement
                    ? 'Đính kèm bổ sung — nội bộ chưa chốt thì người tạo không xem (§13.2).'
                    : 'Checklist đầu vào — chỉ mục được phép sửa.'}
              </Text>
            </>
          )}

          {(kind === 'return' ||
            kind === 'reject' ||
            kind === 'cancel' ||
            kind === 'extendDeadline') && (
            <TextField
              label="Lý do (bắt buộc)"
              multiline
              rows={3}
              value={reason}
              onChange={(_, v) => setReason(v || '')}
            />
          )}

          {kind === 'extendDeadline' && (
            <DatePicker
              label="Hạn mới"
              firstDayOfWeek={DayOfWeek.Monday}
              value={parseLocalDateTime(deadline)}
              onSelectDate={(d) => setDeadline(toLocalDateTime(d))}
              formatDate={(d) => (d ? d.toLocaleString('vi-VN') : '')}
            />
          )}

          {kind === 'withdraw' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Chỉ khi bên nhận chưa Tiếp nhận (BR-03). Sau Accept → không rút (BR-04). Không tăng
              ReviewRound.
            </Text>
          )}

          {kind === 'approve' && (
            <DatePicker
              label="Thời hạn thanh toán (paymentDueAt)"
              firstDayOfWeek={DayOfWeek.Monday}
              value={paymentDue ? new Date(paymentDue + 'T00:00:00') : undefined}
              onSelectDate={(d) => setPaymentDue(toIsoDate(d))}
              formatDate={(d) => (d ? d.toLocaleDateString('vi-VN') : '')}
            />
          )}

          {kind === 'confirmPay' && (
            <Stack tokens={{ childrenGap: 8 }}>
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                §10.2 — TCKT chọn người nhận thông báo (không cố định).
              </Text>
              {NOTIFY_TARGETS.map((t) => (
                <Checkbox
                  key={t.id}
                  label={t.label}
                  checked={notify.indexOf(t.id) >= 0}
                  onChange={() => toggleNotify(t.id)}
                />
              ))}
            </Stack>
          )}

          {kind === 'delegate' && (
            <Dropdown
              label="Người được ủy quyền"
              selectedKey={selectedStaff[0] || STAFF_POOL[0].upn}
              options={staffOptions}
              onChange={(_, opt) => opt && setSelectedStaff([String(opt.key)])}
            />
          )}
        </Stack>
        <DialogFooter>
          <DefaultButton text="Hủy" onClick={onClose} styles={actionBtnStyles} />
          <PrimaryButton text="Xác nhận" onClick={confirm} styles={actionBtnStyles} />
        </DialogFooter>
      </Dialog>
    </ThemeProvider>
  );
};

export default ActionDialog;
