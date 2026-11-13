import * as React from 'react';
import {
  DefaultButton,
  MessageBar,
  MessageBarType,
  PrimaryButton,
  Stack,
  Text,
  ThemeProvider
} from '@fluentui/react';
import { ICommandActor, isRequestCreator } from '../../services/actorAuth';
import { INoteListItem, ITimelineItem } from '../../services/ActivityService';
import {
  IChecklistItemRow,
  checklistHasFail,
  checklistReviewComplete,
  requiredChecklistReady
} from '../../services/ChecklistService';
import { IOrgUnit, IStepRecipient } from '../../services/ConfigService';
import {
  canEditRequestBusinessFields,
  displayRequestTitle,
  IRequestMaster,
  IWorkItemRow,
  isWorkItemAccepted
} from '../../services/RequestService';
import { IDocumentIndexRow } from '../../services/UploadService';
import { isChairDossierApproved } from '../../services/liveActions';
import { chairStatusDetailVi, stepShortVi } from '../../services/viLabels';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { IPayAction } from '../types';
import { formatAmountInput } from '../create/amountValidate';
import ActivityPanel, { ActivityTabKey } from './ActivityPanel';
import DocsPanel, { DocsTabKey } from './DocsPanel';
import EditBusinessFields, { IEditRouteStep } from './EditBusinessFields';
import { actionBtnStyles, cardStack, fillStack, themeHostStyle } from './detailStyles';

export interface IRequestDetailPageProps {
  master: IRequestMaster;
  actor: ICommandActor;
  busy: boolean;
  actions: IPayAction[];
  checklist: IChecklistItemRow[];
  workItems: IWorkItemRow[];
  timeline: ITimelineItem[];
  noteList: INoteListItem[];
  docs: IDocumentIndexRow[];
  supportingDocs: IDocumentIndexRow[];
  activeWi?: IWorkItemRow;
  rejectNote?: string;
  canReviewDocs: boolean;
  isBpcm1Adjusting: boolean;
  acceptBlocked: boolean;
  notesAllowed: boolean;
  docsTab: DocsTabKey;
  activityTab: ActivityTabKey;
  commentDraft: string;
  editTitle: string;
  editAmount: string;
  editExpl: string;
  editOu: string;
  editRoutePlan: Record<string, string>;
  orgUnits: IOrgUnit[];
  stepRecipients: IStepRecipient[];
  routeStepsUi: IEditRouteStep[];
  defaultOuForStep: (stepKey: string, recipients: IStepRecipient[]) => string;
  docsForChecklistItem: (itemCode: string) => IDocumentIndexRow[];
  onDocsTabChange: (tab: DocsTabKey) => void;
  onActivityTabChange: (tab: ActivityTabKey) => void;
  onCommentDraftChange: (v: string) => void;
  onEditTitleChange: (v: string) => void;
  onEditAmountChange: (v: string) => void;
  onEditExplChange: (v: string) => void;
  onEditOuChange: (v: string) => void;
  onEditRouteChange: (stepKey: string, ouCode: string) => void;
  onSaveBusinessFields: () => void;
  onRefresh: () => void;
  onAction: (a: IPayAction) => void;
  onOpenDoc: (doc: IDocumentIndexRow) => void;
  onOpenReview: (itemCode: string) => void;
  onClearChecklistItem: (item: IChecklistItemRow) => void;
  onPickChecklistFile: (itemCode: string) => void;
  onOpenAttachChecklist: () => void;
  onOpenAttachStep: () => void;
  onSendNote: () => void;
  onWarn: (text: string) => void;
}

function statusBarType(master: IRequestMaster, workItems: IWorkItemRow[]): MessageBarType {
  if (master.status === 'Returned') return MessageBarType.warning;
  if (master.status === 'Completed' || master.status === 'Paid') return MessageBarType.success;
  if (isChairDossierApproved(master, workItems)) return MessageBarType.success;
  return MessageBarType.info;
}

const NEED_ACCEPT = ['BPCM2_TECH', 'BPCM3_PRICE', 'TCKT_CHECK', 'TCKT_PAY'];

const chipStyle = {
  root: {
    alignSelf: 'center' as const,
    background: '#e7f5f3',
    color: '#0c5f59',
    borderRadius: 4,
    padding: '4px 10px',
    fontWeight: '600' as const
  }
};

const RequestDetailPage: React.FC<IRequestDetailPageProps> = (props) => {
  const { master, activeWi } = props;
  const statusLabel = chairStatusDetailVi(
    master.currentStepKey,
    master.status,
    master.paymentDueAt,
    isChairDossierApproved(master, props.workItems)
  );

  const actionButton = (a: IPayAction): React.ReactNode => {
    const common = {
      key: a.id,
      text: a.label,
      disabled: props.busy,
      onClick: () => props.onAction(a),
      styles: actionBtnStyles
    };
    if (a.primary) return <PrimaryButton {...common} />;
    if (a.danger) {
      return (
        <DefaultButton
          {...common}
          styles={{
            root: {
              minWidth: 0,
              height: 32,
              padding: '0 12px',
              borderRadius: 4,
              borderColor: '#b91c1c',
              color: '#b91c1c'
            },
            rootHovered: { background: '#fee2e2', borderColor: '#991b1b', color: '#991b1b' }
          }}
        />
      );
    }
    return <DefaultButton {...common} />;
  };

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 14 }} styles={fillStack}>
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="start"
          wrap
          tokens={{ childrenGap: 14 }}
          styles={cardStack}
        >
          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { flex: '1 1 240px', minWidth: 0 } }}>
            <Text
              variant="xLarge"
              styles={{ root: { fontWeight: 700, wordBreak: 'break-word' } }}
            >
              {displayRequestTitle(master)}
            </Text>
            <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
              <MessageBar
                messageBarType={statusBarType(master, props.workItems)}
                isMultiline={false}
                styles={{
                  root: {
                    display: 'inline-flex',
                    width: 'auto',
                    maxWidth: '100%',
                    minHeight: 28
                  }
                }}
              >
                {statusLabel}
              </MessageBar>
              <Text variant="small" styles={chipStyle}>
                {stepShortVi(master.currentStepKey)}
              </Text>
              <Text variant="small" styles={chipStyle}>
                Lượt {master.reviewRound}
              </Text>
            </Stack>
          </Stack>
          <Stack
            horizontal
            tokens={{ childrenGap: 8 }}
            wrap
            styles={{ root: { flex: '0 1 auto', maxWidth: '100%' } }}
          >
            <DefaultButton
              text="Làm mới"
              disabled={props.busy}
              onClick={props.onRefresh}
              styles={actionBtnStyles}
            />
            {props.actions.map((a) => actionButton(a))}
            {props.actions.length === 0 && (
              <Text
                variant="small"
                styles={{ root: { alignSelf: 'center', color: '#4b5563', padding: '0 4px' } }}
              >
                Không có thao tác ở bước này
              </Text>
            )}
          </Stack>
        </Stack>

        {master.status === 'Returned' && (
          <MessageBar messageBarType={MessageBarType.severeWarning}>
            <strong>Hồ sơ đã được trả về.</strong> Chỉnh sửa thông tin / tài liệu rồi trình lại.
            Bước hiện tại: <strong>{stepShortVi(master.currentStepKey)}</strong>
            {props.rejectNote ? (
              <>
                <br />
                <strong>Lý do:</strong> {props.rejectNote}
              </>
            ) : null}
          </MessageBar>
        )}

        {canEditRequestBusinessFields(master) && isRequestCreator(props.actor, master) && (
          <EditBusinessFields
            master={master}
            busy={props.busy}
            editTitle={props.editTitle}
            editAmount={props.editAmount}
            editExpl={props.editExpl}
            editOu={props.editOu}
            editRoutePlan={props.editRoutePlan}
            orgUnits={props.orgUnits}
            stepRecipients={props.stepRecipients}
            routeStepsUi={props.routeStepsUi}
            actorOuCode={props.actor.ouCode || ''}
            defaultOuForStep={props.defaultOuForStep}
            onTitleChange={props.onEditTitleChange}
            onAmountChange={(v) => props.onEditAmountChange(formatAmountInput(v))}
            onExplChange={props.onEditExplChange}
            onOuChange={props.onEditOuChange}
            onRouteChange={props.onEditRouteChange}
            onSave={props.onSaveBusinessFields}
          />
        )}

        {master.currentStepKey === 'BPCM1_PREPARE' &&
          !requiredChecklistReady(props.checklist) && (
            <MessageBar messageBarType={MessageBarType.warning}>
              <strong>Thiếu tài liệu bắt buộc (chặn gửi)</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {props.checklist
                  .filter((c) => {
                    if (!c.isRequired) return false;
                    const min = c.minFileCount > 0 ? c.minFileCount : 1;
                    return c.uploadedCount < min;
                  })
                  .map((c) => (
                    <li key={c.id}>{c.itemLabel}</li>
                  ))}
              </ul>
            </MessageBar>
          )}

        {NEED_ACCEPT.indexOf(master.currentStepKey) >= 0 && !isWorkItemAccepted(activeWi) && (
          <MessageBar messageBarType={MessageBarType.warning}>
            <strong>Chưa tiếp nhận bước.</strong> Cần «Tiếp nhận và đặt hạn» trước khi đánh giá
            checklist / chuyển bước / xác nhận thanh toán.
          </MessageBar>
        )}

        {props.canReviewDocs && checklistHasFail(props.checklist) && (
          <MessageBar messageBarType={MessageBarType.error}>
            <strong>Có mục Không đạt.</strong> Chỉ «Trả về người tạo». Phòng đánh giá các mục chưa
            khóa thuộc phạm vi mình; không cần Đạt hết toàn bộ checklist để chuyển bước.
          </MessageBar>
        )}

        {props.canReviewDocs &&
          !checklistHasFail(props.checklist) &&
          !checklistReviewComplete(props.checklist) && (
            <MessageBar messageBarType={MessageBarType.info}>
              <strong>Gợi ý đánh giá checklist.</strong> Chủ động đánh giá các mục chưa khóa phù
              hợp phòng. Có thể chuyển bước khi không còn mục Không đạt; mục đã khóa chỉ xem,
              không đánh giá lại.
            </MessageBar>
          )}

        <DocsPanel
          master={master}
          busy={props.busy}
          docsTab={props.docsTab}
          checklist={props.checklist}
          supportingDocs={props.supportingDocs}
          canReviewDocs={props.canReviewDocs}
          isBpcm1Adjusting={props.isBpcm1Adjusting}
          docsForChecklistItem={props.docsForChecklistItem}
          onDocsTabChange={props.onDocsTabChange}
          onOpenDoc={props.onOpenDoc}
          onOpenReview={props.onOpenReview}
          onClearChecklistItem={props.onClearChecklistItem}
          onPickChecklistFile={props.onPickChecklistFile}
          onOpenAttachChecklist={props.onOpenAttachChecklist}
          onOpenAttachStep={props.onOpenAttachStep}
        />

        <ActivityPanel
          busy={props.busy}
          activityTab={props.activityTab}
          timeline={props.timeline}
          noteList={props.noteList}
          commentDraft={props.commentDraft}
          docs={props.docs}
          activeWi={activeWi}
          acceptBlocked={props.acceptBlocked}
          notesAllowed={props.notesAllowed}
          onActivityTabChange={props.onActivityTabChange}
          onCommentDraftChange={props.onCommentDraftChange}
          onSendNote={props.onSendNote}
          onOpenDoc={props.onOpenDoc}
          onWarn={props.onWarn}
        />
      </Stack>
    </ThemeProvider>
  );
};

export default RequestDetailPage;
