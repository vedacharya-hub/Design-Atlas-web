import type { CSSProperties } from 'react';
import styles from './NavBar.module.css';
import { Avatar } from '../../components/ui/Avatar';
import type { Member } from '../../api/types';

const navAsset = (file: string) => `/nav/${file}`;

interface TabConfig {
  key: string;
  label: string;
  icon?: string;
  dropdown?: boolean;
}

const TABS: TabConfig[] = [
  { key: 'Home', label: 'Home', icon: 'home.svg' },
  { key: 'Book Office Desk', label: 'Book Services', icon: 'money.svg', dropdown: true },
  { key: 'My Bookings', label: 'My Bookings', icon: 'book.svg' },
  { key: 'Favourites', label: 'Favourites', icon: 'favorite-filled.svg' },
  { key: 'Manage Guests', label: 'Manage Guests', icon: 'people-connect.svg' },
  { key: 'Print', label: 'Print', icon: 'print-bw.svg' },
  { key: 'Events', label: 'Events', icon: 'event.svg' },
  { key: 'Support', label: 'Support', icon: 'customer-service.svg' },
  { key: 'Analytics', label: 'Analytics', icon: 'staircase.svg' },
  { key: 'Admin', label: 'Admin', icon: 'wework.svg' },
];

interface Props {
  user: Member | null;
  active: string;
  onSelect: (tab: string) => void;
  onAvatarClick?: () => void;
}

/** A tab icon drawn in the tab's text colour: grey, then near-black when hovered or active (as in Figma). */
function TabIcon({ file }: { file: string }) {
  return <span className={styles.tabIcon} style={{ '--icon': `url("${navAsset(file)}")` } as CSSProperties} aria-hidden="true" />;
}

/** Top navigation shell. "Book Office Desk" and "Admin" are wired up; the rest are static placeholders. */
export function NavBar({ user, active, onSelect, onAvatarClick }: Props) {
  return (
    <header className={styles.nav}>
      <div className={styles.top}>
        <button className={styles.back}>
          <img src={navAsset('arrow-left.svg')} width={20} height={20} alt="" />
          Back to WeWork
        </button>
        <img className={styles.logo} src={navAsset('wework-logo.svg')} width={137} height={28} alt="WeWork" />
        <div className={styles.actions}>
          <span className={styles.pill}>
            <img src={navAsset('wifi.svg')} width={24} height={24} alt="" /> WiFi
          </span>
          <span className={styles.pill}>
            <img src={navAsset('pass.svg')} width={24} height={24} alt="" /> Keycard
          </span>
          <button className={styles.iconBtn} aria-label="Notifications">
            <img src={navAsset('notification.svg')} width={24} height={24} alt="" />
          </button>
          {user && (
            <button className={styles.avatarBtn} onClick={onAvatarClick} aria-label="Account settings">
              <Avatar name={user.name} color={user.avatarColor} size={32} />
              <span className={styles.avatarIndicator}>
                <img src={navAsset('checkmark.svg')} width={10} height={10} alt="" />
              </span>
            </button>
          )}
        </div>
      </div>
      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={[styles.tab, t.key === active ? styles.tabActive : ''].join(' ')}
            onClick={() => onSelect(t.key)}
          >
            {t.icon && <TabIcon file={t.icon} />}
            <span>{t.label.toUpperCase()}</span>
            {t.dropdown && <TabIcon file="chevron-down.svg" />}
          </button>
        ))}
      </nav>
    </header>
  );
}
