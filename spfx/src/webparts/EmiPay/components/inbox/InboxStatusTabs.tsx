import * as React from 'react';
import styles from '../EmiPay.module.scss';
import { IInboxStatusTab, InboxStatusTabId } from './inboxHelpers';

const badgeClass = (kind: string): string => {
  if (kind === 'warn') return `${styles.badge} ${styles.badgeWarn}`;
  if (kind === 'ok') return `${styles.badge} ${styles.badgeOk}`;
  if (kind === 'info') return `${styles.badge} ${styles.badgeInfo}`;
  if (kind === 'danger') return `${styles.badge} ${styles.badgeDanger}`;
  return `${styles.badge} ${styles.badgeMute}`;
};

export interface IInboxStatusTabsProps {
  tabs: IInboxStatusTab[];
  activeId: InboxStatusTabId;
  onChange: (id: InboxStatusTabId) => void;
  ariaLabel: string;
}

const InboxStatusTabs: React.FC<IInboxStatusTabsProps> = (props) => {
  return (
    <div className={styles.inboxTabs} role="tablist" aria-label={props.ariaLabel}>
      {props.tabs.map((tab) => {
        const active = tab.id === props.activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.inboxTab} ${active ? styles.inboxTabActive : ''}`.trim()}
            onClick={() => props.onChange(tab.id)}
          >
            <span>{tab.label}</span>
            <span className={badgeClass(tab.badgeKind)}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
};

export default InboxStatusTabs;
