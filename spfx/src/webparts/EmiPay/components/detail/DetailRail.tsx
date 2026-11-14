import * as React from 'react';
import { Stack, Text, ThemeProvider } from '@fluentui/react';
import { IActivityPublicRow } from '../../services/ActivityService';
import { IChecklistItemRow, requiredChecklistReady } from '../../services/ChecklistService';
import {
  IOrgMember,
  IOrgUnit,
  IPaymentType
} from '../../services/ConfigService';
import {
  displayRequestTitle,
  IRequestMaster,
  IWorkItemRow
} from '../../services/RequestService';
import { IDocumentIndexRow } from '../../services/UploadService';
import { isChairDossierApproved } from '../../services/liveActions';
import {
  parsePartyBizFromRouteJson,
  partyKindLabel
} from '../../services/partyBiz';
import {
  chairStatusDetailVi,
  moneyVi,
  ouLabel,
  paymentTypeLabel,
  personLabel,
  stepShortVi
} from '../../services/viLabels';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import styles from '../EmiPay.module.scss';
import ApprovalFlow from './ApprovalFlow';
import { cardStack, fillStack, themeHostStyle } from './detailStyles';

export interface IDetailRailProps {
  master?: IRequestMaster;
  checklist: IChecklistItemRow[];
  workItems: IWorkItemRow[];
  activities: IActivityPublicRow[];
  uncDocs: IDocumentIndexRow[];
  orgUnits: IOrgUnit[];
  orgMembers: IOrgMember[];
  paymentTypes: IPaymentType[];
}

const kv = (label: string, value: React.ReactNode): React.ReactNode => (
  <Stack
    horizontal
    horizontalAlign="space-between"
    tokens={{ childrenGap: 8 }}
    styles={{
      root: {
        padding: '7px 0',
        borderBottom: '1px solid #e5e7eb'
      }
    }}
  >
    <Text variant="small" styles={{ root: { color: '#4b5563', fontWeight: 500 } }}>
      {label}
    </Text>
    <Text
      variant="small"
      styles={{
        root: {
          textAlign: 'right',
          maxWidth: '62%',
          wordBreak: 'break-word',
          fontWeight: 600
        }
      }}
    >
      {value}
    </Text>
  </Stack>
);

const DetailRail: React.FC<IDetailRailProps> = (props) => {
  if (!props.master) {
    return (
      <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
        <Stack styles={cardStack} tokens={{ childrenGap: 6 }}>
          <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
            Hồ sơ
          </Text>
          <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
            Chưa mở hồ sơ nào.
          </Text>
        </Stack>
      </ThemeProvider>
    );
  }

  const m = props.master;
  const units = props.orgUnits || [];
  const members = props.orgMembers || [];
  const types = props.paymentTypes || [];
  const party = parsePartyBizFromRouteJson(m.routePlanJson);
  const status = chairStatusDetailVi(
    m.currentStepKey,
    m.status,
    m.paymentDueAt,
    isChairDossierApproved(m, props.workItems)
  );
  const createdOu = ouLabel(m.createdOUCode, units);
  const currentOu = ouLabel(m.currentOUCode, units);
  const typeName = paymentTypeLabel(m.paymentTypeCode, types);
  const creatorName = personLabel(m.creatorUPN, members);

  return (
    <ThemeProvider theme={emiPayFluentTheme} style={themeHostStyle}>
      <Stack tokens={{ childrenGap: 12 }} styles={fillStack}>
        <Stack tokens={{ childrenGap: 12 }} styles={cardStack}>
          <div className={styles.reqKey}>
            <span>Mã hồ sơ</span>
            <strong title={m.requestCode || m.requestKey || ''}>
              {m.requestCode || m.requestKey}
            </strong>
          </div>
          <div
            className={styles.bigNum}
            style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10 }}
          >
            {moneyVi(m.amount)}
            <span>Số tiền đề nghị · {status}</span>
          </div>
        </Stack>

        <Stack tokens={{ childrenGap: 2 }} styles={cardStack}>
          <Text
            variant="mediumPlus"
            styles={{ root: { fontWeight: 600, marginBottom: 4 } }}
          >
            Tóm tắt nhanh
          </Text>
          {kv('Tiêu đề', displayRequestTitle(m))}
          {kv('Đối tượng', partyKindLabel(party.partyKind))}
          {party.partyKind === 'NCC' && (
            <>
              {kv('Dự án', party.project || '—')}
              {kv('Hạng mục / gói / KMCP', party.packageItem || '—')}
              {kv('Hợp đồng số', party.contractNo || '—')}
              {kv('Loại tiền', party.currency || '—')}
              {kv('Lần thanh toán', party.paymentTimes || '—')}
            </>
          )}
          {kv('Loại', typeName)}
          {kv('Đơn vị tạo', createdOu)}
          {m.status === 'AwaitingManager'
            ? kv('Chờ duyệt bởi', `Trưởng phòng · ${createdOu}`)
            : kv('Đơn vị bước hiện tại', currentOu)}
          {kv('Người tạo', creatorName)}
          {kv('Trạng thái', status)}
          {kv('Bước hiện tại', stepShortVi(m.currentStepKey))}
          {kv('Lượt', String(m.reviewRound))}
          {kv(
            'Checklist',
            requiredChecklistReady(props.checklist) ? 'Đã đủ' : 'Còn thiếu'
          )}
          {kv(
            'Thời hạn TT',
            m.paymentDueAt
              ? new Date(m.paymentDueAt).toLocaleDateString('vi-VN')
              : '—'
          )}
          {kv('UNC', props.uncDocs[0] ? props.uncDocs[0].fileName : 'Chưa có')}
          {!!m.explanation && (
            <Stack tokens={{ childrenGap: 4 }} styles={{ root: { marginTop: 8 } }}>
              <Text
                variant="small"
                styles={{ root: { color: '#4b5563', fontWeight: 500 } }}
              >
                Diễn giải
              </Text>
              <Text variant="small" styles={{ root: { wordBreak: 'break-word' } }}>
                {m.explanation}
              </Text>
            </Stack>
          )}
        </Stack>

        <Stack tokens={{ childrenGap: 10 }} styles={cardStack}>
          <Text
            variant="mediumPlus"
            styles={{ root: { fontWeight: 600, display: 'block' } }}
          >
            Luồng duyệt
          </Text>
          <ApprovalFlow
            currentStepKey={m.currentStepKey}
            status={m.status}
            createdOUCode={m.createdOUCode}
            routePlanJson={m.routePlanJson}
            workItems={props.workItems}
            activities={props.activities}
            orgUnits={units}
            orgMembers={members}
          />
        </Stack>
      </Stack>
    </ThemeProvider>
  );
};

export default DetailRail;
