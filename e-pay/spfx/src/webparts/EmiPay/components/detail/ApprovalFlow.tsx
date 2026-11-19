import * as React from 'react';
import { Stack, Text } from '@fluentui/react';
import { IActivityPublicRow } from '../../services/ActivityService';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import { stepFlowFacts } from '../../services/flowFacts';
import {
  isRouteStepSkipped,
  routeStepIndex,
  stepsFromRoutePlan
} from '../../services/routePlan';
import { IWorkItemRow } from '../../services/RequestService';
import { ouLabel, personLabel, stepShortVi } from '../../services/viLabels';
import { payTokens } from '../../theme/payTokens';

export interface IApprovalFlowProps {
  currentStepKey: string;
  status?: string;
  createdOUCode?: string;
  routePlanJson?: string;
  workItems: IWorkItemRow[];
  activities: IActivityPublicRow[];
  orgUnits?: IOrgUnit[];
  orgMembers?: IOrgMember[];
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

function parsePlan(routePlanJson?: string): Record<string, string> {
  if (!routePlanJson || !String(routePlanJson).trim()) return {};
  try {
    return JSON.parse(routePlanJson) as Record<string, string>;
  } catch {
    return {};
  }
}

function ouForStep(
  stepKey: string,
  plan: Record<string, string>,
  createdOUCode?: string
): string {
  if (stepKey === 'BPCM1_PREPARE') return createdOUCode || '';
  const v = plan[stepKey];
  if (typeof v === 'string' && !isRouteStepSkipped(v)) return v;
  return '';
}

type StepPhase = 'done' | 'now' | 'next';

/**
 * Luồng duyệt theo RoutePlan — timeline rõ bước hiện tại, tên phòng, sự kiện.
 */
const ApprovalFlow: React.FC<IApprovalFlowProps> = (props) => {
  const units = props.orgUnits || [];
  const members = props.orgMembers || [];
  const steps = stepsFromRoutePlan(props.routePlanJson);
  const cur = routeStepIndex(props.currentStepKey, props.routePlanJson);
  const plan = parsePlan(props.routePlanJson);
  const progressPct =
    steps.length <= 1 ? 100 : Math.round((Math.min(cur, steps.length - 1) / (steps.length - 1)) * 100);
  const currentLabel = stepShortVi(props.currentStepKey);

  return (
    <Stack tokens={{ childrenGap: 12 }}>
      <Stack tokens={{ childrenGap: 6 }}>
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          tokens={{ childrenGap: 8 }}
          styles={{ root: { minWidth: 0 } }}
        >
          <Text
            as="span"
            variant="small"
            styles={{
              root: {
                fontWeight: 600,
                color: payTokens.brandDark,
                flexShrink: 0,
                lineHeight: '18px'
              }
            }}
          >
            Bước {Math.min(cur + 1, steps.length)}/{steps.length}
          </Text>
          <Text
            as="span"
            variant="small"
            styles={{
              root: {
                color: payTokens.muted,
                lineHeight: '18px',
                textAlign: 'right',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }
            }}
          >
            {currentLabel}
          </Text>
        </Stack>
        <div
          style={{
            height: 6,
            borderRadius: 4,
            background: payTokens.line,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: payTokens.brand,
              borderRadius: 4,
              transition: 'width 0.2s ease'
            }}
          />
        </div>
      </Stack>

      <Stack tokens={{ childrenGap: 0 }}>
        {steps.map((s, idx) => {
          const phase: StepPhase = idx < cur ? 'done' : idx === cur ? 'now' : 'next';
          const facts = stepFlowFacts(s, props.workItems, props.activities);
          const ouCode = ouForStep(s, plan, props.createdOUCode);
          const ouName = ouCode ? ouLabel(ouCode, units) : '';
          const last = idx === steps.length - 1;
          const awaitingTp =
            phase === 'now' &&
            s === 'BPCM1_PREPARE' &&
            props.status === 'AwaitingManager';

          const dotBg =
            phase === 'done'
              ? payTokens.brand
              : phase === 'now'
                ? '#fff'
                : payTokens.surface;
          const dotBorder =
            phase === 'next' ? payTokens.line : payTokens.brand;
          const dotFg =
            phase === 'done' ? '#fff' : phase === 'now' ? payTokens.brandDark : payTokens.muted;

          return (
            <div
              key={s}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px minmax(0, 1fr)',
                columnGap: 10,
                position: 'relative',
                paddingBottom: last ? 0 : 10
              }}
            >
              {!last && (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 13,
                    top: 28,
                    bottom: 0,
                    width: 2,
                    background: phase === 'next' ? payTokens.line : payTokens.brand,
                    zIndex: 0
                  }}
                />
              )}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: dotBg,
                  border: `2px solid ${dotBorder}`,
                  color: dotFg,
                  fontSize: 12,
                  fontWeight: 700,
                  zIndex: 1,
                  position: 'relative'
                }}
              >
                {phase === 'done' ? '✓' : idx + 1}
              </div>

              <div
                style={{
                  minWidth: 0,
                  padding: '8px 10px',
                  borderRadius: 4,
                  border:
                    phase === 'now'
                      ? `1px solid ${payTokens.brand}`
                      : `1px solid ${payTokens.line}`,
                  background:
                    phase === 'now'
                      ? payTokens.brandSoft
                      : phase === 'done'
                        ? '#fff'
                        : payTokens.surface,
                  boxShadow: phase === 'now' ? '0 1px 2px rgba(15,118,110,0.12)' : 'none'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap'
                  }}
                >
                  <Text
                    styles={{
                      root: {
                        fontWeight: 700,
                        fontSize: 13,
                        lineHeight: '18px',
                        color: phase === 'next' ? payTokens.muted : payTokens.text
                      }
                    }}
                  >
                    {stepShortVi(s)}
                  </Text>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: '16px',
                      padding: '1px 7px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      color:
                        phase === 'done'
                          ? payTokens.ok
                          : phase === 'now'
                            ? payTokens.brandDark
                            : payTokens.muted,
                      background:
                        phase === 'done'
                          ? payTokens.okSoft
                          : phase === 'now'
                            ? '#fff'
                            : '#fff',
                      border: `1px solid ${
                        phase === 'done'
                          ? '#86efac'
                          : phase === 'now'
                            ? payTokens.brand
                            : payTokens.line
                      }`
                    }}
                  >
                    {phase === 'done'
                      ? 'Đã xong'
                      : phase === 'now'
                        ? 'Đang xử lý'
                        : 'Chưa tới'}
                  </span>
                </div>

                {!!ouName && (
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        display: 'block',
                        marginTop: 4,
                        color: payTokens.muted,
                        lineHeight: '16px'
                      }
                    }}
                  >
                    {ouName}
                  </Text>
                )}

                {awaitingTp && (
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        display: 'block',
                        marginTop: 4,
                        color: payTokens.warn,
                        fontWeight: 600,
                        lineHeight: '16px'
                      }
                    }}
                  >
                    Chờ trưởng phòng duyệt gửi — chưa sang bước kiểm tra
                  </Text>
                )}

                {(facts.receivedAt || facts.processedAt || facts.closedBy) && (
                  <div style={{ marginTop: 6 }}>
                    {!!facts.receivedAt && (
                      <Text
                        variant="tiny"
                        styles={{ root: { display: 'block', color: '#6b7280' } }}
                      >
                        Nhận · {formatWhen(facts.receivedAt)}
                      </Text>
                    )}
                    {!!facts.processedAt && (
                      <Text
                        variant="tiny"
                        styles={{ root: { display: 'block', color: '#6b7280' } }}
                      >
                        Xử lý · {formatWhen(facts.processedAt)}
                      </Text>
                    )}
                    {!!facts.closedBy && (
                      <Text
                        variant="tiny"
                        styles={{ root: { display: 'block', color: '#6b7280' } }}
                      >
                        Chốt · {personLabel(facts.closedBy, members)}
                      </Text>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Stack>
    </Stack>
  );
};

export default ApprovalFlow;
