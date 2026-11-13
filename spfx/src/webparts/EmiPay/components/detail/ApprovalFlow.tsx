import * as React from 'react';
import { Stack, Text } from '@fluentui/react';
import { IActivityPublicRow } from '../../services/ActivityService';
import { stepFlowFacts } from '../../services/flowFacts';
import { CORE_STEPS } from '../../services/PayLists';
import { IWorkItemRow, stepIndex } from '../../services/RequestService';
import { stepShortVi } from '../../services/viLabels';

export interface IApprovalFlowProps {
  currentStepKey: string;
  workItems: IWorkItemRow[];
  activities: IActivityPublicRow[];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Luồng duyệt: tên bước luôn hiện.
 * Nhận / Xử lý / Chốt chỉ hiện khi bước đó đã có dữ liệu.
 */
const ApprovalFlow: React.FC<IApprovalFlowProps> = (props) => {
  const cur = stepIndex(props.currentStepKey);
  return (
    <Stack tokens={{ childrenGap: 0 }}>
      {CORE_STEPS.map((s, idx) => {
        const done = idx < cur;
        const now = idx === cur;
        const facts = stepFlowFacts(s, props.workItems, props.activities);
        const last = idx === CORE_STEPS.length - 1;
        return (
          <Stack
            key={s}
            horizontal
            tokens={{ childrenGap: 10 }}
            styles={{
              root: {
                position: 'relative',
                paddingBottom: last ? 0 : 14
              }
            }}
          >
            {!last && (
              <div
                style={{
                  position: 'absolute',
                  left: 11,
                  top: 24,
                  bottom: 0,
                  width: 2,
                  background: done || now ? '#0f766e' : '#e5e7eb'
                }}
              />
            )}
            <Stack
              horizontalAlign="center"
              verticalAlign="center"
              styles={{
                root: {
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: done ? '#0f766e' : now ? '#e7f5f3' : '#f3f4f6',
                  border: now ? '2px solid #0f766e' : '1px solid #e5e7eb',
                  color: done ? '#fff' : now ? '#0c5f59' : '#4b5563',
                  fontSize: 11,
                  fontWeight: 700,
                  zIndex: 1
                }
              }}
            >
              {done ? '✓' : idx + 1}
            </Stack>
            <Stack tokens={{ childrenGap: 2 }} styles={{ root: { minWidth: 0, paddingTop: 2 } }}>
              <Text
                styles={{
                  root: {
                    fontWeight: now ? 700 : 600,
                    color: now ? '#0c5f59' : '#111',
                    fontSize: 13
                  }
                }}
              >
                {stepShortVi(s)}
              </Text>
              {!!facts.receivedAt && (
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  Nhận: {formatWhen(facts.receivedAt)}
                </Text>
              )}
              {!!facts.processedAt && (
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  Xử lý: {formatWhen(facts.processedAt)}
                </Text>
              )}
              {!!facts.closedBy && (
                <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
                  Chốt: {facts.closedBy}
                </Text>
              )}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
};

export default ApprovalFlow;
