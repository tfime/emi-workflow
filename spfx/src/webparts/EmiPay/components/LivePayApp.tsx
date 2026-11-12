import * as React from 'react';
import styles from './EmiPay.module.scss';
import {
  ISpRestContext,
  IPaymentType,
  IChecklistTemplate,
  IRequestMaster,
  IChecklistItemRow,
  listPaymentTypes,
  listChecklistTemplates,
  listRecentRequests,
  getRequestByKey,
  stepIndex,
  stepLabel,
  listChecklistItems,
  reconcileChecklistFromTemplates,
  requiredChecklistReady,
  enqueueCommand,
  waitCommand,
  uploadChecklistFile,
  uploadUncFile,
  listUncDocuments,
  liveActionsFor,
  CORE_STEPS
} from '../services';
import { DialogKind, IPayAction, PayView } from './types';

export interface ILivePayAppProps {
  title: string;
  userDisplayName: string;
  userLoginName: string;
  sp: ISpRestContext;
}

type DetailTab = 'info' | 'checklist' | 'files';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

const btnClass = (action: IPayAction): string => {
  if (action.primary) return `${styles.btn} ${styles.btnPrimary}`;
  if (action.danger) return `${styles.btn} ${styles.btnDanger}`;
  if (action.ghost) return `${styles.btn} ${styles.btnGhost}`;
  return `${styles.btn} ${styles.btnOutline}`;
};

function upnFromLogin(login: string): string {
  // i:0#.f|membership|user@tenant.com → user@tenant.com
  if (!login) return 'admin@local';
  const parts = login.split('|');
  return parts[parts.length - 1] || login;
}

const LivePayApp: React.FC<ILivePayAppProps> = (props) => {
  const actorUPN = upnFromLogin(props.userLoginName);
  const [view, setView] = React.useState<PayView>('inbox');
  const [toast, setToast] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const [inbox, setInbox] = React.useState<IRequestMaster[]>([]);
  const [paymentTypes, setPaymentTypes] = React.useState<IPaymentType[]>([]);
  const [selectedType, setSelectedType] = React.useState('');
  const [templates, setTemplates] = React.useState<IChecklistTemplate[]>([]);
  const [createTitle, setCreateTitle] = React.useState('Hồ sơ thanh toán UI');
  const [createAmount, setCreateAmount] = React.useState('1000000');
  const [createExpl, setCreateExpl] = React.useState('');
  const [createOu, setCreateOu] = React.useState('OU_BPCM1');

  const [requestKey, setRequestKey] = React.useState('');
  const [master, setMaster] = React.useState<IRequestMaster | undefined>(undefined);
  const [checklist, setChecklist] = React.useState<IChecklistItemRow[]>([]);
  const [uncDocs, setUncDocs] = React.useState<
    { id: number; documentKey: string; fileUrl: string; fileName: string }[]
  >([]);
  const [detailTab, setDetailTab] = React.useState<DetailTab>('info');
  const [dialog, setDialog] = React.useState<DialogKind>(undefined);
  const [reason, setReason] = React.useState('');
  const [paymentDue, setPaymentDue] = React.useState('');
  const [uploadItemCode, setUploadItemCode] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const showToast = (msg: string): void => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 4500);
  };

  const run = async (fn: () => Promise<void>, okMsg?: string): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (okMsg) showToast(okMsg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const refreshInbox = async (): Promise<void> => {
    const rows = await listRecentRequests(props.sp, { top: 50 });
    setInbox(rows);
  };

  const loadDetail = async (key: string): Promise<void> => {
    const m = await getRequestByKey(props.sp, key);
    if (!m) throw new Error(`Không tìm thấy ${key}`);
    const items = await listChecklistItems(props.sp, key);
    const unc = await listUncDocuments(props.sp, key);
    setMaster(m);
    setChecklist(items);
    setUncDocs(unc);
    setRequestKey(key);
  };

  React.useEffect(() => {
    void run(async () => {
      let types = await listPaymentTypes(props.sp);
      if (!types.length) {
        types = [
          {
            id: 0,
            code: 'SPV_PAYMENT',
            title: 'Hồ sơ thanh toán SPV',
            checklistVersion: 1,
            workflowCode: 'EMI_PAY_SPV'
          }
        ];
      }
      setPaymentTypes(types);
      setSelectedType(types[0].code);
      await refreshInbox();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selectedType) {
      setTemplates([]);
      return;
    }
    const pt = paymentTypes.filter((t) => t.code === selectedType)[0];
    if (!pt) return;
    void run(async () => {
      let tpls = await listChecklistTemplates(props.sp, pt.code, pt.checklistVersion);
      if (!tpls.length && pt.code === 'SPV_PAYMENT') {
        tpls = [
          {
            id: 1,
            paymentTypeCode: 'SPV_PAYMENT',
            versionNo: 1,
            itemCode: 'DOC_REQUEST',
            itemLabel: 'Đề nghị thanh toán',
            isRequired: true,
            minFileCount: 1,
            displayOrder: 1
          },
          {
            id: 2,
            paymentTypeCode: 'SPV_PAYMENT',
            versionNo: 1,
            itemCode: 'DOC_INVOICE',
            itemLabel: 'Hóa đơn / chứng từ',
            isRequired: true,
            minFileCount: 1,
            displayOrder: 2
          },
          {
            id: 3,
            paymentTypeCode: 'SPV_PAYMENT',
            versionNo: 1,
            itemCode: 'DOC_CONTRACT',
            itemLabel: 'Hợp đồng liên quan',
            isRequired: false,
            minFileCount: 0,
            displayOrder: 3
          }
        ];
      }
      setTemplates(tpls);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, paymentTypes]);

  const openLiveDetail = (key: string): void => {
    setView('detail');
    setDetailTab('info');
    void run(async () => {
      await loadDetail(key);
    });
  };

  const onCreate = (): void => {
    if (!selectedType) {
      showToast('Chọn loại hồ sơ');
      return;
    }
    void run(async () => {
      const enq = await enqueueCommand(props.sp, 'CREATE_REQUEST', {
        title: createTitle || 'Hồ sơ UI',
        createdOUCode: createOu || 'OU_BPCM1',
        creatorUPN: actorUPN,
        paymentTypeCode: selectedType,
        amount: Number(createAmount) || 0,
        explanation: createExpl || 'Tạo từ EMI-Pay UI'
      });
      showToast(`CREATE #${enq.id}… chờ Flow`);
      await waitCommand(props.sp, enq.id);
      const key = enq.requestKey;
      const pt = paymentTypes.filter((t) => t.code === selectedType)[0];
      if (pt) {
        const tpls = await listChecklistTemplates(props.sp, pt.code, pt.checklistVersion);
        await reconcileChecklistFromTemplates(props.sp, key, tpls);
      }
      await refreshInbox();
      await loadDetail(key);
      setView('detail');
      setDetailTab('checklist');
    }, 'Đã tạo hồ sơ');
  };

  const actions = master ? liveActionsFor(master, checklist, uncDocs.length > 0) : [];

  const onAction = (a: IPayAction): void => {
    setReason('');
    if (a.dialog === 'attach') {
      setUploadItemCode(checklist[0] ? checklist[0].itemCode : '');
      setDialog('attach');
      return;
    }
    if (a.dialog === 'unc') {
      setDialog('unc');
      return;
    }
    if (a.dialog === 'approve') {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      setPaymentDue(d.toISOString().slice(0, 10));
      setDialog('approve');
      return;
    }
    if (a.dialog) {
      setDialog(a.dialog);
      return;
    }
  };

  const confirmDialog = (): void => {
    if (!master) return;
    const kind = dialog;
    setDialog(undefined);

    if (kind === 'submit') {
      void run(async () => {
        if (!requiredChecklistReady(checklist)) {
          throw new Error('Checklist bắt buộc chưa đủ file');
        }
        const enq = await enqueueCommand(
          props.sp,
          'SUBMIT',
          {
            actorUPN,
            expectedStepKey: 'BPCM1_PREPARE',
            expectedReviewRound: master.reviewRound
          },
          { requestKey: master.requestKey }
        );
        showToast(`SUBMIT #${enq.id}…`);
        await waitCommand(props.sp, enq.id);
        await loadDetail(master.requestKey);
        await refreshInbox();
      }, 'Đã gửi hồ sơ');
      return;
    }

    if (kind === 'forward' || kind === 'approve') {
      void run(async () => {
        const payload: Record<string, unknown> = {
          actorUPN,
          decision: 'PASS',
          note: 'UI PASS',
          expectedStepKey: master.currentStepKey,
          expectedStepInstanceKey: master.currentStepInstanceKey,
          expectedReviewRound: master.reviewRound
        };
        if (kind === 'approve') {
          if (!paymentDue) throw new Error('Cần paymentDueAt');
          payload.paymentDueAt = `${paymentDue}T00:00:00Z`;
        }
        const enq = await enqueueCommand(props.sp, 'DECIDE', payload, {
          requestKey: master.requestKey,
          stepInstanceKey: master.currentStepInstanceKey
        });
        showToast(`DECIDE PASS #${enq.id}…`);
        await waitCommand(props.sp, enq.id);
        await loadDetail(master.requestKey);
        await refreshInbox();
      }, 'Đã duyệt / gửi tiếp');
      return;
    }

    if (kind === 'return' || kind === 'reject') {
      void run(async () => {
        if (!reason.trim()) throw new Error('Bắt buộc lý do');
        const enq = await enqueueCommand(
          props.sp,
          'DECIDE',
          {
            actorUPN,
            decision: 'REJECT',
            reason: reason.trim(),
            note: reason.trim(),
            expectedStepKey: master.currentStepKey,
            expectedStepInstanceKey: master.currentStepInstanceKey,
            expectedReviewRound: master.reviewRound
          },
          {
            requestKey: master.requestKey,
            stepInstanceKey: master.currentStepInstanceKey
          }
        );
        showToast(`DECIDE REJECT #${enq.id}…`);
        await waitCommand(props.sp, enq.id);
        await loadDetail(master.requestKey);
        await refreshInbox();
      }, 'Đã trả hồ sơ');
      return;
    }

    if (kind === 'confirmPay') {
      void run(async () => {
        if (!uncDocs.length) throw new Error('Chưa có UNC');
        const enq = await enqueueCommand(
          props.sp,
          'CONFIRM_PAYMENT',
          {
            actorUPN,
            expectedStepKey: 'TCKT_PAY',
            expectedStepInstanceKey: master.currentStepInstanceKey,
            uncDocumentKey: uncDocs[0].documentKey
          },
          {
            requestKey: master.requestKey,
            stepInstanceKey: master.currentStepInstanceKey
          }
        );
        showToast(`CONFIRM #${enq.id}…`);
        await waitCommand(props.sp, enq.id);
        await loadDetail(master.requestKey);
        await refreshInbox();
      }, 'Đã xác nhận thanh toán');
      return;
    }

    if (kind === 'attach' || kind === 'unc') {
      const input = fileRef.current;
      if (!input || !input.files || !input.files.length) {
        showToast('Chọn file để tải lên');
        setDialog(kind);
        return;
      }
      const file = input.files[0];
      void run(async () => {
        const buf = await file.arrayBuffer();
        if (kind === 'unc') {
          const up = await uploadUncFile(props.sp, {
            requestKey: master.requestKey,
            fileName: file.name,
            content: buf,
            uploadedByUPN: actorUPN
          });
          showToast(`UNC ${up.fileName}`);
        } else {
          const item = checklist.filter((c) => c.itemCode === uploadItemCode)[0] || checklist[0];
          if (!item) throw new Error('Không có mục checklist');
          await uploadChecklistFile(props.sp, {
            requestKey: master.requestKey,
            item,
            fileName: file.name,
            content: buf,
            uploadedByUPN: actorUPN
          });
          showToast(`Đã tải ${file.name} → ${item.itemCode}`);
        }
        if (input) input.value = '';
        await loadDetail(master.requestKey);
      });
      return;
    }
  };

  return (
    <div className={styles.app}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.mark}>PAY</div>
          <div>
            <h1>{props.title || 'EMI PAY'}</h1>
            <p>
              Live CECM · {props.userDisplayName || actorUPN}
              {busy ? ' · đang xử lý…' : ''}
            </p>
          </div>
        </div>
        <div className={styles.topActions}>
          <span className={badgeClass('ok')}>Live</span>
          <div className={styles.avatar}>
            {(props.userDisplayName || 'U').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.nav}>
          {(
            [
              { id: 'inbox' as PayView, label: 'Việc của tôi' },
              { id: 'create' as PayView, label: 'Tạo hồ sơ' },
              { id: 'detail' as PayView, label: 'Chi tiết' }
            ] as { id: PayView; label: string }[]
          ).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`${styles.navBtn} ${view === n.id ? styles.navBtnActive : ''}`}
              onClick={() => setView(n.id)}
              disabled={n.id === 'detail' && !master}
            >
              {n.label}
            </button>
          ))}
          <p className={styles.navNote}>
            Ghi Commands → Flow 1.0.0.9. Upload thật DocsWorking. Tắt Demo mode trên web part.
          </p>
        </nav>

        <main className={styles.main}>
          {error && (
            <div className={`${styles.banner} ${styles.bannerWarn}`}>
              <strong>Lỗi:</strong> {error}
            </div>
          )}

          {view === 'inbox' && (
            <>
              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Inbox live</p>
                    <h2>Hồ sơ gần đây</h2>
                    <p className={styles.sub}>Đọc từ EMI_PAY_Requests</p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      disabled={busy}
                      onClick={() => { void run(refreshInbox); }}
                    >
                      Làm mới
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => setView('create')}
                    >
                      Tạo hồ sơ
                    </button>
                  </div>
                </div>
              </section>
              <section className={styles.card}>
                <div className={`${styles.cardB} ${styles.list}`}>
                  {inbox.length === 0 && <p className={styles.empty}>Chưa có hồ sơ.</p>}
                  {inbox.map((item) => (
                    <button
                      key={item.requestKey}
                      type="button"
                      className={styles.item}
                      onClick={() => openLiveDetail(item.requestKey)}
                    >
                      <span className={styles.swatch}>{item.currentStepKey.slice(0, 4)}</span>
                      <span>
                        <strong>{item.requestKey}</strong>
                        <span className={styles.meta}>
                          {item.status} · {stepLabel(item.currentStepKey)} · round {item.reviewRound}
                        </span>
                      </span>
                      <span className={badgeClass('info')}>{item.paymentTypeCode || '—'}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {view === 'create' && (
            <>
              <div className={styles.pageToolbar}>
                <div>
                  <h2>Tạo hồ sơ thanh toán</h2>
                  <p>Chọn loại → checklist theo template → CREATE_REQUEST</p>
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
                      <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                      >
                        {paymentTypes.length === 0 && (
                          <option value="">(Chưa có PaymentTypes — seed CECM)</option>
                        )}
                        {paymentTypes.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.title} ({t.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      Đơn vị tạo
                      <select value={createOu} onChange={(e) => setCreateOu(e.target.value)}>
                        <option value="OU_BPCM1">OU_BPCM1</option>
                        <option value="OU_PBCM">OU_PBCM</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Số tiền (VND)
                      <input
                        value={createAmount}
                        onChange={(e) => setCreateAmount(e.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      Tiêu đề
                      <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
                    </label>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      Diễn giải
                      <textarea
                        rows={3}
                        value={createExpl}
                        onChange={(e) => setCreateExpl(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className={styles.card} style={{ boxShadow: 'none' }}>
                    <div className={styles.cardH}>
                      <h3>Checklist theo loại</h3>
                    </div>
                    <div className={styles.cardB}>
                      {templates.length === 0 && (
                        <p className={styles.empty}>Chưa có template cho loại này.</p>
                      )}
                      {templates.map((t) => (
                        <div key={t.itemCode} className={styles.checkRow}>
                          <div>
                            <strong>{t.itemLabel}</strong>
                            <span className={styles.meta}>
                              {t.itemCode} · min {t.minFileCount}
                              {t.isRequired ? ' · bắt buộc' : ' · tuỳ chọn'}
                            </span>
                          </div>
                          <span className={badgeClass(t.isRequired ? 'warn' : 'mute')}>
                            {t.isRequired ? 'Required' : 'Optional'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

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
                      disabled={busy || !selectedType}
                      onClick={onCreate}
                    >
                      Tạo hồ sơ
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {view === 'detail' && master && (
            <>
              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Chi tiết live</p>
                    <h2>{master.requestKey}</h2>
                    <p className={styles.sub}>
                      {master.paymentTypeCode} · vòng {master.reviewRound} ·{' '}
                      {stepLabel(master.currentStepKey)}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      disabled={busy}
                      onClick={() => { void run(async () => loadDetail(master.requestKey)); }}
                    >
                      Làm mới
                    </button>
                    {actions.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={btnClass(a)}
                        disabled={busy}
                        onClick={() => onAction(a)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.heroStats}>
                  <div className={styles.stat}>
                    <b>Trạng thái</b>
                    <span>{master.status}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Bước</b>
                    <span>{master.currentStepKey}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>OU</b>
                    <span>{master.currentOUCode || '—'}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Due</b>
                    <span>
                      {master.paymentDueAt
                        ? new Date(master.paymentDueAt).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                </div>
              </section>

              <div className={styles.steps} aria-label="7 bước">
                {CORE_STEPS.map((s, idx) => (
                  <div
                    key={s}
                    className={`${styles.step} ${
                      idx === stepIndex(master.currentStepKey) ? styles.stepOn : ''
                    } ${idx < stepIndex(master.currentStepKey) ? styles.stepDone : ''}`}
                  >
                    <span>{idx + 1}</span>
                    <em>{s.replace(/_/g, ' ')}</em>
                  </div>
                ))}
              </div>

              <div className={styles.tabs}>
                {(
                  [
                    { id: 'info' as DetailTab, label: 'Thông tin' },
                    { id: 'checklist' as DetailTab, label: 'Checklist' },
                    { id: 'files' as DetailTab, label: 'UNC / file' }
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
                <section className={styles.card}>
                  <div className={styles.cardB}>
                    <dl className={styles.kv}>
                      <dt>RequestKey</dt>
                      <dd>{master.requestKey}</dd>
                      <dt>Title</dt>
                      <dd>{master.title}</dd>
                      <dt>Người tạo</dt>
                      <dd>{master.creatorUPN}</dd>
                      <dt>SIK</dt>
                      <dd>{master.currentStepInstanceKey || '—'}</dd>
                      <dt>Diễn giải</dt>
                      <dd>{master.explanation || '—'}</dd>
                    </dl>
                  </div>
                </section>
              )}

              {detailTab === 'checklist' && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Checklist</h3>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      disabled={busy || master.currentStepKey !== 'BPCM1_PREPARE'}
                      onClick={() => {
                        setUploadItemCode(checklist[0] ? checklist[0].itemCode : '');
                        setDialog('attach');
                      }}
                    >
                      Tải tài liệu
                    </button>
                  </div>
                  <div className={styles.cardB}>
                    {checklist.map((c) => (
                      <div key={c.id} className={styles.checkRow}>
                        <div>
                          <strong>{c.itemLabel}</strong>
                          <span className={styles.meta}>
                            {c.itemCode} · {c.uploadedCount}/{c.minFileCount || 1}
                            {c.isRequired ? ' · bắt buộc' : ''}
                          </span>
                        </div>
                        <span
                          className={badgeClass(
                            c.itemStatus === 'Uploaded' ? 'ok' : c.isRequired ? 'warn' : 'mute'
                          )}
                        >
                          {c.itemStatus}
                        </span>
                      </div>
                    ))}
                    {!requiredChecklistReady(checklist) && (
                      <p className={styles.warnBox}>
                        SUBMIT bị chặn đến khi đủ file checklist bắt buộc.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {detailTab === 'files' && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>UNC hiện hành</h3>
                  </div>
                  <div className={styles.cardB}>
                    {uncDocs.length === 0 && <p className={styles.empty}>Chưa có UNC.</p>}
                    {uncDocs.map((u) => (
                      <div key={u.id} className={styles.checkRow}>
                        <div>
                          <strong>{u.fileName}</strong>
                          <span className={styles.meta}>{u.documentKey}</span>
                        </div>
                        <a href={u.fileUrl} target="_blank" rel="noreferrer">
                          Mở
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {view === 'detail' && !master && (
            <p className={styles.empty}>Chọn hồ sơ từ inbox hoặc tạo mới. {requestKey}</p>
          )}
        </main>
      </div>

      {dialog && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalH}>
              <h3>
                {dialog === 'submit' && 'Gửi hồ sơ'}
                {dialog === 'forward' && 'Gửi tiếp (PASS)'}
                {dialog === 'return' && 'Trả hồ sơ'}
                {dialog === 'approve' && 'Duyệt CHAIR'}
                {dialog === 'reject' && 'Không duyệt'}
                {dialog === 'attach' && 'Tải checklist'}
                {dialog === 'unc' && 'Tải UNC'}
                {dialog === 'confirmPay' && 'Xác nhận thanh toán'}
              </h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setDialog(undefined)}
              >
                Đóng
              </button>
            </div>
            <div className={styles.modalB}>
              {(dialog === 'return' || dialog === 'reject') && (
                <label className={styles.field}>
                  Lý do (bắt buộc)
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              )}
              {dialog === 'approve' && (
                <label className={styles.field}>
                  paymentDueAt
                  <input
                    type="date"
                    value={paymentDue}
                    onChange={(e) => setPaymentDue(e.target.value)}
                  />
                </label>
              )}
              {(dialog === 'attach' || dialog === 'unc') && (
                <>
                  {dialog === 'attach' && (
                    <label className={styles.field}>
                      Mục checklist
                      <select
                        value={uploadItemCode}
                        onChange={(e) => setUploadItemCode(e.target.value)}
                      >
                        {checklist.map((c) => (
                          <option key={c.itemCode} value={c.itemCode}>
                            {c.itemLabel} ({c.itemCode})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={styles.field}>
                    File thật
                    <input ref={fileRef} type="file" />
                  </label>
                </>
              )}
              {dialog === 'submit' && (
                <p className={styles.hint}>
                  Flow chặn nếu UploadedCount &lt; MinFileCount trên mục bắt buộc.
                </p>
              )}
              {dialog === 'confirmPay' && (
                <p className={styles.hint}>
                  Dùng UNC DocumentKey: {uncDocs[0] ? uncDocs[0].documentKey : '(chưa có)'}
                </p>
              )}
            </div>
            <div className={styles.modalF}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnOutline}`}
                onClick={() => setDialog(undefined)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                onClick={confirmDialog}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
};

export default LivePayApp;
