import * as React from 'react';
import { Persona, PersonaSize, Stack, Text, ThemeProvider } from '@fluentui/react';
import {
  ICommandActor,
  actorLabel,
  canSeeWorkQueue
} from '../../services/actorAuth';
import { PayInboxFilter } from '../../services/payRoute';
import { emiPayFluentTheme } from '../../theme/fluentPayTheme';
import { PayView } from '../types';
import styles from '../EmiPay.module.scss';

export interface IAppNavProps {
  view: PayView;
  inboxFilter: PayInboxFilter;
  actor: ICommandActor;
  ouName?: string;
  avatarLetters: string;
  mayCreate: boolean;
  hasMaster: boolean;
  canAudit: boolean;
  onGoDashboard: () => void;
  onGoInbox: (filter: PayInboxFilter) => void;
  onGoCreate: () => void;
  onGoDetail: () => void;
  onGoAudit: () => void;
}

const AppNav: React.FC<IAppNavProps> = (props) => {
  const showDash =
    props.actor.memberRole === 'SysAdmin' || props.actor.memberRole === 'Manager';
  // Cộng quyền: chỉ Member/Manager (OrgMembers) hoặc SysADM mới có hàng đợi «Việc của tôi».
  const showWorkQueue = canSeeWorkQueue(props.actor);

  const note = props.actor.acting && !props.actor.known
    ? 'Đang đóng vai người tạo hồ sơ (tạm). Chỉ «Hồ sơ của tôi» + tạo/trình; không hàng đợi duyệt.'
    : props.actor.acting
      ? 'Đang đóng vai nhân sự tạm. Nút và người ghi trên lệnh theo người này.'
      : props.actor.memberRole === 'SysAdmin'
        ? 'Quản trị tạo/trình được. Đóng vai Manager để duyệt, hoặc «Người tạo hồ sơ (tạm)» để xem UI tạo.'
        : !props.actor.known
          ? 'Người tạo: «Hồ sơ của tôi» + tạo hồ sơ. Có thêm OrgMembers thì mới thấy «Việc của tôi».'
          : props.actor.memberRole === 'Manager'
            ? 'Trưởng phòng: «Việc của tôi» (duyệt/tiếp nhận/chốt) + hồ sơ mình tạo.'
            : 'Thành viên kiểm tra: «Việc của tôi» khi được giao + hồ sơ mình tạo.';

  const navClass = (active: boolean): string =>
    `${styles.navBtn} ${active ? styles.navBtnActive : ''}`.trim();

  const workQueueActive =
    props.view === 'inbox' &&
    (props.inboxFilter === 'all' || props.inboxFilter === 'todo');
  const mineActive =
    props.view === 'inbox' && props.inboxFilter === 'mine';

  return (
    <ThemeProvider
      theme={emiPayFluentTheme}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        maxWidth: '100%',
        background: 'transparent',
        boxSizing: 'border-box'
      }}
    >
      <nav className={styles.nav} aria-label="Điều hướng EMI PAY">
        <div className={styles.navScroll}>
          <div className={styles.navGroup}>Không gian làm việc</div>
          {showDash && (
            <button
              type="button"
              className={navClass(props.view === 'dashboard')}
              onClick={props.onGoDashboard}
            >
              Tổng quan
            </button>
          )}
          {showWorkQueue && (
            <button
              type="button"
              className={navClass(workQueueActive)}
              onClick={() => props.onGoInbox('all')}
            >
              Việc của tôi
            </button>
          )}
          <button
            type="button"
            className={navClass(mineActive)}
            onClick={() => props.onGoInbox('mine')}
          >
            Hồ sơ của tôi
          </button>
          {props.mayCreate && (
            <button
              type="button"
              className={navClass(props.view === 'create')}
              onClick={props.onGoCreate}
            >
              Tạo hồ sơ
            </button>
          )}
          {props.hasMaster && (
            <button
              type="button"
              className={navClass(props.view === 'detail')}
              onClick={props.onGoDetail}
            >
              Hồ sơ đang mở
            </button>
          )}
          {props.canAudit && (
            <button
              type="button"
              className={navClass(props.view === 'audit')}
              onClick={props.onGoAudit}
            >
              Nhật ký nội bộ
            </button>
          )}
        </div>

        <div className={styles.navFooter}>
          <p className={styles.navNote}>{note}</p>
          <Stack
            horizontal
            verticalAlign="center"
            tokens={{ childrenGap: 10 }}
            styles={{ root: { padding: '10px 8px 4px', minWidth: 0 } }}
          >
            <Persona
              text={props.actor.displayName}
              imageInitials={props.avatarLetters}
              size={PersonaSize.size32}
              hidePersonaDetails={true}
              styles={{ root: { flexShrink: 0 } }}
            />
            <Stack tokens={{ childrenGap: 2 }} styles={{ root: { minWidth: 0, flex: 1 } }}>
              <Text
                styles={{
                  root: {
                    fontWeight: 600,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
                }}
                title={props.actor.displayName}
              >
                {props.actor.displayName}
              </Text>
              <Text
                variant="small"
                styles={{
                  root: {
                    color: '#4b5563',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
                }}
                title={actorLabel(props.actor, props.ouName)}
              >
                {actorLabel(props.actor, props.ouName)}
              </Text>
            </Stack>
          </Stack>
        </div>
      </nav>
    </ThemeProvider>
  );
};

export default AppNav;
