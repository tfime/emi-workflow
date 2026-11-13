import * as React from 'react';
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
import { buildDashboardModel, IDashAlert, ouNameOf } from './dashboardStats';
import DashBarChart from './DashBarChart';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

const formatRate = (
  rate: number | undefined,
  hint?: string
): React.ReactNode => {
  if (rate === undefined) {
    return <span className={styles.dashRateEmpty}>—</span>;
  }
  return (
    <span className={styles.dashRate} title={hint || undefined}>
      {rate}%
    </span>
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
    const tone =
      a.severity === 'danger'
        ? styles.dashAlertDanger
        : a.severity === 'warn'
          ? styles.dashAlertWarn
          : styles.dashAlertInfo;
    const headline = a.requestCode
      ? a.requestCode
      : a.ouCode
        ? ouNameOf(a.ouCode, props.orgUnits)
        : 'Hệ thống';
    return (
      <button
        key={a.id}
        type="button"
        className={`${styles.dashAlert} ${tone}`.trim()}
        disabled={!clickable}
        onClick={() => {
          if (a.requestKey) props.onOpen(a.requestKey);
        }}
      >
        <span className={styles.dashAlertKind}>{a.title}</span>
        <span className={styles.dashAlertBody}>
          <strong>{headline}</strong>
          <span>{a.detail}</span>
        </span>
        {clickable && <span className={styles.dashAlertGo}>Mở</span>}
      </button>
    );
  };

  return (
    <div className={styles.dashPage}>
      <div className={styles.pageHead}>
        <div>
          <h2>Tổng quan vận hành</h2>
          <p className={styles.dashLead}>{scopeLabel}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            disabled={loading || props.busy}
            onClick={() => {
              void load();
              if (props.onRefreshParent) props.onRefreshParent();
            }}
          >
            Làm mới
          </button>
        </div>
      </div>

      {error && <p className={styles.empty}>{error}</p>}
      {loading && !error && <p className={styles.empty}>Đang tải tổng quan…</p>}

      {!loading && !error && (
        <>
          <section className={styles.dashSection}>
            <div className={styles.dashTopRow}>
              <div className={styles.dashKpiPanel}>
                <div className={styles.dashKpiGrid2x2}>
                  <div className={styles.dashKpi}>
                    <span className={styles.dashKpiLabel}>Hồ sơ đang mở</span>
                    <strong className={styles.dashKpiValue}>{model.totals.open}</strong>
                  </div>
                  <div className={styles.dashKpi}>
                    <span className={styles.dashKpiLabel}>Chờ tiếp nhận</span>
                    <strong className={styles.dashKpiValue}>
                      {model.totals.waitingAccept}
                    </strong>
                  </div>
                  <div
                    className={`${styles.dashKpi} ${
                      model.totals.wiOverdue ? styles.dashKpiHot : ''
                    }`.trim()}
                  >
                    <span className={styles.dashKpiLabel}>Quá hạn xử lý</span>
                    <strong className={styles.dashKpiValue}>
                      {model.totals.wiOverdue}
                    </strong>
                  </div>
                  <div
                    className={`${styles.dashKpi} ${
                      model.totals.attentionCount ? styles.dashKpiHot : ''
                    }`.trim()}
                  >
                    <span className={styles.dashKpiLabel}>Điểm nóng</span>
                    <strong className={styles.dashKpiValue}>
                      {model.totals.attentionCount}
                    </strong>
                  </div>
                </div>
              </div>

              <section
                className={`${styles.card} ${styles.dashAttentionCard}`.trim()}
              >
                <div className={styles.cardH}>
                  <h3>Cần để ý ngay</h3>
                  <span
                    className={badgeClass(
                      model.priorityAlerts.length ? 'danger' : 'ok'
                    )}
                  >
                    {model.priorityAlerts.length}
                  </span>
                </div>
                <div
                  className={`${styles.cardB} ${styles.dashAttentionBody}`.trim()}
                  style={{
                    padding: model.priorityAlerts.length ? 0 : undefined
                  }}
                >
                  {model.priorityAlerts.length === 0 ? (
                    <p className={styles.empty}>
                      Không có việc nóng theo mức cảnh báo hiện tại.
                    </p>
                  ) : (
                    <div className={styles.dashAlertList}>
                      {model.priorityAlerts.map(renderAlert)}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>

          <section className={styles.dashSection}>
            <h3 className={styles.dashSectionTitle}>Tình trạng từng phòng</h3>
            <div className={styles.card}>
              <div className={styles.cardB} style={{ padding: 0 }}>
                {model.ouRows.length === 0 ? (
                  <p className={styles.empty}>Không có dữ liệu phòng.</p>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Phòng ban</th>
                        <th>Hồ sơ đang giữ</th>
                        <th>Chờ tiếp nhận</th>
                        <th>Đang xử lý</th>
                        <th>Quá hạn</th>
                        <th>Sắp hết hạn</th>
                        <th>Cần để ý</th>
                        <th>Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.ouRows.map((row) => (
                        <tr
                          key={row.ouCode || 'none'}
                          className={
                            row.overloaded || row.wiOverdue > 0
                              ? styles.dashRowHot
                              : undefined
                          }
                        >
                          <td>
                            <strong>{row.ouName}</strong>
                          </td>
                          <td>{row.total}</td>
                          <td>{row.waitingAccept}</td>
                          <td>{row.inReview}</td>
                          <td>
                            {row.wiOverdue > 0 ? (
                              <span className={badgeClass('danger')}>
                                {row.wiOverdue}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td>
                            {row.wiDueSoon > 0 ? (
                              <span className={badgeClass('warn')}>
                                {row.wiDueSoon}
                              </span>
                            ) : (
                              0
                            )}
                          </td>
                          <td className={styles.dashAttentionCell}>
                            {row.attention}
                          </td>
                          <td>
                            {row.overloaded ? (
                              <span className={badgeClass('danger')}>Quá tải</span>
                            ) : row.wiOverdue > 0 || row.waitingAccept > 0 ? (
                              <span className={badgeClass('warn')}>
                                Cần theo dõi
                              </span>
                            ) : (
                              <span className={badgeClass('ok')}>Ổn định</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          <section className={styles.dashSection}>
            <h3 className={styles.dashSectionTitle}>Hiệu suất theo đơn vị</h3>
            <div className={styles.card}>
              <div className={styles.cardB} style={{ padding: 0 }}>
                {model.ouRateRows.length === 0 ? (
                  <p className={styles.empty}>
                    Chưa đủ dữ liệu việc / quyết định để tính tỉ lệ.
                  </p>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Phòng ban</th>
                        <th>Tiếp nhận</th>
                        <th>Đúng hạn</th>
                        <th>Trễ</th>
                        <th>Chấp thuận</th>
                        <th>Trả lại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.ouRateRows.map((row) => (
                        <tr key={`rate-${row.ouCode || 'none'}`}>
                          <td>
                            <strong>{row.ouName}</strong>
                          </td>
                          <td>{formatRate(row.acceptRate, row.acceptHint)}</td>
                          <td>{formatRate(row.onTimeRate, row.onTimeHint)}</td>
                          <td>
                            {row.lateRate !== undefined && row.lateRate > 0 ? (
                              <span
                                className={styles.dashRateWarn}
                                title={row.lateHint || undefined}
                              >
                                {row.lateRate}%
                              </span>
                            ) : (
                              formatRate(row.lateRate, row.lateHint)
                            )}
                          </td>
                          <td>{formatRate(row.approveRate, row.approveHint)}</td>
                          <td>
                            {row.returnRate !== undefined && row.returnRate > 0 ? (
                              <span
                                className={styles.dashRateWarn}
                                title={row.returnHint || undefined}
                              >
                                {row.returnRate}%
                              </span>
                            ) : (
                              formatRate(row.returnRate, row.returnHint)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <p className={styles.dashSectionHint}>
              Theo việc (Work Item) của phòng phụ trách: tiếp nhận trên bước cần
              ACCEPT; đúng hạn/trễ so ngày đóng với hạn xử lý; chấp thuận/trả lại theo
              quyết định PASS·APPROVE / REJECT. Di chuột lên số để xem mẫu (vd. 3/4).
            </p>
          </section>

          <section className={styles.dashSection}>
            <h3 className={styles.dashSectionTitle}>Biểu đồ vận hành</h3>
            <div className={styles.dashGrid3}>
              <DashBarChart
                title="Hồ sơ đang mở theo bước"
                emptyText="Chưa có hồ sơ."
                items={model.stepRows.map((s) => ({
                  id: s.stepKey || 'none',
                  label: s.label,
                  value: s.count
                }))}
              />
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
            </div>
          </section>

          <p className={styles.dashThresholdNote}>
            «Người thao tác gần đây» đếm sự kiện trên nhật ký hồ sơ (tiếp nhận, quyết
            định…), không phải lượt mở trang. «Hồ sơ đang mở» lấy trong phạm vi xem hiện
            tại.
            {thresholds
              ? ` Mức cảnh báo: sắp hết hạn xử lý ${thresholds.dueSoonDays} ngày; sắp đến hạn thanh toán ${thresholds.paymentDueSoonDays} ngày; quá tải khi chờ tiếp nhận từ ${thresholds.overloadWaitingAccept} hoặc việc quá hạn từ ${thresholds.overloadOverdueWi}; xử lý lại từ ${thresholds.alertReviewRound} lượt — chỉnh trong danh mục cấu hình hệ thống.`
              : ''}
          </p>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
