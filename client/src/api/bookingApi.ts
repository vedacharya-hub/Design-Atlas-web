import type { Booking, FilterOptions, Floor, FloorZone, Member, Seat, BookingAssignment, RecurrenceRule } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const bookingApi = {
  getFilters: () => get<FilterOptions>('/api/filters'),
  getFloor: (id: string) => get<Floor>(`/api/floors/${id}`),
  getSeats: (floorId: string, zone = 'all') =>
    get<Seat[]>(`/api/floors/${floorId}/seats?zone=${encodeURIComponent(zone)}`),
  /** The zones drawn on a floor (Admin → Space Zones), with their desks and who may book them. */
  getZones: (floorId: string) => get<FloorZone[]>(`/api/floors/${floorId}/zones`),
  getMembers: (query = '') => get<Member[]>(`/api/members?query=${encodeURIComponent(query)}`),

  async createBooking(payload: {
    floorId: string;
    shift: string;
    date: string;
    mode: 'self' | 'others';
    assignments: BookingAssignment[];
    recurrence?: RecurrenceRule;
  }): Promise<Booking> {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Booking failed');
    return data as Booking;
  },
};
