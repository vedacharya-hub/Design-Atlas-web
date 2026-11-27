import { useEffect, useState } from 'react';
import styles from './HomePage.module.css';
import { NavBar } from '../booking/NavBar';
import { AccountSettingsPanel } from '../account/AccountSettingsPanel';
import { bookingApi } from '../../api/bookingApi';
import type { Member } from '../../api/types';
import { Hero } from './Hero';
import { QuickServices, UpcomingBookings, MeetingRooms } from './ServiceRails';
import { BuildingInfo } from './BuildingInfo';
import { HelpCards, Footer } from './HelpAndFooter';
import { SELECTED_BUILDING } from './selectedBuilding';

interface Props {
  active: string;
  onTabChange: (tab: string) => void;
}

/** Workplace home — Figma frame 8408:256946. */
export function HomePage({ active, onTabChange }: Props) {
  const [user, setUser] = useState<Member | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    bookingApi
      .getMembers()
      .then((members) => setUser(members.find((m) => m.isCurrentUser) ?? members[0] ?? null))
      .catch(() => setUser(null));
  }, []);

  const firstName = user?.name.split(' ')[0] ?? 'Ved';

  return (
    <div className={styles.page}>
      <NavBar user={user} active={active} onSelect={onTabChange} onAvatarClick={() => setAccountOpen(true)} />
      <main>
        <Hero firstName={firstName} company="Google" location={SELECTED_BUILDING.label} />
        <QuickServices onNavigate={onTabChange} />
        <UpcomingBookings />
        <MeetingRooms />
        <BuildingInfo />
        <HelpCards memberName={user?.name ?? 'Ved Prakash Acharya'} />
      </main>
      <Footer />
      {accountOpen && user && <AccountSettingsPanel user={user} onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
