import * as React from 'react';
import styles from './EmiHubPortal.module.scss';

export interface IEmiHubPortalProps {
  title: string;
  hubSiteUrl: string;
  emiSiteUrl: string;
  projectSiteUrl: string;
  userDisplayName: string;
}

type TabId = 'all' | 'hub' | 'th' | 'projects';

interface ILinkCard {
  title: string;
  desc: string;
  url: string;
  meta?: string;
  phaseUrls?: { label: string; url: string }[];
}

const PHASES = [
  { folder: '01-Khoi tao', label: '01. Khởi tạo' },
  { folder: '02-Ke hoach', label: '02. Kế hoạch' },
  { folder: '03-Thuc hien', label: '03. Thực hiện' },
  { folder: '04-Nghiem thu-Dong', label: '04. Nghiệm thu' }
];

function trimSlash(u: string): string {
  return (u || '').replace(/\/+$/, '');
}

function phaseLinks(libUrl: string): { label: string; url: string }[] {
  return PHASES.map((p) => ({
    label: p.label,
    url: `${trimSlash(libUrl)}/${p.folder}`
  }));
}

export const EmiHubPortal: React.FC<IEmiHubPortalProps> = (props) => {
  const hub = trimSlash(props.hubSiteUrl);
  const emi = trimSlash(props.emiSiteUrl);
  const proj = trimSlash(props.projectSiteUrl);
  const [tab, setTab] = React.useState<TabId>('all');

  const hubCards: ILinkCard[] = [
    {
      title: 'EMI - Tài liệu dùng chung',
      desc: 'Hướng dẫn, bản phát hành toàn hệ thống',
      url: `${hub}/EMI-SharedDocs`,
      meta: 'Hub'
    },
    {
      title: 'EMI - Quy trình ISO chuẩn',
      desc: 'Quy trình ISO chuẩn đã phát hành',
      url: `${hub}/EMI-ISO-Standards`,
      meta: 'Hub'
    },
    {
      title: 'EMI - Biểu mẫu chuẩn',
      desc: 'Biểu mẫu thống nhất, kiểm soát phiên bản',
      url: `${hub}/EMI-Templates`,
      meta: 'Hub'
    },
    {
      title: 'Danh mục tài liệu chung',
      desc: 'Tra cứu mã / URL phát hành',
      url: `${hub}/Lists/EMI_DEMO_DanhMucChung`,
      meta: 'List'
    }
  ];

  const thCards: ILinkCard[] = [
    {
      title: 'TH - Dùng chung',
      desc: 'Kế hoạch / báo cáo phòng Tổng hợp',
      url: `${emi}/TH-Shared`,
      meta: 'cecm'
    },
    {
      title: 'TH - Chuyển đổi số',
      desc: 'Đào tạo CĐS, hồ sơ đang xử lý',
      url: `${emi}/TH-Digital`,
      meta: 'cecm'
    },
    {
      title: 'TH - ISO thực hiện',
      desc: 'Document Set đánh giá nội bộ',
      url: `${emi}/TH-ISO`,
      meta: 'cecm'
    },
    {
      title: 'TH - Pháp lý',
      desc: 'Hồ sơ pháp lý demo (không dùng dữ liệu thật)',
      url: `${emi}/TH-Legal`,
      meta: 'cecm'
    },
    {
      title: 'TH - Công nghệ',
      desc: 'Ứng dụng / hạ tầng demo',
      url: `${emi}/TH-Tech`,
      meta: 'cecm'
    },
    {
      title: 'Danh mục hồ sơ',
      desc: 'Đăng ký bộ hồ sơ + liên kết phát hành Hub',
      url: `${emi}/Lists/EMI_DEMO_DanhMucHoSo`,
      meta: 'List'
    }
  ];

  const projectDefs = [
    {
      title: 'DA — Cổng thông tin CĐS 2026',
      desc: 'Dự án chuyển đổi số cổng thông tin',
      urlName: 'DA-CDS-Portal-2026'
    },
    {
      title: 'DA — Đánh giá nội bộ ISO 2026',
      desc: 'Dự án đánh giá / cải tiến ISO',
      urlName: 'DA-ISO-DGNB-2026'
    },
    {
      title: 'DA — Hạ tầng Wi-Fi 2026',
      desc: 'Dự án hạ tầng mạng demo',
      urlName: 'DA-Infra-Wifi-2026'
    }
  ];

  const projectCards: ILinkCard[] = projectDefs.map((p) => {
    const url = `${proj}/${p.urlName}`;
    return {
      title: p.title,
      desc: p.desc,
      url,
      meta: '1 Library = 1 dự án',
      phaseUrls: phaseLinks(url)
    };
  });

  const showHub = tab === 'all' || tab === 'hub';
  const showTh = tab === 'all' || tab === 'th';
  const showProj = tab === 'all' || tab === 'projects';

  const renderCards = (cards: ILinkCard[]): React.ReactNode => (
    <div className={styles.grid}>
      {cards.map((c) => (
        <div key={c.url} className={styles.card}>
          {c.meta && <span className={styles.cardMeta}>{c.meta}</span>}
          <h3 className={styles.cardTitle}>
            <a href={c.url} target="_blank" rel="noreferrer" data-interception="off">
              {c.title}
            </a>
          </h3>
          <p className={styles.cardDesc}>{c.desc}</p>
          {c.phaseUrls && c.phaseUrls.length > 0 && (
            <div className={styles.phases}>
              {c.phaseUrls.map((ph) => (
                <a
                  key={ph.url}
                  className={styles.phaseChip}
                  href={ph.url}
                  target="_blank"
                  rel="noreferrer"
                  data-interception="off"
                >
                  {ph.label}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.root}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>EMI · SharePoint Hub</p>
        <h1>{props.title || 'EMI Hub'}</h1>
        <p>
          Xin chào{props.userDisplayName ? ` ${props.userDisplayName}` : ''}. Cổng
          truy cập tài liệu dùng chung, nghiệp vụ Phòng Tổng hợp và các dự án
          (mỗi thư viện = một dự án, 4 giai đoạn).
        </p>
      </header>

      <div className={styles.tabs} role="tablist">
        {(
          [
            ['all', 'Tất cả'],
            ['hub', 'Tài liệu dùng chung'],
            ['th', 'Phòng Tổng hợp'],
            ['projects', 'Dự án']
          ] as [TabId, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.tab}${tab === id ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {showHub && (
        <section className={styles.section}>
          <h2 className={styles.sectionHead}>1. Tài liệu dùng chung (Hub)</h2>
          <p className={styles.sectionBlurb}>
            Bản phát hành / chuẩn trên site Hub — không lẫn với hồ sơ đang soạn tại
            bộ phận.
          </p>
          {renderCards(hubCards)}
        </section>
      )}

      {showTh && (
        <section className={styles.section}>
          <h2 className={styles.sectionHead}>2. Phòng Tổng hợp (cecm)</h2>
          <p className={styles.sectionBlurb}>
            Mỗi bộ phận một thư viện riêng; quyền RBAC demo tách CĐS / ISO / Pháp lý /
            Công nghệ.
          </p>
          {renderCards(thCards)}
        </section>
      )}

      {showProj && (
        <section className={styles.section}>
          <h2 className={styles.sectionHead}>3. Dự án (DnDemo)</h2>
          <p className={styles.sectionBlurb}>
            Mở thư viện dự án, rồi làm việc trong 4 giai đoạn: Khởi tạo → Kế hoạch →
            Thực hiện → Nghiệm thu &amp; Đóng.
          </p>
          {renderCards(projectCards)}
        </section>
      )}

      <p className={styles.footnote}>
        Dữ liệu gắn nhãn demo chỉ mang tính minh họa — không có hiệu lực áp dụng.
        Trang này là web part SPFx trên{' '}
        <a href={`${hub}/SitePages/EMI-Hub.aspx`} data-interception="off">
          EMI-Hub.aspx
        </a>
        .
      </p>
    </div>
  );
};

export default EmiHubPortal;
