import * as React from 'react';
import styles from './EmiPay.module.scss';
import {
  IDocumentIndexRow,
  ISpRestContext,
  resolveDocPreview,
  IResolvedPreview,
  shortFileName
} from '../services';

export interface IFilePreviewDrawerProps {
  sp: ISpRestContext;
  doc: IDocumentIndexRow;
  comment: string;
  onCommentChange: (v: string) => void;
  onSendComment: () => void;
  onClose: () => void;
}

const FilePreviewDrawer: React.FC<IFilePreviewDrawerProps> = ({
  sp,
  doc,
  comment,
  onCommentChange,
  onSendComment,
  onClose
}) => {
  const [preview, setPreview] = React.useState<IResolvedPreview | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const blobRef = React.useRef<string | undefined>(undefined);

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
    <div
      className={styles.drawerOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Xem tài liệu"
      onClick={onClose}
    >
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerH}>
          <div style={{ minWidth: 0 }}>
            <h3
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={doc.fileName}
            >
              {shortFileName(doc.fileName || 'Tài liệu', 22, 12)}
            </h3>
            <span className={styles.meta} style={{ margin: 0 }}>
              {doc.docClass || '—'} · {doc.uploadedByUPN || '—'}
              {doc.uploadedAt ? ` · ${new Date(doc.uploadedAt).toLocaleString('vi-VN')}` : ''}
            </span>
          </div>
          <div className={styles.actions}>
            {doc.fileUrl && (
              <a
                className={`${styles.btn} ${styles.btnOutline}`}
                href={doc.fileUrl}
                download={doc.fileName || true}
                style={{ padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}
              >
                Tải xuống
              </a>
            )}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onClose}
            >
              Đóng
            </button>
          </div>
        </div>

        <div className={styles.drawerB}>
          <div className={`${styles.filePreview} ${styles.filePreviewLive}`}>
            {loading && <p className={styles.hint}>Đang tải xem trước…</p>}
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
              <div style={{ padding: 24, textAlign: 'center' }}>
                <strong>{doc.fileName}</strong>
                <p className={styles.hint} style={{ marginTop: 8 }}>
                  {preview.error || 'Không xem trước được tệp này trong khung.'}
                </p>
              </div>
            )}
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Ghi chú trên tài liệu</h4>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              Nội dung
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Ghi chú gắn với tài liệu này…"
              />
            </label>
            <div className={styles.actions} style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={onSendComment}
              >
                Gửi ghi chú
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default FilePreviewDrawer;
