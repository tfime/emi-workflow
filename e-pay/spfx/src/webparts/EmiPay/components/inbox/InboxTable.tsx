import * as React from 'react';
import {
  DefaultButton,
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  SelectionMode,
  Stack,
  Text
} from '@fluentui/react';
import { IRequestMaster, displayRequestTitle } from '../../services/RequestService';
import { IOrgMember, IOrgUnit } from '../../services/ConfigService';
import {
  moneyVi,
  statusVi,
  statusBadgeKind,
  stepShortVi
} from '../../services/viLabels';
import { actionBtnStyles, compactBtnStyles } from '../detail/detailStyles';
import { badgeBg, badgeColor } from '../detail/fluentBadge';
import {
  INBOX_PAGE_SIZE,
  creatorDisplayName,
  filterInboxRows,
  formatCreatedAt,
  ouDisplayName,
  paginateRows,
  sortByCreatedDesc
} from './inboxHelpers';

export interface IInboxTableProps {
  rows: IRequestMaster[];
  searchQuery: string;
  orgMembers: IOrgMember[];
  orgUnits: IOrgUnit[];
  onOpen: (requestKey: string) => void;
  /** Reset key khi đổi filter nav / search — về trang 1. */
  resetToken: string;
}

const InboxTable: React.FC<IInboxTableProps> = (props) => {
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    setPage(1);
  }, [props.resetToken]);

  const prepared = sortByCreatedDesc(
    filterInboxRows(props.rows, props.searchQuery, props.orgMembers, props.orgUnits)
  );
  const paged = paginateRows(prepared, page, INBOX_PAGE_SIZE);

  const columns: IColumn[] = [
    {
      key: 'code',
      name: 'Mã hồ sơ',
      minWidth: 110,
      maxWidth: 150,
      isResizable: true,
      onRender: (item: IRequestMaster) => (
        <Text styles={{ root: { fontWeight: 600 } }}>
          {item.requestCode || item.requestKey}
        </Text>
      )
    },
    {
      key: 'title',
      name: 'Tiêu đề',
      minWidth: 140,
      maxWidth: 240,
      isResizable: true,
      onRender: (item: IRequestMaster) => (
        <Text styles={{ root: { wordBreak: 'break-word' } }}>
          {displayRequestTitle(item)}
        </Text>
      )
    },
    {
      key: 'creator',
      name: 'Người tạo',
      minWidth: 100,
      maxWidth: 140,
      isResizable: true,
      onRender: (item: IRequestMaster) =>
        creatorDisplayName(item.creatorUPN, props.orgMembers)
    },
    {
      key: 'ou',
      name: 'Phòng tạo',
      minWidth: 90,
      maxWidth: 130,
      isResizable: true,
      onRender: (item: IRequestMaster) =>
        ouDisplayName(item.createdOUCode, props.orgUnits)
    },
    {
      key: 'created',
      name: 'Ngày tạo',
      minWidth: 90,
      maxWidth: 120,
      onRender: (item: IRequestMaster) => formatCreatedAt(item.createdAt)
    },
    {
      key: 'step',
      name: 'Bước',
      minWidth: 80,
      maxWidth: 110,
      onRender: (item: IRequestMaster) => stepShortVi(item.currentStepKey)
    },
    {
      key: 'amount',
      name: 'Số tiền',
      minWidth: 100,
      maxWidth: 140,
      onRender: (item: IRequestMaster) => moneyVi(item.amount)
    },
    {
      key: 'status',
      name: 'Trạng thái',
      minWidth: 100,
      maxWidth: 140,
      onRender: (item: IRequestMaster) => {
        const kind = statusBadgeKind(item.status);
        return (
          <Text
            variant="small"
            styles={{
              root: {
                display: 'inline-block',
                fontWeight: '600',
                color: badgeColor(kind),
                background: badgeBg(kind),
                borderRadius: 4,
                padding: '2px 8px'
              }
            }}
          >
            {statusVi(item.status)}
          </Text>
        );
      }
    }
  ];

  if (!props.rows.length && !(props.searchQuery || '').trim()) {
    return (
      <Text styles={{ root: { padding: 16, color: '#4b5563' } }}>Không có hồ sơ.</Text>
    );
  }

  if (!prepared.length) {
    return (
      <Text styles={{ root: { padding: 16, color: '#4b5563' } }}>
        Không có hồ sơ khớp tìm kiếm.
      </Text>
    );
  }

  return (
    <Stack tokens={{ childrenGap: 8 }}>
      <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <DetailsList
          items={paged.pageRows}
          columns={columns}
          selectionMode={SelectionMode.none}
          layoutMode={DetailsListLayoutMode.justified}
          compact={true}
          onItemInvoked={(item: IRequestMaster) => props.onOpen(item.requestKey)}
          onRenderRow={(rowProps, defaultRender) => {
            if (!rowProps || !defaultRender) return null;
            return (
              <div
                style={{ cursor: 'pointer' }}
                onClick={() => props.onOpen(rowProps.item.requestKey)}
              >
                {defaultRender(rowProps)}
              </div>
            );
          }}
        />
      </div>
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="center"
        wrap
        tokens={{ childrenGap: 8 }}
        styles={{ root: { padding: '4px 8px 8px' } }}
      >
        <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
          Hiển thị {paged.from}–{paged.to} / {paged.total}
        </Text>
        {paged.pageCount > 1 && (
          <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
            <DefaultButton
              text="Trước"
              disabled={paged.page <= 1}
              onClick={() => setPage(paged.page - 1)}
              styles={compactBtnStyles}
            />
            <Text variant="small" styles={{ root: { color: '#4b5563' } }}>
              Trang {paged.page} / {paged.pageCount}
            </Text>
            <DefaultButton
              text="Sau"
              disabled={paged.page >= paged.pageCount}
              onClick={() => setPage(paged.page + 1)}
              styles={actionBtnStyles}
            />
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default InboxTable;
