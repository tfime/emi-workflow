import * as React from 'react';
import { initializeIcons } from '@fluentui/react';
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
  patchRequestBusinessFields,
  listChecklistItems,
  reconcileChecklistFromTemplates,
  checklistMatchesTemplates,
  requiredChecklistReady,
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
  setChecklistItemReview,
  saveStepReview,
  liveActionsFor,
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
  commandDenial,
  resolveActor,
  readActAsKey,
  writeActAsKey,
  memberKey,
  canCreateInOu,
  canReviewAtStep,
  isRequestCreator,
  requestVisibleTo,
  isActorTodo,
  sameUpn,
  isSysAdmin,
  IActivityPublicRow,
  IStepReviewRow,
  INoteListItem,
  moneyVi,
  parsePayHash,
  applyPayHash,
  samePayRoute,
  IPayRoute,
  PayInboxFilter
} from '../services';
import { perfLog, perfNow } from '../services/perfMark';
import { payThemeStyle } from '../theme/payTokens';
import { DialogKind, IPayAction, PayView } from './types';
import BusyDialog from './BusyDialog';
import PayNoticeBar, { IPayNotice } from './PayNotice';
import FilePreviewDrawer from './FilePreviewDrawer';
import RequestDetailPage from './detail/RequestDetailPage';
import DetailRail from './detail/DetailRail';
import InboxPage from './inbox/InboxPage';
import DashboardPage from './dashboard/DashboardPage';
import CreateRequestPage from './create/CreateRequestPage';
import CreateRail from './create/CreateRail';
import AuditPage from './audit/AuditPage';
import AppHeader from './shell/AppHeader';
import AppNav from './shell/AppNav';
import PayActionDialog from './dialogs/PayActionDialog';
import {
  formatAmountFromNumber,
  parseAmountInput
} from './create/amountValidate';

initializeIcons(undefined, { disableWarnings: true });

export interface ILivePayAppProps {
  title: string;
  userDisplayName: string;
  userLoginName: string;
  sp: ISpRestContext;
  /** HTTP POST URL Flow Core (When a HTTP request is received). Empty = poll Commands. */
  orchestratorUrl?: string;
}

function upnFromLogin(login: string): string {
  if (!login) return 'admin@local';
  const parts = login.split('|');
  return parts[parts.length - 1] || login;
}

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
  const [createAmount, setCreateAmount] = React.useState(() => formatAmountFromNumber(1000000));
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
    options?: {
      waiting?: string;
      success?: string;
      /** Sau khi tắt spinner — làm mới UI nền (không giữ Dialog chờ). */
      refreshAfter?: () => Promise<void>;
    }
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
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!options?.refreshAfter) return;
    try {
      await options.refreshAfter();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showNotice(
        'error',
        `Đã xử lý nhưng làm mới giao diện thất bại: ${msg}`
      );
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
    setEditAmount(
      m.amount !== undefined && m.amount !== null ? formatAmountFromNumber(Number(m.amount)) : ''
    );
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

  const loadDetail = async (
    key: string,
    opts?: { skipReconcile?: boolean }
  ): Promise<void> => {
    const t0 = perfNow();
    const m = await getRequestByKey(props.sp, key);
    if (!m) throw new Error(`Không tìm thấy hồ sơ ${key}`);
    perfLog('loadDetail.master', t0, { key });
    let items = await listChecklistItems(props.sp, key);
    perfLog('loadDetail.checklist', t0, { key, n: items.length });
    // Đang sửa lại ở BPCM1: mở khóa — «Đã khóa» chỉ áp dụng bước kiểm tra sau khi chốt.
    if (
      m.currentStepKey === 'BPCM1_PREPARE' &&
      (m.status === 'Draft' || m.status === 'Returned') &&
      items.some((i) => i.isLocked)
    ) {
      await unlockChecklistItems(props.sp, items);
      items = await listChecklistItems(props.sp, key);
    }
    // Gỡ stub Flow; chỉ reconcile khi lệch template (tránh ghi lại mỗi lần mở / sau CREATE).
    let didReconcile = false;
    if (
      !opts?.skipReconcile &&
      m.currentStepKey === 'BPCM1_PREPARE' &&
      (m.status === 'Draft' || m.status === 'Returned') &&
      m.paymentTypeCode
    ) {
      const pt =
        paymentTypes.filter((t) => t.code === m.paymentTypeCode)[0] ||
        ({ code: m.paymentTypeCode, checklistVersion: 1 } as {
          code: string;
          checklistVersion: number;
        });
      const tpls = await listChecklistTemplates(
        props.sp,
        pt.code,
        pt.checklistVersion || 1
      );
      if (tpls.length && !checklistMatchesTemplates(items, tpls)) {
        didReconcile = true;
        items = await reconcileChecklistFromTemplates(props.sp, key, tpls);
        perfLog('loadDetail.reconcile', t0, { key, n: items.length });
      }
    }
    const tParallel = perfNow();
    const [wis, acts, reviews, unc, allDocs] = await Promise.all([
      listWorkItems(props.sp, key),
      listActivityPublic(props.sp, key),
      listStepReviews(props.sp, key),
      listUncDocuments(props.sp, key),
      listDocumentsForRequest(props.sp, key)
    ]);
    perfLog('loadDetail.parallel', tParallel, {
      key,
      wi: wis.length,
      acts: acts.length,
      docs: allDocs.length
    });
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
    perfLog('loadDetail.total', t0, {
      key,
      skipReconcile: !!opts?.skipReconcile,
      didReconcile,
      step: m.currentStepKey,
      status: m.status
    });
  };

  const refreshDetailAndInbox = async (
    key: string,
    opts?: { skipReconcile?: boolean }
  ): Promise<void> => {
    await Promise.all([loadDetail(key, opts), refreshInbox()]);
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
        const amountParsed = parseAmountInput(editAmount);
        if (!amountParsed.ok) {
          throw new Error(amountParsed.error || 'Số tiền đề nghị không hợp lệ');
        }
        setBusyMessage('Đang lưu thông tin hồ sơ…');
        await patchRequestBusinessFields(props.sp, master.requestKey, {
          title,
          amount: amountParsed.value,
          explanation: editExpl,
          createdOUCode: editOu || master.createdOUCode,
          routePlanJson: JSON.stringify(fullRoute)
        });
      },
      {
        waiting: 'Đang lưu thông tin…',
        success: 'Đã lưu thông tin hồ sơ.',
        refreshAfter: () => loadDetail(master.requestKey)
      }
    );
  };

  React.useEffect(() => {
    void run(async () => {
      const tBoot = perfNow();
      const [typesRaw, ous, members, srs] = await Promise.all([
        listPaymentTypes(props.sp),
        listOrgUnits(props.sp),
        listOrgMembers(props.sp),
        listStepRecipients(props.sp)
      ]);
      perfLog('boot.cfg', tBoot, {
        types: typesRaw.length,
        ous: ous.length,
        members: members.length,
        srs: srs.length
      });
      let types = typesRaw;
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
      setOrgUnits(ous);
      setOrgMembers(members);
      if (ous[0]) setCreateOu(ous[0].ouCode);
      setStepRecipients(srs);
      const defaults: Record<string, string> = {};
      [...ROUTE_STEPS_UI.map((r) => r.key), ...ROUTE_STEPS_AUTO].forEach((key) => {
        const rows = srs.filter((r) => r.stepKey === key);
        const def = rows.filter((r) => r.isDefault)[0] || rows[0];
        if (def) defaults[key] = def.ouCode;
      });
      setRoutePlan(defaults);
      const tInbox = perfNow();
      await refreshInbox();
      perfLog('boot.inbox', tInbox, {});
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
      perfLog('boot.total', tBoot, {
        deepLink: !!(bootRoute.view === 'detail' && bootRoute.requestKey)
      });
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

  /** Member không vào Dashboard — fallback inbox. */
  React.useEffect(() => {
    if (
      view === 'dashboard' &&
      actor.memberRole !== 'SysAdmin' &&
      actor.memberRole !== 'Manager'
    ) {
      setView('inbox');
      setInboxFilter('all');
    }
  }, [view, actor.memberRole]);

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
    const amountParsed = parseAmountInput(createAmount);
    if (!amountParsed.ok) {
      showNotice('warning', amountParsed.error || 'Số tiền đề nghị không hợp lệ');
      return;
    }
    const createOuCode = actor.ouCode || createOu;
    const createDeny = commandDenial(actor, 'CREATE_REQUEST', undefined, createOuCode);
    if (createDeny) {
      showNotice('warning', createDeny);
      return;
    }
    let createdKey = '';
    void run(
      async () => {
        const title = (createTitle || '').trim();
        if (!title) throw new Error('Nhập tiêu đề hồ sơ.');
        const amount = amountParsed.value;
        const explanation = createExpl || 'Tạo từ giao diện EMI PAY';
        const fullRoute: Record<string, string> = { ...routePlan };
        ROUTE_STEPS_AUTO.forEach((sk) => {
          if (!fullRoute[sk]) {
            const rows = stepRecipients.filter((r) => r.stepKey === sk);
            const def = rows.filter((r) => r.isDefault)[0] || rows[0];
            if (def) fullRoute[sk] = def.ouCode;
          }
        });
        const missingUi = ROUTE_STEPS_UI.filter((rs) => !fullRoute[rs.key]);
        if (missingUi.length) {
          throw new Error(`Chọn phòng: ${missingUi.map((r) => r.label).join(', ')}`);
        }
        const routePlanJson = JSON.stringify(fullRoute);
        const pt = paymentTypes.filter((t) => t.code === selectedType)[0];
        setBusyMessage('Đang tạo hồ sơ cho bạn…');
        const tCreate = perfNow();
        const cmdDone = await enqueueAndRun(
          props.sp,
          'CREATE_REQUEST',
          {
            title,
            createdOUCode: createOuCode,
            creatorUPN: actorUPN,
            paymentTypeCode: selectedType,
            checklistVersion: pt?.checklistVersion || 1,
            amount,
            explanation,
            routePlan: fullRoute,
            routePlanJson
          },
          { orchestratorUrl: props.orchestratorUrl }
        );
        createdKey = cmdDone.requestKey;
        perfLog('ui.create.command', tCreate, {
          requestKey: createdKey,
          state: cmdDone.state
        });
        // Core 1.0.0.14+: CREATE ghi đủ field + checklist từ template — không patch/reconcile UI.
        setRequestKey(createdKey);
        setView('detail');
      },
      {
        waiting: 'Đang tạo hồ sơ…',
        success:
          'Đã tạo hồ sơ. Tải checklist rồi bấm «Trình trưởng phòng» (chưa sang BPCM2).',
        refreshAfter: async () => {
          const tRef = perfNow();
          await refreshDetailAndInbox(createdKey, { skipReconcile: true });
          perfLog('ui.create.refreshAfter', tRef, { requestKey: createdKey });
        }
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
  const createOuChoices = bpcm1Ous.length
    ? bpcm1Ous
    : orgUnits.map((o) => o.ouCode);
  const mayCreate = canCreateInOu(actor, createOuChoices);
  const actions = master
    ? liveActionsFor(master, checklist, uncDocs.length > 0, actor, activeWi, workItems)
    : [];

  const acceptBlocked = needsAcceptFirst(master, activeWi, workItems);
  const notesAllowed = canAddUserNote(master, activeWi, workItems);

  const canReviewDocs = !!(
    master &&
    canReviewAtStep(actor, master) &&
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
    if (!isRequestCreator(actor, master) && !isActorTodo(actor, master)) {
      showNotice('warning', 'Không ghi chú trên hồ sơ ngoài phạm vi của nhân sự đang dùng.');
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
      },
      {
        waiting: 'Đang gửi ghi chú…',
        success: 'Đã gửi ghi chú.',
        refreshAfter: () => loadDetail(master.requestKey)
      }
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
      },
      {
        waiting: `Đang tải tệp «${file.name}»…`,
        success: `Đã tải «${file.name}» vào mục ${item.itemLabel}`,
        refreshAfter: () => loadDetail(master.requestKey)
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
      },
      {
        waiting: 'Đang xóa hồ sơ mục…',
        success: `Đã xóa tệp mục «${item.itemLabel}».`,
        refreshAfter: () => loadDetail(master.requestKey)
      }
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
        },
        {
          waiting: 'Đang gửi hồ sơ…',
          success: 'Đã gửi hồ sơ thành công.',
          refreshAfter: () => refreshDetailAndInbox(master.requestKey)
        }
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
        },
        {
          waiting: 'Đang tiếp nhận…',
          success: 'Đã tiếp nhận và đặt hạn xử lý.',
          refreshAfter: () => refreshDetailAndInbox(master.requestKey)
        }
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
                  : 'Đã chuyển bước tiếp theo.',
          refreshAfter: () => refreshDetailAndInbox(master.requestKey)
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
        },
        {
          waiting: 'Đang trả hồ sơ…',
          success: 'Đã trả hồ sơ về người tạo.',
          refreshAfter: () => refreshDetailAndInbox(master.requestKey)
        }
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
        },
        {
          waiting: 'Đang xác nhận thanh toán…',
          success: 'Đã xác nhận thanh toán.',
          refreshAfter: () => refreshDetailAndInbox(master.requestKey)
        }
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
        },
        {
          waiting: 'Đang lưu đánh giá…',
          success:
            reviewResult === 'Pass'
              ? `Đã đánh giá Đạt: ${reviewItemCode}`
              : `Đã đánh giá Không đạt: ${reviewItemCode}`,
          refreshAfter: () => loadDetail(master.requestKey)
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
        },
        {
          waiting:
            kind === 'unc' ? 'Đang tải ủy nhiệm chi…' : `Đang tải tệp «${file.name}»…`,
          refreshAfter: () => loadDetail(master.requestKey)
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
    (item) => sameUpn(item.creatorUPN, actor.upn)
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
      <AppHeader
        title={props.title || 'EMI PAY'}
        userDisplayName={props.userDisplayName}
        avatarLetters={avatarLetters}
        isSysAdmin={isSysAdmin(signedInUPN)}
        actAsValue={
          actor.acting
            ? memberKey({
                memberUPN: actor.upn,
                ouCode: actor.ouCode,
                memberRole: actor.memberRole === 'Manager' ? 'Manager' : 'Member'
              })
            : ''
        }
        orgMembers={orgMembers}
        orgUnits={orgUnits}
        onActAsChange={(next) => {
          writeActAsKey(next);
          setActAsKey(next);
          if (view === 'audit' || view === 'create') setView('inbox');
        }}
      />

      <div className={styles.shell}>
        <AppNav
          view={view}
          inboxFilter={inboxFilter}
          actor={actor}
          ouName={orgUnits.filter((u) => u.ouCode === actor.ouCode)[0]?.ouName}
          avatarLetters={avatarLetters}
          mayCreate={mayCreate}
          hasMaster={!!master}
          canAudit={!actor.acting && isSysAdmin(signedInUPN)}
          onGoDashboard={() => setView('dashboard')}
          onGoInbox={goInbox}
          onGoCreate={() => setView('create')}
          onGoDetail={() => setView('detail')}
          onGoAudit={() => setView('audit')}
        />

        <div
          className={`${styles.workspace} ${showRail ? '' : styles.workspaceNoRail}`.trim()}
        >
          <main className={styles.main}>
            <PayNoticeBar notice={notice} onDismiss={() => setNotice(undefined)} />

          {view === 'dashboard' &&
            (actor.memberRole === 'SysAdmin' || actor.memberRole === 'Manager') && (
            <DashboardPage
              sp={props.sp}
              actor={actor}
              orgUnits={orgUnits}
              orgMembers={orgMembers}
              busy={busy}
              onOpen={openLiveDetail}
              onRefreshParent={() => {
                void run(refreshInbox, {
                  waiting: 'Đang làm mới…',
                  success: 'Đã làm mới danh sách.'
                });
              }}
            />
          )}

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
            <CreateRequestPage
              busy={busy}
              createTitle={createTitle}
              createAmount={createAmount}
              createExpl={createExpl}
              createOu={createOu}
              actorOuCode={actor.ouCode || ''}
              selectedType={selectedType}
              paymentTypes={paymentTypes}
              orgUnits={orgUnits}
              stepRecipients={stepRecipients}
              routePlan={routePlan}
              routeStepsUi={ROUTE_STEPS_UI}
              templates={templates}
              defaultOuForStep={defaultOuForStep}
              onTitleChange={setCreateTitle}
              onAmountChange={setCreateAmount}
              onExplChange={setCreateExpl}
              onOuChange={setCreateOu}
              onTypeChange={setSelectedType}
              onRouteChange={(stepKey, ouCode) =>
                setRoutePlan((prev) => ({ ...prev, [stepKey]: ouCode }))
              }
              onBack={() => goInbox('all')}
              onCreate={onCreate}
            />
          )}

          {view === 'detail' && master && (
            <RequestDetailPage
              master={master}
              actor={actor}
              busy={busy}
              actions={actions}
              checklist={checklist}
              workItems={workItems}
              timeline={timeline}
              noteList={noteList}
              docs={docs}
              supportingDocs={supportingDocs}
              activeWi={activeWi}
              rejectNote={rejectNote}
              canReviewDocs={canReviewDocs}
              isBpcm1Adjusting={isBpcm1Adjusting}
              acceptBlocked={acceptBlocked}
              notesAllowed={notesAllowed}
              docsTab={docsTab}
              activityTab={activityTab}
              commentDraft={commentDraft}
              editTitle={editTitle}
              editAmount={editAmount}
              editExpl={editExpl}
              editOu={editOu}
              editRoutePlan={editRoutePlan}
              orgUnits={orgUnits}
              stepRecipients={stepRecipients}
              routeStepsUi={ROUTE_STEPS_UI}
              defaultOuForStep={defaultOuForStep}
              docsForChecklistItem={docsForChecklistItem}
              onDocsTabChange={setDocsTab}
              onActivityTabChange={setActivityTab}
              onCommentDraftChange={setCommentDraft}
              onEditTitleChange={setEditTitle}
              onEditAmountChange={setEditAmount}
              onEditExplChange={setEditExpl}
              onEditOuChange={setEditOu}
              onEditRouteChange={(stepKey, ouCode) =>
                setEditRoutePlan((prev) => ({ ...prev, [stepKey]: ouCode }))
              }
              onSaveBusinessFields={onSaveBusinessFields}
              onRefresh={() => {
                void run(async () => loadDetail(master.requestKey), {
                  waiting: 'Đang làm mới hồ sơ…'
                });
              }}
              onAction={onAction}
              onOpenDoc={setDrawerDoc}
              onOpenReview={openReview}
              onClearChecklistItem={onClearChecklistItem}
              onPickChecklistFile={pickChecklistFile}
              onOpenAttachChecklist={() => {
                setUploadMode('checklist');
                setUploadItemCode(checklist[0] ? checklist[0].itemCode : '');
                setDialog('attach');
              }}
              onOpenAttachStep={() => {
                setUploadMode('step');
                setDialog('attach');
              }}
              onSendNote={() => {
                const text = commentDraft.trim();
                setCommentDraft('');
                sendUserNote(text);
              }}
              onWarn={(text) => showNotice('warning', text)}
            />
          )}

          {view === 'detail' && !master && (
            <div style={{ padding: 16, color: '#4b5563', fontSize: 14 }}>
              Chưa chọn hồ sơ. Vào «Việc của tôi» hoặc «Tạo hồ sơ».
              {requestKey ? ` (${requestKey})` : ''}
            </div>
          )}

          {view === 'audit' && (
            <AuditPage
              inbox={inbox}
              orgMembers={orgMembers}
              orgUnits={orgUnits}
              onOpen={openLiveDetail}
            />
          )}
          </main>

          {showRail && (
            <aside className={styles.rail} aria-label="Thông tin phụ">
              {view === 'create' && (
                <CreateRail
                  typeTitle={selectedTypeMeta ? selectedTypeMeta.title : ''}
                  title={createTitle}
                  amountDisplay={moneyVi(parseAmountInput(createAmount).value)}
                  ouCode={actor.ouCode || createOu}
                  actorUPN={actorUPN}
                  templateCount={templates.length}
                  requiredCount={requiredTplCount}
                />
              )}
              {view === 'detail' && (
                <DetailRail
                  master={master}
                  checklist={checklist}
                  workItems={workItems}
                  activities={activities}
                  uncDocs={uncDocs}
                />
              )}
            </aside>
          )}
        </div>
      </div>

      <PayActionDialog
        dialog={dialog}
        busy={busy}
        reason={reason}
        acceptDue={acceptDue}
        paymentDue={paymentDue}
        uploadMode={uploadMode}
        uploadItemCode={uploadItemCode}
        checklist={checklist}
        reviewItemCode={reviewItemCode}
        reviewResult={reviewResult}
        reviewReason={reviewReason}
        currentStepKey={master ? master.currentStepKey : undefined}
        uncDocs={uncDocs}
        fileRef={fileRef}
        onReasonChange={setReason}
        onAcceptDueChange={setAcceptDue}
        onPaymentDueChange={setPaymentDue}
        onUploadItemCodeChange={setUploadItemCode}
        onReviewResultChange={setReviewResult}
        onReviewReasonChange={setReviewReason}
        onDismiss={() => setDialog(undefined)}
        onConfirm={confirmDialog}
      />

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
