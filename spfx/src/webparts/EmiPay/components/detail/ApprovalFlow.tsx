import * as React from 'react';
import styles from '../EmiPay.module.scss';
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
    <div className={styles.flowV}>
      {CORE_STEPS.map((s, idx) => {
        const done = idx < cur;
        const now = idx === cur;
        const facts = stepFlowFacts(s, props.workItems, props.activities);
        return (
          <div
            key={s}
            className={`${styles.flowStep} ${done ? styles.flowDone : ''} ${
              now ? styles.flowNow : ''
            }`.trim()}
          >
            <span className={styles.flowDot}>{done ? '✓' : idx + 1}</span>
            <strong>{stepShortVi(s)}</strong>
            {!!facts.receivedAt && (
              <span className={styles.flowMeta}>Nhận: {formatWhen(facts.receivedAt)}</span>
            )}
            {!!facts.processedAt && (
              <span className={styles.flowMeta}>Xử lý: {formatWhen(facts.processedAt)}</span>
            )}
            {!!facts.closedBy && (
              <span className={styles.flowMeta}>Chốt: {facts.closedBy}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ApprovalFlow;
