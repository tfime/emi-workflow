import * as React from 'react';
import {
  Link,
  MessageBar,
  MessageBarType,
  Pivot,
  PivotItem,
  PrimaryButton,
  Stack,
  Text,
  TextField
} from '@fluentui/react';
import { INoteListItem, ITimelineItem } from '../../services/ActivityService';
import { IDocumentIndexRow } from '../../services/UploadService';
import { IWorkItemRow, isWorkItemAccepted } from '../../services/RequestService';
import { shortFileName } from '../../services/viLabels';
import { actionBtnStyles, cardStack } from './detailStyles';

export type ActivityTabKey = 'timeline' | 'comment';

export interface IActivityPanelProps {
  busy: boolean;
  activityTab: ActivityTabKey;
  timeline: ITimelineItem[];
  noteList: INoteListItem[];
  commentDraft: string;
  docs: IDocumentIndexRow[];
  activeWi?: IWorkItemRow;
  acceptBlocked: boolean;
  notesAllowed: boolean;
  onActivityTabChange: (tab: ActivityTabKey) => void;
  onCommentDraftChange: (v: string) => void;
  onSendNote: () => void;
  onOpenDoc: (doc: IDocumentIndexRow) => void;
  onWarn: (text: string) => void;
}

function kindColor(kind: string): string {
  if (kind === 'ok') return '#166534';
  if (kind === 'warn') return '#92400e';
  if (kind === 'danger' || kind === 'reject') return '#b91c1c';
  if (kind === 'info' || kind === 'user') return '#1d4ed8';
  return '#4b5563';
}

const ActivityPanel: React.FC<IActivityPanelProps> = (props) => {
  return (
    <Stack tokens={{ childrenGap: 12 }} styles={cardStack}>
      <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
        Hoạt động
      </Text>

      <Pivot
        selectedKey={props.activityTab}
        onLinkClick={(item) => {
          const key = (item && item.props.itemKey) as ActivityTabKey;
          if (key === 'timeline' || key === 'comment') props.onActivityTabChange(key);
        }}
      >
        <PivotItem
          headerText="Nhật ký"
          itemKey="timeline"
          itemCount={props.timeline.length || undefined}
        >
          <Stack tokens={{ childrenGap: 10 }} styles={{ root: { paddingTop: 8 } }}>
            {props.activeWi && isWorkItemAccepted(props.activeWi) && (
              <Stack
                horizontal
                horizontalAlign="space-between"
                verticalAlign="center"
                styles={{
                  root: {
                    padding: '8px 0',
                    borderBottom: '1px solid #e5e7eb'
                  }
                }}
              >
                <Stack tokens={{ childrenGap: 2 }}>
                  <Text styles={{ root: { fontWeight: 600 } }}>Hạn xử lý bước hiện tại</Text>
                  <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                    {props.activeWi.dueAt
                      ? new Date(props.activeWi.dueAt).toLocaleString('vi-VN')
                      : '—'}
                    {props.activeWi.acceptedByUPN
                      ? ` · ${props.activeWi.acceptedByUPN}`
                      : ''}
                  </Text>
                </Stack>
                <Text variant="small" styles={{ root: { color: '#1d4ed8', fontWeight: 600 } }}>
                  Hạn xử lý
                </Text>
              </Stack>
            )}
            {props.timeline.length === 0 && (
              <Text styles={{ root: { color: '#4b5563' } }}>
                Chưa có nhật ký Activity. Import Flow rồi thao tác lại hồ sơ.
              </Text>
            )}
            {props.timeline.map((row) => (
              <Stack
                key={row.id}
                horizontal
                horizontalAlign="space-between"
                verticalAlign="center"
                styles={{
                  root: { padding: '8px 0', borderBottom: '1px solid #f3f4f6' }
                }}
              >
                <Stack tokens={{ childrenGap: 2 }}>
                  <Text styles={{ root: { fontWeight: 600 } }}>{row.title}</Text>
                  <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                    {[row.at ? new Date(row.at).toLocaleString('vi-VN') : '', row.meta]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Stack>
                <Text
                  variant="small"
                  styles={{ root: { color: kindColor(row.kind), fontWeight: 600 } }}
                >
                  {row.badge}
                </Text>
              </Stack>
            ))}
          </Stack>
        </PivotItem>

        <PivotItem
          headerText="Ghi chú"
          itemKey="comment"
          itemCount={props.noteList.length || undefined}
        >
          <Stack tokens={{ childrenGap: 10 }} styles={{ root: { paddingTop: 8 } }}>
            {props.noteList.length === 0 && (
              <Text styles={{ root: { color: '#4b5563' } }}>Chưa có ghi chú trên hồ sơ.</Text>
            )}
            {props.noteList.map((n) => {
              const linkedDoc = n.documentKey
                ? props.docs.filter(
                    (d) => (d.documentKey || '').replace(/\|/g, '_') === n.documentKey
                  )[0]
                : undefined;
              const label =
                n.kind === 'reject'
                  ? 'Trả về'
                  : n.kind === 'review'
                    ? 'Nhận xét'
                    : n.documentKey
                      ? 'Tệp'
                      : n.kind === 'user'
                        ? 'Ghi chú'
                        : 'Khác';
              return (
                <Stack
                  key={n.id}
                  horizontal
                  horizontalAlign="space-between"
                  styles={{
                    root: { padding: '8px 0', borderBottom: '1px solid #f3f4f6' }
                  }}
                >
                  <Stack tokens={{ childrenGap: 4 }} styles={{ root: { flex: 1 } }}>
                    <Text styles={{ root: { fontWeight: 600 } }}>{n.title}</Text>
                    <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                      {[
                        n.at ? new Date(n.at).toLocaleString('vi-VN') : '',
                        n.actorUPN,
                        linkedDoc
                          ? shortFileName(linkedDoc.fileName || linkedDoc.documentKey)
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text>{n.body}</Text>
                    {linkedDoc && (
                      <Link onClick={() => props.onOpenDoc(linkedDoc)}>Mở tệp</Link>
                    )}
                  </Stack>
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        color: kindColor(n.kind === 'reject' ? 'reject' : n.kind),
                        fontWeight: 600,
                        marginLeft: 12
                      }
                    }}
                  >
                    {label}
                  </Text>
                </Stack>
              );
            })}

            {props.acceptBlocked ? (
              <MessageBar messageBarType={MessageBarType.warning}>
                Cần «Tiếp nhận và đặt hạn» trước khi đánh giá checklist hoặc gửi ghi chú.
              </MessageBar>
            ) : !props.notesAllowed ? (
              <MessageBar messageBarType={MessageBarType.info}>
                Hồ sơ đã đóng — không gửi thêm ghi chú.
              </MessageBar>
            ) : (
              <Stack tokens={{ childrenGap: 8 }}>
                <TextField
                  label="Thêm ghi chú"
                  multiline
                  rows={3}
                  value={props.commentDraft}
                  onChange={(_, v) => props.onCommentDraftChange(v || '')}
                  placeholder="Thêm ghi chú…"
                  disabled={props.busy}
                />
                <Stack horizontal horizontalAlign="end">
                  <PrimaryButton
                    text="Gửi ghi chú"
                    disabled={props.busy}
                    styles={actionBtnStyles}
                    onClick={() => {
                      if (!props.commentDraft.trim()) {
                        props.onWarn('Nhập nội dung ghi chú');
                        return;
                      }
                      props.onSendNote();
                    }}
                  />
                </Stack>
              </Stack>
            )}
          </Stack>
        </PivotItem>
      </Pivot>
    </Stack>
  );
};

export default ActivityPanel;
