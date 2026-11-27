import type { BuildingEvent } from './types';

export const eventsApi = {
  /** Events at `building` on `date` (YYYY-MM-DD), in start-time order. */
  async getEvents(building: string, date: string): Promise<BuildingEvent[]> {
    const res = await fetch(`/api/events?building=${encodeURIComponent(building)}&date=${date}`);
    if (!res.ok) throw new Error(`GET /api/events failed: ${res.status}`);
    const data = (await res.json()) as { events: BuildingEvent[] };
    return data.events;
  },
};
