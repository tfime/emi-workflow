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
import { IRequestMaster } from '../../services/RequestService';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import {
  actionBtnStyles,
  cardStack,
  fillStack,
  themeHostStyle
} from '../detail/detailStyles';
import { badgeBg, badgeColor } from '../detail/fluentBadge';
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

const countPill = (n: number, kind: string): React.ReactNode => (
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
    {n}
  </Text>
);

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
    props.inboxFilter === 'mine' ? 'Hồ sơ của tôi' : 'Đang theo dõi';
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

  const stats: { label: string; value: number }[] = [
    { label: 'Cần xử lý', value: props.todoRows.length },
    { label: 'Cần tiếp nhận', value: acceptTodoCount },
    { label: 'Hồ sơ của tôi', value: props.mineRows.length },
    { label: 'Đã trả về', value: returnedCount },
    { label: 'Đang xử lý', value: inProgressCount }
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
            Việc của tôi
          </Text>
          <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
            <DefaultButton
              text="Làm mới"
              disabled={props.busy}
              onClick={props.onRefresh}
              styles={actionBtnStyles}
            />
            {props.mayCreate && (
              <PrimaryButton
                text="Tạo hồ sơ mới"
                onClick={props.onCreate}
                styles={actionBtnStyles}
              />
            )}
          </Stack>
        </Stack>

        <Stack horizontal wrap tokens={{ childrenGap: 10 }}>
          {stats.map((s) => (
            <Stack
              key={s.label}
              tokens={{ childrenGap: 4 }}
              styles={{
                root: {
                  flex: '1 1 120px',
                  minWidth: 110,
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                  padding: '12px 14px'
                }
              }}
            >
              <Text variant="small" styles={{ root: { color: '#4b5563', fontWeight: 600 } }}>
                {s.label}
              </Text>
              <Text variant="xLarge" styles={{ root: { fontWeight: 700, color: '#0f766e' } }}>
                {s.value}
              </Text>
            </Stack>
          ))}
        </Stack>

        <Stack styles={cardStack}>
          <TextField
            label="Tìm kiếm"
            type="search"
            value={searchQuery}
            placeholder="Mã, tiêu đề, người tạo, phòng, trạng thái…"
            onChange={(_, v) => setSearchQuery(v || '')}
          />
        </Stack>

        {(props.inboxFilter === 'all' || props.inboxFilter === 'todo') && (
          <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
              <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
                Cần tôi xử lý
              </Text>
              {countPill(props.todoRows.length, acceptTodoCount > 0 ? 'warn' : 'mute')}
            </Stack>
            {acceptTodoCount > 0 && (
              <MessageBar messageBarType={MessageBarType.warning}>
                Có {acceptTodoCount} hồ sơ cần tiếp nhận (đặt hạn xử lý) trước khi đánh giá /
                quyết định.
              </MessageBar>
            )}
            <InboxStatusTabs
              tabs={todoTabs}
              activeId={effectiveTodoTab}
              ariaLabel="Lọc trạng thái — cần tôi xử lý"
              onChange={setTodoTab}
            />
            <InboxTable
              rows={todoFiltered}
              searchQuery=""
              orgMembers={props.orgMembers}
              orgUnits={props.orgUnits}
              onOpen={props.onOpen}
              resetToken={`${resetBase}|todo|${effectiveTodoTab}`}
            />
          </Stack>
        )}

        {/* «Đang theo dõi» (relatedRows khi filter=all) tạm ẩn — chưa chốt nghiệp vụ; giữ code relatedRows. */}
        {props.inboxFilter === 'mine' && (
          <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
              <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
                {secondTitle}
              </Text>
              {countPill(secondSource.length, 'mute')}
            </Stack>
            <InboxStatusTabs
              tabs={secondTabs}
              activeId={effectiveSecondTab}
              ariaLabel={`Lọc trạng thái — ${secondTitle}`}
              onChange={setSecondTab}
            />
            <InboxTable
              rows={secondFiltered}
              searchQuery=""
              orgMembers={props.orgMembers}
              orgUnits={props.orgUnits}
              onOpen={props.onOpen}
              resetToken={`${resetBase}|second|${effectiveSecondTab}`}
            />
          </Stack>
        )}
      </Stack>
    </ThemeProvider>
  );
};

export default InboxPage;
