import { useEffect, useState } from 'react';
import styles from './AdminPage.module.css';
import { NavBar } from '../booking/NavBar';
import { bookingApi } from '../../api/bookingApi';
import { AdminMenu, type AdminMenuGroup } from './AdminMenu';
import { AnnouncementsPanel } from './announcements/AnnouncementsPanel';
import { EventsPanel } from './events/EventsPanel';
import { UsersPanel } from './users/UsersPanel';
import { SpacesPanel } from './spaces/SpacesPanel';
import { RolesPanel } from './roles/RolesPanel';
import { AccessControlPanel } from './accessControl/AccessControlPanel';
import { CompanySettingsPanel } from './company/CompanySettingsPanel';
import { CreditsPanel } from './credits/CreditsPanel';
import { CompanyBookingsPanel } from './companyBookings/CompanyBookingsPanel';
import { ComingSoonPanel } from './panels/ComingSoonPanel';
import type { Member } from '../../api/types';

export type AdminSection =
  | 'announcement'
  | 'events'
  | 'companyBookings'
  | 'users'
  | 'spaces'
  | 'roles'
  | 'accessControl'
  | 'credits'
  | 'companySettings';

/** The left menu of Figma 1580:133491; icons live in /public/admin. */
const MENU: AdminMenuGroup<AdminSection>[] = [
  {
    heading: 'ADMIN CONTROLS',
    items: [
      { id: 'announcement', label: 'Announcement', icon: 'announcement.svg' },
      { id: 'events', label: 'Events', icon: 'events.svg' },
      { id: 'companyBookings', label: 'Company Bookings', icon: 'company-bookings.svg' },
      { id: 'users', label: 'Users', icon: 'users.svg' },
      { id: 'spaces', label: 'Spaces', icon: 'spaces.svg' },
    ],
  },
  {
    heading: 'SETTINGS',
    items: [
      { id: 'roles', label: 'Roles', icon: 'roles.svg' },
      { id: 'accessControl', label: 'Access Control', icon: 'access-control.svg' },
      { id: 'credits', label: 'Credits', icon: 'credits.svg' },
      { id: 'companySettings', label: 'Company Settings', icon: 'company-settings.svg' },
    ],
  },
];

/** Sections with a canvas so far; the rest show "coming soon" until their designs arrive. */
const BUILT: AdminSection[] = ['announcement', 'events', 'companyBookings', 'users', 'spaces', 'roles', 'accessControl', 'credits', 'companySettings'];

interface Props {
  active: string;
  onTabChange: (tab: string) => void;
}

/**
 * Admin (Figma 1580:128785): the top navigation, the admin menu on the left and the canvas for the
 * selected menu item on the right.
 */
export function AdminPage({ active, onTabChange }: Props) {
  const [section, setSection] = useState<AdminSection>('announcement');
  const [user, setUser] = useState<Member | null>(null);

  useEffect(() => {
    bookingApi
      .getMembers()
      .then((list) => setUser(list.find((m) => m.isCurrentUser) ?? list[0] ?? null))
      .catch(() => setUser(null));
  }, []);

  const current = MENU.flatMap((g) => g.items).find((i) => i.id === section)!;

  return (
    <div className={styles.page}>
      <NavBar user={user} active={active} onSelect={onTabChange} />
      <div className={styles.layout}>
        <AdminMenu groups={MENU} active={section} onSelect={setSection} />
        <main className={styles.canvas} aria-label={current.label}>
          {section === 'announcement' && <AnnouncementsPanel />}
          {section === 'events' && <EventsPanel />}
          {section === 'companyBookings' && <CompanyBookingsPanel />}
          {section === 'users' && <UsersPanel />}
          {section === 'spaces' && <SpacesPanel />}
          {section === 'roles' && <RolesPanel />}
          {section === 'accessControl' && <AccessControlPanel />}
          {section === 'companySettings' && <CompanySettingsPanel />}
          {section === 'credits' && <CreditsPanel />}
          {!BUILT.includes(section) && <ComingSoonPanel title={current.label} icon={current.icon} />}
        </main>
      </div>
    </div>
  );
}
