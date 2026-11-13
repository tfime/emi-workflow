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
  listOrgMembers,
  IOrgMember,
  listStepRecipients,
  IStepRecipient,
  listRecentRequests,
  getRequestByKey,
  patchRequestAfterCreate,
  patchRequestBusinessFields,
  canEditRequestBusinessFields,
  displayRequestTitle,
  listChecklistItems,
  reconcileChecklistFromTemplates,
  requiredChecklistReady,
  checklistReviewComplete,
  checklistHasFail,
  lockReviewedItems,
  unlockChecklistItems,
  enqueueAndRun,
  uploadChecklistFile,
  uploadStepAttachment,
  uploadUncFile,
  clearChecklistItemFiles,
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
  buildNoteList,
  latestRejectNote,
  notesForDocument,
  addUserNote,
  needsAcceptFirst,
  canAddUserNote,
  SYSADM_UPN,
  commandDenial,
  resolveActor,
  readActAsKey,
  writeActAsKey,
  memberKey,
  actorLabel,
  canCreateInOu,
  isRequestCreator,
  requestVisibleTo,
  isActorTodo,
  sameUpn,
  isSysAdmin,
  IActivityPublicRow,
  IStepReviewRow,
  INoteListItem,
  chairStatusDetailVi,
  stepShortVi,
  checklistStatusVi,
  moneyVi,
  shortFileName,
  parsePayHash,
  applyPayHash,
  samePayRoute,
  IPayRoute,
  PayInboxFilter
} from '../services';
import { payThemeStyle } from '../theme/payTokens';
import { DialogKind, IPayAction, PayView } from './types';
import BusyDialog from './BusyDialog';
import PayNoticeBar, { IPayNotice } from './PayNotice';
import FilePreviewDrawer from './FilePreviewDrawer';
import ApprovalFlow from './detail/ApprovalFlow';
import InboxPage from './inbox/InboxPage';
import InboxTable from './inbox/InboxTable';

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

/** UI chỉ chọn BPCM2/BPCM3; TCKT/CHAIR/Archive auto từ StepRecipients default. */
const ROUTE_STEPS_UI: { key: string; label: string }[] = [
  { key: 'BPCM2_TECH', label: 'BPCM2' },
  { key: 'BPCM3_PRICE', label: 'BPCM3' }
];
const ROUTE_STEPS_AUTO = ['TCKT_CHECK', 'CHAIR_APPROVE', 'TCKT_PAY', 'SYSTEM_ARCHIVE'];

const LivePayApp: React.FC<ILivePayAppProps> = (props) => {
  const bootRoute = React.useMemo(
    () => parsePayHash(typeof window !== 'undefined' ? window.location.hash : ''),
    []
  );
  const signedInUPN = upnFromLogin(props.userLoginName);
  const [orgMembers, setOrgMembers] = React.useState<IOrgMember[]>([]);
  const [actAsKey, setActAsKey] = React.useState(readActAsKey);
  const actor = resolveActor(signedInUPN, orgMembers, actAsKey);
  const actorUPN = actor.upn;
  const [view, setView] = React.useState<PayView>(bootRoute.view);
  const [inboxFilter, setInboxFilter] = React.useState<PayInboxFilter>(
    bootRoute.inboxFilter
  );
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

  /** Form sửa trên detail khi Draft/Returned */
  const [editTitle, setEditTitle] = React.useState('');
  const [editAmount, setEditAmount] = React.useState('');
  const [editExpl, setEditExpl] = React.useState('');
  const [editOu, setEditOu] = React.useState('');
  const [editRoutePlan, setEditRoutePlan] = React.useState<Record<string, string>>({});

  const [requestKey, setRequestKey] = React.useState(bootRoute.requestKey || '');
  const [master, setMaster] = React.useState<IRequestMaster | undefined>(undefined);
  const routePrevRef = React.useRef<IPayRoute>(bootRoute);
  const routeHashReadyRef = React.useRef(false);
  const [checklist, setChecklist] = React.useState<IChecklistItemRow[]>([]);
  const [workItems, setWorkItems] = React.useState<IWorkItemRow[]>([]);
  const [activities, setActivities] = React.useState<IActivityPublicRow[]>([]);
  const [stepReviews, setStepReviews] = React.useState<IStepReviewRow[]>([]);
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
  /** File picker trực tiếp từ nút Tải lên/Tải thêm trên từng mục checklist (không qua dialog). */
  const checklistFileRef = React.useRef<HTMLInputElement>(null);
  const pendingChecklistItemCode = React.useRef<string>('');

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

  const defaultOuForStep = React.useCallback(
    (stepKey: string, recipients: IStepRecipient[]): string => {
      const rows = recipients.filter((r) => r.stepKey === stepKey);
      const def = rows.filter((r) => r.isDefault)[0] || rows[0];
      return def ? def.ouCode : '';
    },
    []
  );

  const fillRoutePlanGaps = React.useCallback(
    (
      plan: Record<string, string>,
      recipients: IStepRecipient[]
    ): Record<string, string> => {
      const next = { ...plan };
      ROUTE_STEPS_UI.forEach((rs) => {
        if (!next[rs.key]) next[rs.key] = defaultOuForStep(rs.key, recipients);
      });
      ROUTE_STEPS_AUTO.forEach((sk) => {
        if (!next[sk]) next[sk] = defaultOuForStep(sk, recipients);
      });
      return next;
    },
    [defaultOuForStep]
  );

  const syncEditForm = (m: IRequestMaster, recipients: IStepRecipient[]): void => {
    setEditTitle(m.title || '');
    setEditAmount(m.amount !== undefined && m.amount !== null ? String(m.amount) : '');
    setEditExpl(m.explanation || '');
    setEditOu(m.createdOUCode || '');
    // title đã được mapMaster tách khỏi RequestKey
    let plan: Record<string, string> = {};
    if (m.routePlanJson) {
      try {
        plan = JSON.parse(m.routePlanJson) as Record<string, string>;
      } catch {
        plan = {};
      }
    }
    // RoutePlanJson thiếu / rỗng → điền mặc định IsDefault (tránh select value="" hiện option đầu nhưng state vẫn trống).
    setEditRoutePlan(fillRoutePlanGaps(plan, recipients));
  };

  const loadDetail = async (key: string): Promise<void> => {
    const m = await getRequestByKey(props.sp, key);
    if (!m) throw new Error(`Không tìm thấy hồ sơ ${key}`);
    let items = await listChecklistItems(props.sp, key);
    // Đang sửa lại ở BPCM1: mở khóa — «Đã khóa» chỉ áp dụng bước kiểm tra sau khi chốt.
    if (
      m.currentStepKey === 'BPCM1_PREPARE' &&
      (m.status === 'Draft' || m.status === 'Returned') &&
      items.some((i) => i.isLocked)
    ) {
      await unlockChecklistItems(props.sp, items);
      items = await listChecklistItems(props.sp, key);
    }
    const wis = await listWorkItems(props.sp, key);
    const acts = await listActivityPublic(props.sp, key);
    const reviews = await listStepReviews(props.sp, key);
    const unc = await listUncDocuments(props.sp, key);
    const allDocs = await listDocumentsForRequest(props.sp, key);
    setMaster(m);
    syncEditForm(m, stepRecipients);
    setChecklist(items);
    setWorkItems(wis);
    setActivities(acts);
    setStepReviews(reviews);
    setTimeline(buildTimeline(acts, reviews));
    setUncDocs(unc);
    setDocs(allDocs);
    setRequestKey(key);
    setDocsTab('checklist');
    setActivityTab('timeline');
  };

  const onSaveBusinessFields = (): void => {
    if (!master) return;
    if (!isRequestCreator(actor, master)) {
      showNotice('warning', 'Chỉ người tạo hồ sơ được sửa thông tin khi nháp hoặc bị trả.');
      return;
    }
    void run(
      async () => {
        const fullRoute = fillRoutePlanGaps({ ...editRoutePlan }, stepRecipients);
        const missingUi = ROUTE_STEPS_UI.filter((rs) => !fullRoute[rs.key]);
        if (missingUi.length) {
          throw new Error(
            `Chưa cấu hình phòng nhận ${missingUi.map((r) => r.label).join(', ')} (StepRecipients).`
          );
        }
        const title = editTitle.trim();
        if (!title) throw new Error('Nhập tiêu đề hồ sơ.');
        if (title === master.requestKey) {
          throw new Error('Tiêu đề phải khác mã hồ sơ.');
        }
        setBusyMessage('Đang lưu thông tin hồ sơ…');
        await patchRequestBusinessFields(props.sp, master.requestKey, {
          title,
          amount: Number(editAmount) || 0,
          explanation: editExpl,
          createdOUCode: editOu || master.createdOUCode,
          routePlanJson: JSON.stringify(fullRoute)
        });
        await loadDetail(master.requestKey);
      },
      { waiting: 'Đang lưu thông tin…', success: 'Đã lưu thông tin hồ sơ.' }
    );
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
      const members = await listOrgMembers(props.sp);
      setOrgMembers(members);
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
      if (bootRoute.view === 'detail' && bootRoute.requestKey) {
        try {
          setBusyMessage('Đang mở hồ sơ từ liên kết…');
          await loadDetail(bootRoute.requestKey);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          showNotice('error', msg || `Không mở được hồ sơ ${bootRoute.requestKey}`);
          setView('inbox');
          setInboxFilter('all');
          applyPayHash({ view: 'inbox', inboxFilter: 'all' }, 'replace');
          routePrevRef.current = { view: 'inbox', inboxFilter: 'all' };
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Đồng bộ #emi/... khi đổi màn / hồ sơ (F5 giữ đúng chỗ). */
  React.useEffect(() => {
    const next: IPayRoute = {
      view,
      inboxFilter,
      requestKey: view === 'detail' ? requestKey || undefined : undefined
    };
    const prev = routePrevRef.current;
    const onlyInboxFilter =
      prev.view === 'inbox' &&
      next.view === 'inbox' &&
      prev.inboxFilter !== next.inboxFilter;
    const mode: 'push' | 'replace' =
      !routeHashReadyRef.current || onlyInboxFilter ? 'replace' : 'push';
    applyPayHash(next, mode);
    routeHashReadyRef.current = true;
    routePrevRef.current = next;
  }, [view, inboxFilter, requestKey]);

  /** Back/Forward hoặc sửa hash tay. */
  React.useEffect(() => {
    const onLocationRoute = (): void => {
      const route = parsePayHash(window.location.hash);
      if (samePayRoute(route, routePrevRef.current)) {
        return;
      }
      routePrevRef.current = route;
      setView(route.view);
      setInboxFilter(route.inboxFilter);
      if (route.view === 'detail' && route.requestKey) {
        void run(
          async () => {
            try {
              await loadDetail(route.requestKey as string);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              showNotice(
                'error',
                msg || `Không mở được hồ sơ ${route.requestKey}`
              );
              setView('inbox');
              setInboxFilter('all');
              applyPayHash({ view: 'inbox', inboxFilter: 'all' }, 'replace');
              routePrevRef.current = { view: 'inbox', inboxFilter: 'all' };
            }
          },
          { waiting: 'Đang mở hồ sơ…' }
        );
      }
    };
    window.addEventListener('popstate', onLocationRoute);
    window.addEventListener('hashchange', onLocationRoute);
    return () => {
      window.removeEventListener('popstate', onLocationRoute);
      window.removeEventListener('hashchange', onLocationRoute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (actor.ouCode) setCreateOu(actor.ouCode);
  }, [actor.ouCode]);

  React.useEffect(() => {
    if (!actAsKey || !orgMembers.length) return;
    const still = orgMembers.some((m) => memberKey(m) === actAsKey);
    if (!still) {
      writeActAsKey('');
      setActAsKey('');
    }
  }, [orgMembers, actAsKey]);

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
    setRequestKey(key);
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
    const createOuCode = actor.ouCode || createOu;
    const createDeny = commandDenial(actor, 'CREATE_REQUEST', undefined, createOuCode);
    if (createDeny) {
      showNotice('warning', createDeny);
      return;
    }
    void run(
      async () => {
        const title = (createTitle || '').trim();
        if (!title) throw new Error('Nhập tiêu đề hồ sơ.');
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
        setBusyMessage('Đang tạo hồ sơ cho bạn…');
        const cmdDone = await enqueueAndRun(
          props.sp,
          'CREATE_REQUEST',
          {
            title,
            createdOUCode: createOuCode,
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
  const bpcm1Ous = stepRecipients
    .filter((r) => r.stepKey === 'BPCM1_PREPARE')
    .map((r) => r.ouCode);
  const mayCreate = canCreateInOu(actor, bpcm1Ous);
  const actions = master
    ? liveActionsFor(master, checklist, uncDocs.length > 0, actor, activeWi, workItems)
    : [];

  const acceptBlocked = needsAcceptFirst(master, activeWi, workItems);
  const notesAllowed = canAddUserNote(master, activeWi, workItems);

  const canReviewDocs = !!(
    master &&
    actor.memberRole === 'Manager' &&
    actor.ouCode.toLowerCase() === (master.currentOUCode || '').toLowerCase() &&
    REVIEW_STEPS.indexOf(master.currentStepKey) >= 0 &&
    isWorkItemAccepted(activeWi) &&
    !acceptBlocked
  );

  const noteList: INoteListItem[] = buildNoteList(activities, stepReviews);
  const rejectNote = latestRejectNote(activities);

  const openReview = (itemCode: string): void => {
    if (acceptBlocked || !canReviewDocs) {
      showNotice(
        'warning',
        'Cần «Tiếp nhận và đặt hạn» trước khi đánh giá checklist.'
      );
      return;
    }
    setReviewItemCode(itemCode);
    setReviewResult('Pass');
    setReviewReason('');
    setDialog('review');
  };

  const sendUserNote = (text: string, documentKey?: string): void => {
    if (!master) return;
    if (acceptBlocked) {
      showNotice(
        'warning',
        'Cần «Tiếp nhận và đặt hạn» trước khi gửi ghi chú.'
      );
      return;
    }
    if (!notesAllowed) {
      showNotice('warning', 'Hồ sơ đã đóng — không gửi thêm ghi chú.');
      return;
    }
    if (
      actor.memberRole === 'SysAdmin' ||
      (!isRequestCreator(actor, master) && !isActorTodo(actor, master))
    ) {
      showNotice('warning', 'Nhân sự đang đóng vai không ghi chú trên hồ sơ này.');
      return;
    }
    void run(
      async () => {
        await addUserNote(props.sp, {
          requestKey: master.requestKey,
          stepInstanceKey: master.currentStepInstanceKey,
          reviewRound: master.reviewRound,
          actorUPN,
          note: text,
          documentKey
        });
        setActivityTab('comment');
        await loadDetail(master.requestKey);
      },
      { waiting: 'Đang gửi ghi chú…', success: 'Đã gửi ghi chú.' }
    );
  };

  const isBpcm1Adjusting = !!(
    master &&
    isRequestCreator(actor, master) &&
    master.currentStepKey === 'BPCM1_PREPARE' &&
    (master.status === 'Draft' || master.status === 'Returned')
  );

  /** Mở file picker ngay cho mục checklist đã chọn (không dialog chọn mục). */
  const pickChecklistFile = (itemCode: string): void => {
    pendingChecklistItemCode.current = itemCode;
    setUploadMode('checklist');
    setUploadItemCode(itemCode);
    const input = checklistFileRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const onChecklistFilePicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file || !master) return;
    const code = pendingChecklistItemCode.current || uploadItemCode;
    const item = checklist.filter((c) => c.itemCode === code)[0] || checklist[0];
    if (!item) {
      showNotice('warning', 'Không có mục checklist');
      input.value = '';
      return;
    }
    void run(
      async () => {
        const buf = await file.arrayBuffer();
        await uploadChecklistFile(props.sp, {
          requestKey: master.requestKey,
          item,
          fileName: file.name,
          content: buf,
          uploadedByUPN: actorUPN
        });
        input.value = '';
        await loadDetail(master.requestKey);
      },
      {
        waiting: `Đang tải tệp «${file.name}»…`,
        success: `Đã tải «${file.name}» vào mục ${item.itemLabel}`
      }
    );
  };

  const onClearChecklistItem = (item: IChecklistItemRow): void => {
    if (!master) return;
    if (
      !window.confirm(
        `Xóa toàn bộ tệp của mục «${item.itemLabel}» để tải lên mới? Tệp cũ sẽ không còn hiện trên hồ sơ.`
      )
    ) {
      return;
    }
    void run(
      async () => {
        await clearChecklistItemFiles(props.sp, item);
        await loadDetail(master.requestKey);
      },
      { waiting: 'Đang xóa hồ sơ mục…', success: `Đã xóa tệp mục «${item.itemLabel}».` }
    );
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
    const commandKind =
      kind === 'submit'
        ? 'SUBMIT'
        : kind === 'accept'
          ? 'ACCEPT'
          : kind === 'confirmPay'
            ? 'CONFIRM_PAYMENT'
            : kind === 'mgrApprove' ||
                kind === 'forward' ||
                kind === 'approve' ||
                kind === 'approvePay' ||
                kind === 'return' ||
                kind === 'reject'
              ? 'DECIDE'
              : undefined;
    if (commandKind) {
      const deny = commandDenial(actor, commandKind, master);
      if (deny) {
        setDialog(undefined);
        showNotice('warning', deny);
        return;
      }
    }
    setDialog(undefined);

    if (kind === 'submit') {
      void run(
        async () => {
          if (!requiredChecklistReady(checklist)) {
            throw new Error('Chưa đủ tài liệu checklist bắt buộc');
          }
          setBusyMessage('Đang gửi hồ sơ…');
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
          // Có Fail chưa khóa → phải trả BPCM1, không PASS. Không đòi Đạt hết checklist.
          if (kind === 'forward' && checklistHasFail(checklist)) {
            throw new Error(
              'Có mục checklist Không đạt — hãy «Trả về người tạo», không chuyển bước.'
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
          // BPCM2/3/TCKT_CHECK: khóa mục đã Pass/Fail; mục chưa đánh giá để bước sau.
          // approvePay: khóa nốt mục đã đánh giá còn mở. Không khóa khi chỉ duyệt hồ sơ CHAIR.
          if (kind === 'forward' || kind === 'approvePay') {
            await lockReviewedItems(props.sp, checklist);
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
          // Không khóa toàn bộ checklist khi trả — BPCM1 cần sửa/tải lại mục Fail.
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
          if (needsAcceptFirst(master, activeWi, workItems)) {
            throw new Error('Cần «Tiếp nhận và đặt hạn» trước khi đánh giá checklist.');
          }
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

  const goInbox = (filter: PayInboxFilter = 'all'): void => {
    setInboxFilter(filter);
    setView('inbox');
  };

  const visibleInbox = inbox.filter((item) => requestVisibleTo(actor, item));
  const todoRows = visibleInbox.filter((item) => isActorTodo(actor, item));
  const mineRows = visibleInbox.filter(
    (item) => actor.memberRole !== 'SysAdmin' && sameUpn(item.creatorUPN, actor.upn)
  );
  const relatedRows = visibleInbox.filter((item) => !isActorTodo(actor, item));
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
          {isSysAdmin(signedInUPN) && (
            <>
              <label className={styles.meta} htmlFor="emiPayActAs">
                Đóng vai
              </label>
              <select
                id="emiPayActAs"
                className={styles.personaSelect}
                value={actor.acting ? memberKey({
                  memberUPN: actor.upn,
                  ouCode: actor.ouCode,
                  memberRole: actor.memberRole === 'Manager' ? 'Manager' : 'Member'
                }) : ''}
                onChange={(e) => {
                  const next = e.target.value;
                  writeActAsKey(next);
                  setActAsKey(next);
                  if (view === 'audit' || view === 'create') setView('inbox');
                }}
              >
                <option value="">Quản trị ({SYSADM_UPN}) — không thao tác hồ sơ</option>
                {orgMembers.map((m) => {
                  const ou = orgUnits.filter((u) => u.ouCode === m.ouCode)[0];
                  const role = m.memberRole === 'Manager' ? 'Trưởng phòng' : 'Thành viên';
                  return (
                    <option key={memberKey(m)} value={memberKey(m)}>
                      {m.displayName} · {role} · {ou ? ou.ouName : m.ouCode}
                    </option>
                  );
                })}
              </select>
            </>
          )}
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
            disabled={!mayCreate}
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
            disabled={actor.acting || !isSysAdmin(signedInUPN)}
            onClick={() => setView('audit')}
          >
            Nhật ký nội bộ
          </button>

          <p className={styles.navNote}>
            {actor.acting
              ? 'Đang đóng vai nhân sự tạm. Nút và người ghi trên lệnh theo người này. User thật sau chỉ đổi UPN trong OrgMembers.'
              : isSysAdmin(signedInUPN)
                ? 'Quản trị thấy dữ liệu, không chốt nghiệp vụ. Chọn «Đóng vai» để thao tác hồ sơ.'
                : 'Quyền theo phòng và chức danh trong OrgMembers.'}
          </p>
          <div className={styles.navProfile}>
            <div className={styles.avatar} style={{ width: 32, height: 32, fontSize: 10 }}>
              {avatarLetters}
            </div>
            <div>
              <strong>{actor.displayName}</strong>
              <span>
                {actorLabel(
                  actor,
                  orgUnits.filter((u) => u.ouCode === actor.ouCode)[0]?.ouName
                )}
              </span>
            </div>
          </div>
        </nav>

        <div
          className={`${styles.workspace} ${showRail ? '' : styles.workspaceNoRail}`.trim()}
        >
          <main className={styles.main}>
            <PayNoticeBar notice={notice} onDismiss={() => setNotice(undefined)} />

          {view === 'inbox' && (
            <InboxPage
              todoRows={todoRows}
              mineRows={mineRows}
              relatedRows={relatedRows}
              inboxFilter={inboxFilter}
              orgUnits={orgUnits}
              orgMembers={orgMembers}
              busy={busy}
              mayCreate={mayCreate}
              onOpen={openLiveDetail}
              onRefresh={() => {
                void run(refreshInbox, {
                  waiting: 'Đang làm mới danh sách hồ sơ…',
                  success: 'Đã làm mới danh sách.'
                });
              }}
              onCreate={() => setView('create')}
            />
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
                      Tiêu đề hồ sơ
                      <input
                        value={createTitle}
                        onChange={(e) => setCreateTitle(e.target.value)}
                        placeholder="Ví dụ: Thanh toán đợt 2 theo HĐ…"
                      />
                    </label>
                    <label className={styles.field}>
                      Số tiền đề nghị (VND)
                      <input
                        value={createAmount}
                        onChange={(e) => setCreateAmount(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className={styles.field}>
                      Đơn vị khởi tạo
                      <select
                        value={actor.ouCode || createOu}
                        disabled={!!actor.ouCode}
                        onChange={(e) => setCreateOu(e.target.value)}
                      >
                        {orgUnits.length === 0 && (
                          <option value={actor.ouCode || 'OU_TONGHOP'}>{actor.ouCode || 'OU_TONGHOP'}</option>
                        )}
                        {(actor.ouCode
                          ? orgUnits.filter((o) => o.ouCode === actor.ouCode)
                          : orgUnits
                        ).map((o) => (
                          <option key={o.id} value={o.ouCode}>
                            {o.ouName}
                          </option>
                        ))}
                      </select>
                    </label>
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
                    <div className={`${styles.field} ${styles.fieldFull}`}>
                      <span>Phòng nhận kiểm tra</span>
                      <div className={styles.routeRow}>
                        {ROUTE_STEPS_UI.map((rs) => {
                          const opts = stepRecipients.filter((r) => r.stepKey === rs.key);
                          const selected =
                            routePlan[rs.key] || defaultOuForStep(rs.key, stepRecipients);
                          return (
                            <label key={rs.key} className={styles.routeChip}>
                              <span>{rs.label}</span>
                              <select
                                value={selected}
                                onChange={(e) =>
                                  setRoutePlan((prev) => ({
                                    ...prev,
                                    [rs.key]: e.target.value
                                  }))
                                }
                              >
                                {!opts.length && <option value="">—</option>}
                                {opts.map((o) => {
                                  const ou = orgUnits.filter((u) => u.ouCode === o.ouCode)[0];
                                  return (
                                    <option key={`${rs.key}-${o.ouCode}`} value={o.ouCode}>
                                      {ou ? ou.ouName : o.ouCode}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                          );
                        })}
                      </div>
                      <p className={styles.hint}>TCKT / CT.HĐQT lấy mặc định từ cấu hình.</p>
                    </div>
                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      Diễn giải
                      <textarea
                        rows={2}
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
                              {/* <span className={styles.meta}>{t.itemCode}</span> */}
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
                  <h2>{displayRequestTitle(master)}</h2>
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
                    Chỉnh sửa thông tin / tài liệu rồi trình lại. Bước hiện tại:{' '}
                    <b>{stepShortVi(master.currentStepKey)}</b>
                    {rejectNote ? (
                      <>
                        <br />
                        <b>Lý do:</b> {rejectNote}
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {canEditRequestBusinessFields(master) && isRequestCreator(actor, master) && (
                <section className={styles.card}>
                  <div className={styles.cardH}>
                    <h3>Sửa thông tin hồ sơ</h3>
                    <span className={badgeClass('warn')}>
                      {master.status === 'Returned' ? 'Đã trả về' : 'Nháp'}
                    </span>
                  </div>
                  <div className={styles.cardB}>
                    <div className={styles.form}>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        Tiêu đề hồ sơ
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Ví dụ: Thanh toán công tác tháng 11…"
                        />
                      </label>
                      <label className={styles.field}>
                        Số tiền đề nghị (VND)
                        <input
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          inputMode="numeric"
                        />
                      </label>
                      <label className={styles.field}>
                        Đơn vị khởi tạo
                        <select
                          value={editOu}
                          disabled={!!actor.ouCode}
                          onChange={(e) => setEditOu(e.target.value)}
                        >
                          {orgUnits.length === 0 && (
                            <option value={editOu || 'OU_TONGHOP'}>
                              {editOu || 'OU_TONGHOP'}
                            </option>
                          )}
                          {orgUnits.map((o) => (
                            <option key={o.id} value={o.ouCode}>
                              {o.ouName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={`${styles.field} ${styles.fieldFull}`}>
                        <span>Phòng nhận kiểm tra</span>
                        <div className={styles.routeRow}>
                          {ROUTE_STEPS_UI.map((rs) => {
                            const opts = stepRecipients.filter((r) => r.stepKey === rs.key);
                            const selected =
                              editRoutePlan[rs.key] || defaultOuForStep(rs.key, stepRecipients);
                            return (
                              <label key={rs.key} className={styles.routeChip}>
                                <span>{rs.label}</span>
                                <select
                                  value={selected}
                                  onChange={(e) =>
                                    setEditRoutePlan((prev) => ({
                                      ...prev,
                                      [rs.key]: e.target.value
                                    }))
                                  }
                                >
                                  {!opts.length && <option value="">—</option>}
                                  {opts.map((o) => {
                                    const ou = orgUnits.filter((u) => u.ouCode === o.ouCode)[0];
                                    return (
                                      <option key={`edit-${rs.key}-${o.ouCode}`} value={o.ouCode}>
                                        {ou ? ou.ouName : o.ouCode}
                                      </option>
                                    );
                                  })}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                        <p className={styles.hint}>
                          Loại hồ sơ: {master.paymentTypeCode} (không đổi).
                        </p>
                      </div>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        Diễn giải
                        <textarea
                          rows={2}
                          value={editExpl}
                          onChange={(e) => setEditExpl(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className={styles.actions} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        disabled={busy}
                        onClick={onSaveBusinessFields}
                      >
                        Lưu thông tin
                      </button>
                    </div>
                  </div>
                </section>
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

              {canReviewDocs && checklistHasFail(checklist) && (
                <div className={styles.panelWarn}>
                  <h4>Có mục Không đạt</h4>
                  <div>
                    Chỉ «Trả về người tạo». Phòng đánh giá các mục chưa khóa thuộc phạm vi mình;
                    không cần Đạt hết toàn bộ checklist để chuyển bước.
                  </div>
                </div>
              )}
              {canReviewDocs && !checklistHasFail(checklist) && !checklistReviewComplete(checklist) && (
                <div className={styles.panelWarn}>
                  <h4>Gợi ý đánh giá checklist</h4>
                  <div>
                    Chủ động đánh giá các mục chưa khóa phù hợp phòng. Có thể chuyển bước khi không
                    còn mục Không đạt; mục đã khóa chỉ xem, không đánh giá lại.
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
                                    {/* {c.itemCode} */}
                                    {c.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
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
                                    {/* «Đã khóa» chỉ hiện ở bước kiểm tra — không hiện khi đang sửa lại BPCM1 */}
                                    {c.isLocked && !isBpcm1Adjusting && (
                                      <span className={badgeClass('mute')}>Đã khóa</span>
                                    )}
                                    {isBpcm1Adjusting && linked.length > 0 && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnOutline}`}
                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                        disabled={busy}
                                        onClick={() => onClearChecklistItem(c)}
                                      >
                                        Xóa hồ sơ
                                      </button>
                                    )}
                                    {isBpcm1Adjusting && (
                                      <button
                                        type="button"
                                        className={`${styles.btn} ${styles.btnPrimary}`}
                                        style={{ padding: '6px 10px', fontSize: 12 }}
                                        disabled={busy}
                                        onClick={() => pickChecklistFile(c.itemCode)}
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
                        theo bước.
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
                    <span className={styles.tabLabel}>
                      Nhật ký
                      <span className={styles.tabCountBadge} aria-label={`${timeline.length} mục`}>
                        {timeline.length}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.tab} ${
                      activityTab === 'comment' ? styles.tabOn : ''
                    }`}
                    onClick={() => setActivityTab('comment')}
                  >
                    <span className={styles.tabLabel}>
                      Ghi chú
                      <span className={styles.tabCountBadge} aria-label={`${noteList.length} ghi chú`}>
                        {noteList.length}
                      </span>
                    </span>
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
                    {noteList.length === 0 && (
                      <p className={styles.empty}>Chưa có ghi chú trên hồ sơ.</p>
                    )}
                    {noteList.map((n) => {
                      const linkedDoc = n.documentKey
                        ? docs.filter(
                            (d) =>
                              (d.documentKey || '').replace(/\|/g, '_') === n.documentKey
                          )[0]
                        : undefined;
                      return (
                        <div className={styles.actRow} key={n.id}>
                          <div>
                            <strong>{n.title}</strong>
                            <span className={styles.meta}>
                              {[
                                n.at ? new Date(n.at).toLocaleString('vi-VN') : '',
                                n.actorUPN,
                                linkedDoc
                                  ? shortFileName(linkedDoc.fileName || linkedDoc.documentKey)
                                  : ''
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            <div style={{ marginTop: 4 }}>{n.body}</div>
                            {linkedDoc && (
                              <button
                                type="button"
                                className={styles.linkish}
                                style={{ marginTop: 4, padding: 0, fontSize: 12 }}
                                onClick={() => setDrawerDoc(linkedDoc)}
                              >
                                Mở tệp
                              </button>
                            )}
                          </div>
                          <span
                            className={badgeClass(
                              n.kind === 'reject'
                                ? 'danger'
                                : n.kind === 'user'
                                  ? 'info'
                                  : 'mute'
                            )}
                          >
                            {n.kind === 'reject'
                              ? 'Trả về'
                              : n.kind === 'review'
                                ? 'Nhận xét'
                                : n.documentKey
                                  ? 'Tệp'
                                  : n.kind === 'user'
                                    ? 'Ghi chú'
                                    : 'Khác'}
                          </span>
                        </div>
                      );
                    })}
                    {acceptBlocked ? (
                      <p className={styles.hint} style={{ marginTop: 12 }}>
                        Cần «Tiếp nhận và đặt hạn» trước khi đánh giá checklist hoặc gửi ghi chú.
                      </p>
                    ) : !notesAllowed ? (
                      <p className={styles.hint} style={{ marginTop: 12 }}>
                        Hồ sơ đã đóng — không gửi thêm ghi chú.
                      </p>
                    ) : (
                      <>
                        <label
                          className={`${styles.field} ${styles.fieldFull}`}
                          style={{ marginTop: noteList.length ? 12 : 0 }}
                        >
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
                              const text = commentDraft.trim();
                              setCommentDraft('');
                              sendUserNote(text);
                            }}
                          >
                            Gửi ghi chú
                          </button>
                        </div>
                      </>
                    )}
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
                  <InboxTable
                    rows={inbox}
                    searchQuery=""
                    orgMembers={orgMembers}
                    orgUnits={orgUnits}
                    onOpen={openLiveDetail}
                    resetToken="audit"
                  />
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
                      {master.requestCode || master.requestKey}
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
                      <b>Tiêu đề</b>
                      <span>{displayRequestTitle(master)}</span>
                    </div>
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
                    <ApprovalFlow
                      currentStepKey={master.currentStepKey}
                      workItems={workItems}
                      activities={activities}
                    />
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
              Bạn xác nhận hồ sơ đã đúng, đủ để trình trưởng phòng rồi?
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
          commentsEnabled={notesAllowed && !acceptBlocked}
          commentsDisabledHint={
            acceptBlocked
              ? 'Cần «Tiếp nhận và đặt hạn» trước khi ghi chú trên tài liệu.'
              : 'Hồ sơ đã đóng — không gửi thêm ghi chú.'
          }
          docNotes={notesForDocument(noteList, drawerDoc.documentKey)}
          onClose={() => {
            setDrawerDoc(undefined);
            setDocComment('');
          }}
          onSendComment={() => {
            if (!docComment.trim()) {
              showNotice('warning', 'Nhập nội dung ghi chú');
              return;
            }
            const text = docComment.trim();
            const docKey = drawerDoc.documentKey;
            setDocComment('');
            sendUserNote(text, docKey);
          }}
        />
      )}

      <input
        ref={checklistFileRef}
        type="file"
        style={{ display: 'none' }}
        aria-hidden={true}
        onChange={onChecklistFilePicked}
      />
      <BusyDialog open={busy} message={busyMessage} />
    </div>
  );
};

export default LivePayApp;
