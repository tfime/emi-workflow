import * as React from 'react';
import {
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  Link,
  Pivot,
  PivotItem,
  PrimaryButton,
  SelectionMode,
  Stack,
  Text
} from '@fluentui/react';
import { IChecklistItemRow } from '../../services/ChecklistService';
import { IDocumentIndexRow } from '../../services/UploadService';
import { IRequestMaster } from '../../services/RequestService';
import { docClassVi } from '../../services/DocPreview';
import { checklistStatusVi, shortFileName } from '../../services/viLabels';
import { actionBtnStyles, cardStack, compactBtnStyles } from './detailStyles';

export type DocsTabKey = 'checklist' | 'files';

export interface IDocsPanelProps {
  master: IRequestMaster;
  busy: boolean;
  docsTab: DocsTabKey;
  checklist: IChecklistItemRow[];
  supportingDocs: IDocumentIndexRow[];
  canReviewDocs: boolean;
  isBpcm1Adjusting: boolean;
  docsForChecklistItem: (itemCode: string) => IDocumentIndexRow[];
  onDocsTabChange: (tab: DocsTabKey) => void;
  onOpenDoc: (doc: IDocumentIndexRow) => void;
  onOpenReview: (itemCode: string) => void;
  onClearChecklistItem: (item: IChecklistItemRow) => void;
  onPickChecklistFile: (itemCode: string) => void;
  onOpenAttachChecklist: () => void;
  onOpenAttachStep: () => void;
}

function statusColor(status: string, missing: boolean): string {
  if (status === 'Uploaded' || status === 'Pass') return '#166534';
  if (status === 'Fail') return '#b91c1c';
  if (missing) return '#92400e';
  return '#4b5563';
}

const DocsPanel: React.FC<IDocsPanelProps> = (props) => {
  const canUploadChecklist =
    props.master.currentStepKey === 'BPCM1_PREPARE' &&
    (props.master.status === 'Draft' || props.master.status === 'Returned');
  const canUploadStep =
    props.master.currentStepKey !== 'SYSTEM_ARCHIVE' &&
    props.master.status !== 'Cancelled' &&
    props.master.status !== 'Completed';

  const checklistColumns: IColumn[] = [
    {
      key: 'label',
      name: 'Mục tài liệu',
      minWidth: 160,
      maxWidth: 280,
      isResizable: true,
      onRender: (c: IChecklistItemRow) => {
        const min = c.minFileCount > 0 ? c.minFileCount : 1;
        return (
          <Stack tokens={{ childrenGap: 2 }}>
            <Text styles={{ root: { fontWeight: 600 } }}>{c.itemLabel}</Text>
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              {c.isRequired ? 'Bắt buộc' : 'Tuỳ chọn'}
              {` · ${c.uploadedCount}/${min} tệp`}
            </Text>
          </Stack>
        );
      }
    },
    {
      key: 'files',
      name: 'Tệp',
      minWidth: 120,
      maxWidth: 200,
      isResizable: true,
      onRender: (c: IChecklistItemRow) => {
        const linked = props.docsForChecklistItem(c.itemCode);
        if (!linked.length) return <Text>—</Text>;
        return (
          <Stack tokens={{ childrenGap: 2 }}>
            {linked.map((d) => (
              <Link key={d.id} onClick={() => props.onOpenDoc(d)} title={d.fileName}>
                {shortFileName(d.fileName || d.documentKey)}
              </Link>
            ))}
          </Stack>
        );
      }
    },
    {
      key: 'by',
      name: 'Người tải',
      minWidth: 100,
      maxWidth: 160,
      isResizable: true,
      onRender: (c: IChecklistItemRow) => {
        const linked = props.docsForChecklistItem(c.itemCode);
        const uploaders = linked
          .map((d) => d.uploadedByUPN)
          .filter(Boolean)
          .filter((u, i, arr) => arr.indexOf(u) === i);
        if (!uploaders.length) return <Text>—</Text>;
        return (
          <Stack tokens={{ childrenGap: 2 }}>
            {uploaders.map((u) => (
              <Text key={u} variant="small">
                {u}
              </Text>
            ))}
          </Stack>
        );
      }
    },
    {
      key: 'status',
      name: 'Trạng thái',
      minWidth: 90,
      maxWidth: 120,
      onRender: (c: IChecklistItemRow) => {
        const min = c.minFileCount > 0 ? c.minFileCount : 1;
        const missing = c.isRequired && c.uploadedCount < min;
        return (
          <Text
            variant="small"
            styles={{ root: { fontWeight: 600, color: statusColor(c.itemStatus, missing) } }}
          >
            {checklistStatusVi(c.itemStatus)}
          </Text>
        );
      }
    },
    {
      key: 'actions',
      name: '',
      minWidth: 180,
      maxWidth: 260,
      onRender: (c: IChecklistItemRow) => {
        const linked = props.docsForChecklistItem(c.itemCode);
        return (
          <Stack horizontal tokens={{ childrenGap: 6 }} wrap>
            {linked[0] && (
              <DefaultButton
                text="Xem"
                onClick={() => props.onOpenDoc(linked[0])}
                styles={compactBtnStyles}
              />
            )}
            {props.canReviewDocs && linked.length > 0 && !c.isLocked && (
              <DefaultButton
                text="Đánh giá"
                disabled={props.busy}
                onClick={() => props.onOpenReview(c.itemCode)}
                styles={compactBtnStyles}
              />
            )}
            {c.isLocked && !props.isBpcm1Adjusting && (
              <Text variant="small" styles={{ root: { color: '#4b5563', alignSelf: 'center' } }}>
                Đã khóa
              </Text>
            )}
            {props.isBpcm1Adjusting && linked.length > 0 && (
              <DefaultButton
                text="Xóa hồ sơ"
                disabled={props.busy}
                onClick={() => props.onClearChecklistItem(c)}
                styles={compactBtnStyles}
              />
            )}
            {props.isBpcm1Adjusting && (
              <PrimaryButton
                text={c.uploadedCount > 0 ? 'Tải thêm' : 'Tải lên'}
                disabled={props.busy}
                onClick={() => props.onPickChecklistFile(c.itemCode)}
                styles={compactBtnStyles}
              />
            )}
          </Stack>
        );
      }
    }
  ];

  const fileColumns: IColumn[] = [
    {
      key: 'class',
      name: 'Loại',
      minWidth: 100,
      maxWidth: 140,
      onRender: (d: IDocumentIndexRow) => (
        <Stack tokens={{ childrenGap: 2 }}>
          <Text styles={{ root: { fontWeight: 600 } }}>{docClassVi(d.docClass)}</Text>
          <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
            {d.documentKey}
          </Text>
        </Stack>
      )
    },
    {
      key: 'file',
      name: 'Tệp',
      minWidth: 120,
      maxWidth: 200,
      onRender: (d: IDocumentIndexRow) => (
        <Link onClick={() => props.onOpenDoc(d)} title={d.fileName}>
          {shortFileName(d.fileName || '—')}
        </Link>
      )
    },
    {
      key: 'lib',
      name: 'Kho',
      minWidth: 90,
      maxWidth: 120,
      onRender: (d: IDocumentIndexRow) => (
        <Text variant="small">
          {/internal/i.test(d.libraryName || '') ? 'DocsInternal' : 'DocsWorking'}
        </Text>
      )
    },
    {
      key: 'by',
      name: 'Người tải',
      minWidth: 100,
      maxWidth: 160,
      onRender: (d: IDocumentIndexRow) => <Text>{d.uploadedByUPN || '—'}</Text>
    },
    {
      key: 'at',
      name: 'Thời gian',
      minWidth: 120,
      maxWidth: 160,
      onRender: (d: IDocumentIndexRow) => (
        <Text variant="small">
          {d.uploadedAt ? new Date(d.uploadedAt).toLocaleString('vi-VN') : '—'}
        </Text>
      )
    },
    {
      key: 'act',
      name: '',
      minWidth: 70,
      maxWidth: 80,
      onRender: (d: IDocumentIndexRow) => (
        <DefaultButton text="Xem" onClick={() => props.onOpenDoc(d)} styles={compactBtnStyles} />
      )
    }
  ];

  const listWrap: React.CSSProperties = {
    margin: '0 -4px',
    padding: '4px 0 0',
    overflowX: 'auto',
    maxWidth: '100%'
  };

  return (
    <Stack tokens={{ childrenGap: 12 }} styles={cardStack}>
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="center"
        wrap
        tokens={{ childrenGap: 10 }}
      >
        <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
          Tài liệu
        </Text>
        <Stack horizontal tokens={{ childrenGap: 8 }} wrap>
          {props.docsTab === 'checklist' && canUploadChecklist && (
            <DefaultButton
              text="Tải checklist"
              disabled={props.busy}
              onClick={props.onOpenAttachChecklist}
              styles={actionBtnStyles}
            />
          )}
          {props.docsTab === 'files' && canUploadStep && (
            <PrimaryButton
              text="Tải đính kèm hỗ trợ"
              disabled={props.busy}
              onClick={props.onOpenAttachStep}
              styles={actionBtnStyles}
            />
          )}
        </Stack>
      </Stack>

      <Pivot
        selectedKey={props.docsTab}
        styles={{ root: { marginTop: 0 } }}
        onLinkClick={(item) => {
          const key = (item && item.props.itemKey) as DocsTabKey;
          if (key === 'checklist' || key === 'files') props.onDocsTabChange(key);
        }}
      >
        <PivotItem headerText="Checklist" itemKey="checklist">
          {props.checklist.length === 0 ? (
            <Text styles={{ root: { padding: '12px 4px', color: '#4b5563' } }}>
              Chưa có mục checklist.
            </Text>
          ) : (
            <div style={listWrap}>
              <DetailsList
                items={props.checklist}
                columns={checklistColumns}
                selectionMode={SelectionMode.none}
                layoutMode={DetailsListLayoutMode.justified}
                compact={true}
                styles={{
                  root: { overflowX: 'visible' },
                  headerWrapper: { paddingTop: 4 }
                }}
              />
            </div>
          )}
        </PivotItem>
        <PivotItem headerText="Tài liệu hỗ trợ" itemKey="files">
          {props.supportingDocs.length === 0 ? (
            <Text styles={{ root: { padding: '12px 4px', color: '#4b5563' } }}>
              Chưa có tài liệu hỗ trợ. Dùng «Tải đính kèm hỗ trợ» để bổ sung chứng từ theo bước.
            </Text>
          ) : (
            <div style={listWrap}>
              <DetailsList
                items={props.supportingDocs}
                columns={fileColumns}
                selectionMode={SelectionMode.none}
                layoutMode={DetailsListLayoutMode.justified}
                compact={true}
                styles={{
                  root: { overflowX: 'visible' },
                  headerWrapper: { paddingTop: 4 }
                }}
              />
            </div>
          )}
        </PivotItem>
      </Pivot>
    </Stack>
  );
};

export default DocsPanel;
