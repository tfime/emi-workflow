import * as React from 'react';
import {
  DefaultButton,
  MessageBar,
  MessageBarType,
  Panel,
  PanelType,
  PrimaryButton,
  Spinner,
  SpinnerSize,
  Stack,
  Text,
  TextField,
  ThemeProvider
} from '@fluentui/react';
import {
  IDocumentIndexRow,
  INoteListItem,
  ISpRestContext,
  resolveDocPreview,
  IResolvedPreview,
  shortFileName
} from '../services';
import { emiPayFluentTheme } from '../theme/fluentPayTheme';
import styles from './EmiPay.module.scss';
import { actionBtnStyles, themeHostStyle } from './detail/detailStyles';

export interface IFilePreviewDrawerProps {
  sp: ISpRestContext;
  doc: IDocumentIndexRow;
  comment: string;
  onCommentChange: (v: string) => void;
  onSendComment: () => void;
  onClose: () => void;
  /** false = chỉ xem tệp, ẩn form ghi chú. */
  commentsEnabled?: boolean;
  commentsDisabledHint?: string;
  /** Chỉ ghi chú gắn documentKey của tệp đang mở. */
  docNotes?: INoteListItem[];
}

const FilePreviewDrawer: React.FC<IFilePreviewDrawerProps> = ({
  sp,
  doc,
  comment,
  onCommentChange,
  onSendComment,
  onClose,
  commentsEnabled = true,
  commentsDisabledHint,
  docNotes
}) => {
  const [preview, setPreview] = React.useState<IResolvedPreview | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const blobRef = React.useRef<string | undefined>(undefined);
  const notes = docNotes || [];

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(undefined);
    void (async () => {
      const result = await resolveDocPreview(sp, doc.fileUrl, doc.fileName);
      if (cancelled) {
        if (result.blobUrl) URL.revokeObjectURL(result.blobUrl);
        return;
      }
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = undefined;
      }
      if (result.blobUrl) blobRef.current = result.blobUrl;
      setPreview(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = undefined;
      }
    };
  }, [sp, doc.fileUrl, doc.fileName, doc.id]);

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Panel
        isOpen={true}
        onDismiss={onClose}
        type={PanelType.large}
        isLightDismiss={true}
        headerText={shortFileName(doc.fileName || 'Tài liệu', 22, 12)}
        closeButtonAriaLabel="Đóng"
        styles={{
          main: { maxWidth: 920 },
          content: { paddingBottom: 24 }
        }}
        onRenderFooterContent={() => (
          <Stack horizontal tokens={{ childrenGap: 8 }} horizontalAlign="end">
            {doc.fileUrl && (
              <DefaultButton
                text="Tải xuống"
                href={doc.fileUrl}
                target="_blank"
                styles={actionBtnStyles}
              />
            )}
            <DefaultButton text="Đóng" onClick={onClose} styles={actionBtnStyles} />
          </Stack>
        )}
        isFooterAtBottom={true}
      >
        <Stack tokens={{ childrenGap: 16 }}>
          <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
            {doc.docClass || '—'} · {doc.uploadedByUPN || '—'}
            {doc.uploadedAt ? ` · ${new Date(doc.uploadedAt).toLocaleString('vi-VN')}` : ''}
          </Text>

          <div className={`${styles.filePreview} ${styles.filePreviewLive}`}>
            {loading && (
              <Stack
                horizontalAlign="center"
                verticalAlign="center"
                tokens={{ childrenGap: 8 }}
                styles={{ root: { padding: 24 } }}
              >
                <Spinner size={SpinnerSize.medium} label="Đang tải xem trước…" />
              </Stack>
            )}
            {!loading && preview?.mode === 'embed' && preview.embedUrl && (
              <iframe
                title={doc.fileName || 'preview'}
                src={preview.embedUrl}
                className={styles.previewFrame}
              />
            )}
            {!loading && preview?.mode === 'image' && preview.blobUrl && (
              <img
                src={preview.blobUrl}
                alt={doc.fileName || 'preview'}
                className={styles.previewImage}
              />
            )}
            {!loading && preview?.mode === 'pdf' && preview.blobUrl && (
              <iframe
                title={doc.fileName || 'pdf'}
                src={preview.blobUrl}
                className={styles.previewFrame}
              />
            )}
            {!loading && preview?.mode === 'none' && (
              <Stack
                horizontalAlign="center"
                tokens={{ childrenGap: 8 }}
                styles={{ root: { padding: 24 } }}
              >
                <Text styles={{ root: { fontWeight: 600 } }}>{doc.fileName}</Text>
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  {preview.error || 'Không xem trước được tệp này trong khung.'}
                </Text>
              </Stack>
            )}
          </div>

          <Stack tokens={{ childrenGap: 10 }}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Text styles={{ root: { fontWeight: 600 } }}>Ghi chú trên tài liệu</Text>
              {notes.length > 0 && (
                <Text
                  variant="small"
                  styles={{
                    root: {
                      background: '#fee2e2',
                      color: '#b91c1c',
                      borderRadius: 4,
                      padding: '1px 6px',
                      fontWeight: '600'
                    }
                  }}
                >
                  {notes.length}
                </Text>
              )}
            </Stack>
            {notes.length === 0 ? (
              <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                Chưa có ghi chú cho tệp này.
              </Text>
            ) : (
              <Stack tokens={{ childrenGap: 8 }}>
                {notes.map((n) => (
                  <Stack
                    key={n.id}
                    tokens={{ childrenGap: 4 }}
                    styles={{
                      root: {
                        padding: '8px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: 4,
                        background: '#fafafa'
                      }
                    }}
                  >
                    <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                      {[n.at ? new Date(n.at).toLocaleString('vi-VN') : '', n.actorUPN]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text styles={{ root: { whiteSpace: 'pre-wrap', fontSize: 13 } }}>
                      {n.body}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            )}
            {!commentsEnabled ? (
              <MessageBar messageBarType={MessageBarType.info}>
                {commentsDisabledHint ||
                  'Tiếp nhận và đặt hạn trước khi ghi chú trên tài liệu.'}
              </MessageBar>
            ) : (
              <Stack tokens={{ childrenGap: 8 }}>
                <TextField
                  label="Thêm ghi chú cho tệp này"
                  multiline
                  rows={3}
                  value={comment}
                  onChange={(_, v) => onCommentChange(v || '')}
                  placeholder="Ghi chú gắn với tài liệu này…"
                />
                <Stack horizontal horizontalAlign="end">
                  <PrimaryButton
                    text="Gửi ghi chú"
                    onClick={onSendComment}
                    styles={actionBtnStyles}
                  />
                </Stack>
              </Stack>
            )}
          </Stack>
        </Stack>
      </Panel>
    </ThemeProvider>
  );
};

export default FilePreviewDrawer;
