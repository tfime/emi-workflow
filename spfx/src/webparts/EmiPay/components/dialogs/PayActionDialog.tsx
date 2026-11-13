import * as React from 'react';
import {
  DatePicker,
  DayOfWeek,
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
  Dropdown,
  IDropdownOption,
  PrimaryButton,
  Stack,
  Text,
  TextField,
  ThemeProvider
} from '@fluentui/react';
import { IChecklistItemRow } from '../../services/ChecklistService';
import { IDocumentIndexRow } from '../../services/UploadService';
import { stepShortVi } from '../../services/viLabels';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { DialogKind } from '../types';
import { actionBtnStyles, themeHostStyle } from '../detail/detailStyles';

export interface IPayActionDialogProps {
  dialog: DialogKind;
  busy: boolean;
  reason: string;
  acceptDue: string;
  paymentDue: string;
  uploadMode: 'checklist' | 'step';
  uploadItemCode: string;
  checklist: IChecklistItemRow[];
  reviewItemCode: string;
  reviewResult: 'Pass' | 'Fail';
  reviewReason: string;
  currentStepKey?: string;
  uncDocs: IDocumentIndexRow[];
  fileRef: React.RefObject<HTMLInputElement>;
  onReasonChange: (v: string) => void;
  onAcceptDueChange: (v: string) => void;
  onPaymentDueChange: (v: string) => void;
  onUploadItemCodeChange: (v: string) => void;
  onReviewResultChange: (v: 'Pass' | 'Fail') => void;
  onReviewReasonChange: (v: string) => void;
  onDismiss: () => void;
  onConfirm: () => void;
}

const dialogTitleVi = (kind: DialogKind, uploadMode: 'checklist' | 'step'): string => {
  switch (kind) {
    case 'submit':
      return 'Trình trưởng phòng';
    case 'mgrApprove':
      return 'Duyệt gửi sang BPCM2';
    case 'forward':
      return 'Chuyển bước tiếp theo';
    case 'return':
      return 'Từ chối / trả hồ sơ';
    case 'approve':
      return 'Phê duyệt hồ sơ (CT.HĐQT)';
    case 'approvePay':
      return 'Duyệt thanh toán';
    case 'reject':
      return 'Không phê duyệt';
    case 'attach':
      return uploadMode === 'step' ? 'Tải tài liệu hỗ trợ' : 'Tải tài liệu checklist';
    case 'unc':
      return 'Tải ủy nhiệm chi (UNC)';
    case 'confirmPay':
      return 'Xác nhận đã thanh toán';
    case 'review':
      return 'Đánh giá mục checklist';
    case 'accept':
      return 'Tiếp nhận và đặt hạn xử lý';
    default:
      return 'Xác nhận';
  }
};

function parseIsoDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? undefined : d;
}

function toIsoDate(d: Date | null | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const mm = m < 10 ? `0${m}` : `${m}`;
  const dd = day < 10 ? `0${day}` : `${day}`;
  return `${y}-${mm}-${dd}`;
}

const PayActionDialog: React.FC<IPayActionDialogProps> = (props) => {
  const checklistOpts: IDropdownOption[] = props.checklist.map((c) => ({
    key: c.itemCode,
    text: c.itemLabel
  }));
  const reviewItemLabel =
    (props.checklist.filter((c) => c.itemCode === props.reviewItemCode)[0] || {})
      .itemLabel || props.reviewItemCode;

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Dialog
        hidden={!props.dialog}
        onDismiss={props.busy ? undefined : props.onDismiss}
        dialogContentProps={{
          type: DialogType.normal,
          title: props.dialog ? dialogTitleVi(props.dialog, props.uploadMode) : ''
        }}
        modalProps={{ isBlocking: true, styles: { main: { maxWidth: 520 } } }}
      >
        <Stack tokens={{ childrenGap: 12 }} styles={{ root: { padding: '4px 0 8px' } }}>
          {(props.dialog === 'return' || props.dialog === 'reject') && (
            <TextField
              label="Lý do (bắt buộc)"
              multiline
              rows={3}
              value={props.reason}
              onChange={(_, v) => props.onReasonChange(v || '')}
              disabled={props.busy}
            />
          )}
          {props.dialog === 'accept' && (
            <>
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                Trưởng phòng / người được giao tiếp nhận bước hiện tại và bắt buộc đặt hạn xử
                lý. Chưa tiếp nhận thì không được chuyển bước / xác nhận thanh toán.
              </Text>
              <DatePicker
                label="Hạn xử lý (bắt buộc)"
                firstDayOfWeek={DayOfWeek.Monday}
                placeholder="Chọn ngày…"
                value={parseIsoDate(props.acceptDue)}
                onSelectDate={(d) => props.onAcceptDueChange(toIsoDate(d))}
                disabled={props.busy}
                formatDate={(d) => (d ? d.toLocaleDateString('vi-VN') : '')}
              />
            </>
          )}
          {props.dialog === 'approve' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Phê duyệt hồ sơ tại CT.HĐQT. Sau bước này hồ sơ vẫn ở CT.HĐQT — chưa chuyển TCKT
              thanh toán. Dùng «Duyệt thanh toán» để đặt hạn và chuyển bước.
            </Text>
          )}
          {props.dialog === 'approvePay' && (
            <DatePicker
              label="Thời hạn thanh toán"
              firstDayOfWeek={DayOfWeek.Monday}
              placeholder="Chọn ngày…"
              value={parseIsoDate(props.paymentDue)}
              onSelectDate={(d) => props.onPaymentDueChange(toIsoDate(d))}
              disabled={props.busy}
              formatDate={(d) => (d ? d.toLocaleDateString('vi-VN') : '')}
            />
          )}
          {(props.dialog === 'attach' || props.dialog === 'unc') && (
            <>
              {props.dialog === 'attach' && props.uploadMode === 'checklist' && (
                <Dropdown
                  label="Mục checklist"
                  selectedKey={props.uploadItemCode}
                  options={checklistOpts}
                  onChange={(_, opt) =>
                    opt && props.onUploadItemCodeChange(String(opt.key))
                  }
                  disabled={props.busy}
                />
              )}
              {props.dialog === 'attach' && props.uploadMode === 'step' && (
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  Tải tài liệu hỗ trợ cho bước{' '}
                  <strong>{stepShortVi(props.currentStepKey || '')}</strong> (nhóm
                  StepAttachment — không thay thế checklist bắt buộc).
                </Text>
              )}
              <Stack tokens={{ childrenGap: 4 }}>
                <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
                  Chọn tệp
                </Text>
                <input ref={props.fileRef} type="file" disabled={props.busy} />
              </Stack>
            </>
          )}
          {props.dialog === 'submit' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Bạn xác nhận hồ sơ đã đúng, đủ để trình trưởng phòng rồi?
            </Text>
          )}
          {props.dialog === 'mgrApprove' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Xác nhận duyệt gửi hồ sơ sang BPCM2. Không yêu cầu đánh giá Đạt hết checklist —
              việc đó thuộc các bước kiểm tra sau.
            </Text>
          )}
          {props.dialog === 'forward' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Xác nhận chuyển bước. Checklist đã đánh giá Đạt hết các mục cần kiểm tra. Sau khi
              chuyển, không được đánh giá lại.
            </Text>
          )}
          {props.dialog === 'confirmPay' && (
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Xác nhận dựa trên ủy nhiệm chi:{' '}
              {props.uncDocs[0] ? props.uncDocs[0].fileName : '(chưa có tệp)'}
            </Text>
          )}
          {props.dialog === 'review' && (
            <>
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                Mục: <strong>{reviewItemLabel}</strong>
              </Text>
              <Dropdown
                label="Kết quả"
                selectedKey={props.reviewResult}
                options={[
                  { key: 'Pass', text: 'Đạt' },
                  { key: 'Fail', text: 'Không đạt' }
                ]}
                onChange={(_, opt) =>
                  opt && props.onReviewResultChange(opt.key as 'Pass' | 'Fail')
                }
                disabled={props.busy}
              />
              <TextField
                label={
                  props.reviewResult === 'Fail' ? 'Lý do (bắt buộc)' : 'Lý do (tuỳ chọn)'
                }
                multiline
                rows={3}
                value={props.reviewReason}
                onChange={(_, v) => props.onReviewReasonChange(v || '')}
                disabled={props.busy}
              />
            </>
          )}
        </Stack>
        <DialogFooter>
          <DefaultButton
            text="Hủy"
            onClick={props.onDismiss}
            disabled={props.busy}
            styles={actionBtnStyles}
          />
          <PrimaryButton
            text="Xác nhận"
            onClick={props.onConfirm}
            disabled={props.busy}
            styles={
              props.dialog === 'review' && props.reviewResult === 'Fail'
                ? {
                    root: {
                      minWidth: 0,
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 4,
                      background: '#b91c1c',
                      borderColor: '#b91c1c'
                    },
                    rootHovered: { background: '#991b1b', borderColor: '#991b1b' }
                  }
                : actionBtnStyles
            }
          />
        </DialogFooter>
      </Dialog>
    </ThemeProvider>
  );
};

export default PayActionDialog;
