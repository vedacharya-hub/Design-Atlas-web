import type { MeetingRoom, RoomAvailability, RoomBooking } from './types';

interface SlotQuery {
  date: string;
  start: number;
  duration: number;
  guests: number;
}

/** Thrown when the API rejects a request; `status` 409 means the room was taken in the meantime. */
export class RoomApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new RoomApiError(data.error ?? `Request failed: ${res.status}`, res.status);
  return data as T;
}

export const meetingRoomApi = {
  getAvailability: ({ date, start, duration, guests }: SlotQuery) =>
    send<RoomAvailability>(
      `/api/meeting-rooms/availability?date=${date}&start=${start}&duration=${duration}&guests=${guests}`,
    ),

  /** Every room booking made through the API, plus the rooms they refer to. */
  getBookings: () => send<{ bookings: RoomBooking[]; rooms: MeetingRoom[] }>('/api/meeting-rooms/bookings'),

  book: (payload: SlotQuery & { roomId: string }) =>
    send<{ booking: RoomBooking; room: MeetingRoom }>('/api/meeting-rooms/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** Start times (every 30 min) at which the booking's room is free for the same duration that day. */
  getRescheduleSlots: (bookingId: string) =>
    send<{ booking: RoomBooking; room: MeetingRoom; slots: number[] }>(`/api/meeting-rooms/bookings/${bookingId}/slots`),

  cancel: (bookingId: string) =>
    send<{ booking: RoomBooking; room: MeetingRoom }>(`/api/meeting-rooms/bookings/${bookingId}`, { method: 'DELETE' }),

  /** Moves a booking to a new start time; room, date and duration stay the same. */
  reschedule: (bookingId: string, start: number) =>
    send<{ booking: RoomBooking; room: MeetingRoom }>(`/api/meeting-rooms/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start }),
    }),
};
