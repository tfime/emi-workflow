import * as React from 'react';
import {
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  MessageBar,
  MessageBarType,
  SelectionMode,
  Spinner,
  SpinnerSize,
  Stack,
  Text,
  ThemeProvider
} from '@fluentui/react';
import styles from '../EmiPay.module.scss';
import { ISpRestContext } from '../../services/SpRest';
import {
  IOrgUnit,
  IOrgMember,
  IDashboardThresholds,
  getDashboardThresholds
} from '../../services/ConfigService';
import {
  IRequestMaster,
  IWorkItemRow,
  listRecentRequests,
  listWorkItemsForDashboard
} from '../../services/RequestService';
import { listRecentActivityPublic, IActivityPublicRow } from '../../services/ActivityService';
import { ICommandActor, requestVisibleTo } from '../../services/actorAuth';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import {
  actionBtnStyles,
  cardStack,
  fillStack,
  themeHostStyle
} from '../detail/detailStyles';
import { badgeBg, badgeColor } from '../detail/fluentBadge';
import {
  buildDashboardModel,
  IDashAlert,
  IOuLoadRow,
  IOuRateRow,
  ouNameOf
} from './dashboardStats';
import DashBarChart from './DashBarChart';

const pill = (text: string, kind: string): React.ReactNode => (
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
    {text}
  </Text>
);

const formatRate = (
  rate: number | undefined,
  hint?: string,
  warn?: boolean
): React.ReactNode => {
  if (rate === undefined) {
    return <Text styles={{ root: { color: '#9ca3af' } }}>—</Text>;
  }
  return (
    <Text
      title={hint || undefined}
      styles={{
        root: {
          fontWeight: 600,
          color: warn && rate > 0 ? '#b45309' : '#111'
        }
      }}
    >
      {rate}%
    </Text>
  );
};

export interface IDashboardPageProps {
  sp: ISpRestContext;
  actor: ICommandActor;
  orgUnits: IOrgUnit[];
  orgMembers: IOrgMember[];
  busy: boolean;
  onOpen: (requestKey: string) => void;
  onRefreshParent?: () => void;
}

const DashboardPage: React.FC<IDashboardPageProps> = (props) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [thresholds, setThresholds] = React.useState<IDashboardThresholds | undefined>(
    undefined
  );
  const [requests, setRequests] = React.useState<IRequestMaster[]>([]);
  const [workItems, setWorkItems] = React.useState<IWorkItemRow[]>([]);
  const [activities, setActivities] = React.useState<IActivityPublicRow[]>([]);

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const th = await getDashboardThresholds(props.sp);
      setThresholds(th);
      const [reqs, items, acts] = await Promise.all([
        listRecentRequests(props.sp, { top: 200 }),
        listWorkItemsForDashboard(props.sp, { top: 400 }),
        listRecentActivityPublic(props.sp, { top: 200 }).catch(() => [])
      ]);
      setRequests(reqs);
      setWorkItems(items);
      setActivities(acts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [props.sp]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = requests.filter((r) => requestVisibleTo(props.actor, r));
  const visibleKeys: { [k: string]: boolean } = {};
  for (let i = 0; i < visible.length; i++) {
    visibleKeys[visible[i].requestKey] = true;
  }
  const scopedActs =
    props.actor.memberRole === 'SysAdmin'
      ? activities
      : activities.filter(
          (a) => !a.requestKey || !!visibleKeys[a.requestKey]
        );
  const model = buildDashboardModel(
    visible,
    workItems,
    props.orgUnits,
    thresholds || {
      dueSoonDays: 3,
      paymentDueSoonDays: 7,
      overloadWaitingAccept: 5,
      overloadOverdueWi: 3,
      alertReviewRound: 3
    },
    scopedActs,
    props.orgMembers
  );

  const scopeLabel =
    props.actor.memberRole === 'SysAdmin'
      ? 'Toàn bộ hệ thống'
      : `Phòng ${
          props.orgUnits.filter((u) => u.ouCode === props.actor.ouCode)[0]?.ouName ||
          props.actor.ouCode ||
          '—'
        }`;

  const renderAlert = (a: IDashAlert): React.ReactNode => {
    const clickable = !!a.requestKey;
    const border =
      a.severity === 'danger' ? '#fecaca' : a.severity === 'warn' ? '#fde68a' : '#bfdbfe';
    const bg =
      a.severity === 'danger' ? '#fef2f2' : a.severity === 'warn' ? '#fffbeb' : '#eff6ff';
    const kindColor =
      a.severity === 'danger' ? '#b91c1c' : a.severity === 'warn' ? '#92400e' : '#1d4ed8';
    const headline = a.requestCode
      ? a.requestCode
      : a.ouCode
        ? ouNameOf(a.ouCode, props.orgUnits)
        : 'Hệ thống';
    return (
      <DefaultButton
        key={a.id}
        disabled={!clickable}
        onClick={() => {
          if (a.requestKey) props.onOpen(a.requestKey);
        }}
        styles={{
          root: {
            width: '100%',
            height: 'auto',
            minHeight: 44,
            padding: '10px 12px',
            borderRadius: 4,
            border: `1px solid ${border}`,
            background: bg,
            textAlign: 'left'
          },
          rootHovered: { background: bg, borderColor: border },
          flexContainer: {
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          },
          label: { margin: 0, width: '100%' }
        }}
      >
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="start"
          tokens={{ childrenGap: 10 }}
          styles={{ root: { width: '100%' } }}
        >
          <Stack tokens={{ childrenGap: 4 }} styles={{ root: { minWidth: 0, flex: 1 } }}>
            <Text
              variant="small"
              styles={{ root: { color: kindColor, fontWeight: 700 } }}
            >
              {a.title}
            </Text>
            <Text styles={{ root: { fontWeight: 600 } }}>{headline}</Text>
            <Text variant="small" styles={{ root: { color: '#4b5563', whiteSpace: 'normal' } }}>
              {a.detail}
            </Text>
          </Stack>
          {clickable && (
            <Text
              variant="small"
              styles={{ root: { color: '#0f766e', fontWeight: 600, flexShrink: 0 } }}
            >
              Mở
            </Text>
          )}
        </Stack>
      </DefaultButton>
    );
  };

  const kpiItems = [
    { label: 'Hồ sơ đang mở', value: model.totals.open, hot: false },
    { label: 'Chờ tiếp nhận', value: model.totals.waitingAccept, hot: false },
    { label: 'Quá hạn xử lý', value: model.totals.wiOverdue, hot: !!model.totals.wiOverdue },
    {
      label: 'Điểm nóng',
      value: model.totals.attentionCount,
      hot: !!model.totals.attentionCount
    }
  ];

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 14 }} styles={fillStack} className={styles.dashPage}>
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          wrap
          tokens={{ childrenGap: 12 }}
          styles={cardStack}
        >
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
              Tổng quan vận hành
            </Text>
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              {scopeLabel}
            </Text>
          </Stack>
          <DefaultButton
            text="Làm mới"
            disabled={loading || props.busy}
            styles={actionBtnStyles}
            onClick={() => {
              void load();
              if (props.onRefreshParent) props.onRefreshParent();
            }}
          />
        </Stack>

        {error && (
          <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>
        )}
        {loading && !error && (
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
            <Spinner size={SpinnerSize.small} />
            <Text>Đang tải tổng quan…</Text>
          </Stack>
        )}

        {!loading && !error && (
          <>
            <Stack horizontal wrap tokens={{ childrenGap: 12 }}>
              <Stack
                horizontal
                wrap
                tokens={{ childrenGap: 10 }}
                styles={{ root: { flex: '1 1 280px', minWidth: 0 } }}
              >
                {kpiItems.map((k) => (
                  <Stack
                    key={k.label}
                    tokens={{ childrenGap: 4 }}
                    styles={{
                      root: {
                        flex: '1 1 120px',
                        minWidth: 110,
                        background: '#fff',
                        border: `1px solid ${k.hot ? '#fecaca' : '#e5e7eb'}`,
                        borderRadius: 4,
                        padding: '12px 14px'
                      }
                    }}
                  >
                    <Text
                      variant="small"
                      styles={{ root: { color: '#4b5563', fontWeight: 600 } }}
                    >
                      {k.label}
                    </Text>
                    <Text
                      variant="xLarge"
                      styles={{
                        root: { fontWeight: 700, color: k.hot ? '#b91c1c' : '#0f766e' }
                      }}
                    >
                      {k.value}
                    </Text>
                  </Stack>
                ))}
              </Stack>

              <Stack
                tokens={{ childrenGap: 10 }}
                styles={{
                  ...cardStack,
                  root: {
                    ...(cardStack.root as object),
                    flex: '1 1 280px',
                    minWidth: 0,
                    maxHeight: 320,
                    overflow: 'auto'
                  }
                }}
              >
                <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                  <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
                    Cần để ý ngay
                  </Text>
                  {pill(
                    String(model.priorityAlerts.length),
                    model.priorityAlerts.length ? 'danger' : 'ok'
                  )}
                </Stack>
                {model.priorityAlerts.length === 0 ? (
                  <Text styles={{ root: { color: '#4b5563' } }}>
                    Không có việc nóng theo mức cảnh báo hiện tại.
                  </Text>
                ) : (
                  <Stack tokens={{ childrenGap: 8 }}>
                    {model.priorityAlerts.map(renderAlert)}
                  </Stack>
                )}
              </Stack>
            </Stack>

          <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              Tình trạng từng phòng
            </Text>
            {model.ouRows.length === 0 ? (
              <Text styles={{ root: { color: '#4b5563' } }}>Không có dữ liệu phòng.</Text>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <DetailsList
                  items={model.ouRows}
                  selectionMode={SelectionMode.none}
                  layoutMode={DetailsListLayoutMode.justified}
                  compact={true}
                  columns={
                    [
                      {
                        key: 'ou',
                        name: 'Phòng ban',
                        minWidth: 120,
                        isResizable: true,
                        onRender: (row: IOuLoadRow) => (
                          <Text styles={{ root: { fontWeight: 600 } }}>{row.ouName}</Text>
                        )
                      },
                      {
                        key: 'total',
                        name: 'Hồ sơ đang giữ',
                        minWidth: 80,
                        onRender: (row: IOuLoadRow) => row.total
                      },
                      {
                        key: 'wa',
                        name: 'Chờ tiếp nhận',
                        minWidth: 80,
                        onRender: (row: IOuLoadRow) => row.waitingAccept
                      },
                      {
                        key: 'ir',
                        name: 'Đang xử lý',
                        minWidth: 70,
                        onRender: (row: IOuLoadRow) => row.inReview
                      },
                      {
                        key: 'od',
                        name: 'Quá hạn',
                        minWidth: 70,
                        onRender: (row: IOuLoadRow) =>
                          row.wiOverdue > 0 ? pill(String(row.wiOverdue), 'danger') : 0
                      },
                      {
                        key: 'soon',
                        name: 'Sắp hết hạn',
                        minWidth: 80,
                        onRender: (row: IOuLoadRow) =>
                          row.wiDueSoon > 0 ? pill(String(row.wiDueSoon), 'warn') : 0
                      },
                      {
                        key: 'att',
                        name: 'Cần để ý',
                        minWidth: 70,
                        onRender: (row: IOuLoadRow) => row.attention
                      },
                      {
                        key: 'st',
                        name: 'Tình trạng',
                        minWidth: 100,
                        onRender: (row: IOuLoadRow) =>
                          row.overloaded
                            ? pill('Quá tải', 'danger')
                            : row.wiOverdue > 0 || row.waitingAccept > 0
                              ? pill('Cần theo dõi', 'warn')
                              : pill('Ổn định', 'ok')
                      }
                    ] as IColumn[]
                  }
                />
              </div>
            )}
          </Stack>

          <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              Hiệu suất theo đơn vị
            </Text>
            {model.ouRateRows.length === 0 ? (
              <Text styles={{ root: { color: '#4b5563' } }}>
                Chưa đủ dữ liệu việc / quyết định để tính tỉ lệ.
              </Text>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <DetailsList
                  items={model.ouRateRows}
                  selectionMode={SelectionMode.none}
                  layoutMode={DetailsListLayoutMode.justified}
                  compact={true}
                  columns={
                    [
                      {
                        key: 'ou',
                        name: 'Phòng ban',
                        minWidth: 120,
                        isResizable: true,
                        onRender: (row: IOuRateRow) => (
                          <Text styles={{ root: { fontWeight: 600 } }}>{row.ouName}</Text>
                        )
                      },
                      {
                        key: 'acc',
                        name: 'Tiếp nhận',
                        minWidth: 80,
                        onRender: (row: IOuRateRow) =>
                          formatRate(row.acceptRate, row.acceptHint)
                      },
                      {
                        key: 'ot',
                        name: 'Đúng hạn',
                        minWidth: 80,
                        onRender: (row: IOuRateRow) =>
                          formatRate(row.onTimeRate, row.onTimeHint)
                      },
                      {
                        key: 'late',
                        name: 'Trễ',
                        minWidth: 70,
                        onRender: (row: IOuRateRow) =>
                          formatRate(row.lateRate, row.lateHint, true)
                      },
                      {
                        key: 'ap',
                        name: 'Chấp thuận',
                        minWidth: 80,
                        onRender: (row: IOuRateRow) =>
                          formatRate(row.approveRate, row.approveHint)
                      },
                      {
                        key: 'ret',
                        name: 'Trả lại',
                        minWidth: 70,
                        onRender: (row: IOuRateRow) =>
                          formatRate(row.returnRate, row.returnHint, true)
                      }
                    ] as IColumn[]
                  }
                />
              </div>
            )}
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Theo việc (Work Item) của phòng phụ trách: tiếp nhận trên bước cần ACCEPT;
              đúng hạn/trễ so ngày đóng với hạn xử lý; chấp thuận/trả lại theo quyết định
              PASS·APPROVE / REJECT. Di chuột lên số để xem mẫu (vd. 3/4).
            </Text>
          </Stack>

          <Stack tokens={{ childrenGap: 10 }}>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              Biểu đồ vận hành
            </Text>
            <Stack horizontal wrap tokens={{ childrenGap: 12 }}>
              <Stack styles={{ root: { flex: '1 1 240px', minWidth: 220 } }}>
                <DashBarChart
                  title="Hồ sơ đang mở theo bước"
                  emptyText="Chưa có hồ sơ."
                  items={model.stepRows.map((s) => ({
                    id: s.stepKey || 'none',
                    label: s.label,
                    value: s.count
                  }))}
                />
              </Stack>
              <Stack styles={{ root: { flex: '1 1 240px', minWidth: 220 } }}>
                <DashBarChart
                  title="Phòng tạo hồ sơ"
                  emptyText="Chưa có dữ liệu tạo hồ sơ."
                  accent="ok"
                  items={model.createOuRows.map((r) => ({
                    id: r.ouCode || 'none',
                    label: r.ouName,
                    value: r.count
                  }))}
                />
              </Stack>
              <Stack styles={{ root: { flex: '1 1 240px', minWidth: 220 } }}>
                <DashBarChart
                  title="Người thao tác gần đây"
                  emptyText="Chưa có nhật ký thao tác."
                  accent="warn"
                  items={model.actorRows.map((a) => ({
                    id: a.upn,
                    label: a.displayName,
                    value: a.count,
                    hint: a.upn
                  }))}
                />
              </Stack>
            </Stack>
          </Stack>

          <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
            «Người thao tác gần đây» đếm sự kiện trên nhật ký hồ sơ (tiếp nhận, quyết
            định…), không phải lượt mở trang. «Hồ sơ đang mở» lấy trong phạm vi xem hiện
            tại.
            {thresholds
              ? ` Mức cảnh báo: sắp hết hạn xử lý ${thresholds.dueSoonDays} ngày; sắp đến hạn thanh toán ${thresholds.paymentDueSoonDays} ngày; quá tải khi chờ tiếp nhận từ ${thresholds.overloadWaitingAccept} hoặc việc quá hạn từ ${thresholds.overloadOverdueWi}; xử lý lại từ ${thresholds.alertReviewRound} lượt — chỉnh trong danh mục cấu hình hệ thống.`
              : ''}
          </Text>
        </>
      )}
      </Stack>
    </ThemeProvider>
  );
};

export default DashboardPage;
