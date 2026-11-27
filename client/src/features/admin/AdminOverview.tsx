import { useEffect, useState } from 'react';
import styles from './AdminOverview.module.css';
import { NavBar } from '../booking/NavBar';
import { bookingApi } from '../../api/bookingApi';
import { ChartPie, RadioLine, Calendar, UsersAlt } from '../../components/ui/icons';
import { BookingInsights } from './BookingInsights';
import type { ComponentType, SVGProps } from 'react';
import type { Member } from '../../api/types';

type Section = 'overview' | 'bookings' | 'attendance' | 'credits';

const MENU: { value: Section; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { value: 'overview', label: 'Overview', icon: ChartPie },
  { value: 'bookings', label: 'Bookings', icon: RadioLine },
  { value: 'attendance', label: 'Attendence', icon: Calendar },
  { value: 'credits', label: 'Credits', icon: UsersAlt },
];

const STATS = [
  { label: 'AVAILABLE CREDITS', value: '120' },
  { label: 'AVAILABLE OVERAGES', value: '420' },
  { label: 'TOTAL USED CREDITS', value: '1230' },
  { label: 'AVG MONTHLY USAGE', value: '243' },
];

interface Props {
  active: string;
  onTabChange: (tab: string) => void;
}

/** Admin "Overview Panel" — analytics landing page reached from the top-nav Analytics tab. */
export function AdminOverview({ active, onTabChange }: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [user, setUser] = useState<Member | null>(null);

  useEffect(() => {
    bookingApi.getMembers().then((list) => setUser(list.find((m) => m.isCurrentUser) ?? list[0] ?? null));
  }, []);

  return (
    <div className={styles.page}>
      <NavBar user={user} active={active} onSelect={onTabChange} />

      <div className={styles.pageMargin}>
        <aside className={styles.sidebar}>
          <span className={styles.sidebarLabel}>ADMIN CONTROLS</span>
          <nav className={styles.menu}>
            {MENU.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                className={[styles.menuItem, section === value ? styles.menuItemActive : ''].join(' ')}
                onClick={() => setSection(value)}
              >
                <Icon width={20} height={20} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className={styles.content}>
          {section === 'overview' ? (
            <>
              <div className={styles.header}>
                <div className={styles.greeting}>
                  <p className={styles.hello}>Goodmorning {user?.name.split(' ')[0] ?? ''}!</p>
                  <h1 className={styles.pageTitle}>Overview Panel</h1>
                </div>
                <BookingInsights />
              </div>

              <div className={styles.stats}>
                {STATS.map((stat) => (
                  <div key={stat.label} className={styles.statCard}>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <span className={styles.statValue}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className={styles.placeholder}>Coming soon.</p>
          )}
        </main>
      </div>
    </div>
  );
}
