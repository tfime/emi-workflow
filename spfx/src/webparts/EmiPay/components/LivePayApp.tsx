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
  IOrgUnit,
  IRequestMaster,
  IChecklistItemRow,
  IWorkItemRow,
  ITimelineItem,
  listPaymentTypes,
  listChecklistTemplates,
  listOrgUnits,
  listStepRecipients,
  IStepRecipient,
  listRecentRequests,
  getRequestByKey,
  patchRequestAfterCreate,
  stepIndex,
  listChecklistItems,
  reconcileChecklistFromTemplates,
  requiredChecklistReady,
  checklistAllPass,
  checklistReviewComplete,
  checklistHasFail,
  lockChecklistItems,
  enqueueAndRun,
  uploadChecklistFile,
  uploadStepAttachment,
  uploadUncFile,
  listUncDocuments,
  listDocumentsForRequest,
  IDocumentIndexRow,
  isSupportingDoc,
  isChecklistDocClass,
  docClassVi,
  setChecklistItemReview,
  saveStepReview,
  liveActionsFor,
  isChairDossierApproved,
  listWorkItems,
  currentWorkItem,
  isWorkItemAccepted,
  listActivityPublic,
  listStepReviews,
  buildTimeline,
  CORE_STEPS,
  statusVi,
  chairStatusDetailVi,
  stepShortVi,
  checklistStatusVi,
  moneyVi,
  shortFileName
} from '../services';
import { payThemeStyle } from '../theme/payTokens';
import { DialogKind, IPayAction, PayPersona, PayView } from './types';
import BusyDialog from './BusyDialog';
import PayNoticeBar, { IPayNotice } from './PayNotice';
import FilePreviewDrawer from './FilePreviewDrawer';

initializeIcons(undefined, { disableWarnings: true });

export interface ILivePayAppProps {
  title: string;
  userDisplayName: string;
  userLoginName: string;
  sp: ISpRestContext;
  /** HTTP POST URL Flow Core (When a HTTP request is received). Empty = poll Commands. */
  orchestratorUrl?: string;
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
      return 'Trình trưởng phòng';
    case 'mgrApprove':
      return 'Duyệt gửi sang BPCM2';
    case 'forward':
      return 'Chuyển bước tiếp theo';
    case 'return':
      return 'Từ chối / trả hồ sơ';
    case 'approve':
      return 'Phê duyệt hồ sơ (CT.HĐQT)';
    case 'approvePay':
      return 'Duyệt thanh toán';
    case 'reject':
      return 'Không phê duyệt';
    case 'attach':
      return 'Tải tài liệu';
    case 'unc':
      return 'Tải ủy nhiệm chi (UNC)';
    case 'confirmPay':
      return 'Xác nhận đã thanh toán';
    case 'review':
      return 'Đánh giá mục checklist';
    case 'accept':
      return 'Tiếp nhận và đặt hạn xử lý';
    default:
      return 'Xác nhận';
  }
};

const REVIEW_STEPS = ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK'];
const REVIEW_PERSONAS: PayPersona[] = ['bpcm2', 'bpcm3', 'tckt_check', 'tckt', 'manager', 'assignee'];

/** UI chỉ chọn BPCM2/BPCM3; TCKT/CHAIR/Archive auto từ StepRecipients default. */
const ROUTE_STEPS_UI: { key: string; label: string }[] = [
  { key: 'BPCM2_TECH', label: 'BPCM2' },
  { key: 'BPCM3_PRICE', label: 'BPCM3' }
];
const ROUTE_STEPS_AUTO = ['TCKT_CHECK', 'CHAIR_APPROVE', 'TCKT_PAY', 'SYSTEM_ARCHIVE'];

const LivePayApp: React.FC<ILivePayAppProps> = (props) => {
  const actorUPN = upnFromLogin(props.userLoginName);
  const [view, setView] = React.useState<PayView>('inbox');
  const [persona, setPersona] = React.useState<PayPersona>('creator');
  const [inboxFilter, setInboxFilter] = React.useState<'all' | 'todo' | 'mine'>('all');
  const [docsTab, setDocsTab] = React.useState<'checklist' | 'files'>('checklist');
  const [activityTab, setActivityTab] = React.useState<'timeline' | 'comment'>('timeline');
  const [commentDraft, setCommentDraft] = React.useState('');
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
  const [createOu, setCreateOu] = React.useState('OU_TONGHOP');
  const [orgUnits, setOrgUnits] = React.useState<IOrgUnit[]>([]);
  const [stepRecipients, setStepRecipients] = React.useState<IStepRecipient[]>([]);
  const [routePlan, setRoutePlan] = React.useState<Record<string, string>>({});

  const [requestKey, setRequestKey] = React.useState('');
  const [master, setMaster] = React.useState<IRequestMaster | undefined>(undefined);
  const [checklist, setChecklist] = React.useState<IChecklistItemRow[]>([]);
  const [workItems, setWorkItems] = React.useState<IWorkItemRow[]>([]);
  const [timeline, setTimeline] = React.useState<ITimelineItem[]>([]);
  const [uncDocs, setUncDocs] = React.useState<IDocumentIndexRow[]>([]);
  const [docs, setDocs] = React.useState<IDocumentIndexRow[]>([]);
  const [drawerDoc, setDrawerDoc] = React.useState<IDocumentIndexRow | undefined>(undefined);
  const [docComment, setDocComment] = React.useState('');
  const [dialog, setDialog] = React.useState<DialogKind>(undefined);
  const [reason, setReason] = React.useState('');
  const [paymentDue, setPaymentDue] = React.useState('');
  const [acceptDue, setAcceptDue] = React.useState('');
  const [uploadItemCode, setUploadItemCode] = React.useState('');
  /** checklist = mục checklist BPCM1; step = tài liệu hỗ trợ (DocClass StepAttachment). */
  const [uploadMode, setUploadMode] = React.useState<'checklist' | 'step'>('checklist');
  const [reviewItemCode, setReviewItemCode] = React.useState('');
  const [reviewResult, setReviewResult] = React.useState<'Pass' | 'Fail'>('Pass');
  const [reviewReason, setReviewReason] = React.useState('');
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
    const wis = await listWorkItems(props.sp, key);
    const acts = await listActivityPublic(props.sp, key);
    const reviews = await listStepReviews(props.sp, key);
    const unc = await listUncDocuments(props.sp, key);
    const allDocs = await listDocumentsForRequest(props.sp, key);
    setMaster(m);
    setChecklist(items);
    setWorkItems(wis);
    setTimeline(buildTimeline(acts, reviews));
    setUncDocs(unc);
    setDocs(allDocs);
    setRequestKey(key);
    setDocsTab('checklist');
    setActivityTab('timeline');
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
            workflowCode: 'EMI_PAY_SPV',
            isActive: true
          }
        ];
      }
      setPaymentTypes(types);
      setSelectedType(types[0].code);
      const ous = await listOrgUnits(props.sp);
      setOrgUnits(ous);
      if (ous[0]) setCreateOu(ous[0].ouCode);
      const srs = await listStepRecipients(props.sp);
      setStepRecipients(srs);
      const defaults: Record<string, string> = {};
      [...ROUTE_STEPS_UI.map((r) => r.key), ...ROUTE_STEPS_AUTO].forEach((key) => {
        const rows = srs.filter((r) => r.stepKey === key);
        const def = rows.filter((r) => r.isDefault)[0] || rows[0];
        if (def) defaults[key] = def.ouCode;
      });
      setRoutePlan(defaults);
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
        const title = createTitle || 'Hồ sơ thanh toán';
        const amount = Number(createAmount) || 0;
        const explanation = createExpl || 'Tạo từ giao diện EMI PAY';
        const fullRoute: Record<string, string> = { ...routePlan };
        ROUTE_STEPS_AUTO.forEach((key) => {
          if (!fullRoute[key]) {
            const rows = stepRecipients.filter((r) => r.stepKey === key);
            const def = rows.filter((r) => r.isDefault)[0] || rows[0];
            if (def) fullRoute[key] = def.ouCode;
          }
        });
        const missingUi = ROUTE_STEPS_UI.filter((rs) => !fullRoute[rs.key]);
        if (missingUi.length) {
          throw new Error(`Chọn phòng: ${missingUi.map((r) => r.label).join(', ')}`);
        }
        const routePlanJson = JSON.stringify(fullRoute);
        setBusyMessage('Đang tạo hồ sơ… Gọi Orchestrator…');
        const cmdDone = await enqueueAndRun(
          props.sp,
          'CREATE_REQUEST',
          {
            title,
            createdOUCode: createOu || 'OU_TONGHOP',
            creatorUPN: actorUPN,
            paymentTypeCode: selectedType,
            amount,
            explanation,
            routePlan: fullRoute
          },
          { orchestratorUrl: props.orchestratorUrl }
        );
        const key = cmdDone.requestKey;
        setBusyMessage('Đang cập nhật thông tin hồ sơ + RoutePlan…');
        await patchRequestAfterCreate(props.sp, key, {
          title,
          amount,
          explanation,
          routePlanJson
        });
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
        success:
          'Đã tạo hồ sơ. Tải checklist rồi bấm «Trình trưởng phòng» (chưa sang BPCM2).'
      }
    );
  };

  const selectedTypeMeta = paymentTypes.filter((t) => t.code === selectedType)[0];
  const requiredTplCount = templates.filter((t) => t.isRequired).length;
  const activeWi = master
    ? currentWorkItem(workItems, master.currentStepInstanceKey)
    : undefined;
  const actions = master
    ? liveActionsFor(master, checklist, uncDocs.length > 0, persona, activeWi, workItems)
    : [];

  const canReviewDocs = !!(
    master &&
    REVIEW_STEPS.indexOf(master.currentStepKey) >= 0 &&
    REVIEW_PERSONAS.indexOf(persona) >= 0 &&
    isWorkItemAccepted(activeWi)
  );

  const openReview = (itemCode: string): void => {
    setReviewItemCode(itemCode);
    setReviewResult('Pass');
    setReviewReason('');
    setDialog('review');
  };

  const personaMeta: Record<PayPersona, { name: string; meta: string }> = {
    creator: { name: props.userDisplayName || 'Người tạo', meta: 'R01 · BPCM1 Người tạo' },
    bpcm2: { name: 'BPCM2', meta: 'R02 · BPCM2 KT kỹ thuật' },
    bpcm3: { name: 'BPCM3', meta: 'R03 · BPCM3 KT giá' },
    tckt_check: { name: 'TCKT Kiểm tra', meta: 'R04 · TCKT Kiểm tra' },
    chair: { name: 'CT.HĐQT', meta: 'R05 · CT.HĐQT' },
    tckt_pay: { name: 'TCKT Thanh toán', meta: 'R06 · TCKT Thanh toán' },
    procadm: { name: 'Quản trị quy trình', meta: 'R08 · PROCADM' },
    audit: { name: 'Kiểm toán', meta: 'R10 · AUDIT' },
    manager: { name: 'Trưởng phòng', meta: 'Legacy · manager' },
    assignee: { name: 'Nhân sự', meta: 'Legacy · assignee' },
    tckt: { name: 'TCKT', meta: 'Legacy · tckt' }
  };

  const onAction = (a: IPayAction): void => {
    setReason('');
    if (a.dialog === 'accept') {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 3);
      const iso = d.toISOString().slice(0, 10);
      setAcceptDue(iso);
      setDialog('accept');
      return;
    }
    if (a.dialog === 'attach') {
      // Nút thao tác bước = tài liệu hỗ trợ; checklist chỉ tải ở BPCM1 qua bảng Checklist.
      setUploadMode('step');
      setDocsTab('files');
      setDialog('attach');
      return;
    }
    if (a.dialog === 'unc') {
      setDialog('unc');
      return;
    }
    if (a.dialog === 'approve') {
      setDialog('approve');
      return;
    }
    if (a.dialog === 'approvePay') {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7);
      setPaymentDue(d.toISOString().slice(0, 10));
      setDialog('approvePay');
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
          setBusyMessage('Đang gửi hồ sơ… Gọi Orchestrator…');
          await enqueueAndRun(
            props.sp,
            'SUBMIT',
            {
              actorUPN,
              expectedStepKey: 'BPCM1_PREPARE',
              expectedReviewRound: master.reviewRound
            },
            {
              requestKey: master.requestKey,
              orchestratorUrl: props.orchestratorUrl
            }
          );
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang gửi hồ sơ…', success: 'Đã gửi hồ sơ thành công.' }
      );
      return;
    }

    if (kind === 'accept') {
      void run(
        async () => {
          if (!acceptDue.trim()) throw new Error('Vui lòng chọn hạn xử lý');
          setBusyMessage('Đang tiếp nhận hồ sơ…');
          await enqueueAndRun(
            props.sp,
            'ACCEPT',
            {
              actorUPN,
              dueAt: `${acceptDue.trim()}T23:59:59Z`,
              expectedStepKey: master.currentStepKey,
              expectedStepInstanceKey: master.currentStepInstanceKey,
              expectedReviewRound: master.reviewRound
            },
            {
              requestKey: master.requestKey,
              stepInstanceKey: master.currentStepInstanceKey,
              orchestratorUrl: props.orchestratorUrl
            }
          );
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang tiếp nhận…', success: 'Đã tiếp nhận và đặt hạn xử lý.' }
      );
      return;
    }

    if (kind === 'mgrApprove' || kind === 'forward' || kind === 'approve' || kind === 'approvePay') {
      void run(
        async () => {
          // Chỉ BPCM2/BPCM3/TCKT KT mới bắt Đạt hết; TP duyệt trình gửi thì không.
          if (kind === 'forward' && !checklistAllPass(checklist)) {
            throw new Error(
              'Chưa thể chuyển bước: cần đánh giá Đạt hết các mục checklist có tệp/bắt buộc.'
            );
          }
          const payload: Record<string, unknown> = {
            actorUPN,
            decision: 'PASS',
            note:
              kind === 'mgrApprove'
                ? 'Trưởng phòng duyệt gửi sang BPCM2'
                : kind === 'approvePay'
                  ? 'CT.HĐQT duyệt thanh toán'
                  : kind === 'approve'
                    ? 'CT.HĐQT phê duyệt hồ sơ'
                    : 'Phê duyệt từ giao diện',
            expectedStepKey: master.currentStepKey,
            expectedStepInstanceKey: master.currentStepInstanceKey,
            expectedReviewRound: master.reviewRound
          };
          if (kind === 'approvePay') {
            if (!paymentDue) throw new Error('Vui lòng nhập thời hạn thanh toán');
            payload.paymentDueAt = `${paymentDue}T00:00:00Z`;
          }
          setBusyMessage(
            kind === 'approvePay'
              ? 'Đang duyệt thanh toán…'
              : kind === 'approve'
                ? 'Đang phê duyệt hồ sơ…'
                : kind === 'mgrApprove'
                  ? 'Đang duyệt gửi sang BPCM2…'
                  : 'Đang chuyển bước tiếp theo…'
          );
          await enqueueAndRun(props.sp, 'DECIDE', payload, {
            requestKey: master.requestKey,
            stepInstanceKey: master.currentStepInstanceKey,
            orchestratorUrl: props.orchestratorUrl
          });
          // Khóa sau bước KT chuyển tiếp / duyệt TT — không khóa khi chỉ duyệt hồ sơ CHAIR
          if (kind === 'forward' || kind === 'approvePay') {
            await lockChecklistItems(props.sp, checklist);
          }
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        {
          waiting:
            kind === 'approvePay'
              ? 'Đang duyệt thanh toán…'
              : kind === 'approve'
                ? 'Đang phê duyệt hồ sơ…'
                : kind === 'mgrApprove'
                  ? 'Đang duyệt gửi…'
                  : 'Đang chuyển bước…',
          success:
            kind === 'approvePay'
              ? 'Đã duyệt thanh toán — chuyển TCKT.'
              : kind === 'approve'
                ? 'Đã phê duyệt hồ sơ (chưa duyệt thanh toán).'
                : kind === 'mgrApprove'
                  ? 'Đã duyệt gửi sang BPCM2.'
                  : 'Đã chuyển bước tiếp theo.'
        }
      );
      return;
    }

    if (kind === 'return' || kind === 'reject') {
      void run(
        async () => {
          if (!reason.trim()) throw new Error('Vui lòng nhập lý do');
          setBusyMessage('Đang trả hồ sơ về người tạo…');
          await enqueueAndRun(
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
              stepInstanceKey: master.currentStepInstanceKey,
              orchestratorUrl: props.orchestratorUrl
            }
          );
          await lockChecklistItems(props.sp, checklist);
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
          setBusyMessage('Đang xác nhận đã thanh toán…');
          await enqueueAndRun(
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
              stepInstanceKey: master.currentStepInstanceKey,
              orchestratorUrl: props.orchestratorUrl
            }
          );
          await loadDetail(master.requestKey);
          await refreshInbox();
        },
        { waiting: 'Đang xác nhận thanh toán…', success: 'Đã xác nhận thanh toán.' }
      );
      return;
    }

    if (kind === 'review') {
      void run(
        async () => {
          const item =
            checklist.filter((c) => c.itemCode === reviewItemCode)[0] || checklist[0];
          if (!item) throw new Error('Không tìm thấy mục checklist');
          if (reviewResult === 'Fail' && !reviewReason.trim()) {
            throw new Error('Vui lòng nhập lý do khi đánh giá Không đạt');
          }
          await saveStepReview(props.sp, {
            requestKey: master.requestKey,
            stepInstanceKey: master.currentStepInstanceKey,
            reviewRound: master.reviewRound,
            checklistItemKey: item.checklistItemKey || `${master.requestKey}|${item.itemCode}`,
            result: reviewResult,
            reason: reviewReason.trim(),
            reviewedByUPN: actorUPN
          });
          await setChecklistItemReview(props.sp, item, reviewResult);
          await loadDetail(master.requestKey);
        },
        {
          waiting: 'Đang lưu đánh giá…',
          success:
            reviewResult === 'Pass'
              ? `Đã đánh giá Đạt: ${reviewItemCode}`
              : `Đã đánh giá Không đạt: ${reviewItemCode}`
        }
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
          } else if (uploadMode === 'step') {
            const up = await uploadStepAttachment(props.sp, {
              requestKey: master.requestKey,
              stepKey: master.currentStepKey,
              fileName: file.name,
              content: buf,
              uploadedByUPN: actorUPN
            });
            showNotice('success', `Đã tải tài liệu hỗ trợ: ${up.fileName}`);
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

  const showRail = view === 'create' || view === 'detail';
  const avatarLetters = (props.userDisplayName || actorUPN || 'U')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';

  const goInbox = (filter: 'all' | 'todo' | 'mine' = 'all'): void => {
    setInboxFilter(filter);
    setView('inbox');
  };

  const isTodoItem = (item: IRequestMaster): boolean => {
    const s = (item.status || '').toLowerCase();
    return s === 'draft' || s === 'returned' || s === 'inprogress' || s === 'in progress';
  };

  const filteredInbox = inbox.filter((item) => {
    if (inboxFilter === 'mine') {
      return (item.creatorUPN || '').toLowerCase() === actorUPN.toLowerCase();
    }
    if (inboxFilter === 'todo') {
      return isTodoItem(item);
    }
    return true;
  });
  const todoRows = filteredInbox.filter(isTodoItem);
  const relatedRows = filteredInbox.filter((item) => !isTodoItem(item));
  const checklistDocs = docs.filter((d) => isChecklistDocClass(d.docClass));
  const supportingDocs = docs.filter((d) => isSupportingDoc(d));

  const docsForChecklistItem = (itemCode: string): IDocumentIndexRow[] => {
    const code = (itemCode || '').toLowerCase();
    return checklistDocs.filter((d) => {
      const key = (d.checklistItemKey || d.documentKey || '').toLowerCase();
      return (
        key.indexOf(`|${code}`) >= 0 ||
        key.lastIndexOf(code) === key.length - code.length ||
        key.indexOf(code) >= 0
      );
    });
  };

  const renderInboxTable = (rows: IRequestMaster[]): React.ReactNode => {
    if (!rows.length) {
      return <p className={styles.empty}>Không có hồ sơ.</p>;
    }
    return (
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Mã hồ sơ</th>
            <th>Tiêu đề</th>
            <th>Bước</th>
            <th>Số tiền</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={item.requestKey}
              style={{ cursor: 'pointer' }}
              onClick={() => openLiveDetail(item.requestKey)}
            >
              <td>
                <strong>{item.requestKey}</strong>
              </td>
              <td>{item.title || '—'}</td>
              <td>{stepShortVi(item.currentStepKey)}</td>
              <td>{moneyVi(item.amount)}</td>
              <td>
                <span
                  className={badgeClass(
                    item.status === 'Returned'
                      ? 'warn'
                      : item.status === 'Paid' || item.status === 'Completed'
                        ? 'ok'
                        : 'info'
                  )}
                >
                  {statusVi(item.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className={styles.app} style={payThemeStyle}>
      <header className={styles.top}>
        <div className={styles.brand}>
          <div className={styles.mark}>PAY</div>
          <div>
            <h1>{props.title || 'EMI PAY'}</h1>
            <p>Hồ sơ thanh toán</p>
          </div>
        </div>
        <div className={styles.topActions}>
          <label className={styles.meta} htmlFor="emiPayPersona">
            Vai trò xem UI
          </label>
          <select
            id="emiPayPersona"
            className={styles.personaSelect}
            value={persona}
            onChange={(e) => {
              const next = e.target.value as PayPersona;
              setPersona(next);
              if (next === 'audit') setView('audit');
              else if (view === 'audit') setView('inbox');
            }}
          >
            <option value="creator">R01 · BPCM1 Người tạo</option>
            <option value="manager">R01b · Trưởng phòng phòng tạo</option>
            <option value="bpcm2">R02 · BPCM2 KT kỹ thuật</option>
            <option value="bpcm3">R03 · BPCM3 KT giá</option>
            <option value="tckt_check">R04 · TCKT Kiểm tra</option>
            <option value="chair">R05 · CT.HĐQT</option>
            <option value="tckt_pay">R06 · TCKT Thanh toán</option>
            <option value="audit">R10 · Kiểm toán</option>
          </select>
          <div className={styles.avatar} aria-hidden="true">
            {avatarLetters}
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Điều hướng EMI PAY">
          <div className={styles.navGroup}>Không gian làm việc</div>
          <button
            type="button"
            className={`${styles.navBtn} ${
              view === 'inbox' && inboxFilter === 'all' ? styles.navBtnActive : ''
            }`}
            onClick={() => goInbox('all')}
          >
            Việc của tôi
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${view === 'create' ? styles.navBtnActive : ''}`}
            onClick={() => setView('create')}
            disabled={persona !== 'creator'}
          >
            Tạo hồ sơ
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${view === 'detail' ? styles.navBtnActive : ''}`}
            onClick={() => setView('detail')}
            disabled={!master}
          >
            Hồ sơ đang mở
          </button>

          <div className={styles.navGroup}>Theo vai trò</div>
          <button
            type="button"
            className={`${styles.navBtn} ${
              view === 'inbox' && inboxFilter === 'todo' ? styles.navBtnActive : ''
            }`}
            onClick={() => goInbox('todo')}
          >
            Cần tôi xử lý
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${
              view === 'inbox' && inboxFilter === 'mine' ? styles.navBtnActive : ''
            }`}
            onClick={() => goInbox('mine')}
          >
            Hồ sơ của tôi
          </button>

          <div className={styles.navGroup}>Kiểm toán</div>
          <button
            type="button"
            className={`${styles.navBtn} ${view === 'audit' ? styles.navBtnActive : ''}`}
            disabled={persona !== 'audit'}
            onClick={() => setView('audit')}
          >
            Nhật ký nội bộ
          </button>

          <p className={styles.navNote}>
            UI theo ma trận vai trò — chỉ enqueue Commands Core, không viết lại Flow.
          </p>
          <div className={styles.navProfile}>
            <div className={styles.avatar} style={{ width: 32, height: 32, fontSize: 10 }}>
              {avatarLetters}
            </div>
            <div>
              <strong>{personaMeta[persona].name}</strong>
              <span>{personaMeta[persona].meta}</span>
            </div>
          </div>
        </nav>

        <div
          className={`${styles.workspace} ${showRail ? '' : styles.workspaceNoRail}`.trim()}
        >
          <main className={styles.main}>
            <PayNoticeBar notice={notice} onDismiss={() => setNotice(undefined)} />

          {view === 'inbox' && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h2>Việc của tôi</h2>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnOutline}`}
                    disabled={busy}
                    onClick={() => {
                      void run(refreshInbox, {
                        waiting: 'Đang làm mới danh sách hồ sơ…',
                        success: 'Đã làm mới danh sách.'
                      });
                    }}
                  >
                    Làm mới
                  </button>
                  {persona === 'creator' && (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => setView('create')}
                    >
                      Tạo hồ sơ mới
                    </button>
                  )}
                </div>
              </div>

              {(inboxFilter === 'all' || inboxFilter === 'todo') && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Cần tôi xử lý</h3>
                    <span className={badgeClass('mute')}>{todoRows.length}</span>
                  </div>
                  <div className={styles.cardB} style={{ padding: 0 }}>
                    {renderInboxTable(todoRows)}
                  </div>
                </section>
              )}

              {(inboxFilter === 'all' || inboxFilter === 'mine') && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>{inboxFilter === 'mine' ? 'Hồ sơ của tôi' : 'Hồ sơ liên quan'}</h3>
                    <span className={badgeClass('mute')}>
                      {inboxFilter === 'mine' ? filteredInbox.length : relatedRows.length}
                    </span>
                  </div>
                  <div className={styles.cardB} style={{ padding: 0 }}>
                    {renderInboxTable(
                      inboxFilter === 'mine' ? filteredInbox : relatedRows
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {view === 'create' && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h2>Tạo hồ sơ thanh toán</h2>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnOutline}`}
                    onClick={() => goInbox('all')}
                  >
                    Quay lại
                  </button>
                </div>
              </div>

              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Thông tin hồ sơ</h3>
                </div>
                <div className={styles.cardB}>
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
                        {orgUnits.length === 0 && (
                          <option value="OU_TONGHOP">OU_TONGHOP</option>
                        )}
                        {orgUnits.map((o) => (
                          <option key={o.id} value={o.ouCode}>
                            {o.ouCode} · {o.ouName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={`${styles.field} ${styles.fieldFull}`}>
                      <span>Phòng nhận BPCM2 / BPCM3</span>
                      <div className={styles.routeRow}>
                        {ROUTE_STEPS_UI.map((rs) => {
                          const opts = stepRecipients.filter((r) => r.stepKey === rs.key);
                          return (
                            <label key={rs.key} className={styles.routeChip}>
                              <span>{rs.label}</span>
                              <select
                                value={routePlan[rs.key] || ''}
                                onChange={(e) =>
                                  setRoutePlan((prev) => ({
                                    ...prev,
                                    [rs.key]: e.target.value
                                  }))
                                }
                              >
                                {!opts.length && <option value="">—</option>}
                                {opts.map((o) => (
                                  <option key={`${rs.key}-${o.ouCode}`} value={o.ouCode}>
                                    {o.ouCode}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                      <p className={styles.hint}>TCKT / CT.HĐQT lấy mặc định từ cấu hình — không chọn tay.</p>
                    </div>
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
                </div>
              </section>

              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Checklist sẽ yêu cầu</h3>
                  <span className={badgeClass('warn')}>{requiredTplCount} bắt buộc</span>
                </div>
                <div className={styles.cardB} style={{ padding: 0 }}>
                  {templates.length === 0 ? (
                    <p className={styles.empty}>Chưa có mẫu checklist cho loại này.</p>
                  ) : (
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th>Mục tài liệu</th>
                          <th>Bắt buộc</th>
                          <th>Tối thiểu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {templates.map((t) => (
                          <tr key={t.itemCode}>
                            <td>
                              <strong>{t.itemLabel}</strong>
                              <span className={styles.meta}>{t.itemCode}</span>
                            </td>
                            <td>
                              <span className={badgeClass(t.isRequired ? 'warn' : 'mute')}>
                                {t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
                              </span>
                            </td>
                            <td>{t.isRequired || t.minFileCount > 0 ? `${t.minFileCount || 1} tệp` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={busy || !selectedType}
                  onClick={onCreate}
                >
                  Tạo hồ sơ
                </button>
              </div>
            </>
          )}

          {view === 'detail' && master && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h2>{master.title || master.requestKey}</h2>
                  <div className={styles.tags}>
                    <span
                      className={badgeClass(
                        master.status === 'Returned'
                          ? 'warn'
                          : master.status === 'Completed' || master.status === 'Paid'
                            ? 'ok'
                            : isChairDossierApproved(master, workItems)
                              ? 'ok'
                              : 'info'
                      )}
                    >
                      {chairStatusDetailVi(
                        master.currentStepKey,
                        master.status,
                        master.paymentDueAt,
                        isChairDossierApproved(master, workItems)
                      )}
                    </span>
                    <span className={badgeClass('mute')}>
                      {stepShortVi(master.currentStepKey)}
                    </span>
                    <span className={badgeClass('mute')}>Lượt {master.reviewRound}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnOutline}`}
                    disabled={busy}
                    onClick={() => {
                      void run(async () => loadDetail(master.requestKey), {
                        waiting: 'Đang làm mới hồ sơ…'
                      });
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
                  {actions.length === 0 && (
                    <span className={badgeClass('mute')}>Không có thao tác ở bước này</span>
                  )}
                </div>
              </div>

              {master.status === 'Returned' && (
                <div className={styles.panelWarn}>
                  <h4>Hồ sơ đã được trả về</h4>
                  <div>
                    Chỉnh sửa tài liệu / nội dung rồi gửi lại. Bước hiện tại:{' '}
                    <b>{stepShortVi(master.currentStepKey)}</b>
                  </div>
                </div>
              )}

              {master.currentStepKey === 'BPCM1_PREPARE' &&
                !requiredChecklistReady(checklist) && (
                  <div className={styles.panelWarn}>
                    <h4>Thiếu tài liệu bắt buộc (chặn gửi)</h4>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {checklist
                        .filter((c) => {
                          if (!c.isRequired) return false;
                          const min = c.minFileCount > 0 ? c.minFileCount : 1;
                          return c.uploadedCount < min;
                        })
                        .map((c) => (
                          <li key={c.id}>{c.itemLabel}</li>
                        ))}
                    </ul>
                  </div>
                )}

              {master &&
                ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'TCKT_PAY'].indexOf(
                  master.currentStepKey
                ) >= 0 &&
                !isWorkItemAccepted(activeWi) && (
                  <div className={styles.panelWarn}>
                    <h4>Chưa tiếp nhận bước</h4>
                    <div>
                      Cần «Tiếp nhận và đặt hạn» trước khi đánh giá checklist / chuyển bước /
                      xác nhận thanh toán.
                    </div>
                  </div>
                )}

              {canReviewDocs && !checklistAllPass(checklist) && (
                <div className={styles.panelWarn}>
                  <h4>Chưa đủ điều kiện chuyển bước</h4>
                  <div>
                    {!checklistReviewComplete(checklist)
                      ? 'Cần đánh giá Đạt/Không đạt hết các mục checklist (bắt buộc hoặc đã có tệp) trước khi chuyển tiếp.'
                      : checklistHasFail(checklist)
                        ? 'Có mục Không đạt — chỉ có thể «Trả về người tạo», không chuyển bước.'
                        : 'Checklist chưa Đạt đủ.'}
                  </div>
                </div>
              )}

              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Tài liệu</h3>
                  <div className={styles.actions}>
                    {master.currentStepKey === 'BPCM1_PREPARE' &&
                      docsTab === 'checklist' &&
                      (master.status === 'Draft' || master.status === 'Returned') && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnOutline}`}
                        disabled={busy}
                        onClick={() => {
                          setUploadMode('checklist');
                          setUploadItemCode(checklist[0] ? checklist[0].itemCode : '');
                          setDialog('attach');
                        }}
                      >
                        Tải checklist
                      </button>
                    )}
                    {docsTab === 'files' &&
                      master.currentStepKey !== 'SYSTEM_ARCHIVE' &&
                      master.status !== 'Cancelled' &&
                      master.status !== 'Completed' && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        disabled={busy}
                        onClick={() => {
                          setUploadMode('step');
                          setDialog('attach');
                        }}
                      >
                        Tải đính kèm hỗ trợ
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.tabs}>
                  <button
                    type="button"
                    className={`${styles.tab} ${docsTab === 'checklist' ? styles.tabOn : ''}`}
                    onClick={() => setDocsTab('checklist')}
                  >
                    Checklist
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${docsTab === 'files' ? styles.tabOn : ''}`}
                    onClick={() => setDocsTab('files')}
                  >
                    Tài liệu hỗ trợ
                  </button>
                </div>
                {docsTab === 'checklist' && (
                  <div style={{ padding: 0 }}>
                    {checklist.length === 0 ? (
                      <p className={styles.empty}>Chưa có mục checklist.</p>
                    ) : (
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Mục tài liệu</th>
                            <th>Tệp</th>
                            <th>Người tải</th>
                            <th>Trạng thái</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {checklist.map((c) => {
                            const min = c.minFileCount > 0 ? c.minFileCount : 1;
                            const missing = c.isRequired && c.uploadedCount < min;
                            const linked = docsForChecklistItem(c.itemCode);
                            const uploaders = linked
                              .map((d) => d.uploadedByUPN)
                              .filter(Boolean)
                              .filter((u, i, arr) => arr.indexOf(u) === i);
                            return (
                              <tr key={c.id}>
                                <td>
                                  <strong>{c.itemLabel}</strong>
                                  <span className={styles.meta}>
                                    {c.itemCode}
                                    {c.isRequired ? ' · Bắt buộc' : ' · Tuỳ chọn'}
                                    {` · ${c.uploadedCount}/${min} tệp`}
                                  </span>
                                </td>
                                <td>
                                  {linked.length === 0 ? (
                                    '—'
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {linked.map((d) => (
                                        <button
                                          key={d.id}
                                          type="button"
                                          className={styles.linkish}
                                          title={d.fileName}
                                          onClick={() => setDrawerDoc(d)}
                                        >
                                          {shortFileName(d.fileName || d.documentKey)}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {uploaders.length
                                    ? uploaders.map((u) => (
                                        <span key={u} className={styles.meta} style={{ margin: 0, display: 'block' }}>
                                          {u}
                                        </span>
                                      ))
                                    : '—'}
                                </td>
                                <td>
                                  <span
                                    className={badgeClass(
                                      c.itemStatus === 'Uploaded' || c.itemStatus === 'Pass'
                                        ? 'ok'
                                        : c.itemStatus === 'Fail'
                                          ? 'danger'
                                          : missing
                                            ? 'warn'
                                            : 'mute'
                                    )}
                                  >
                                    {checklistStatusVi(c.itemStatus)}
                                  </span>
                                </td>
                                <td>
                                  <div className={styles.actions}>
                                    {linked[0] && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnOutline}`}
                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                        onClick={() => setDrawerDoc(linked[0])}
                                      >
                                        Xem
                                      </button>
                                    )}
                                    {canReviewDocs &&
                                      linked.length > 0 &&
                                      !c.isLocked && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnOutline}`}
                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                        disabled={busy}
                                        onClick={() => openReview(c.itemCode)}
                                      >
                                        Đánh giá
                                      </button>
                                    )}
                                    {c.isLocked && (
                                      <span className={badgeClass('mute')}>Đã khóa</span>
                                    )}
                                    {master.currentStepKey === 'BPCM1_PREPARE' &&
                                      (master.status === 'Draft' || master.status === 'Returned') && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnPrimary}`}
                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                        disabled={busy}
                                        onClick={() => {
                                          setUploadMode('checklist');
                                          setUploadItemCode(c.itemCode);
                                          setDialog('attach');
                                        }}
                                      >
                                        {c.uploadedCount > 0 ? 'Tải thêm' : 'Tải lên'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {docsTab === 'files' && (
                  <div style={{ padding: 0 }}>
                    {supportingDocs.length === 0 ? (
                      <p className={styles.empty}>
                        Chưa có tài liệu hỗ trợ. Dùng «Tải đính kèm hỗ trợ» để bổ sung chứng từ
                        theo bước (không thay checklist).
                      </p>
                    ) : (
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Loại</th>
                            <th>Tệp</th>
                            <th>Kho</th>
                            <th>Người tải</th>
                            <th>Thời gian</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {supportingDocs.map((d) => (
                            <tr key={d.id}>
                              <td>
                                <strong>{docClassVi(d.docClass)}</strong>
                                <span className={styles.meta}>{d.documentKey}</span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={styles.linkish}
                                  title={d.fileName}
                                  onClick={() => setDrawerDoc(d)}
                                >
                                  {shortFileName(d.fileName || '—')}
                                </button>
                              </td>
                              <td>
                                <span
                                  className={`${styles.visTag} ${
                                    /internal/i.test(d.libraryName || d.visibility)
                                      ? styles.visTagInternal
                                      : ''
                                  }`}
                                >
                                  {/internal/i.test(d.libraryName || '')
                                    ? 'DocsInternal'
                                    : 'DocsWorking'}
                                </span>
                              </td>
                              <td>{d.uploadedByUPN || '—'}</td>
                              <td>
                                {d.uploadedAt
                                  ? new Date(d.uploadedAt).toLocaleString('vi-VN')
                                  : '—'}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.btnOutline}`}
                                  style={{ padding: '6px 10px', fontSize: 12 }}
                                  onClick={() => setDrawerDoc(d)}
                                >
                                  Xem
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </section>

              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Hoạt động</h3>
                </div>
                <div className={styles.tabs}>
                  <button
                    type="button"
                    className={`${styles.tab} ${
                      activityTab === 'timeline' ? styles.tabOn : ''
                    }`}
                    onClick={() => setActivityTab('timeline')}
                  >
                    Nhật ký
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${
                      activityTab === 'comment' ? styles.tabOn : ''
                    }`}
                    onClick={() => setActivityTab('comment')}
                  >
                    Ghi chú
                  </button>
                </div>
                {activityTab === 'timeline' && (
                  <div className={styles.cardB}>
                    {activeWi && isWorkItemAccepted(activeWi) && (
                      <div className={styles.actRow}>
                        <div>
                          <strong>Hạn xử lý bước hiện tại</strong>
                          <span className={styles.meta}>
                            {activeWi.dueAt
                              ? new Date(activeWi.dueAt).toLocaleString('vi-VN')
                              : '—'}
                            {activeWi.acceptedByUPN ? ` · ${activeWi.acceptedByUPN}` : ''}
                          </span>
                        </div>
                        <span className={badgeClass('info')}>Hạn xử lý</span>
                      </div>
                    )}
                    {timeline.length === 0 && (
                      <p className={styles.empty}>
                        Chưa có nhật ký Activity. Import Flow 1.0.0.11 rồi thao tác lại hồ sơ.
                      </p>
                    )}
                    {timeline.map((row) => (
                      <div className={styles.actRow} key={row.id}>
                        <div>
                          <strong>{row.title}</strong>
                          <span className={styles.meta}>
                            {[row.at ? new Date(row.at).toLocaleString('vi-VN') : '', row.meta]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        <span className={badgeClass(row.kind)}>{row.badge}</span>
                      </div>
                    ))}
                  </div>
                )}
                {activityTab === 'comment' && (
                  <div className={styles.cardB}>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      Thêm ghi chú
                      <textarea
                        rows={3}
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Thêm ghi chú…"
                      />
                    </label>
                    <div className={styles.actions} style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        disabled={busy}
                        onClick={() => {
                          if (!commentDraft.trim()) {
                            showNotice('warning', 'Nhập nội dung ghi chú');
                            return;
                          }
                          showNotice(
                            'info',
                            'Ghi chú UI đã nhận — chờ nối list Activity/Comments trên CECM.'
                          );
                          setCommentDraft('');
                        }}
                      >
                        Gửi ghi chú
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {view === 'detail' && !master && (
            <p className={styles.empty}>
              Chưa chọn hồ sơ. Vào «Việc của tôi» hoặc «Tạo hồ sơ». {requestKey}
            </p>
          )}

          {view === 'audit' && (
            <>
              <div className={styles.pageHead}>
                <div>
                  <h2>Nhật ký nội bộ</h2>
                </div>
              </div>
              <div className={styles.panelInfo}>
                <h4>R10 · AUDIT</h4>
                <p className={styles.hint} style={{ marginTop: 6 }}>
                  Chỉ đọc ActivityInternal khi ACL cho phép. UI khung đã sẵn — nối list nhật ký
                  ở UAT CECM.
                </p>
              </div>
              <section className={styles.card}>
                <div className={styles.cardH}>
                  <h3>Hồ sơ gần đây (đối chiếu)</h3>
                </div>
                <div className={styles.cardB} style={{ padding: 0 }}>
                  {renderInboxTable(inbox)}
                </div>
              </section>
            </>
          )}
          </main>

          {showRail && (
            <aside className={styles.rail} aria-label="Thông tin phụ">
              {view === 'create' && (
                <>
                  <div className={styles.railCard}>
                    <h4>Xem trước</h4>
                    <div className={styles.kv}>
                      <b>Loại</b>
                      <span>{selectedTypeMeta ? selectedTypeMeta.title : '—'}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Tiêu đề</b>
                      <span>{createTitle || '—'}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Số tiền</b>
                      <span>{moneyVi(Number(createAmount) || 0)}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Đơn vị</b>
                      <span>{createOu}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Người tạo</b>
                      <span>{actorUPN}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Checklist</b>
                      <span>
                        {requiredTplCount} bắt buộc · {templates.length} mục
                      </span>
                    </div>
                  </div>
                  <div className={styles.railCard}>
                    <h4>Gợi ý</h4>
                    <p className={styles.hint}>
                      Sau khi tạo: tải đủ tài liệu bắt buộc rồi mới «Gửi hồ sơ».
                    </p>
                  </div>
                </>
              )}
              {view === 'detail' && master && (
                <>
                  <div className={styles.railCard}>
                    <div className={styles.reqKey}>
                      <span>Mã hồ sơ</span>
                      {master.requestKey}
                    </div>
                    <div className={styles.bigNum}>
                      {moneyVi(master.amount)}
                      <span>
                        Số tiền đề nghị ·{' '}
                        {chairStatusDetailVi(
                          master.currentStepKey,
                          master.status,
                          master.paymentDueAt,
                          isChairDossierApproved(master, workItems)
                        )}
                      </span>
                    </div>
                  </div>
                  <div className={styles.railCard}>
                    <h4>Tóm tắt nhanh</h4>
                    <div className={styles.kv}>
                      <b>Loại</b>
                      <span>{master.paymentTypeCode || '—'}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Đơn vị</b>
                      <span>{master.currentOUCode || master.createdOUCode || '—'}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Người tạo</b>
                      <span>{master.creatorUPN || '—'}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Trạng thái</b>
                      <span>
                        {chairStatusDetailVi(
                          master.currentStepKey,
                          master.status,
                          master.paymentDueAt,
                          isChairDossierApproved(master, workItems)
                        )}
                      </span>
                    </div>
                    <div className={styles.kv}>
                      <b>Bước</b>
                      <span>{stepShortVi(master.currentStepKey)}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Lượt</b>
                      <span>{master.reviewRound}</span>
                    </div>
                    <div className={styles.kv}>
                      <b>Checklist</b>
                      <span>
                        {requiredChecklistReady(checklist) ? 'Đã đủ' : 'Còn thiếu'}
                      </span>
                    </div>
                    <div className={styles.kv}>
                      <b>Thời hạn TT</b>
                      <span>
                        {master.paymentDueAt
                          ? new Date(master.paymentDueAt).toLocaleDateString('vi-VN')
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.kv}>
                      <b>UNC</b>
                      <span>{uncDocs[0] ? uncDocs[0].fileName : 'Chưa có'}</span>
                    </div>
                    {!!master.explanation && (
                      <div
                        className={styles.kv}
                        style={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: 4
                        }}
                      >
                        <b>Diễn giải</b>
                        <span style={{ textAlign: 'left' }}>{master.explanation}</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.railCard}>
                    <h4>Luồng duyệt</h4>
                    <div className={styles.flowV}>
                      {CORE_STEPS.map((s, idx) => {
                        const cur = stepIndex(master.currentStepKey);
                        const done = idx < cur;
                        const now = idx === cur;
                        return (
                          <div
                            key={s}
                            className={`${styles.flowStep} ${done ? styles.flowDone : ''} ${
                              now ? styles.flowNow : ''
                            }`.trim()}
                          >
                            <span className={styles.flowDot}>{done ? '✓' : idx + 1}</span>
                            <strong>{stepShortVi(s)}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              {view === 'detail' && !master && (
                <div className={styles.railCard}>
                  <h4>Hồ sơ</h4>
                  <p className={styles.hint}>Chưa mở hồ sơ nào.</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      <Dialog
        hidden={!dialog}
        onDismiss={busy ? undefined : () => setDialog(undefined)}
        dialogContentProps={{
          type: DialogType.normal,
          title: dialog
            ? dialog === 'attach'
              ? uploadMode === 'step'
                ? 'Tải tài liệu hỗ trợ'
                : 'Tải tài liệu checklist'
              : dialogTitleVi(dialog)
            : ''
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
          {dialog === 'accept' && (
            <>
              <p className={styles.hint}>
                Trưởng phòng / người được giao tiếp nhận bước hiện tại và bắt buộc đặt hạn xử
                lý. Chưa tiếp nhận thì không được chuyển bước / xác nhận thanh toán.
              </p>
              <label className={styles.field}>
                Hạn xử lý (bắt buộc)
                <input
                  type="date"
                  value={acceptDue}
                  onChange={(e) => setAcceptDue(e.target.value)}
                />
              </label>
            </>
          )}
          {dialog === 'approve' && (
            <p className={styles.hint}>
              Phê duyệt hồ sơ tại CT.HĐQT. Sau bước này hồ sơ vẫn ở CT.HĐQT — chưa chuyển TCKT
              thanh toán. Dùng «Duyệt thanh toán» để đặt hạn và chuyển bước.
            </p>
          )}
          {dialog === 'approvePay' && (
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
              {dialog === 'attach' && uploadMode === 'checklist' && (
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
              {dialog === 'attach' && uploadMode === 'step' && (
                <p className={styles.hint}>
                  Tải tài liệu hỗ trợ cho bước{' '}
                  <b>{stepShortVi(master ? master.currentStepKey : '')}</b> (nhóm StepAttachment —
                  không thay thế checklist bắt buộc).
                </p>
              )}
              <label className={styles.field}>
                Chọn tệp
                <input ref={fileRef} type="file" />
              </label>
            </>
          )}
          {dialog === 'submit' && (
            <p className={styles.hint}>
              Hệ thống kiểm tra đủ tài liệu checklist bắt buộc rồi trình trưởng phòng (chưa sang
              BPCM2). Không cần đánh giá Đạt/Không đạt ở bước này.
            </p>
          )}
          {dialog === 'mgrApprove' && (
            <p className={styles.hint}>
              Xác nhận duyệt gửi hồ sơ sang BPCM2. Không yêu cầu đánh giá Đạt hết checklist — việc
              đó thuộc các bước kiểm tra sau.
            </p>
          )}
          {dialog === 'forward' && (
            <p className={styles.hint}>
              Xác nhận chuyển bước. Checklist đã đánh giá Đạt hết các mục cần kiểm tra. Sau khi
              chuyển, không được đánh giá lại.
            </p>
          )}
          {dialog === 'confirmPay' && (
            <p className={styles.hint}>
              Xác nhận dựa trên ủy nhiệm chi:{' '}
              {uncDocs[0] ? uncDocs[0].fileName : '(chưa có tệp)'}
            </p>
          )}
          {dialog === 'review' && (
            <>
              <p className={styles.hint}>
                Mục:{' '}
                <b>
                  {(checklist.filter((c) => c.itemCode === reviewItemCode)[0] || {}).itemLabel ||
                    reviewItemCode}
                </b>
              </p>
              <label className={styles.field}>
                Kết quả
                <select
                  value={reviewResult}
                  onChange={(e) => setReviewResult(e.target.value as 'Pass' | 'Fail')}
                >
                  <option value="Pass">Đạt</option>
                  <option value="Fail">Không đạt</option>
                </select>
              </label>
              <label className={styles.field}>
                Lý do {reviewResult === 'Fail' ? '(bắt buộc)' : '(tuỳ chọn)'}
                <textarea
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <DialogFooter>
          <DefaultButton text="Hủy" onClick={() => setDialog(undefined)} disabled={busy} />
          <PrimaryButton
            text="Xác nhận"
            onClick={confirmDialog}
            disabled={busy}
            styles={
              dialog === 'review' && reviewResult === 'Fail'
                ? {
                    root: { background: '#b91c1c', borderColor: '#b91c1c' },
                    rootHovered: { background: '#991b1b', borderColor: '#991b1b' }
                  }
                : undefined
            }
          />
        </DialogFooter>
      </Dialog>

      {drawerDoc && (
        <FilePreviewDrawer
          sp={props.sp}
          doc={drawerDoc}
          comment={docComment}
          onCommentChange={setDocComment}
          onClose={() => {
            setDrawerDoc(undefined);
            setDocComment('');
          }}
          onSendComment={() => {
            if (!docComment.trim()) {
              showNotice('warning', 'Nhập nội dung ghi chú');
              return;
            }
            showNotice(
              'info',
              'Đã nhận ghi chú tài liệu (chờ nối list Comments trên CECM).'
            );
            setDocComment('');
          }}
        />
      )}

      <BusyDialog open={busy} message={busyMessage} />
    </div>
  );
};

export default LivePayApp;
