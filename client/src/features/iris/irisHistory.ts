/* Iris conversations, kept in this browser for the history drawer (and anything else that lists them). */
import type { IrisItem } from './irisShared';

/**
 * A thread entry. Iris's interactive items (room/desk choices, calendar, summary) lock once the user
 * answers or moves on, and remember the answer (`picked` date/desk, `chosen` button, `bookedId`).
 */
export type ChatMessage =
  | { id: number; role: 'user'; kind: 'text'; text: string }
  | ({ id: number; role: 'assistant'; locked?: boolean; picked?: string; chosen?: 'primary' | 'secondary'; bookedId?: string } & IrisItem);

/** A past conversation. */
export interface SavedChat {
  id: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const HISTORY_KEY = 'iris.chats.v1';
export const HISTORY_LIMIT = 20;
/** Fired on `window` whenever the saved history changes. */
export const IRIS_HISTORY_EVENT = 'iris:history';

export function loadChats(): SavedChat[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(list) ? (list as SavedChat[]) : [];
  } catch {
    return [];
  }
}

export function storeChats(chats: SavedChat[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
  } catch {
    // Private mode or full storage: history just doesn't persist.
  }
  window.dispatchEvent(new Event(IRIS_HISTORY_EVENT));
}

export function clearChats() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing stored, or storage is blocked.
  }
  window.dispatchEvent(new Event(IRIS_HISTORY_EVENT));
}

const startOfDay = (t: number) => new Date(new Date(t).toDateString()).getTime();

/** Today / Yesterday / Earlier, newest first. */
export function groupChats(chats: SavedChat[], now: number) {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const groups: { label: string; chats: SavedChat[] }[] = [
    { label: 'Today', chats: [] },
    { label: 'Yesterday', chats: [] },
    { label: 'Earlier', chats: [] },
  ];
  for (const chat of chats) {
    const day = startOfDay(chat.updatedAt);
    groups[day >= today ? 0 : day >= yesterday ? 1 : 2].chats.push(chat);
  }
  return groups.filter((g) => g.chats.length > 0);
}

export function chatTime(chat: SavedChat, now: number) {
  const d = new Date(chat.updatedAt);
  if (startOfDay(chat.updatedAt) === startOfDay(now)) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase();
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Iris's last plain-text reply, for the history preview. */
export function chatPreview(chat: SavedChat) {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    if (m.role === 'assistant' && m.kind === 'text') return m.text;
  }
  return '';
}
