import * as React from 'react';
import {
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
  PrimaryButton,
  initializeIcons
} from '@fluentui/react';
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
  listChecklistItems,
  reconcileChecklistFromTemplates,
  requiredChecklistReady,
  enqueueCommand,
  waitCommand,
  uploadChecklistFile,
  uploadUncFile,
  listUncDocuments,
  liveActionsFor,
  CORE_STEPS,
  statusVi,
  stepVi,
  stepShortVi,
  checklistStatusVi,
  moneyVi
} from '../services';
import { payThemeStyle } from '../theme/payTokens';
import { DialogKind, IPayAction, PayView } from './types';
import BusyDialog from './BusyDialog';
import PayNoticeBar, { IPayNotice } from './PayNotice';

initializeIcons(undefined, { disableWarnings: true });

export interface ILivePayAppProps {
  title: string;
  userDisplayName: string;
  userLoginName: string;
  sp: ISpRestContext;
}

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
  if (!login) return 'admin@local';
  const parts = login.split('|');
  return parts[parts.length - 1] || login;
}

const dialogTitleVi = (kind: DialogKind): string => {
  switch (kind) {
    case 'submit':
      return 'Gửi hồ sơ';
    case 'forward':
      return 'Chuyển bước tiếp theo';
    case 'return':
      return 'Trả về người tạo';
    case 'approve':
      return 'Phê duyệt của CT.HĐQT';
    case 'reject':
      return 'Không phê duyệt';
    case 'attach':
      return 'Tải tài liệu checklist';
    case 'unc':
      return 'Tải ủy nhiệm chi (UNC)';
    case 'confirmPay':
      return 'Xác nhận đã thanh toán';
    default:
      return 'Xác nhận';
  }
};

const LivePayApp: React.FC<ILivePayAppProps> = (props) => {
  const actorUPN = upnFromLogin(props.userLoginName);
  const [view, setView] = React.useState<PayView>('inbox');
  const [busy, setBusy] = React.useState(false);
  const [busyMessage, setBusyMessage] = React.useState('Đang xử lý…');
  const [notice, setNotice] = React.useState<IPayNotice | undefined>(undefined);

  const [inbox, setInbox] = React.useState<IRequestMaster[]>([]);
  const [paymentTypes, setPaymentTypes] = React.useState<IPaymentType[]>([]);
  const [selectedType, setSelectedType] = React.useState('');
  const [templates, setTemplates] = React.useState<IChecklistTemplate[]>([]);
  const [createTitle, setCreateTitle] = React.useState('Hồ sơ thanh toán');
  const [createAmount, setCreateAmount] = React.useState('1000000');
  const [createExpl, setCreateExpl] = React.useState('');
  const [createOu, setCreateOu] = React.useState('OU_BPCM1');

  const [requestKey, setRequestKey] = React.useState('');
  const [master, setMaster] = React.useState<IRequestMaster | undefined>(undefined);
  const [checklist, setChecklist] = React.useState<IChecklistItemRow[]>([]);
  const [uncDocs, setUncDocs] = React.useState<
    { id: number; documentKey: string; fileUrl: string; fileName: string }[]
  >([]);
  const [dialog, setDialog] = React.useState<DialogKind>(undefined);
  const [reason, setReason] = React.useState('');
  const [paymentDue, setPaymentDue] = React.useState('');
  const [uploadItemCode, setUploadItemCode] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const showNotice = (kind: IPayNotice['kind'], text: string): void => {
    setNotice({ kind, text });
  };

  const run = async (
    fn: () => Promise<void>,
    options?: { waiting?: string; success?: string }
  ): Promise<void> => {
    setBusy(true);
    setBusyMessage(options?.waiting || 'Đang xử lý…');
    setNotice(undefined);
    try {
      await fn();
      if (options?.success) {
        showNotice('success', options.success);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showNotice('error', msg);
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
    if (!m) throw new Error(`Không tìm thấy hồ sơ ${key}`);
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
    void run(
      async () => {
        await loadDetail(key);
      },
      { waiting: 'Đang mở hồ sơ…' }
    );
  };

  const onCreate = (): void => {
    if (!selectedType) {
      showNotice('warning', 'Vui lòng chọn loại hồ sơ');
      return;
    }
    void run(
      async () => {
        const enq = await enqueueCommand(props.sp, 'CREATE_REQUEST', {
          title: createTitle || 'Hồ sơ thanh toán',
          createdOUCode: createOu || 'OU_BPCM1',
          creatorUPN: actorUPN,
          paymentTypeCode: selectedType,
          amount: Number(createAmount) || 0,
          explanation: createExpl || 'Tạo từ giao diện EMI PAY'
        });
        setBusyMessage('Đang tạo hồ sơ… Hệ thống đang xử lý, vui lòng chờ.');
        await waitCommand(props.sp, enq.id);
        const key = enq.requestKey;
        const pt = paymentTypes.filter((t) => t.code === selectedType)[0];
        if (pt) {
          const tpls =
            templates.length > 0
              ? templates
              : await listChecklistTemplates(props.sp, pt.code, pt.checklistVersion);
          setBusyMessage('Đang đồng bộ checklist theo loại hồ sơ…');
          await reconcileChecklistFromTemplates(props.sp, key, tpls.length ? tpls : templates);
        }
        await refreshInbox();
        await loadDetail(key);
        setView('detail');
      },
      {
        waiting: 'Đang tạo hồ sơ…',
        success: 'Đã tạo hồ sơ thành công. Tiếp tục tải tài liệu checklist rồi gửi duyệt.'
      }
    );
  };

  const selectedTypeMeta = paymentTypes.filter((t) => t.code === selectedType)[0];
  const requiredTplCount = templates.filter((t) => t.isRequired).length;
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
      void run(
        async () => {
          if (!requiredChecklistReady(checklist)) {
            throw new Error('Chưa đủ tài liệu checklist bắt buộc');
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
          setBusyMessage('Đang gửi hồ sơ… Hệ thống đang kiểm tra và chuyển bước.');
          await waitCommand(props.sp, enq.id);
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang gửi hồ sơ…', success: 'Đã gửi hồ sơ thành công.' }
      );
      return;
    }

    if (kind === 'forward' || kind === 'approve') {
      void run(
        async () => {
          const payload: Record<string, unknown> = {
            actorUPN,
            decision: 'PASS',
            note: 'Phê duyệt từ giao diện',
            expectedStepKey: master.currentStepKey,
            expectedStepInstanceKey: master.currentStepInstanceKey,
            expectedReviewRound: master.reviewRound
          };
          if (kind === 'approve') {
            if (!paymentDue) throw new Error('Vui lòng nhập thời hạn thanh toán');
            payload.paymentDueAt = `${paymentDue}T00:00:00Z`;
          }
          const enq = await enqueueCommand(props.sp, 'DECIDE', payload, {
            requestKey: master.requestKey,
            stepInstanceKey: master.currentStepInstanceKey
          });
          setBusyMessage(
            kind === 'approve'
              ? 'Đang ghi nhận phê duyệt của CT.HĐQT…'
              : 'Đang chuyển bước tiếp theo…'
          );
          await waitCommand(props.sp, enq.id);
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        {
          waiting: kind === 'approve' ? 'Đang phê duyệt…' : 'Đang chuyển bước…',
          success: kind === 'approve' ? 'Đã phê duyệt hồ sơ.' : 'Đã chuyển bước tiếp theo.'
        }
      );
      return;
    }

    if (kind === 'return' || kind === 'reject') {
      void run(
        async () => {
          if (!reason.trim()) throw new Error('Vui lòng nhập lý do');
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
          setBusyMessage('Đang trả hồ sơ về người tạo…');
          await waitCommand(props.sp, enq.id);
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang trả hồ sơ…', success: 'Đã trả hồ sơ về người tạo.' }
      );
      return;
    }

    if (kind === 'confirmPay') {
      void run(
        async () => {
          if (!uncDocs.length) throw new Error('Chưa có ủy nhiệm chi (UNC)');
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
          setBusyMessage('Đang xác nhận đã thanh toán…');
          await waitCommand(props.sp, enq.id);
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang xác nhận thanh toán…', success: 'Đã xác nhận thanh toán.' }
      );
      return;
    }

    if (kind === 'attach' || kind === 'unc') {
      const input = fileRef.current;
      if (!input || !input.files || !input.files.length) {
        showNotice('warning', 'Vui lòng chọn tệp để tải lên');
        setDialog(kind);
        return;
      }
      const file = input.files[0];
      void run(
        async () => {
          const buf = await file.arrayBuffer();
          if (kind === 'unc') {
            const up = await uploadUncFile(props.sp, {
              requestKey: master.requestKey,
              fileName: file.name,
              content: buf,
              uploadedByUPN: actorUPN
            });
            showNotice('success', `Đã tải ủy nhiệm chi: ${up.fileName}`);
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
            showNotice('success', `Đã tải «${file.name}» vào mục ${item.itemLabel}`);
          }
          if (input) input.value = '';
          await loadDetail(master.requestKey);
        },
        {
          waiting:
            kind === 'unc' ? 'Đang tải ủy nhiệm chi…' : `Đang tải tệp «${file.name}»…`
        }
      );
      return;
    }
  };

  return (
    <div className={styles.app} style={payThemeStyle}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.mark}>PAY</div>
          <div>
            <h1>{props.title || 'EMI PAY'}</h1>
            <p>Hồ sơ thanh toán · {props.userDisplayName || actorUPN}</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <span className={badgeClass('ok')}>Trực tiếp CECM</span>
          <div className={styles.avatar}>
            {(props.userDisplayName || 'U').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Điều hướng EMI PAY">
          {(
            [
              { id: 'inbox' as PayView, label: 'Việc của tôi' },
              { id: 'create' as PayView, label: 'Tạo hồ sơ' },
              { id: 'detail' as PayView, label: 'Chi tiết hồ sơ' }
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
            Việc của tôi theo bước bạn đang phụ trách. Tạo hồ sơ → checklist → tải tài liệu → gửi
            duyệt.
          </p>
        </nav>

        <main className={styles.main}>
          <PayNoticeBar notice={notice} onDismiss={() => setNotice(undefined)} />

          {view === 'inbox' && (
            <>
              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Danh sách hồ sơ</p>
                    <h2>Việc của tôi</h2>
                    <p className={styles.pageLead}>
                      Các hồ sơ thanh toán gần đây trên CECM. Bấm vào một dòng để mở chi tiết.
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      disabled={busy}
                      onClick={() => {
                        void run(refreshInbox);
                      }}
                    >
                      Làm mới
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => setView('create')}
                    >
                      Tạo hồ sơ mới
                    </button>
                  </div>
                </div>
              </section>
              <section className={styles.card}>
                <div className={`${styles.cardB} ${styles.list}`}>
                  {inbox.length === 0 && (
                    <p className={styles.empty}>Chưa có hồ sơ. Hãy tạo hồ sơ mới để bắt đầu.</p>
                  )}
                  {inbox.map((item) => (
                    <button
                      key={item.requestKey}
                      type="button"
                      className={styles.item}
                      onClick={() => openLiveDetail(item.requestKey)}
                    >
                      <span className={styles.swatch}>{stepShortVi(item.currentStepKey).slice(0, 4)}</span>
                      <span>
                        <strong>{item.title || item.requestKey}</strong>
                        <span className={styles.meta}>
                          {item.requestKey} · {statusVi(item.status)} · {stepVi(item.currentStepKey)} ·
                          Lượt {item.reviewRound}
                        </span>
                      </span>
                      <span className={badgeClass('info')}>{statusVi(item.status)}</span>
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
                  <p className={styles.pageLead}>
                    Chọn loại hồ sơ bên trái để xem checklist bắt buộc. Phía phải là bản xem trước trước khi tạo.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  onClick={() => setView('inbox')}
                >
                  Quay lại
                </button>
              </div>

              <div className={styles.splitCreate}>
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>1. Thông tin &amp; checklist</h3>
                  </div>
                  <div className={styles.cardB} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className={styles.form}>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        Loại hồ sơ
                        <select
                          value={selectedType}
                          onChange={(e) => setSelectedType(e.target.value)}
                        >
                          {paymentTypes.length === 0 && (
                            <option value="">(Chưa cấu hình loại hồ sơ)</option>
                          )}
                          {paymentTypes.map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        Đơn vị khởi tạo
                        <select value={createOu} onChange={(e) => setCreateOu(e.target.value)}>
                          <option value="OU_BPCM1">OU_BPCM1 · Bộ phận chuyên môn 1</option>
                          <option value="OU_PBCM">OU_PBCM · Bộ phận chuyên môn</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        Số tiền đề nghị (VND)
                        <input
                          value={createAmount}
                          onChange={(e) => setCreateAmount(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        Tiêu đề hồ sơ
                        <input
                          value={createTitle}
                          onChange={(e) => setCreateTitle(e.target.value)}
                          placeholder="Ví dụ: Thanh toán đợt 2 theo HĐ…"
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        Diễn giải
                        <textarea
                          rows={3}
                          value={createExpl}
                          onChange={(e) => setCreateExpl(e.target.value)}
                          placeholder="Mô tả ngắn nội dung đề nghị thanh toán"
                        />
                      </label>
                    </div>

                    <div>
                      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Checklist theo loại đã chọn</h3>
                      {templates.length === 0 && (
                        <p className={styles.empty}>Chưa có mẫu checklist cho loại này.</p>
                      )}
                      {templates.map((t) => (
                        <div key={t.itemCode} className={styles.checkRow}>
                          <div>
                            <strong>{t.itemLabel}</strong>
                            <span className={styles.meta}>
                              Tối thiểu {t.minFileCount} tệp
                              {t.isRequired ? ' · Bắt buộc trước khi gửi' : ' · Không bắt buộc'}
                            </span>
                          </div>
                          <span className={badgeClass(t.isRequired ? 'warn' : 'mute')}>
                            {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
                          </span>
                        </div>
                      ))}
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

                <aside className={styles.previewPanel} aria-label="Xem trước hồ sơ">
                  <div className={styles.previewHead}>
                    <h3>Xem trước</h3>
                    <p>Kiểm tra trước khi bấm «Tạo hồ sơ»</p>
                  </div>
                  <div className={styles.previewBody}>
                    <div className={styles.previewRow}>
                      <b>Loại hồ sơ</b>
                      <span>{selectedTypeMeta ? selectedTypeMeta.title : '—'}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Tiêu đề</b>
                      <span>{createTitle || '—'}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Số tiền</b>
                      <span>{moneyVi(Number(createAmount) || 0)}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Đơn vị tạo</b>
                      <span>{createOu}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Người tạo</b>
                      <span>{actorUPN}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Diễn giải</b>
                      <span>{createExpl || '(Trống)'}</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 13 }}>Tài liệu sẽ yêu cầu</strong>
                      <p className={styles.hint}>
                        {requiredTplCount} mục bắt buộc · {templates.length} mục tổng cộng
                      </p>
                      {templates.map((t) => (
                        <div key={`pv-${t.itemCode}`} className={styles.checkPreviewItem}>
                          <div>
                            <strong>{t.itemLabel}</strong>
                            <span className={styles.meta}>
                              {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'} · ≥ {t.minFileCount} tệp
                            </span>
                          </div>
                          <span className={badgeClass(t.isRequired ? 'warn' : 'mute')}>
                            {t.isRequired ? 'Cần tải' : 'Tuỳ chọn'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className={styles.hint}>
                      Sau khi tạo: tải đủ tài liệu bắt buộc rồi mới «Gửi hồ sơ».
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}

          {view === 'detail' && master && (
            <>
              <section className={styles.hero}>
                <div className={styles.heroRow}>
                  <div>
                    <p className={styles.eyebrow}>Chi tiết hồ sơ</p>
                    <h2>{master.title || master.requestKey}</h2>
                    <p className={styles.sub}>
                      {master.requestKey} · {master.paymentTypeCode} · Lượt xử lý {master.reviewRound}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnOutline}`}
                      disabled={busy}
                      onClick={() => {
                        void run(async () => loadDetail(master.requestKey));
                      }}
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
                    <span>{statusVi(master.status)}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Bước hiện tại</b>
                    <span>{stepShortVi(master.currentStepKey)}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Đơn vị phụ trách</b>
                    <span>{master.currentOUCode || '—'}</span>
                  </div>
                  <div className={styles.stat}>
                    <b>Hạn thanh toán</b>
                    <span>
                      {master.paymentDueAt
                        ? new Date(master.paymentDueAt).toLocaleDateString('vi-VN')
                        : '—'}
                    </span>
                  </div>
                </div>
              </section>

              <div className={styles.steps} aria-label="Các bước quy trình">
                {CORE_STEPS.map((s, idx) => (
                  <div
                    key={s}
                    className={`${styles.step} ${
                      idx === stepIndex(master.currentStepKey) ? styles.stepOn : ''
                    } ${idx < stepIndex(master.currentStepKey) ? styles.stepDone : ''}`}
                  >
                    <span>{idx + 1}</span>
                    <em>{stepShortVi(s)}</em>
                  </div>
                ))}
              </div>

              <div className={styles.splitCreate}>
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Checklist tài liệu</h3>
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
                    {checklist.length === 0 && (
                      <p className={styles.empty}>Chưa có mục checklist.</p>
                    )}
                    {checklist.map((c) => (
                      <div key={c.id} className={styles.checkRow}>
                        <div>
                          <strong>{c.itemLabel}</strong>
                          <span className={styles.meta}>
                            Đã tải {c.uploadedCount}/{c.minFileCount > 0 ? c.minFileCount : 1} tệp
                            {c.isRequired ? ' · Bắt buộc' : ' · Tuỳ chọn'}
                          </span>
                        </div>
                        <span
                          className={badgeClass(
                            c.itemStatus === 'Uploaded' ? 'ok' : c.isRequired ? 'warn' : 'mute'
                          )}
                        >
                          {checklistStatusVi(c.itemStatus)}
                        </span>
                      </div>
                    ))}
                    {!requiredChecklistReady(checklist) &&
                      master.currentStepKey === 'BPCM1_PREPARE' && (
                        <p className={styles.warnBox}>
                          Chưa thể gửi: còn mục checklist bắt buộc chưa đủ tài liệu.
                        </p>
                      )}
                  </div>
                </section>

                <aside className={styles.previewPanel}>
                  <div className={styles.previewHead}>
                    <h3>Tóm tắt hồ sơ</h3>
                    <p>{stepVi(master.currentStepKey)}</p>
                  </div>
                  <div className={styles.previewBody}>
                    <div className={styles.previewRow}>
                      <b>Mã hồ sơ</b>
                      <span>{master.requestKey}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Trạng thái</b>
                      <span>{statusVi(master.status)}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Bước</b>
                      <span>{stepVi(master.currentStepKey)}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Người tạo</b>
                      <span>{master.creatorUPN || '—'}</span>
                    </div>
                    <div className={styles.previewRow}>
                      <b>Diễn giải</b>
                      <span>{master.explanation || '—'}</span>
                    </div>
                    <div>
                      <strong style={{ fontSize: 13 }}>Ủy nhiệm chi (UNC)</strong>
                      {uncDocs.length === 0 && (
                        <p className={styles.empty}>Chưa tải UNC.</p>
                      )}
                      {uncDocs.map((u) => (
                        <div key={u.id} className={styles.checkPreviewItem}>
                          <div>
                            <strong>{u.fileName}</strong>
                            <span className={styles.meta}>{u.documentKey}</span>
                          </div>
                          <a href={u.fileUrl} target="_blank" rel="noreferrer">
                            Mở tệp
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}

          {view === 'detail' && !master && (
            <p className={styles.empty}>
              Chưa chọn hồ sơ. Vào «Việc của tôi» hoặc «Tạo hồ sơ». {requestKey}
            </p>
          )}
        </main>
      </div>

      <Dialog
        hidden={!dialog}
        onDismiss={busy ? undefined : () => setDialog(undefined)}
        dialogContentProps={{
          type: DialogType.normal,
          title: dialog ? dialogTitleVi(dialog) : ''
        }}
        modalProps={{ isBlocking: true, styles: { main: { maxWidth: 520 } } }}
      >
        <div className={styles.modalB} style={{ padding: '4px 0 8px' }}>
          {(dialog === 'return' || dialog === 'reject') && (
            <label className={styles.field}>
              Lý do (bắt buộc)
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          {dialog === 'approve' && (
            <label className={styles.field}>
              Thời hạn thanh toán
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
                        {c.itemLabel}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={styles.field}>
                Chọn tệp
                <input ref={fileRef} type="file" />
              </label>
            </>
          )}
          {dialog === 'submit' && (
            <p className={styles.hint}>
              Hệ thống sẽ kiểm tra checklist bắt buộc trước khi chuyển sang bước tiếp theo.
            </p>
          )}
          {dialog === 'confirmPay' && (
            <p className={styles.hint}>
              Xác nhận dựa trên ủy nhiệm chi:{' '}
              {uncDocs[0] ? uncDocs[0].fileName : '(chưa có tệp)'}
            </p>
          )}
        </div>
        <DialogFooter>
          <DefaultButton text="Hủy" onClick={() => setDialog(undefined)} disabled={busy} />
          <PrimaryButton text="Xác nhận" onClick={confirmDialog} disabled={busy} />
        </DialogFooter>
      </Dialog>

      <BusyDialog open={busy} message={busyMessage} />
    </div>
  );
};

export default LivePayApp;
