import * as React from 'react';
import styles from '../EmiPay.module.scss';

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

const DashBarChart: React.FC<IDashBarChartProps> = (props) => {
  const max = props.items.reduce((m, it) => (it.value > m ? it.value : m), 0);
  const fillClass =
    props.accent === 'warn'
      ? `${styles.dashChartFill} ${styles.dashChartFillWarn}`
      : props.accent === 'ok'
        ? `${styles.dashChartFill} ${styles.dashChartFillOk}`
        : styles.dashChartFill;

  return (
    <section className={styles.card}>
      <div className={styles.cardH}>
        <h3>{props.title}</h3>
      </div>
      <div className={styles.cardB}>
        {props.items.length === 0 ? (
          <p className={styles.empty}>{props.emptyText}</p>
        ) : (
          <div className={styles.dashChart}>
            {props.items.map((it) => {
              const pct = max > 0 ? Math.max(4, Math.round((it.value / max) * 100)) : 0;
              return (
                <div key={it.id} className={styles.dashChartRow}>
                  <div className={styles.dashChartLabel} title={it.hint || it.label}>
                    {it.label}
                  </div>
                  <div className={styles.dashChartTrack}>
                    <div
                      className={fillClass}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className={styles.dashChartValue}>{it.value}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default DashBarChart;
