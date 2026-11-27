import type { MyBooking } from './types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `${url} failed: ${res.status}`);
  return data as T;
}

export const myBookingsApi = {
  /** Everything the member booked, or was booked into, across the product lines. */
  list: () => req<{ bookings: MyBooking[] }>('/api/my-bookings').then((r) => r.bookings),
  /** Invites a guest to a meeting room or private office; returns the updated booking. */
  inviteGuest: (id: string, guest: { name: string; email: string }) =>
    req<MyBooking>(`/api/my-bookings/${id}/guests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(guest) }),
};
