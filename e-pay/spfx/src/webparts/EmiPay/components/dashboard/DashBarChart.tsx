import * as React from 'react';
import { Stack, Text } from '@fluentui/react';
import { cardStack } from '../detail/detailStyles';

export interface IDashBarChartItem {
  id: string;
  label: string;
  value: number;
  hint?: string;
}

export interface IDashBarChartProps {
  title: string;
  items: IDashBarChartItem[];
  emptyText: string;
  accent?: 'brand' | 'warn' | 'ok';
}

function fillColor(accent?: 'brand' | 'warn' | 'ok'): string {
  if (accent === 'warn') return '#d97706';
  if (accent === 'ok') return '#16a34a';
  return '#0f766e';
}

const DashBarChart: React.FC<IDashBarChartProps> = (props) => {
  const max = props.items.reduce((m, it) => (it.value > m ? it.value : m), 0);
  const color = fillColor(props.accent);

  return (
    <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
      <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
        {props.title}
      </Text>
      {props.items.length === 0 ? (
        <Text styles={{ root: { color: '#4b5563' } }}>{props.emptyText}</Text>
      ) : (
        <Stack tokens={{ childrenGap: 8 }}>
          {props.items.map((it) => {
            const pct = max > 0 ? Math.max(4, Math.round((it.value / max) * 100)) : 0;
            return (
              <Stack
                key={it.id}
                horizontal
                verticalAlign="center"
                tokens={{ childrenGap: 8 }}
              >
                <Text
                  variant="small"
                  title={it.hint || it.label}
                  styles={{
                    root: {
                      width: 96,
                      flexShrink: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#4b5563'
                    }
                  }}
                >
                  {it.label}
                </Text>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 10,
                    borderRadius: 4,
                    background: '#f3f4f6',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 4,
                      background: color
                    }}
                  />
                </div>
                <Text
                  variant="small"
                  styles={{ root: { width: 28, textAlign: 'right', fontWeight: 600 } }}
                >
                  {it.value}
                </Text>
              </Stack>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};

export default DashBarChart;
