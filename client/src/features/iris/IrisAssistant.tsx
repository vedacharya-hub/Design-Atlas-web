import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import styles from './IrisAssistant.module.css';
import { ArrowUp, IrisMark } from '../../components/ui/icons';
import { bookingApi } from '../../api/bookingApi';
import type { Member } from '../../api/types';
import { respond } from './irisConversation';
import { dayCount, formatDay, formatDays, formatRange, type IrisAction, type IrisFlow, type IrisItem, type IrisTurn } from './irisShared';
import { IrisRoomCards } from './IrisRoomCards';
import { IrisEventCards } from './IrisEventCards';
import {
  IrisBookingPicker,
  IrisCalendar,
  IrisDeskOptions,
  IrisOfficeBookingPicker,
  IrisOfficeCard,
  IrisRoomBookingPicker,
  IrisRoomSlots,
  IrisSummaryCard,
} from './IrisWidgets';
import { IrisOfficeCards } from './IrisOfficeCards';
import { roomHeader } from './irisRoomBookings';
import { officeHeader } from './irisOfficeFlow';
import type { Desk, DeskBooking, MeetingRoom, OfficeBooking, PrivateOffice, RoomBooking } from '../../api/types';
import { ShaderFill } from '../../lib/custom-effect-runtime';
import { LIQUID_METAL } from './irisLiquidMetal';
import { HISTORY_LIMIT, chatPreview, chatTime, groupChats, loadChats, storeChats, type ChatMessage, type SavedChat } from './irisHistory';
import { onIrisCommand, type IrisCommand } from './irisControl';

type Mode = 'closed' | 'panel' | 'quick';
type ComposerVariant = 'panel' | 'quick';
type QuickStage = 'idle' | 'padded' | 'expanded';

interface QuickSuggestion {
  title: string;
  meta?: string;
}

const INTERACTIVE = new Set<IrisItem['kind']>(['rooms', 'calendar', 'desks', 'bookingPicker', 'roomBookingPicker', 'roomSlots', 'offices', 'officeBookingPicker', 'summary']);
type NewChatMessage = ChatMessage extends infer M ? (M extends ChatMessage ? Omit<M, 'id'> : never) : never;

const SUGGESTIONS = [
  'Book a desk at office space',
  'Book a Meeting room',
  'Book a private office',
  'Suggest nearby WeWork',
  'Upcoming Bookings',
  'Whats my attendance for the week?',
];

/** Prompts the composer's placeholder flips through while it's inactive (after the greeting). */
const PROMPT_IDEAS = [
  'Book a desk for tomorrow',
  'Book a meeting room for 4 people',
  'Book a private office for my team',
  "What's happening at office today?",
  'Show my upcoming bookings',
  'Reschedule my meeting',
];
const PROMPT_FLIP_MS = 3000;

const QUICK_SUGGESTIONS: QuickSuggestion[] = [
  { title: 'Book a desk at Office', meta: 'Private office at Google' },
  { title: 'Book a Meeting Room', meta: 'at Vaishnavi Signature' },
  { title: 'Book a Private Office' },
  { title: 'Events at Vaishnavi Signature' },
  { title: 'Request Support' },
  { title: 'Invite a Guest' },
];

const CLOSE_MS = 220;
const STAGE_MS = 240;
const SUGGEST_MIN_CHARS = 3;
const SUGGESTIONS_ID = 'iris-quick-suggestions';
/** Lines cycled by the "thinking" loader (Figma 9702:312168). */
const THINKING_LINES = ['Finding best options', 'Brewing coffee for you', 'Making sure the best one'];
const THINK_MS = 2400;
const FOLLOW_UP_MS = 1100;

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || !!el?.isContentEditable;
}

/** Global floating AI assistant. Mounted once from App.tsx so it's available on every tab. */
interface IrisAssistantProps {
  /** Opens the app's desk booking page (used by "Choose seats manually"). */
  onOpenDeskBooking?: () => void;
}

export function IrisAssistant({ onOpenDeskBooking }: IrisAssistantProps = {}) {
  const [mode, setMode] = useState<Mode>('closed');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<Member | null>(null);
  const [closing, setClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [quickStage, setQuickStage] = useState<QuickStage>('idle');
  const stageRef = useRef<QuickStage>('idle');
  const listedRef = useRef<QuickSuggestion[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const replyTimers = useRef<number[]>([]);
  const nextId = useRef(0);
  // Where a guided flow (meeting room / desk) is up to; read by the async replies.
  const flowRef = useRef<IrisFlow | null>(null);
  // Bumped on reset so replies still in flight from a closed conversation are dropped.
  const sessionRef = useRef(0);
  const [chats, setChats] = useState<SavedChat[]>(loadChats);
  // The saved conversation the thread belongs to; set when its first message is sent.
  const chatIdRef = useRef<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState(false);
  // Placeholder line on show and the one flipping away.
  const [flip, setFlip] = useState({ index: 0, prev: -1 });

  useEffect(() => {
    bookingApi
      .getMembers()
      .then((members) => setUser(members.find((m) => m.isCurrentUser) ?? members[0] ?? null))
      .catch(() => setUser(null));
  }, []);

  const firstName = user?.name.split(' ')[0] ?? 'there';

  function openPanel() {
    setMode('panel');
    // Focus the dialog rather than the input so the composer starts in its inactive state.
    requestAnimationFrame(() => panelRef.current?.focus());
  }

  // Both surfaces play their entry animation in reverse before unmounting.
  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      setMode('closed');
      setHistoryOpen(false);
      updateMessage('');
      resetChat();
    }, CLOSE_MS);
  }

  function resetChat() {
    sessionRef.current++;
    replyTimers.current.forEach((t) => clearTimeout(t));
    replyTimers.current = [];
    setMessages([]);
    setThinking(false);
    setChips([]);
    setFlow(null);
    chatIdRef.current = null;
    setChatId(null);
  }

  /** Reopens a past conversation; its cards stay locked with the answers given. */
  function openChat(chat: SavedChat) {
    resetChat();
    const restored = chat.messages.map((m) =>
      m.role === 'assistant' && INTERACTIVE.has(m.kind) ? ({ ...m, locked: true } as ChatMessage) : m,
    );
    setMessages(restored);
    nextId.current = Math.max(0, ...restored.map((m) => m.id)) + 1;
    chatIdRef.current = chat.id;
    setChatId(chat.id);
    setHistoryOpen(false);
  }

  function newChat() {
    resetChat();
    updateMessage('');
    setHistoryOpen(false);
  }

  // Every change to the thread is saved to its conversation in the history.
  useEffect(() => {
    const first = messages.find((m) => m.role === 'user');
    if (!first) return;
    let id = chatIdRef.current;
    if (!id) {
      id = `chat-${Date.now().toString(36)}`;
      chatIdRef.current = id;
      setChatId(id);
    }
    const chatKey = id;
    setChats((list) => {
      const saved = list.find((c) => c.id === chatKey);
      const now = Date.now();
      const chat: SavedChat = {
        id: chatKey,
        title: first.text,
        startedAt: saved?.startedAt ?? now,
        // Reopening a chat doesn't move it to the top; new messages do.
        updatedAt: saved && saved.messages.length === messages.length ? saved.updatedAt : now,
        messages,
      };
      return [chat, ...list.filter((c) => c.id !== chatKey)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, HISTORY_LIMIT);
    });
  }, [messages]);

  useEffect(() => storeChats(chats), [chats]);

  useEffect(() => {
    if (historyOpen) historyRef.current?.focus();
  }, [historyOpen]);

  function setFlow(next: IrisFlow | null) {
    flowRef.current = next;
  }

  useEffect(() => () => replyTimers.current.forEach((t) => clearTimeout(t)), []);

  // Keep the newest message (or the loader) in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, thinking]);

  /**
   * Adds the user's prompt, shows the loader while Iris works out (and fetches) the answer, then
   * streams the reply items in one by one. The loader stays up for at least THINK_MS.
   */
  async function ask(prompt: string, action?: IrisAction, sourceId?: number, answer: Partial<ChatMessage> = {}) {
    const session = sessionRef.current;
    const pushed = (item: NewChatMessage) =>
      setMessages((list) => [...list, { ...item, id: nextId.current++ } as ChatMessage]);
    // Freeze earlier widgets; the one that was used keeps the answer on show.
    setMessages((list) =>
      list.map((m) =>
        m.role === 'assistant' && INTERACTIVE.has(m.kind) && (!m.locked || m.id === sourceId)
          ? ({ ...m, locked: true, ...(m.id === sourceId ? answer : {}) } as ChatMessage)
          : m,
      ),
    );
    pushed({ role: 'user', kind: 'text', text: prompt });
    setChips([]);
    setThinking(true);

    const startedAt = performance.now();
    let turn: IrisTurn;
    try {
      turn = await respond({ text: prompt, action }, flowRef.current, { firstName, now: new Date() });
    } catch {
      turn = {
        items: [{ kind: 'text', text: "Sorry, I couldn't reach the booking service. Please try again." }],
        flow: flowRef.current,
      };
    }
    if (session !== sessionRef.current) return;

    setFlow(turn.flow);
    const bookedRoomId = turn.bookedRoomId;
    if (bookedRoomId) {
      setMessages((list) =>
        list.map((m) =>
          m.role === 'assistant' && m.kind === 'rooms' && m.rooms.some((r) => r.id === bookedRoomId) && !m.bookedId
            ? { ...m, bookedId: bookedRoomId }
            : m,
        ),
      );
    }
    const wait = Math.max(0, THINK_MS - (performance.now() - startedAt));
    if (turn.navigate === 'deskBooking') {
      replyTimers.current.push(window.setTimeout(openDeskBooking, wait + turn.items.length * FOLLOW_UP_MS + 600));
    }
    turn.items.forEach((item: IrisItem, i) => {
      const timer = window.setTimeout(() => {
        pushed({ role: 'assistant', ...item } as NewChatMessage);
        if (i === turn.items.length - 1) {
          setThinking(false);
          setChips(turn.chips ?? []);
        }
      }, wait + i * FOLLOW_UP_MS);
      replyTimers.current.push(timer);
    });
  }

  /** Leaves the chat for the full desk booking page; Iris closes behind it. */
  function openDeskBooking() {
    close();
    onOpenDeskBooking?.();
  }

  // Answers given through widgets in the thread: sent as a user message plus an action, and the
  // widget keeps `answer` on show once it locks.
  function act(messageId: number, text: string, action: IrisAction, answer: Partial<ChatMessage> = {}) {
    if (thinking) return;
    void ask(text, action, messageId, answer);
  }
  const selectRoom = (messageId: number, room: MeetingRoom) => act(messageId, `Book ${room.name}`, { type: 'selectRoom', roomId: room.id });
  const selectOffice = (messageId: number, office: PrivateOffice) =>
    act(messageId, `Book ${office.name}`, { type: 'selectOffice', officeId: office.id }, { picked: office.id });
  const pickOfficeBooking = (messageId: number, b: OfficeBooking) =>
    act(messageId, `${formatDay(b.date)} · ${b.office.name}`, { type: 'pickBooking', bookingId: b.id }, { picked: b.id });
  const applyDates = (messageId: number, dates: string[]) =>
    act(
      messageId,
      dates.length === 1 ? formatDay(dates[0]) : `${formatDays(dates)} (${dayCount(dates.length)})`,
      { type: 'pickDates', dates },
      { picked: dates.join(',') },
    );
  const pickDesk = (messageId: number, desk: Desk) => act(messageId, desk.id, { type: 'pickDesk', deskId: desk.id }, { picked: desk.id });
  const pickBooking = (messageId: number, b: DeskBooking) =>
    act(messageId, `${formatDay(b.date)} · ${b.deskId}`, { type: 'pickBooking', bookingId: b.id }, { picked: b.id });
  const pickRoomBooking = (messageId: number, b: RoomBooking, room?: MeetingRoom) =>
    act(messageId, `${room?.name ?? 'Meeting'} · ${formatDay(b.date)}, ${formatRange(b.start, b.end)}`, { type: 'pickBooking', bookingId: b.id }, { picked: b.id });
  const pickSlot = (messageId: number, start: number, duration: number) =>
    act(messageId, formatRange(start, start + duration), { type: 'pickSlot', start }, { picked: String(start) });

  function renderMessage(m: ChatMessage) {
    if (m.role === 'user') {
      return (
        <p key={m.id} className={[styles.bubble, styles.bubbleUser].join(' ')}>
          {m.text}
        </p>
      );
    }
    const disabled = thinking || !!m.locked;
    switch (m.kind) {
      case 'text':
        return (
          <p key={m.id} className={[styles.bubble, styles.bubbleAi].join(' ')}>
            {m.text}
          </p>
        );
      case 'events':
        return <IrisEventCards key={m.id} title={m.title} subtitle={m.subtitle} events={m.events} date={m.date} />;
      case 'rooms':
        return (
          <IrisRoomCards
            key={m.id}
            title={m.title}
            subtitle={m.subtitle}
            rooms={m.rooms}
            bookedId={m.bookedId}
            selectable={!disabled}
            onSelect={(room) => selectRoom(m.id, room)}
          />
        );
      case 'office':
        return <IrisOfficeCard key={m.id} />;
      case 'calendar':
        return (
          <IrisCalendar
            key={m.id}
            min={m.min}
            max={m.max}
            multiple={m.multiple}
            current={m.current}
            anchored={m.anchored}
            applied={m.picked ? m.picked.split(',') : undefined}
            disabled={disabled}
            onApply={(dates) => applyDates(m.id, dates)}
          />
        );
      case 'desks':
        return (
          <IrisDeskOptions
            key={m.id}
            options={m.options}
            picked={m.picked}
            disabled={disabled}
            onPick={(o) => pickDesk(m.id, o.desk)}
            onManual={openDeskBooking}
          />
        );
      case 'bookingPicker':
        return (
          <IrisBookingPicker
            key={m.id}
            purpose={m.purpose}
            bookings={m.bookings}
            cancelled={m.cancelled}
            picked={m.picked}
            disabled={disabled}
            onPick={(b) => pickBooking(m.id, b)}
          />
        );
      case 'offices':
        return (
          <IrisOfficeCards
            key={m.id}
            title={m.title}
            subtitle={m.subtitle}
            offices={m.offices}
            picked={m.picked}
            selectable={!disabled}
            onSelect={(office) => selectOffice(m.id, office)}
          />
        );
      case 'officeBookingPicker':
        return (
          <IrisOfficeBookingPicker
            key={m.id}
            bookings={m.bookings}
            header={officeHeader(m.bookings[0].office)}
            picked={m.picked}
            disabled={disabled}
            onPick={(b) => pickOfficeBooking(m.id, b)}
          />
        );
      case 'roomBookingPicker':
        return (
          <IrisRoomBookingPicker
            key={m.id}
            purpose={m.purpose}
            bookings={m.bookings}
            rooms={m.rooms}
            picked={m.picked}
            disabled={disabled}
            onPick={(b) => pickRoomBooking(m.id, b, m.rooms.find((r) => r.id === b.roomId))}
          />
        );
      case 'roomSlots':
        return (
          <IrisRoomSlots
            key={m.id}
            booking={m.booking}
            room={m.room}
            header={roomHeader(m.room)}
            slots={m.slots}
            picked={m.picked === undefined ? undefined : Number(m.picked)}
            disabled={disabled}
            onPick={(start) => pickSlot(m.id, start, m.booking.end - m.booking.start)}
          />
        );
      case 'summary': {
        const { primary, secondary } = m;
        return (
          <IrisSummaryCard
            key={m.id}
            headline={m.headline}
            header={m.header}
            title={m.title}
            rows={m.rows}
            change={m.change}
            primaryLabel={primary?.label}
            secondaryLabel={secondary?.label}
            tone={m.tone}
            chosen={m.chosen}
            disabled={disabled}
            onPrimary={() => primary && act(m.id, primary.label, primary.action, { chosen: 'primary' })}
            onSecondary={() => secondary && act(m.id, secondary.label, secondary.action, { chosen: 'secondary' })}
          />
        );
      }
    }
  }

  function updateMessage(next: string) {
    setMessage(next);
    setActiveIndex(null);
  }

  // Global shortcut: Option/Alt + Space opens the quick bar (see note to user re: Fn key).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space' && e.altKey) {
        e.preventDefault();
        setMode((m) => (m === 'closed' ? 'quick' : m));
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Commands from elsewhere in the app (irisControl). Read through a ref so they see this render's state.
  const commandRef = useRef<(command: IrisCommand) => void>(() => {});
  commandRef.current = (command) => {
    if (closingRef.current) return;
    if (command.type === 'quick') {
      if (mode === 'closed') setMode('quick');
      return;
    }
    if (mode !== 'panel') openPanel();
    if (command.type === 'chat') {
      const chat = chats.find((c) => c.id === command.chatId);
      if (chat) openChat(chat);
    } else if (command.prompt && !thinking) {
      resetChat();
      void ask(command.prompt);
    }
  };
  useEffect(() => onIrisCommand((command) => commandRef.current(command)), []);

  // The shortcut opens the quick bar ready to type: focus puts the composer straight into its active state.
  useEffect(() => {
    if (mode === 'quick') inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (historyOpen) setHistoryOpen(false);
      else close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, historyOpen]);

  // While the composer is inactive its placeholder flips from the greeting through prompt ideas.
  const promptLines = [`Hi, ${firstName}. How can I help you.`, ...PROMPT_IDEAS];
  const flipping = mode !== 'closed' && !focused && !message;
  useEffect(() => {
    if (mode !== 'closed') setFlip({ index: 0, prev: -1 });
  }, [mode]);
  useEffect(() => {
    if (!flipping) return;
    const t = setInterval(() => setFlip((f) => ({ index: (f.index + 1) % promptLines.length, prev: f.index })), PROMPT_FLIP_MS);
    return () => clearInterval(t);
  }, [flipping, promptLines.length]);

  function handleSend(text: string = message) {
    const prompt = text.trim();
    // One question at a time: Enter is ignored (and the draft kept) while Iris is answering.
    if (!prompt || thinking) return;
    if (mode === 'quick') {
      setMode('panel');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    void ask(prompt);
    updateMessage('');
  }

  function sendSuggestion(text: string) {
    handleSend(text);
    inputRef.current?.focus();
  }

  const chatting = messages.length > 0;

  const hasText = message.trim().length > 0;
  const query = message.trim().toLowerCase();
  const showSuggestions = mode === 'quick' && query.length >= SUGGEST_MIN_CHARS;
  const suggestionsOpen = showSuggestions && quickStage === 'expanded';
  const matching = showSuggestions ? QUICK_SUGGESTIONS.filter((s) => s.title.toLowerCase().includes(query)) : [];
  const ranked = showSuggestions ? [...matching, ...QUICK_SUGGESTIONS.filter((s) => !matching.includes(s))] : [];
  const highlighted = suggestionsOpen ? activeIndex ?? (matching.length > 0 ? 0 : -1) : -1;
  const activeSuggestion = highlighted >= 0 ? ranked[highlighted] : null;
  const ghost =
    activeSuggestion && activeSuggestion.title.toLowerCase().startsWith(message.toLowerCase())
      ? activeSuggestion.title.slice(message.length)
      : '';

  // Keep the last list on screen while it collapses, so it shrinks away instead of vanishing.
  if (showSuggestions) listedRef.current = ranked;
  const listed = quickStage === 'expanded' || (quickStage === 'padded' && !showSuggestions) ? listedRef.current : [];

  function goToStage(next: QuickStage) {
    stageRef.current = next;
    setQuickStage(next);
  }

  // Frame by frame: the bar first grows 12px of padding on every side, then opens the
  // suggestions. Dropping below the threshold plays the same frames in reverse.
  useEffect(() => {
    if (mode !== 'quick') {
      goToStage('idle');
      return;
    }
    const target: QuickStage = showSuggestions ? 'expanded' : 'idle';
    if (stageRef.current === target) return;
    goToStage('padded');
    const t = setTimeout(() => goToStage(target), STAGE_MS);
    return () => clearTimeout(t);
  }, [mode, showSuggestions]);

  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    // Tab takes the prompt idea the placeholder stopped on.
    if (e.key === 'Tab' && !message && flip.index > 0) {
      e.preventDefault();
      updateMessage(promptLines[flip.index]);
      return;
    }
    if (suggestionsOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((highlighted + 1) % ranked.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(highlighted <= 0 ? ranked.length - 1 : highlighted - 1);
        return;
      }
      if (e.key === 'Tab' && activeSuggestion && ghost) {
        e.preventDefault();
        updateMessage(activeSuggestion.title);
        return;
      }
      if (e.key === 'Enter' && activeSuggestion) {
        e.preventDefault();
        handleSend(activeSuggestion.title);
        return;
      }
    }
    if (e.key === 'Enter') handleSend();
  }

  function renderSuggestionTitle(title: string) {
    const at = title.toLowerCase().indexOf(query);
    if (at < 0) return title;
    return (
      <>
        {title.slice(0, at)}
        <span className={styles.quickSuggestionMatch}>{title.slice(at, at + query.length)}</span>
        {title.slice(at + query.length)}
      </>
    );
  }

  /** Drawer of previous conversations, opened from the header's list button. */
  function renderHistory() {
    const now = Date.now();
    return (
      <>
        <div className={styles.historyScrim} onMouseDown={() => setHistoryOpen(false)} aria-hidden="true" />
        <aside id="iris-history" ref={historyRef} tabIndex={-1} className={styles.history} aria-label="Previous chats">
          <div className={styles.historyHead}>
            <h3 className={styles.historyTitle}>Previous chats</h3>
            <button type="button" className={styles.historyNew} onClick={newChat}>
              <img src="/iris/add.svg" alt="" width={16} height={16} />
              New chat
            </button>
          </div>
          {chats.length === 0 ? (
            <p className={styles.historyEmpty}>No previous chats yet. Your conversations with Iris will show up here.</p>
          ) : (
            <div className={styles.historyGroups}>
              {groupChats(chats, now).map((group) => (
                <section key={group.label} className={styles.historyGroup}>
                  <h4 className={styles.historyGroupLabel}>{group.label}</h4>
                  <ul className={styles.historyList}>
                    {group.chats.map((chat) => {
                      const current = chat.id === chatId;
                      return (
                        <li key={chat.id}>
                          <button
                            type="button"
                            className={[styles.historyItem, current ? styles.historyItemCurrent : ''].join(' ').trim()}
                            aria-current={current || undefined}
                            onClick={() => (current ? setHistoryOpen(false) : openChat(chat))}
                          >
                            <span className={styles.historyItemTop}>
                              <span className={styles.historyItemTitle}>{chat.title}</span>
                              <span className={styles.historyItemTime}>{chatTime(chat, now)}</span>
                            </span>
                            <span className={styles.historyItemPreview}>{chatPreview(chat)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </aside>
      </>
    );
  }

  // Iris mark filled with the Figma "Liquid Metal" shader; the plain mark underneath shows until WebGPU paints.
  function renderMarkGlyph() {
    return (
      <div className={styles.panelMarkGlyph}>
        <IrisMark className={styles.panelMarkFallback} />
        <ShaderFill shader={LIQUID_METAL} mask='url("/iris/iris-mark.svg")' className={styles.panelMarkShader} />
      </div>
    );
  }

  /** The placeholder, drawn over the input so it can flip from one line to the next. */
  function renderPlaceholder() {
    if (message) return null;
    const idea = flip.index > 0;
    return (
      <span className={styles.flipPlaceholder} aria-hidden="true">
        {flip.prev >= 0 && (
          <span key={`out-${flip.index}`} className={[styles.flipLine, styles.flipOut].join(' ')}>
            {promptLines[flip.prev]}
          </span>
        )}
        <span key={`in-${flip.index}`} className={[styles.flipLine, flip.prev >= 0 ? styles.flipIn : ''].join(' ').trim()}>
          <span className={styles.flipText}>{promptLines[flip.index]}</span>
          {focused && idea && <kbd className={styles.flipKey}>Tab</kbd>}
        </span>
      </span>
    );
  }

  function renderComposer(variant: ComposerVariant) {
    const isQuick = variant === 'quick';
    const input = (
      <input
        ref={inputRef}
        className={styles.composerInput}
        value={message}
        onChange={(e) => updateMessage(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Message Iris"
        placeholder={promptLines[0]}
        role={isQuick ? 'combobox' : undefined}
        aria-expanded={isQuick ? suggestionsOpen : undefined}
        aria-controls={isQuick && suggestionsOpen ? SUGGESTIONS_ID : undefined}
        aria-activedescendant={isQuick && highlighted >= 0 ? `${SUGGESTIONS_ID}-${highlighted}` : undefined}
      />
    );

    return (
      <div className={[styles.composerWrap, !isQuick ? styles.composerDissolve : ''].join(' ').trim()}>
        <div className={styles.composer}>
          <button type="button" className={styles.composerPlus} aria-label="Add attachment">
            <img src="/iris/add.svg" alt="" width={20} height={20} />
          </button>
          {isQuick ? (
            <div className={styles.quickField}>
              {renderPlaceholder()}
              {input}
              {ghost && (
                <span className={styles.quickGhost} aria-hidden="true">
                  <span className={styles.quickGhostTyped}>{message}</span>
                  {ghost}
                </span>
              )}
            </div>
          ) : (
            <div className={styles.quickField}>
              {renderPlaceholder()}
              {input}
            </div>
          )}
          <button
            type="button"
            className={styles.composerSend}
            aria-label={hasText ? 'Send' : 'Voice input'}
            onClick={() => handleSend()}
          >
            {hasText ? (
              <ArrowUp width={20} height={20} />
            ) : (
              <img src="/iris/audio-lines.svg" alt="" width={20} height={20} />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {mode === 'closed' && (
        <button type="button" className={styles.fab} aria-label="Open Iris AI assistant" onClick={openPanel}>
          <IrisMark width={24} height={24} />
        </button>
      )}

      {mode === 'panel' && (
        <div className={[styles.overlay, closing ? styles.overlayOut : ''].join(' ').trim()} onMouseDown={close}>
          <div
            ref={panelRef}
            tabIndex={-1}
            className={[styles.panel, chatting ? styles.panelChat : '', closing ? styles.panelOut : '']
              .join(' ')
              .trim()}
            role="dialog"
            aria-modal="true"
            aria-label="Iris AI assistant"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {chatting && <div className={styles.chatFade} aria-hidden="true" />}
            <div className={styles.panelHeader}>
              <button
                type="button"
                className={[styles.panelIconBtn, historyOpen ? styles.panelIconBtnOn : ''].join(' ').trim()}
                aria-label="Previous chats"
                aria-expanded={historyOpen}
                aria-controls="iris-history"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <img src="/iris/list.svg" alt="" width={20} height={20} />
              </button>
              {chatting && (
                <div className={[styles.headerMark, thinking ? styles.headerMarkThinking : ''].join(' ').trim()}>
                  {renderMarkGlyph()}
                </div>
              )}
              <button type="button" className={styles.panelIconBtn} aria-label="Close Iris" onClick={close}>
                <img src="/iris/close.svg" alt="" width={20} height={20} />
              </button>
            </div>

            {chatting ? (
              <div ref={threadRef} className={styles.thread} role="log" aria-label="Conversation with Iris">
                {messages.map(renderMessage)}
                {thinking && (
                  <div className={styles.thinking} role="status">
                    <span className={styles.srOnly}>Iris is thinking</span>
                    <div className={styles.thinkingTrack} aria-hidden="true">
                      {[...THINKING_LINES, THINKING_LINES[0]].map((line, i) => (
                        <span key={i} className={styles.thinkingLine}>
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.panelBody}>
                <div className={styles.panelIntro}>
                  <div className={styles.panelMark}>{renderMarkGlyph()}</div>
                  <div className={styles.panelGreeting}>
                    <h2 className={styles.greeting}>Hi {firstName}!</h2>
                    <p className={styles.greetingSub}>Ask me about WeWork spaces, I am here to help you.</p>
                  </div>
                </div>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className={styles.suggestionBtn} onClick={() => sendSuggestion(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatting && chips.length > 0 && (
              <div className={styles.chips} role="group" aria-label="Suggested replies">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={[styles.suggestionBtn, styles.chip].join(' ')}
                    onClick={() => sendSuggestion(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {renderComposer('panel')}

            {historyOpen && renderHistory()}
          </div>
        </div>
      )}

      {mode === 'quick' && (
        <>
          <div className={styles.quickCatcher} onMouseDown={close} />
          <div
            className={[
              styles.quickBar,
              quickStage === 'padded' ? styles.quickBarPadded : '',
              quickStage === 'expanded' ? styles.quickBarExpanded : '',
              closing ? styles.quickBarOut : '',
            ]
              .join(' ')
              .trim()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.quickSuggestionsWrap} aria-hidden={!suggestionsOpen}>
              <div className={styles.quickSuggestionsInner}>
                {listed.length > 0 && (
                  <ul id={SUGGESTIONS_ID} role="listbox" aria-label="Suggestions" className={styles.quickSuggestions}>
                    {listed.map((s, i) => (
                      <li
                        key={s.title}
                        id={`${SUGGESTIONS_ID}-${i}`}
                        role="option"
                        aria-selected={i === highlighted}
                        className={[styles.quickSuggestion, i === highlighted ? styles.quickSuggestionActive : '']
                          .join(' ')
                          .trim()}
                        style={{ '--i': i } as CSSProperties}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => handleSend(s.title)}
                      >
                        <span className={styles.quickSuggestionTitle}>{renderSuggestionTitle(s.title)}</span>
                        {s.meta && <span className={styles.quickSuggestionMeta}>{s.meta}</span>}
                        <img src="/iris/arrow-forward.svg" alt="" width={24} height={24} className={styles.quickSuggestionArrow} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className={styles.quickBarComposer}>
              {renderComposer('quick')}
            </div>
          </div>
        </>
      )}
    </>
  );
}
