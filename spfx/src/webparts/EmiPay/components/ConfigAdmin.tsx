import * as React from 'react';
import {
  DefaultButton,
  Dialog,
  DialogFooter,
  DialogType,
  PrimaryButton
} from '@fluentui/react';
import styles from './EmiPay.module.scss';
import {
  ISpRestContext,
  IPaymentType,
  IChecklistTemplate,
  IOrgUnit,
  IOrgMember,
  IWorkflowVersion,
  IWorkflowStep,
  IStepRecipient,
  listPaymentTypesAdmin,
  createPaymentType,
  setPaymentTypeActive,
  listChecklistTemplatesAdmin,
  createChecklistTemplate,
  listOrgUnits,
  createOrgUnit,
  listOrgMembers,
  createOrgMember,
  listWorkflowVersions,
  listWorkflowSteps,
  listStepRecipients,
  createStepRecipient
} from '../services';
import BusyDialog from './BusyDialog';
import PayNoticeBar, { IPayNotice } from './PayNotice';

export interface IConfigAdminProps {
  sp: ISpRestContext;
}

type CfgTab = 'types' | 'ou' | 'steps' | 'checklist' | 'versions';

type FormKind =
  | 'type'
  | 'ou'
  | 'member'
  | 'checklist'
  | 'recipient'
  | undefined;

const badge = (kind: string, text: string): React.ReactNode => {
  const cls =
    kind === 'ok'
      ? `${styles.badge} ${styles.badgeOk}`
      : kind === 'warn'
        ? `${styles.badge} ${styles.badgeWarn}`
        : kind === 'danger'
          ? `${styles.badge} ${styles.badgeDanger}`
          : `${styles.badge} ${styles.badgeMute}`;
  return <span className={cls}>{text}</span>;
};

const ConfigAdmin: React.FC<IConfigAdminProps> = ({ sp }) => {
  const [tab, setTab] = React.useState<CfgTab>('types');
  const [busy, setBusy] = React.useState(false);
  const [busyMessage, setBusyMessage] = React.useState('Đang tải…');
  const [notice, setNotice] = React.useState<IPayNotice | undefined>(undefined);

  const [types, setTypes] = React.useState<IPaymentType[]>([]);
  const [ous, setOus] = React.useState<IOrgUnit[]>([]);
  const [members, setMembers] = React.useState<IOrgMember[]>([]);
  const [versions, setVersions] = React.useState<IWorkflowVersion[]>([]);
  const [steps, setSteps] = React.useState<IWorkflowStep[]>([]);
  const [recipients, setRecipients] = React.useState<IStepRecipient[]>([]);
  const [templates, setTemplates] = React.useState<IChecklistTemplate[]>([]);

  const [form, setForm] = React.useState<FormKind>(undefined);
  const [fCode, setFCode] = React.useState('');
  const [fTitle, setFTitle] = React.useState('');
  const [fWorkflow, setFWorkflow] = React.useState('EMI_PAY_SPV');
  const [fVersion, setFVersion] = React.useState('1');
  const [fOu, setFOu] = React.useState('');
  const [fUpn, setFUpn] = React.useState('');
  const [fHomeLE, setFHomeLE] = React.useState('SPV');
  const [fItemCode, setFItemCode] = React.useState('');
  const [fItemLabel, setFItemLabel] = React.useState('');
  const [fRequired, setFRequired] = React.useState(true);
  const [fMinFile, setFMinFile] = React.useState('1');
  const [fOrder, setFOrder] = React.useState('10');
  const [fStepKey, setFStepKey] = React.useState('');
  const [fDefault, setFDefault] = React.useState(true);

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
      if (options?.success) showNotice('success', options.success);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showNotice('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const reload = async (): Promise<void> => {
    const [t, o, m, v, s, r, c] = await Promise.all([
      listPaymentTypesAdmin(sp),
      listOrgUnits(sp),
      listOrgMembers(sp),
      listWorkflowVersions(sp),
      listWorkflowSteps(sp),
      listStepRecipients(sp),
      listChecklistTemplatesAdmin(sp)
    ]);
    setTypes(t);
    setOus(o);
    setMembers(m);
    setVersions(v);
    setSteps(s);
    setRecipients(r);
    setTemplates(c);
  };

  React.useEffect(() => {
    void run(reload, { waiting: 'Đang tải 7 Lists cấu hình…' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForm = (kind: FormKind): void => {
    setFCode('');
    setFTitle('');
    setFWorkflow(types[0]?.workflowCode || versions[0]?.workflowCode || 'EMI_PAY_SPV');
    setFVersion(String(types[0]?.checklistVersion || versions[0]?.versionNo || 1));
    setFOu(ous[0]?.ouCode || '');
    setFUpn('');
    setFHomeLE('SPV');
    setFItemCode('');
    setFItemLabel('');
    setFRequired(true);
    setFMinFile('1');
    setFOrder('10');
    setFStepKey(steps[0]?.stepKey || '');
    setFDefault(true);
    setForm(kind);
  };

  const confirmForm = (): void => {
    const kind = form;
    setForm(undefined);
    if (!kind) return;

    if (kind === 'type') {
      void run(
        async () => {
          await createPaymentType(sp, {
            code: fCode,
            title: fTitle,
            checklistVersion: Number(fVersion) || 1,
            workflowCode: fWorkflow
          });
          await reload();
        },
        { waiting: 'Đang thêm loại hồ sơ…', success: 'Đã thêm loại hồ sơ.' }
      );
      return;
    }

    if (kind === 'ou') {
      void run(
        async () => {
          await createOrgUnit(sp, {
            ouCode: fCode,
            ouName: fTitle,
            managerUPN: fUpn,
            homeLECode: fHomeLE
          });
          await reload();
        },
        { waiting: 'Đang thêm phòng ban…', success: 'Đã thêm phòng ban (OrgUnits).' }
      );
      return;
    }

    if (kind === 'member') {
      void run(
        async () => {
          await createOrgMember(sp, { ouCode: fOu, memberUPN: fUpn });
          await reload();
        },
        { waiting: 'Đang thêm thành viên…', success: 'Đã thêm thành viên OU.' }
      );
      return;
    }

    if (kind === 'checklist') {
      void run(
        async () => {
          await createChecklistTemplate(sp, {
            paymentTypeCode: fCode || types[0]?.code || '',
            versionNo: Number(fVersion) || 1,
            itemCode: fItemCode,
            itemLabel: fItemLabel,
            isRequired: fRequired,
            minFileCount: Number(fMinFile) || 0,
            displayOrder: Number(fOrder) || 0
          });
          await reload();
        },
        { waiting: 'Đang thêm mục checklist…', success: 'Đã thêm checklist template.' }
      );
      return;
    }

    if (kind === 'recipient') {
      void run(
        async () => {
          await createStepRecipient(sp, {
            workflowCode: fWorkflow,
            versionNo: Number(fVersion) || 1,
            stepKey: fStepKey,
            ouCode: fOu,
            isDefault: fDefault
          });
          await reload();
        },
        { waiting: 'Đang thêm người nhận bước…', success: 'Đã thêm StepRecipient.' }
      );
    }
  };

  const membersByOu = (ouCode: string): IOrgMember[] => {
    return members.filter((m) => m.ouCode === ouCode && m.isActive);
  };

  const membersPreview = (ouCode: string): string => {
    const rows = membersByOu(ouCode);
    if (!rows.length) return '—';
    return (
      rows
        .slice(0, 3)
        .map((m) => m.memberUPN)
        .join(', ') + (rows.length > 3 ? ` (+${rows.length - 3})` : '')
    );
  };

  const stepsForOu = (ouCode: string): string => {
    const keys = recipients
      .filter((r) => r.ouCode === ouCode)
      .map((r) => r.stepKey)
      .filter((k, i, arr) => arr.indexOf(k) === i);
    return keys.length ? keys.join(', ') : '—';
  };

  const ousForStep = (stepKey: string): IStepRecipient[] => {
    return recipients.filter((r) => r.stepKey === stepKey);
  };

  const ousLabelForStep = (stepKey: string): string => {
    const rows = ousForStep(stepKey);
    if (!rows.length) return '— (chưa gắn phòng)';
    return rows
      .map((r) => {
        const ou = ous.filter((o) => o.ouCode === r.ouCode)[0];
        const name = ou ? ou.ouName : r.ouCode;
        return `${r.ouCode}${r.isDefault ? ' ★' : ''} · ${name}`;
      })
      .join(' | ');
  };

  const formTitle = (): string => {
    switch (form) {
      case 'type':
        return 'Thêm loại hồ sơ';
      case 'ou':
        return 'Thêm phòng ban (OrgUnits)';
      case 'member':
        return 'Thêm nhân sự vào phòng ban';
      case 'checklist':
        return 'Thêm checklist template';
      case 'recipient':
        return 'Thêm OU nhận bước';
      default:
        return 'Cấu hình';
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2>Cấu hình quy trình</h2>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            disabled={busy}
            onClick={() => {
              void run(reload, {
                waiting: 'Đang làm mới cấu hình…',
                success: 'Đã làm mới 7 Lists cấu hình.'
              });
            }}
          >
            Làm mới
          </button>
        </div>
      </div>

      <PayNoticeBar notice={notice} onDismiss={() => setNotice(undefined)} />

      <div className={styles.panelInfo}>
        <h4>R08 · PROCADM — 7 Lists cấu hình</h4>
        <p className={styles.hint} style={{ marginTop: 6 }}>
          Contribute: PaymentTypes · OrgUnits · OrgMembers · WorkflowVersions · WorkflowSteps ·
          ChecklistTemplates · StepRecipients. Không sửa SystemSettings. Không phê duyệt hồ sơ.
        </p>
      </div>

      <section className={styles.card}>
        <div className={styles.tabs}>
          {(
            [
              { id: 'types' as CfgTab, label: 'Loại hồ sơ' },
              { id: 'ou' as CfgTab, label: 'Phòng ban / nhân sự' },
              { id: 'steps' as CfgTab, label: 'Bước & người nhận' },
              { id: 'checklist' as CfgTab, label: 'Checklist templates' },
              { id: 'versions' as CfgTab, label: 'Phiên bản WF' }
            ] as { id: CfgTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'types' && (
          <div style={{ padding: 0 }}>
            <div className={styles.cardH} style={{ borderTop: '1px solid var(--emi-line)' }}>
              <h3>EMI_PAY_PaymentTypes</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ padding: '6px 10px', fontSize: 12 }}
                disabled={busy}
                onClick={() => openForm('type')}
              >
                Thêm loại hồ sơ
              </button>
            </div>
            {types.length === 0 ? (
              <p className={styles.empty}>Chưa có loại hồ sơ.</p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Tiêu đề</th>
                    <th>Checklist ver</th>
                    <th>Workflow</th>
                    <th>Trạng thái</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.code}</strong>
                      </td>
                      <td>{t.title}</td>
                      <td>{t.checklistVersion}</td>
                      <td>{t.workflowCode || '—'}</td>
                      <td>{badge(t.isActive ? 'ok' : 'mute', t.isActive ? 'Active' : 'Tắt')}</td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnOutline}`}
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          disabled={busy}
                          onClick={() => {
                            void run(
                              async () => {
                                await setPaymentTypeActive(sp, t.id, !t.isActive);
                                await reload();
                              },
                              {
                                waiting: t.isActive ? 'Đang tắt loại…' : 'Đang bật loại…',
                                success: t.isActive
                                  ? `Đã tắt ${t.code}.`
                                  : `Đã bật ${t.code}.`
                              }
                            );
                          }}
                        >
                          {t.isActive ? 'Tắt' : 'Bật'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'ou' && (
          <div style={{ padding: 0 }}>
            <div className={styles.panelInfo} style={{ margin: 14 }}>
              <h4>OrgUnits · OrgMembers · StepRecipients</h4>
              <p className={styles.hint} style={{ marginTop: 6 }}>
                Danh mục phòng ban và nhân sự lấy từ CECM (seed/model). BPCM là bước; gắn phòng
                nhận qua tab <b>Bước &amp; người nhận</b> (StepRecipients).
              </p>
            </div>
            <div className={styles.cardH}>
              <h3>Phòng ban · EMI_PAY_OrgUnits ({ous.length})</h3>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnOutline}`}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  disabled={busy || ous.length === 0}
                  onClick={() => openForm('member')}
                >
                  Thêm nhân sự
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  disabled={busy}
                  onClick={() => openForm('ou')}
                >
                  Thêm phòng ban
                </button>
              </div>
            </div>
            {ous.length === 0 ? (
              <p className={styles.empty}>
                Chưa có phòng ban trên CECM. Thêm OU hoặc chạy seed OrgUnits.
              </p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Mã OU</th>
                    <th>Tên phòng ban</th>
                    <th>Pháp nhân (HomeLE)</th>
                    <th>Trưởng đơn vị</th>
                    <th>Nhân sự</th>
                    <th>Bước nhận (StepRecipients)</th>
                    <th>TT</th>
                  </tr>
                </thead>
                <tbody>
                  {ous.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.ouCode}</strong>
                      </td>
                      <td>{o.ouName}</td>
                      <td>{o.homeLECode || '—'}</td>
                      <td>{o.managerUPN || '—'}</td>
                      <td>
                        <span className={styles.meta} style={{ margin: 0, display: 'block' }}>
                          {membersByOu(o.ouCode).length} người
                          {membersByOu(o.ouCode).length
                            ? ` · ${membersPreview(o.ouCode)}`
                            : ''}
                        </span>
                      </td>
                      <td>
                        <span className={styles.meta} style={{ margin: 0, display: 'block' }}>
                          {stepsForOu(o.ouCode)}
                        </span>
                      </td>
                      <td>{badge(o.isActive ? 'ok' : 'mute', o.isActive ? 'Active' : 'Tắt')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.cardH}>
              <h3>Nhân sự theo phòng ban · EMI_PAY_OrgMembers ({members.length})</h3>
            </div>
            {members.length === 0 ? (
              <p className={styles.empty}>Chưa có thành viên. Chọn «Thêm nhân sự».</p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Phòng ban (OU)</th>
                    <th>Tên OU</th>
                    <th>MemberUPN</th>
                    <th>TT</th>
                  </tr>
                </thead>
                <tbody>
                  {members.slice(0, 120).map((m) => {
                    const ou = ous.filter((o) => o.ouCode === m.ouCode)[0];
                    return (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.ouCode}</strong>
                        </td>
                        <td>{ou ? ou.ouName : '—'}</td>
                        <td>{m.memberUPN}</td>
                        <td>
                          {badge(m.isActive ? 'ok' : 'mute', m.isActive ? 'Active' : 'Tắt')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'steps' && (
          <div style={{ padding: 0 }}>
            <div className={styles.cardH} style={{ borderTop: '1px solid var(--emi-line)' }}>
              <h3>EMI_PAY_WorkflowSteps · StepRecipients</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ padding: '6px 10px', fontSize: 12 }}
                disabled={busy}
                onClick={() => openForm('recipient')}
              >
                Thêm OU nhận bước
              </button>
            </div>
            {steps.length === 0 ? (
              <p className={styles.empty}>Chưa có bước quy trình.</p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>StepKey (BPCM / bước)</th>
                    <th>#</th>
                    <th>Tên bước</th>
                    <th>Kind</th>
                    <th>Phòng đủ điều kiện nhận</th>
                    <th>Số phòng</th>
                    <th>WF / Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.stepKey}</strong>
                      </td>
                      <td>{s.stepOrder}</td>
                      <td>{s.stepName}</td>
                      <td>{s.stepKind || '—'}</td>
                      <td>
                        <span className={styles.meta} style={{ margin: 0, display: 'block' }}>
                          {ousLabelForStep(s.stepKey)}
                        </span>
                      </td>
                      <td>{ousForStep(s.stepKey).length}</td>
                      <td>
                        {s.workflowCode} · v{s.versionNo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {recipients.length > 0 && (
              <>
                <div className={styles.cardH}>
                  <h3>Chi tiết StepRecipients ({recipients.length})</h3>
                </div>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>StepKey</th>
                      <th>Phòng (OU)</th>
                      <th>Tên OU</th>
                      <th>Default</th>
                      <th>WF / Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => {
                      const ou = ous.filter((o) => o.ouCode === r.ouCode)[0];
                      return (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.stepKey}</strong>
                          </td>
                          <td>{r.ouCode}</td>
                          <td>{ou ? ou.ouName : '—'}</td>
                          <td>
                            {badge(
                              r.isDefault ? 'ok' : 'mute',
                              r.isDefault ? '★ Mặc định' : 'Đủ điều kiện'
                            )}
                          </td>
                          <td>
                            {r.workflowCode} · v{r.versionNo}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {tab === 'checklist' && (
          <div style={{ padding: 0 }}>
            <div className={styles.cardH} style={{ borderTop: '1px solid var(--emi-line)' }}>
              <h3>EMI_PAY_ChecklistTemplates</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ padding: '6px 10px', fontSize: 12 }}
                disabled={busy}
                onClick={() => openForm('checklist')}
              >
                Thêm mục checklist
              </button>
            </div>
            {templates.length === 0 ? (
              <p className={styles.empty}>Chưa có checklist template.</p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>PaymentType</th>
                    <th>Ver</th>
                    <th>ItemCode</th>
                    <th>Nhãn</th>
                    <th>Bắt buộc</th>
                    <th>Min file</th>
                    <th>Thứ tự</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td>{t.paymentTypeCode}</td>
                      <td>{t.versionNo}</td>
                      <td>
                        <strong>{t.itemCode}</strong>
                      </td>
                      <td>{t.itemLabel}</td>
                      <td>
                        {badge(t.isRequired ? 'warn' : 'mute', t.isRequired ? 'Bắt buộc' : 'Tuỳ chọn')}
                      </td>
                      <td>{t.minFileCount}</td>
                      <td>{t.displayOrder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'versions' && (
          <div style={{ padding: 0 }}>
            <div className={styles.cardH} style={{ borderTop: '1px solid var(--emi-line)' }}>
              <h3>EMI_PAY_WorkflowVersions</h3>
              <span className={styles.hint}>
                Không sửa hồi tố phiên bản đang gắn hồ sơ đã phát sinh.
              </span>
            </div>
            {versions.length === 0 ? (
              <p className={styles.empty}>Chưa có phiên bản quy trình.</p>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>WorkflowCode</th>
                    <th>Version</th>
                    <th>Lifecycle</th>
                    <th>Published</th>
                    <th>Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.workflowCode}</strong>
                      </td>
                      <td>{v.versionNo}</td>
                      <td>
                        {badge(
                          v.lifecycle === 'PUBLISHED' ? 'ok' : 'warn',
                          v.lifecycle || '—'
                        )}
                      </td>
                      <td>
                        {v.publishedAt
                          ? new Date(v.publishedAt).toLocaleString('vi-VN')
                          : '—'}
                      </td>
                      <td>
                        {v.effectiveAt
                          ? new Date(v.effectiveAt).toLocaleString('vi-VN')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={styles.panelWarn} style={{ margin: 14 }}>
              <h4>SystemSettings — không mở cho PROCADM</h4>
              <div>
                Tham số kỹ thuật chỉ SYSADM / Site Owners / Flow. ACL tĩnh đã khóa Contribute
                PROCADM trên list này.
              </div>
            </div>
          </div>
        )}
      </section>

      <Dialog
        hidden={!form}
        onDismiss={busy ? undefined : () => setForm(undefined)}
        dialogContentProps={{ type: DialogType.normal, title: formTitle() }}
        modalProps={{ isBlocking: true, styles: { main: { maxWidth: 520 } } }}
      >
        <div className={styles.modalB} style={{ padding: '4px 0 8px' }}>
          {form === 'type' && (
            <div className={styles.form}>
              <label className={styles.field}>
                Mã (PaymentTypeCode)
                <input value={fCode} onChange={(e) => setFCode(e.target.value)} />
              </label>
              <label className={styles.field}>
                Checklist ver
                <input value={fVersion} onChange={(e) => setFVersion(e.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Tiêu đề
                <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                WorkflowCode
                <input value={fWorkflow} onChange={(e) => setFWorkflow(e.target.value)} />
              </label>
            </div>
          )}
          {form === 'ou' && (
            <div className={styles.form}>
              <label className={styles.field}>
                Mã phòng ban (OUCode)
                <input
                  value={fCode}
                  onChange={(e) => setFCode(e.target.value)}
                  placeholder="VD: OU_PBCM / OU_TCKT"
                />
              </label>
              <label className={styles.field}>
                Pháp nhân (HomeLECode)
                <input
                  value={fHomeLE}
                  onChange={(e) => setFHomeLE(e.target.value)}
                  placeholder="VD: SPV"
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Tên phòng ban (OUName)
                <input
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder="VD: Bộ phận chuyên môn 1 / NH2"
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Trưởng đơn vị (ManagerUPN)
                <input
                  value={fUpn}
                  onChange={(e) => setFUpn(e.target.value)}
                  placeholder="user@emi.com.vn"
                />
              </label>
            </div>
          )}
          {form === 'member' && (
            <div className={styles.form}>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Phòng ban
                <select value={fOu} onChange={(e) => setFOu(e.target.value)}>
                  {ous.map((o) => (
                    <option key={o.id} value={o.ouCode}>
                      {o.ouCode} · {o.ouName}
                      {o.homeLECode ? ` · ${o.homeLECode}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Nhân sự (MemberUPN)
                <input
                  value={fUpn}
                  onChange={(e) => setFUpn(e.target.value)}
                  placeholder="user@emi.com.vn"
                />
              </label>
            </div>
          )}
          {form === 'checklist' && (
            <div className={styles.form}>
              <label className={styles.field}>
                PaymentType
                <select value={fCode} onChange={(e) => setFCode(e.target.value)}>
                  <option value="">(Chọn)</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                VersionNo
                <input value={fVersion} onChange={(e) => setFVersion(e.target.value)} />
              </label>
              <label className={styles.field}>
                ItemCode
                <input value={fItemCode} onChange={(e) => setFItemCode(e.target.value)} />
              </label>
              <label className={styles.field}>
                Min file
                <input value={fMinFile} onChange={(e) => setFMinFile(e.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                Nhãn
                <input value={fItemLabel} onChange={(e) => setFItemLabel(e.target.value)} />
              </label>
              <label className={styles.field}>
                Thứ tự
                <input value={fOrder} onChange={(e) => setFOrder(e.target.value)} />
              </label>
              <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={fRequired}
                  onChange={(e) => setFRequired(e.target.checked)}
                />
                Bắt buộc
              </label>
            </div>
          )}
          {form === 'recipient' && (
            <div className={styles.form}>
              <label className={styles.field}>
                WorkflowCode
                <input value={fWorkflow} onChange={(e) => setFWorkflow(e.target.value)} />
              </label>
              <label className={styles.field}>
                VersionNo
                <input value={fVersion} onChange={(e) => setFVersion(e.target.value)} />
              </label>
              <label className={styles.field}>
                StepKey
                <select value={fStepKey} onChange={(e) => setFStepKey(e.target.value)}>
                  {steps.map((s) => (
                    <option key={s.id} value={s.stepKey}>
                      {s.stepOrder}. {s.stepKey}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Phòng ban (OU)
                <select value={fOu} onChange={(e) => setFOu(e.target.value)}>
                  {ous.map((o) => (
                    <option key={o.id} value={o.ouCode}>
                      {o.ouCode} · {o.ouName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={fDefault}
                  onChange={(e) => setFDefault(e.target.checked)}
                />
                IsDefault
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <DefaultButton text="Hủy" onClick={() => setForm(undefined)} disabled={busy} />
          <PrimaryButton text="Lưu" onClick={confirmForm} disabled={busy} />
        </DialogFooter>
      </Dialog>

      <BusyDialog open={busy} message={busyMessage} />
    </>
  );
};

export default ConfigAdmin;
