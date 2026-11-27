import { useState } from 'react';
import { BookingProvider } from './features/booking/bookingMachine';
import { BookOfficeDesk } from './features/booking/BookOfficeDesk';
import { AdminPage } from './features/admin/AdminPage';
import { AdminOverview } from './features/admin/AdminOverview';
import { HomePage } from './features/home/HomePage';
import { MyBookingsPage } from './features/myBookings/MyBookingsPage';
import { IrisAi } from './features/irisAi/IrisAi';
import { ToastProvider } from './features/admin/Toaster';
import { BulkUploadProvider } from './features/admin/users/bulk/BulkUploadProvider';

export default function App() {
  const [tab, setTab] = useState('Home');

  let page;
  if (tab === 'Home') {
    page = <HomePage active={tab} onTabChange={setTab} />;
  } else if (tab === 'Admin') {
    page = <AdminPage active={tab} onTabChange={setTab} />;
  } else if (tab === 'My Bookings') {
    page = <MyBookingsPage active={tab} onTabChange={setTab} />;
  } else if (tab === 'Analytics') {
    page = <AdminOverview active={tab} onTabChange={setTab} />;
  } else {
    page = (
      <BookingProvider>
        <BookOfficeDesk active={tab} onTabChange={setTab} />
      </BookingProvider>
    );
  }

  // Toasts and bulk uploads live above the pages, so an upload keeps its progress bar (and its
  // closing toast) when the admin moves to another page.
  return (
    <ToastProvider>
      <BulkUploadProvider>
        {page}
        <IrisAi />
      </BulkUploadProvider>
    </ToastProvider>
  );
}
