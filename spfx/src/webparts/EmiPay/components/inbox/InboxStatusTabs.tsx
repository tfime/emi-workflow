import * as React from 'react';
import { DefaultButton, Stack, Text } from '@fluentui/react';
import { badgeBg, badgeColor } from '../detail/fluentBadge';
import { IInboxStatusTab, InboxStatusTabId } from './inboxHelpers';

export interface IInboxStatusTabsProps {
  tabs: IInboxStatusTab[];
  activeId: InboxStatusTabId;
  onChange: (id: InboxStatusTabId) => void;
  ariaLabel: string;
}

const InboxStatusTabs: React.FC<IInboxStatusTabsProps> = (props) => {
  return (
    <Stack
      horizontal
      wrap
      tokens={{ childrenGap: 8 }}
      styles={{ root: { padding: '0 0 8px' } }}
      role="tablist"
      aria-label={props.ariaLabel}
    >
      {props.tabs.map((tab) => {
        const active = tab.id === props.activeId;
        return (
          <DefaultButton
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => props.onChange(tab.id)}
            styles={{
              root: {
                minWidth: 0,
                height: 32,
                padding: '0 10px',
                borderRadius: 4,
                borderColor: active ? '#0f766e' : '#e5e7eb',
                background: active ? '#e7f5f3' : '#fff',
                color: active ? '#0c5f59' : '#111'
              },
              rootHovered: {
                background: active ? '#d5efe9' : '#f9fafb',
                borderColor: active ? '#0f766e' : '#d1d5db'
              }
            }}
          >
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Text variant="small" styles={{ root: { fontWeight: active ? '600' : '500' } }}>
                {tab.label}
              </Text>
              <Text
                variant="small"
                styles={{
                  root: {
                    fontWeight: '600',
                    color: badgeColor(tab.badgeKind),
                    background: badgeBg(tab.badgeKind),
                    borderRadius: 4,
                    padding: '1px 6px',
                    lineHeight: '18px'
                  }
                }}
              >
                {tab.count}
              </Text>
            </Stack>
          </DefaultButton>
        );
      })}
    </Stack>
  );
};

export default InboxStatusTabs;
