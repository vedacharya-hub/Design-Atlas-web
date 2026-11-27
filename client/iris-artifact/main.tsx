import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/theme.css';
import './global.css';
import { installMockServer, resetMockData } from './mockServer';
import { IrisHome } from './IrisHome';
import { IrisAssistant } from '../src/features/iris/IrisAssistant';
import { clearChats } from '../src/features/iris/irisHistory';
import { BookingProvider } from '../src/features/booking/bookingMachine';
import { BookOfficeDesk } from '../src/features/booking/BookOfficeDesk';
import { bookingApi } from '../src/api/bookingApi';
import type { Member } from '../src/api/types';

// Before anything renders, so the first requests are answered in the page.
installMockServer();

const DESK_TAB = 'Book Office Desk';

/** The Iris artifact: the Iris home page, Iris itself, and the desk booking page Iris opens for "Choose seats manually". */
function IrisApp() {
  const [view, setView] = useState<'home' | 'desk'>('home');
  const [user, setUser] = useState<Member | null>(null);
  // Bumped by "Reset demo data" so Iris remounts with an empty history.
  const [session, setSession] = useState(0);

  useEffect(() => {
    bookingApi.getMembers().then(
      (members) => setUser(members.find((m) => m.isCurrentUser) ?? members[0] ?? null),
      () => setUser(null),
    );
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  function reset() {
    resetMockData();
    clearChats();
    setSession((s) => s + 1);
  }

  return (
    <>
      {view === 'home' ? (
        <IrisHome user={user} onReset={reset} />
      ) : (
        <BookingProvider>
          {/* Every other tab leads back to the Iris home. */}
          <BookOfficeDesk active={DESK_TAB} onTabChange={(tab) => tab !== DESK_TAB && setView('home')} />
        </BookingProvider>
      )}
      <IrisAssistant key={session} onOpenDeskBooking={() => setView('desk')} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<IrisApp />);
