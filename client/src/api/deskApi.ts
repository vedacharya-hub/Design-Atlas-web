import type { DeskBooking, DeskRecommendations } from './types';

/** `code` is "desk-taken" or "member-busy" for 409 conflicts. */
export class DeskApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DeskApiError(data.error ?? `Request failed: ${res.status}`, res.status, data.code);
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const deskApi = {
  getRecommendations: (dates: string[]) => send<DeskRecommendations>(`/api/desks/recommendations?dates=${dates.join(',')}`),
  getBookings: () => send<{ bookings: DeskBooking[] }>('/api/desks/bookings').then((r) => r.bookings),
  /** Days the member cancelled (they no longer hold a desk). */
  getCancelled: () => send<{ cancelled: DeskBooking[] }>('/api/desks/bookings').then((r) => r.cancelled),
  /** Books one desk for every date in one go (all or nothing). */
  book: (deskId: string, dates: string[]) =>
    send<{ bookings: DeskBooking[] }>('/api/desks/bookings', json('POST', { deskId, dates })).then((r) => r.bookings),
  reschedule: (id: string, date: string, deskId?: string) =>
    send<DeskBooking>(`/api/desks/bookings/${id}`, json('PATCH', { date, deskId })),
  cancel: (id: string) => send<DeskBooking>(`/api/desks/bookings/${id}`, json('DELETE')),
};
