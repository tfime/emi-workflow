import * as React from 'react';
import styles from '../EmiPay.module.scss';
import { IRequestMaster } from '../../services/RequestService';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import {
  InboxStatusTabId,
  buildStatusTabs,
  countByStatus,
  countStatusExact,
  defaultTodoStatusTab,
  filterByStatusTab,
  filterInboxRows,
  isInProgressStatus
} from './inboxHelpers';
import InboxStatusTabs from './InboxStatusTabs';
import InboxTable from './InboxTable';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

export interface IInboxPageProps {
  todoRows: IRequestMaster[];
  mineRows: IRequestMaster[];
  relatedRows: IRequestMaster[];
  inboxFilter: 'all' | 'todo' | 'mine';
  orgUnits: IOrgUnit[];
  orgMembers: IOrgMember[];
  busy: boolean;
  mayCreate: boolean;
  onOpen: (requestKey: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}

function tabStillValid(tabs: { id: string }[], id: InboxStatusTabId): boolean {
  for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].id === id) return true;
  }
  return false;
}

const InboxPage: React.FC<IInboxPageProps> = (props) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [todoTab, setTodoTab] = React.useState<InboxStatusTabId>('all');
  const [secondTab, setSecondTab] = React.useState<InboxStatusTabId>('all');

  const acceptTodoCount = countStatusExact(props.todoRows, 'WaitingAcceptance');

  React.useEffect(() => {
    setTodoTab(defaultTodoStatusTab(props.todoRows));
    setSecondTab('all');
  }, [props.inboxFilter]);

  React.useEffect(() => {
    if (acceptTodoCount > 0) {
      setTodoTab('WaitingAcceptance');
    }
  }, [acceptTodoCount]);

  const statsScope =
    props.inboxFilter === 'todo'
      ? props.todoRows
      : props.inboxFilter === 'mine'
        ? props.mineRows
        : (() => {
            const map: { [key: string]: IRequestMaster } = {};
            for (let i = 0; i < props.todoRows.length; i++) {
              map[props.todoRows[i].requestKey] = props.todoRows[i];
            }
            for (let i = 0; i < props.relatedRows.length; i++) {
              map[props.relatedRows[i].requestKey] = props.relatedRows[i];
            }
            for (let i = 0; i < props.mineRows.length; i++) {
              map[props.mineRows[i].requestKey] = props.mineRows[i];
            }
            const keys = Object.keys(map);
            const out: IRequestMaster[] = [];
            for (let i = 0; i < keys.length; i++) {
              out.push(map[keys[i]]);
            }
            return out;
          })();

  const returnedCount = countByStatus(statsScope, (s) => s === 'Returned');
  const inProgressCount = countByStatus(statsScope, isInProgressStatus);

  const secondTitle =
    props.inboxFilter === 'mine' ? 'Hồ sơ của tôi' : 'Hồ sơ liên quan';
  const secondSource =
    props.inboxFilter === 'mine' ? props.mineRows : props.relatedRows;

  const todoSearched = filterInboxRows(
    props.todoRows,
    searchQuery,
    props.orgMembers,
    props.orgUnits
  );
  const secondSearched = filterInboxRows(
    secondSource,
    searchQuery,
    props.orgMembers,
    props.orgUnits
  );

  const todoTabs = buildStatusTabs(todoSearched);
  const secondTabs = buildStatusTabs(secondSearched);

  const effectiveTodoTab = tabStillValid(todoTabs, todoTab) ? todoTab : 'all';
  const effectiveSecondTab = tabStillValid(secondTabs, secondTab)
    ? secondTab
    : 'all';

  const todoFiltered = filterByStatusTab(todoSearched, effectiveTodoTab);
  const secondFiltered = filterByStatusTab(secondSearched, effectiveSecondTab);

  const resetBase = `${props.inboxFilter}|${searchQuery}`;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2>Việc của tôi</h2>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            disabled={props.busy}
            onClick={props.onRefresh}
          >
            Làm mới
          </button>
          {props.mayCreate && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={props.onCreate}
            >
              Tạo hồ sơ mới
            </button>
          )}
        </div>
      </div>

      <div className={styles.heroStats}>
        <div className={styles.stat}>
          <b>Cần xử lý</b>
          <span>{props.todoRows.length}</span>
        </div>
        <div className={styles.stat}>
          <b>Cần tiếp nhận</b>
          <span>{acceptTodoCount}</span>
        </div>
        <div className={styles.stat}>
          <b>Hồ sơ của tôi</b>
          <span>{props.mineRows.length}</span>
        </div>
        <div className={styles.stat}>
          <b>Đã trả về</b>
          <span>{returnedCount}</span>
        </div>
        <div className={styles.stat}>
          <b>Đang xử lý</b>
          <span>{inProgressCount}</span>
        </div>
      </div>

      <div className={styles.inboxSearch}>
        <label className={styles.inboxSearchLabel} htmlFor="emiPayInboxSearch">
          Tìm kiếm
        </label>
        <input
          id="emiPayInboxSearch"
          type="search"
          className={styles.inboxSearchInput}
          value={searchQuery}
          placeholder="Mã, tiêu đề, người tạo, phòng, trạng thái…"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {(props.inboxFilter === 'all' || props.inboxFilter === 'todo') && (
        <section className={styles.card}>
          <div className={styles.cardH}>
            <h3>Cần tôi xử lý</h3>
            <span className={badgeClass(acceptTodoCount > 0 ? 'warn' : 'mute')}>
              {props.todoRows.length}
            </span>
          </div>
          {acceptTodoCount > 0 && (
            <p className={styles.inboxSectionHint}>
              Có {acceptTodoCount} hồ sơ cần tiếp nhận (đặt hạn xử lý) trước khi
              đánh giá / quyết định.
            </p>
          )}
          <InboxStatusTabs
            tabs={todoTabs}
            activeId={effectiveTodoTab}
            ariaLabel="Lọc trạng thái — cần tôi xử lý"
            onChange={setTodoTab}
          />
          <div className={styles.cardB} style={{ padding: 0 }}>
            <InboxTable
              rows={todoFiltered}
              searchQuery=""
              orgMembers={props.orgMembers}
              orgUnits={props.orgUnits}
              onOpen={props.onOpen}
              resetToken={`${resetBase}|todo|${effectiveTodoTab}`}
            />
          </div>
        </section>
      )}

      {(props.inboxFilter === 'all' || props.inboxFilter === 'mine') && (
        <section className={styles.card}>
          <div className={styles.cardH}>
            <h3>{secondTitle}</h3>
            <span className={badgeClass('mute')}>{secondSource.length}</span>
          </div>
          <InboxStatusTabs
            tabs={secondTabs}
            activeId={effectiveSecondTab}
            ariaLabel={`Lọc trạng thái — ${secondTitle}`}
            onChange={setSecondTab}
          />
          <div className={styles.cardB} style={{ padding: 0 }}>
            <InboxTable
              rows={secondFiltered}
              searchQuery=""
              orgMembers={props.orgMembers}
              orgUnits={props.orgUnits}
              onOpen={props.onOpen}
              resetToken={`${resetBase}|second|${effectiveSecondTab}`}
            />
          </div>
        </section>
      )}
    </>
  );
};

export default InboxPage;
