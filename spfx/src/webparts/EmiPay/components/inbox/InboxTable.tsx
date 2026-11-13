import * as React from 'react';
import styles from '../EmiPay.module.scss';
import { IRequestMaster, displayRequestTitle } from '../../services/RequestService';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import {
  moneyVi,
  statusVi,
  statusBadgeKind,
  stepShortVi
} from '../../services/viLabels';
import {
  INBOX_PAGE_SIZE,
  creatorDisplayName,
  filterInboxRows,
  formatCreatedAt,
  ouDisplayName,
  paginateRows,
  sortByCreatedDesc
} from './inboxHelpers';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

export interface IInboxTableProps {
  rows: IRequestMaster[];
  searchQuery: string;
  orgMembers: IOrgMember[];
  orgUnits: IOrgUnit[];
  onOpen: (requestKey: string) => void;
  /** Reset key khi đổi filter nav / search — về trang 1. */
  resetToken: string;
}

const InboxTable: React.FC<IInboxTableProps> = (props) => {
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [props.resetToken]);

  const prepared = sortByCreatedDesc(
    filterInboxRows(props.rows, props.searchQuery, props.orgMembers, props.orgUnits)
  );
  const paged = paginateRows(prepared, page, INBOX_PAGE_SIZE);

  if (!props.rows.length && !(props.searchQuery || '').trim()) {
    return <p className={styles.empty}>Không có hồ sơ.</p>;
  }

  if (!prepared.length) {
    return <p className={styles.empty}>Không có hồ sơ khớp tìm kiếm.</p>;
  }

  return (
    <div>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Mã hồ sơ</th>
            <th>Tiêu đề</th>
            <th>Người tạo</th>
            <th>Phòng tạo</th>
            <th>Ngày tạo</th>
            <th>Bước</th>
            <th>Số tiền</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {paged.pageRows.map((item) => (
            <tr
              key={item.requestKey}
              style={{ cursor: 'pointer' }}
              onClick={() => props.onOpen(item.requestKey)}
            >
              <td>
                <strong>{item.requestCode || item.requestKey}</strong>
              </td>
              <td>{displayRequestTitle(item)}</td>
              <td>{creatorDisplayName(item.creatorUPN, props.orgMembers)}</td>
              <td>{ouDisplayName(item.createdOUCode, props.orgUnits)}</td>
              <td>{formatCreatedAt(item.createdAt)}</td>
              <td>{stepShortVi(item.currentStepKey)}</td>
              <td>{moneyVi(item.amount)}</td>
              <td>
                <span className={badgeClass(statusBadgeKind(item.status))}>
                  {statusVi(item.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {paged.pageCount > 1 || paged.total > INBOX_PAGE_SIZE ? (
        <div className={styles.inboxPager}>
          <span className={styles.inboxPagerMeta}>
            Hiển thị {paged.from}–{paged.to} / {paged.total}
          </span>
          <div className={styles.inboxPagerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnOutline}`}
              disabled={paged.page <= 1}
              onClick={() => setPage(paged.page - 1)}
            >
              Trước
            </button>
            <span className={styles.inboxPagerMeta}>
              Trang {paged.page} / {paged.pageCount}
            </span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnOutline}`}
              disabled={paged.page >= paged.pageCount}
              onClick={() => setPage(paged.page + 1)}
            >
              Sau
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.inboxPager}>
          <span className={styles.inboxPagerMeta}>
            Hiển thị {paged.from}–{paged.to} / {paged.total}
          </span>
        </div>
      )}
    </div>
  );
};

export default InboxTable;
