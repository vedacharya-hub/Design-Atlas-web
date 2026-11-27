import type { OfficeBooking, PrivateOffice } from './types';

/** `status` 409 means the office was taken in the meantime (or is already yours that day). */
export class OfficeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new OfficeApiError(data.error ?? `Request failed: ${res.status}`, res.status);
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const officeApi = {
  /** Private offices free on every one of the dates. */
  getAvailability: (dates: string[]) =>
    send<{ dates: string[]; offices: PrivateOffice[] }>(`/api/private-offices/availability?dates=${dates.join(',')}`).then((r) => r.offices),
  getBookings: () => send<{ bookings: OfficeBooking[] }>('/api/private-offices/bookings').then((r) => r.bookings),
  /** Books one office for every date in one go (all or nothing). */
  book: (officeId: string, dates: string[]) =>
    send<{ bookings: OfficeBooking[] }>('/api/private-offices/bookings', json('POST', { officeId, dates })).then((r) => r.bookings),
  reschedule: (id: string, date: string) => send<OfficeBooking>(`/api/private-offices/bookings/${id}`, json('PATCH', { date })),
  cancel: (id: string) => send<OfficeBooking>(`/api/private-offices/bookings/${id}`, json('DELETE')),
};
