import * as React from 'react';
import { SPHttpClient } from '@microsoft/sp-http';
import styles from './EmiPay.module.scss';
import ActionDialog from './ActionDialog';
import LivePayApp from './LivePayApp';
import { actionsFor, canViewInternal } from './capability';
import { FEATURE_MAP } from './featureMap';
import {
  DETAIL_STATES,
  INBOX_ITEMS,
  PERSONAS,
  WORKFLOW_STEPS
} from './mockData';
import {
  BadgeKind,
  DialogKind,
  IPayAction,
  PayPersona,
  PayStateKey,
  PayView
} from './types';

export interface IEmiPayProps {
  title: string;
  demoMode: boolean;
  orchestratorUrl?: string;
  userDisplayName: string;
  userLoginName: string;
  webUrl: string;
  spHttpClient: SPHttpClient;
  postToOrchestrator?: (
    url: string,
    body: unknown
  ) => Promise<{ status: number; ok: boolean; text: string }>;
}

type DetailTab = 'info' | 'checklist' | 'files' | 'activity';

const badgeClass = (kind: BadgeKind): string => {
  switch (kind) {
    case 'warn':
      return `${styles.badge} ${styles.badgeWarn}`;
    case 'ok':
      return `${styles.badge} ${styles.badgeOk}`;
    case 'info':
      return `${styles.badge} ${styles.badgeInfo}`;
    case 'danger':
      return `${styles.badge} ${styles.badgeDanger}`;
    default:
      return `${styles.badge} ${styles.badgeMute}`;
  }
};

const swatchClass = (kind?: BadgeKind): string => {
  if (kind === 'warn') {
    return `${styles.swatch} ${styles.swatchWarn}`;
  }
  if (kind === 'info') {
    return `${styles.swatch} ${styles.swatchInfo}`;
  }
  return styles.swatch;
};

const btnClass = (action: IPayAction): string => {
  if (action.primary) {
    return `${styles.btn} ${styles.btnPrimary}`;
  }
  if (action.danger) {
    return `${styles.btn} ${styles.btnDanger}`;
  }
  if (action.ghost) {
    return `${styles.btn} ${styles.btnGhost}`;
  }
  return `${styles.btn} ${styles.btnOutline}`;
};

const DETAIL_CHIPS: { key: PayStateKey; label: string }[] = [
  { key: 'draft', label: 'Nháp' },
  { key: 'returned', label: 'Trả về' },
  { key: 'waiting', label: 'Chờ nhận' },
  { key: 'review', label: 'Đang xử lý' },
  { key: 'chair', label: 'CT.HĐQT' },
  { key: 'unc', label: 'UNC' },
  { key: 'payment', label: 'Xác nhận TT' },
  { key: 'archivePending', label: 'Chờ archive' },
  { key: 'completed', label: 'Hoàn tất' },
  { key: 'cancelled', label: 'Hủy' }
];

const NAV: { id: PayView; label: string }[] = [
  { id: 'inbox', label: 'Việc của tôi' },
  { id: 'create', label: 'Tạo hồ sơ' },
  { id: 'detail', label: 'Chi tiết' },
  { id: 'search', label: 'Tra cứu' },
  { id: 'features', label: 'Bao phủ chức năng' }
];

const EmiPay: React.FC<IEmiPayProps> = (props) => {
  const [view, setView] = React.useState<PayView>('inbox');
  const [persona, setPersona] = React.useState<PayPersona>('creator');
  const [detailState, setDetailState] = React.useState<PayStateKey>('draft');
  const [detailTab, setDetailTab] = React.useState<DetailTab>('info');
  const [dialog, setDialog] = React.useState<DialogKind>(undefined);
  const [toast, setToast] = React.useState('');
  const [searchQ, setSearchQ] = React.useState('');

  if (!props.demoMode) {
    return (
      <LivePayApp
        title={props.title}
        userDisplayName={props.userDisplayName}
        userLoginName={props.userLoginName}
        orchestratorUrl={props.orchestratorUrl}
        sp={{
          spHttpClient: props.spHttpClient,
          webUrl: props.webUrl,
          postToOrchestrator: props.postToOrchestrator
        }}
      />
    );
  }

  let personaMeta = PERSONAS[0];
  for (let i = 0; i < PERSONAS.length; i++) {
    if (PERSONAS[i].id === persona) {
      personaMeta = PERSONAS[i];
      break;
    }
  }

  const detail = DETAIL_STATES[detailState];
  const actions = actionsFor(persona, detailState);
  const showInternal = canViewInternal(persona);

  const mine = INBOX_ITEMS.filter(
    (i) => i.bucket === 'mine' && i.personas.indexOf(persona) >= 0
  );
  const todo = INBOX_ITEMS.filter(
    (i) => i.bucket === 'todo' && i.personas.indexOf(persona) >= 0
  );
  const watch = INBOX_ITEMS.filter(
    (i) => i.bucket === 'watch' && i.personas.indexOf(persona) >= 0
  );

  const showToast = (msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3800);
  };

  const openDetail = (state: PayStateKey): void => {
    setDetailState(state);
    setDetailTab('info');
    setView('detail');
  };

  const onAction = (action: IPayAction): void => {
    if (action.dialog) {
      setDialog(action.dialog);
      return;
    }
    showToast(
      props.demoMode
        ? `Demo: ${action.label} → ${action.command || action.id}`
        : `Gửi lệnh ${action.command || action.id}`
    );
  };

  const visibleFiles = detail.attachments.filter((f) => {
    if (f.scope === 'internal' && !showInternal) {
      return false;
    }
    if (f.scope === 'supplement' && !f.locked && persona === 'creator') {
      return false;
    }
    return true;
  });

  const publicAct = detail.act.filter((a) => a.scope === 'public');
  const internalAct = detail.act.filter((a) => a.scope === 'internal');

  const searchItems = INBOX_ITEMS.filter((i) => {
    if (!searchQ.trim()) {
      return i.bucket === 'watch' || i.state === 'completed' || i.state === 'cancelled';
    }
    const q = searchQ.toLowerCase();
    return i.title.toLowerCase().indexOf(q) >= 0 || i.meta.toLowerCase().indexOf(q) >= 0;
  });

  const coveredCount = FEATURE_MAP.filter((f) => f.covered).length;

  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.mark}>PAY</div>
          <div>
            <h1>{props.title || 'EMI PAY'}</h1>
            <p>
              Hồ sơ thanh toán SPV
              {props.userDisplayName ? ` · ${props.userDisplayName}` : ''}
            </p>
          </div>
        </div>
        <div className={styles.topActions}>
          {props.demoMode && (
            <>
              <span className={badgeClass('mute')}>Demo · persona</span>
              <select
                className={styles.personaSelect}
                value={persona}
                aria-label="Chọn persona demo"
                onChange={(e) => {
                  setPersona(e.target.value as PayPersona);
                }}
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className={styles.avatar} title={personaMeta.label}>
            {personaMeta.short}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Điều hướng EMI PAY">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`${styles.navBtn} ${view === n.id ? styles.navBtnActive : ''}`}
              onClick={() => setView(n.id)}
            >
              {n.label}
            </button>
          ))}
          <p className={styles.navNote}>
            UI bao phủ quy tắc V1.0 · capability theo vai trò × trạng thái. ACL động + Commands thật
            làm sau.
          </p>
        </nav>

        <main className={styles.main}>
          {view === 'inbox' && (
            <>
              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Inbox</p>
                    <h2>Việc của tôi</h2>
                    <p className={styles.sub}>Persona: {personaMeta.label}</p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => setView('create')}
                    >
                      Tạo hồ sơ
                    </button>
                  </div>
                </div>
                <div className={styles.heroStats}>
                  <div className={styles.stat}>
                    <b>Cần xử lý</b>
                    <span>{todo.length}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Hồ sơ của tôi</b>
                    <span>{mine.length}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Theo dõi</b>
                    <span>{watch.length}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Chức năng UI</b>
                    <span>
                      {coveredCount}/{FEATURE_MAP.length}
                    </span>
                  </div>
                </div>
              </section>

              <div className={styles.grid2}>
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Hồ sơ của tôi</h3>
                  </div>
                  <div className={`${styles.cardB} ${styles.list}`}>
                    {mine.length === 0 && <p className={styles.empty}>Không có hồ sơ.</p>}
                    {mine.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.item}
                        onClick={() => openDetail(item.state)}
                      >
                        <span className={swatchClass(item.swatchKind)}>{item.swatch}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className={styles.meta}>{item.meta}</span>
                        </span>
                        <span className={badgeClass(item.badgeKind)}>{item.badge}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Cần xử lý</h3>
                  </div>
                  <div className={`${styles.cardB} ${styles.list}`}>
                    {todo.length === 0 && <p className={styles.empty}>Không có work item.</p>}
                    {todo.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.item}
                        onClick={() => openDetail(item.state)}
                      >
                        <span className={swatchClass(item.swatchKind)}>{item.swatch}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className={styles.meta}>{item.meta}</span>
                        </span>
                        <span className={badgeClass(item.badgeKind)}>{item.badge}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              {watch.length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Theo dõi / đã kết thúc</h3>
                  </div>
                  <div className={`${styles.cardB} ${styles.list}`}>
                    {watch.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.item}
                        onClick={() => openDetail(item.state)}
                      >
                        <span className={swatchClass(item.swatchKind)}>{item.swatch}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className={styles.meta}>{item.meta}</span>
                        </span>
                        <span className={badgeClass(item.badgeKind)}>{item.badge}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {view === 'create' && (
            <>
              <div className={styles.pageToolbar}>
                <div>
                  <h2>Tạo hồ sơ thanh toán</h2>
                  <p>§04 · CREATE_REQUEST · không cảnh báo trùng (BR-15)</p>
                </div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => setView('inbox')}
                >
                  Quay lại
                </button>
              </div>
              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Thông tin chung</h3>
                </div>
                <div className={styles.cardB} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className={styles.form}>
                    <label className={styles.field}>
                      Loại hồ sơ
                      <select defaultValue="SPV_PAYMENT">
                        <option value="SPV_PAYMENT">Hồ sơ thanh toán SPV</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Đơn vị tạo
                      <select defaultValue="OU_PBCM">
                        <option value="OU_PBCM">OU_PBCM · BPCM 1 / NH2</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Số tiền (VND)
                      <input defaultValue="45000000" />
                    </label>
                    <label className={styles.field}>
                      Mã hồ sơ
                      <input placeholder="Trống → RequestKey" />
                    </label>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      Diễn giải
                      <textarea defaultValue="Thanh toán đợt 2 theo hợp đồng SPV-2026-014" />
                    </label>
                  </div>
                  <p className={styles.hint}>
                    Sau tạo: upload checklist bắt buộc rồi Gửi. Người tạo gửi trực tiếp — không trình
                    TP BPCM1 trước (§4.2).
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      onClick={() => setView('inbox')}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSolid}`}
                      onClick={() => {
                        showToast('Demo CREATE_REQUEST → Draft');
                        openDetail('draft');
                      }}
                    >
                      Tạo hồ sơ
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {view === 'detail' && (
            <>
              <div className={styles.chips} role="group" aria-label="Mẫu trạng thái">
                {DETAIL_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`${styles.chip} ${detailState === c.key ? styles.chipOn : ''}`}
                    onClick={() => setDetailState(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Chi tiết hồ sơ</p>
                    <h2>{detail.title}</h2>
                    <p className={styles.sub}>{detail.sub}</p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      onClick={() => setView('inbox')}
                    >
                      Quay lại
                    </button>
                    {actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={btnClass(a)}
                        onClick={() => onAction(a)}
                      >
                        {a.label}
                      </button>
                    ))}
                    {actions.length === 0 && (
                      <span className={badgeClass('mute')}>Không thao tác · chỉ xem</span>
                    )}
                  </div>
                </div>
                <div className={styles.heroStats}>
                  <div className={styles.stat}>
                    <b>Trạng thái</b>
                    <span>{detail.status}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Bước</b>
                    <span>{detail.stepshort}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Số tiền</b>
                    <span>{detail.amount}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>{detail.deadline ? 'Hạn XL' : 'OU'}</b>
                    <span>{detail.deadline || detail.ou}</span>
                  </div>
                </div>
              </section>

              {detail.banner && (
                <div
                  className={`${styles.banner} ${
                    detail.banner.kind === 'warn' ? styles.bannerWarn : styles.bannerInfo
                  }`}
                  dangerouslySetInnerHTML={{ __html: detail.banner.html }}
                />
              )}

              <div className={styles.steps} aria-label="7 bước">
                {WORKFLOW_STEPS.map((label, idx) => {
                  let cls = styles.step;
                  if (idx < detail.current) {
                    cls = `${styles.step} ${styles.stepDone}`;
                  } else if (idx === detail.current) {
                    cls = `${styles.step} ${styles.stepOn}`;
                  }
                  return (
                    <div key={label} className={cls}>
                      {label}
                    </div>
                  );
                })}
              </div>

              <div className={styles.tabs}>
                {(
                  [
                    { id: 'info', label: 'Thông tin' },
                    { id: 'checklist', label: 'Checklist' },
                    { id: 'files', label: 'Tài liệu' },
                    { id: 'activity', label: 'Lịch sử' }
                  ] as { id: DetailTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.tab} ${detailTab === t.id ? styles.tabOn : ''}`}
                    onClick={() => setDetailTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {detailTab === 'info' && (
                <div className={styles.grid2}>
                  <section className={styles.card}>
                    <div className={styles.cardH}>
                      <h3>Thông tin chung</h3>
                      {detail.canEditMaster && persona === 'creator' && (
                        <span className={badgeClass('info')}>Được sửa</span>
                      )}
                    </div>
                    <div className={styles.cardB}>
                      <dl className={styles.kv}>
                        <dt>Trạng thái</dt>
                        <dd>{detail.status}</dd>
                        <dt>Bước</dt>
                        <dd>{detail.step}</dd>
                        <dt>OU</dt>
                        <dd>{detail.ou}</dd>
                        <dt>Người tạo</dt>
                        <dd>{detail.creator}</dd>
                        <dt>Vòng</dt>
                        <dd>{detail.round}</dd>
                        <dt>Diễn giải</dt>
                        <dd>{detail.explanation}</dd>
                        {detail.returnFromStepKey && (
                          <>
                            <dt>Trả từ</dt>
                            <dd>{detail.returnFromStepKey}</dd>
                          </>
                        )}
                        {detail.paymentDueAt && (
                          <>
                            <dt>Hạn TT</dt>
                            <dd>{detail.paymentDueAt}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  </section>
                  <section className={styles.card}>
                    <div className={styles.cardH}>
                      <h3>Phân công / hạn</h3>
                    </div>
                    <div className={styles.cardB}>
                      {detail.deadline ? (
                        <p className={styles.hint}>Hạn xử lý: <b>{detail.deadline}</b></p>
                      ) : (
                        <p className={styles.hint}>Chưa đặt hạn (sau Tiếp nhận).</p>
                      )}
                      {detail.assignees.length === 0 && (
                        <p className={styles.empty}>Chưa phân công nhân sự.</p>
                      )}
                      {detail.assignees.map((a) => (
                        <div key={a.upn} className={styles.actRow}>
                          <span>
                            <strong>{a.name}</strong>
                            <span className={styles.meta}>{a.upn}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {detailTab === 'checklist' && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Checklist tài liệu</h3>
                    {(persona === 'manager' || persona === 'assignee' || persona === 'tckt') &&
                      detailState === 'review' && (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost}`}
                          onClick={() => setDialog('checklist')}
                        >
                          Đánh giá
                        </button>
                      )}
                  </div>
                  <div className={styles.cardB}>
                    {detail.check.length === 0 && (
                      <p className={styles.empty}>Không có mục checklist ở trạng thái này.</p>
                    )}
                    {detail.check.map((c) => (
                      <div key={c.code} className={styles.checkRow}>
                        <span>
                          <strong>
                            {c.label}
                            {c.required ? ' *' : ''}
                          </strong>
                          <span className={styles.meta}>{c.meta}</span>
                        </span>
                        <span className={badgeClass(c.kind)}>{c.badge}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detailTab === 'files' && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Tài liệu / đính kèm</h3>
                    {(detail.canUploadChecklist || detail.canUploadSupplement) && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => setDialog('attach')}
                      >
                        Tải thêm
                      </button>
                    )}
                  </div>
                  <div className={styles.cardB}>
                    {visibleFiles.length === 0 && (
                      <p className={styles.empty}>
                        Không có file hiển thị cho persona này (§13.2).
                      </p>
                    )}
                    {visibleFiles.map((f) => (
                      <div key={`${f.name}-${f.scope}`} className={styles.checkRow}>
                        <span>
                          <strong>{f.name}</strong>
                          <span className={styles.meta}>
                            {f.scope} · {f.by}
                            {f.locked ? ' · khóa' : ''}
                          </span>
                        </span>
                        <span className={badgeClass(f.locked ? 'mute' : 'info')}>
                          {f.scope}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {detailTab === 'activity' && (
                <div className={styles.grid2}>
                  <section className={styles.card}>
                    <div className={styles.cardH}>
                      <h3>Công khai</h3>
                    </div>
                    <div className={styles.cardB}>
                      {publicAct.map((a, i) => (
                        <div key={`p-${i}`} className={styles.actRow}>
                          <span>
                            <strong>{a.type}</strong>
                            <span className={styles.meta}>{a.text}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className={styles.card}>
                    <div className={styles.cardH}>
                      <h3>Nội bộ</h3>
                      {!showInternal && <span className={badgeClass('mute')}>Ẩn</span>}
                    </div>
                    <div className={styles.cardB}>
                      {!showInternal && (
                        <p className={styles.empty}>Persona hiện tại không xem Activity nội bộ.</p>
                      )}
                      {showInternal &&
                        internalAct.map((a, i) => (
                          <div key={`i-${i}`} className={styles.actRow}>
                            <span>
                              <strong>{a.type}</strong>
                              <span className={styles.meta}>{a.text}</span>
                            </span>
                          </div>
                        ))}
                      {showInternal && internalAct.length === 0 && (
                        <p className={styles.empty}>Không có sự kiện nội bộ.</p>
                      )}
                    </div>
                  </section>
                </div>
              )}

              <p className={styles.cmd}>
                <b>Command</b> · {detail.cmd}
              </p>
            </>
          )}

          {view === 'search' && (
            <>
              <div className={styles.pageToolbar}>
                <div>
                  <h2>Tra cứu hồ sơ</h2>
                  <p>Hoàn tất / hủy / chờ archive · chỉ xem (BR-14)</p>
                </div>
              </div>
              <section className={styles.card}>
                <div className={styles.cardB} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label className={styles.field}>
                    Tìm theo mã / mô tả
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="REQ-…"
                    />
                  </label>
                  <div className={styles.list}>
                    {searchItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.item}
                        onClick={() => openDetail(item.state)}
                      >
                        <span className={swatchClass(item.swatchKind)}>{item.swatch}</span>
                        <span>
                          <strong>{item.title}</strong>
                          <span className={styles.meta}>{item.meta}</span>
                        </span>
                        <span className={badgeClass(item.badgeKind)}>{item.badge}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {view === 'features' && (
            <>
              <div className={styles.pageToolbar}>
                <div>
                  <h2>Bao phủ chức năng UI</h2>
                  <p>
                    {coveredCount}/{FEATURE_MAP.length} mục có mặt trên demo · đối chiếu quy tắc V1.0
                  </p>
                </div>
              </div>
              <section className={styles.card}>
                <div className={styles.cardB} style={{ padding: 0, overflowX: 'auto' }}>
                  <table className={styles.featureTable}>
                    <thead>
                      <tr>
                        <th>Khu vực</th>
                        <th>Chức năng</th>
                        <th>BR / §</th>
                        <th>UI</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_MAP.map((f) => (
                        <tr key={f.id}>
                          <td>{f.area}</td>
                          <td>{f.name}</td>
                          <td>{f.br || '—'}</td>
                          <td>
                            <span className={badgeClass(f.covered ? 'ok' : 'mute')}>
                              {f.covered ? 'Có' : 'Ngoài V1'}
                            </span>
                          </td>
                          <td>{f.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {dialog && (
        <ActionDialog
          kind={dialog}
          detail={detail}
          onClose={() => setDialog(undefined)}
          onConfirm={(summary) => {
            setDialog(undefined);
            showToast(`Demo: ${summary}`);
          }}
        />
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
      <p className={styles.foot}>
        SPFx · emi-workflow/spfx · demoMode={String(props.demoMode)} · UI ≠ ACL
      </p>
    </div>
  );
};

export default EmiPay;
