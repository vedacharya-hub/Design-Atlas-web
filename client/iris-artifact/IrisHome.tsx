import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import styles from './IrisHome.module.css';
import { IrisMark } from '../src/components/ui/icons';
import { ShaderFill } from '../src/lib/custom-effect-runtime';
import { LIQUID_METAL } from '../src/features/iris/irisLiquidMetal';
import { openIris, openIrisChat, openQuickIris } from '../src/features/iris/irisControl';
import { IRIS_HISTORY_EVENT, chatPreview, chatTime, loadChats, type SavedChat } from '../src/features/iris/irisHistory';
import { dateKey, formatRange, formatTime, fromDateKey } from '../src/features/iris/irisShared';
import { SELECTED_BUILDING } from '../src/features/home/selectedBuilding';
import { asset } from '../src/features/home/asset';
import { meetingRoomApi } from '../src/api/meetingRoomApi';
import { deskApi } from '../src/api/deskApi';
import { officeApi } from '../src/api/officeApi';
import { eventsApi } from '../src/api/eventsApi';
import type { BuildingEvent, Member } from '../src/api/types';
import { IRIS_DATA_EVENT } from './mockServer';

// ---------- icons (20px, drawn in the text colour) ----------
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const DeskIcon = () => (
  <Icon>
    <rect x="6" y="3" width="8" height="5.5" rx="1" />
    <path d="M10 8.5V11M3 11h14M5 11v6M15 11v6" />
  </Icon>
);
const RoomIcon = () => (
  <Icon>
    <rect x="5.5" y="7" width="9" height="6" rx="1.5" />
    <path d="M8 4.5h4M8 15.5h4M3 9v2M17 9v2" />
  </Icon>
);
const OfficeIcon = () => (
  <Icon>
    <path d="M5 17V4.5C5 3.7 5.7 3 6.5 3h7c.8 0 1.5.7 1.5 1.5V17M3 17h14M12 10v.5" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
    <path d="M3 8.5h14M7 3v3M13 3v3" />
  </Icon>
);
const RescheduleIcon = () => (
  <Icon>
    <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3h-3M10 7v3.2l2 1.3" />
  </Icon>
);
const CancelIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="7" />
    <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
  </Icon>
);
const EventIcon = () => (
  <Icon>
    <path d="M10 3l1.8 4.2L16 9l-4.2 1.8L10 15l-1.8-4.2L4 9l4.2-1.8z" />
  </Icon>
);
const PinIcon = () => (
  <Icon>
    <path d="M10 17s5-4.6 5-8.5a5 5 0 0 0-10 0C5 12.4 10 17 10 17z" />
    <circle cx="10" cy="8.5" r="1.8" />
  </Icon>
);
const ChartIcon = () => (
  <Icon>
    <path d="M4 16V10M8 16V5M12 16v-7M16 16V7" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon>
    <path d="M5 10h10M11 6l4 4-4 4" />
  </Icon>
);
const SendIcon = () => (
  <Icon>
    <path d="M10 16V4M5 9l5-5 5 5" />
  </Icon>
);

// ---------- what Iris can do ----------
interface Capability {
  title: string;
  /** Sent to Iris as the first message. */
  prompt: string;
  icon: ReactNode;
}

const CAPABILITIES: { label: string; blurb: string; items: Capability[] }[] = [
  {
    label: 'Book',
    blurb: 'Iris checks what’s free and books it in the chat.',
    items: [
      { title: 'A desk in your office', prompt: 'Book a desk at my office', icon: <DeskIcon /> },
      { title: 'A meeting room', prompt: 'Book a meeting room', icon: <RoomIcon /> },
      { title: 'A private office', prompt: 'Book a private office', icon: <OfficeIcon /> },
    ],
  },
  {
    label: 'Manage',
    blurb: 'Change plans without opening a booking page.',
    items: [
      { title: 'Your upcoming bookings', prompt: 'Show my upcoming bookings', icon: <CalendarIcon /> },
      { title: 'Reschedule a booking', prompt: 'Reschedule a booking', icon: <RescheduleIcon /> },
      { title: 'Cancel a booking', prompt: 'Cancel my booking', icon: <CancelIcon /> },
    ],
  },
  {
    label: 'Discover',
    blurb: 'Answers about your building and your week.',
    items: [
      { title: 'What’s on in the building', prompt: "What's happening at my building today?", icon: <EventIcon /> },
      { title: 'Nearby WeWork buildings', prompt: 'Suggest nearby WeWork buildings', icon: <PinIcon /> },
      { title: 'Your attendance this week', prompt: "What's my attendance this week?", icon: <ChartIcon /> },
    ],
  },
];

/** Lines the composer's placeholder cycles through. */
const PROMPT_IDEAS = ['Book a meeting room for 4 people', 'Book a desk at my office', 'Show my upcoming bookings', "What's happening at my building today?"];

// ---------- coming up ----------
interface Upcoming {
  key: string;
  kind: 'Desk' | 'Meeting room' | 'Private office';
  title: string;
  detail: string;
  date: string;
  /** Minutes from midnight; all-day bookings sort first. */
  start: number;
  when: string;
  photo?: string;
  reschedule: string;
  cancel: string;
}

function dayLabel(key: string, now: Date) {
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  return fromDateKey(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function loadUpcoming(now: Date): Promise<Upcoming[]> {
  const today = dateKey(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [{ bookings: rooms, rooms: roomList }, desks, offices] = await Promise.all([meetingRoomApi.getBookings(), deskApi.getBookings(), officeApi.getBookings()]);
  const items: Upcoming[] = [
    ...desks
      .filter((b) => b.date >= today)
      .map((b) => ({
        key: b.id,
        kind: 'Desk' as const,
        title: `Desk ${b.deskId}`,
        detail: `${b.desk.zone} · ${b.desk.floorLabel}`,
        date: b.date,
        start: 0,
        when: `${dayLabel(b.date, now)} · All day`,
        reschedule: 'Reschedule my desk booking',
        cancel: 'Cancel my desk booking',
      })),
    ...rooms
      .filter((b) => b.date > today || (b.date === today && b.end > minutes))
      .map((b) => {
        const room = roomList.find((r) => r.id === b.roomId);
        return {
          key: b.id,
          kind: 'Meeting room' as const,
          title: room?.name ?? 'Meeting room',
          detail: `${room?.floorLabel ?? ''} · ${b.guests} ${b.guests === 1 ? 'person' : 'people'}`,
          date: b.date,
          start: b.start,
          when: `${dayLabel(b.date, now)} · ${formatRange(b.start, b.end)}`,
          photo: room ? asset(room.photo) : undefined,
          reschedule: 'Reschedule my meeting',
          cancel: 'Cancel my meeting',
        };
      }),
    ...offices
      .filter((b) => b.date >= today)
      .map((b) => ({
        key: b.id,
        kind: 'Private office' as const,
        title: b.office.name,
        detail: `${b.office.floorLabel} · Up to ${b.office.capacity} people`,
        date: b.date,
        start: 0,
        when: `${dayLabel(b.date, now)} · All day`,
        photo: asset(b.office.photo),
        reschedule: 'Reschedule my private office',
        cancel: 'Cancel my private office booking',
      })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const OPTION_KEY = isMac ? '⌥' : 'Alt';

function Keys({ dark = false }: { dark?: boolean }) {
  return (
    <span className={[styles.keys, dark ? styles.keysDark : ''].join(' ').trim()} aria-label={`${isMac ? 'Option' : 'Alt'} + Space`}>
      <kbd>{OPTION_KEY}</kbd>
      <kbd>Space</kbd>
    </span>
  );
}

interface Props {
  user: Member | null;
  onReset: () => void;
}

/** Iris home: start any Iris task, see what's booked and what's on, and learn the Quick Iris shortcut. */
export function IrisHome({ user, onReset }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState('');
  const [idea, setIdea] = useState(0);
  const [upcoming, setUpcoming] = useState<Upcoming[] | null>(null);
  const [events, setEvents] = useState<BuildingEvent[] | null>(null);
  const [chats, setChats] = useState<SavedChat[]>(loadChats);
  const [confirmReset, setConfirmReset] = useState(false);

  const firstName = user?.name.split(' ')[0] ?? 'there';
  const initials = user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('') ?? '';

  useEffect(() => {
    const load = () => {
      const at = new Date();
      setNow(at);
      loadUpcoming(at).then(setUpcoming, () => setUpcoming([]));
      eventsApi.getEvents(SELECTED_BUILDING.name, dateKey(at)).then(setEvents, () => setEvents([]));
    };
    load();
    window.addEventListener(IRIS_DATA_EVENT, load);
    // Keeps "on now" and the greeting current.
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.removeEventListener(IRIS_DATA_EVENT, load);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setChats(loadChats());
    window.addEventListener(IRIS_HISTORY_EVENT, refresh);
    return () => window.removeEventListener(IRIS_HISTORY_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (draft) return;
    const t = setInterval(() => setIdea((i) => (i + 1) % PROMPT_IDEAS.length), 3200);
    return () => clearInterval(t);
  }, [draft]);

  function ask(e: FormEvent) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt) return;
    openIris(prompt);
    setDraft('');
  }

  const minutes = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(now);
  const bookedToday = upcoming?.filter((b) => b.date === todayKey).length ?? 0;
  const liveEvents = events?.filter((e) => e.start <= minutes && minutes < e.end).length ?? 0;
  const laterEvents = events?.filter((e) => e.start > minutes).length ?? 0;
  const dateLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.topInner}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <IrisMark width={18} height={18} />
            </span>
            <span className={styles.brandName}>Iris</span>
            <span className={styles.brandNote}>Workplace assistant</span>
          </div>
          <div className={styles.topActions}>
            <span className={styles.building}>
              <PinIcon />
              {SELECTED_BUILDING.name}
            </span>
            <button type="button" className={styles.quickBtn} onClick={openQuickIris}>
              Quick Iris
              <Keys />
            </button>
            <span className={styles.avatar} style={{ background: user?.avatarColor ?? '#3659f5' }} aria-label={user?.name}>
              {initials}
            </span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="iris-greeting">
          <div className={styles.heroMain}>
            <div className={styles.heroMark}>
              <IrisMark className={styles.heroMarkFallback} />
              <ShaderFill shader={LIQUID_METAL} mask='url("/iris/iris-mark.svg")' className={styles.heroMarkShader} />
            </div>
            <p className={styles.eyebrow}>{dateLine}</p>
            <h1 id="iris-greeting" className={styles.greeting}>
              {greeting(now)}, {firstName}.
            </h1>
            <p className={styles.lede}>Ask me to book a desk, a meeting room or a private office at {SELECTED_BUILDING.name}, or to change something you’ve already booked.</p>

            <form className={styles.composer} onSubmit={ask}>
              <label htmlFor="iris-home-ask" className={styles.srOnly}>
                Ask Iris
              </label>
              <input
                id="iris-home-ask"
                className={styles.composerInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Tab takes the idea on show.
                  if (e.key === 'Tab' && !draft) {
                    e.preventDefault();
                    setDraft(PROMPT_IDEAS[idea]);
                  }
                }}
                placeholder={`Try “${PROMPT_IDEAS[idea]}”`}
                autoComplete="off"
              />
              <button type="submit" className={styles.composerSend} aria-label="Ask Iris" disabled={!draft.trim()}>
                <SendIcon />
              </button>
            </form>

            <p className={styles.status}>
              <span>{upcoming === null ? 'Checking your bookings…' : bookedToday ? `${bookedToday} booking${bookedToday === 1 ? '' : 's'} today` : 'Nothing booked today'}</span>
              {events !== null && (
                <span>
                  {liveEvents ? `${liveEvents} event on now` : laterEvents ? `${laterEvents} more event${laterEvents === 1 ? '' : 's'} today` : 'No more events today'}
                </span>
              )}
            </p>
          </div>

          <aside className={styles.quick} aria-labelledby="quick-iris-title">
            <p className={styles.quickLabel}>Quick Iris</p>
            <span className={styles.forKeyboard}>
              <Keys dark />
            </span>
            <h2 id="quick-iris-title" className={styles.quickTitle}>
              Ask from any page
            </h2>
            <p className={styles.quickText}>
              <span className={styles.forKeyboard}>
                Press {isMac ? 'Option' : 'Alt'} + Space and a bar opens where you are. Type three letters and Iris suggests the rest; Tab accepts it.
              </span>
              <span className={styles.forTouch}>Tap Quick Iris and a bar opens over the page. Type three letters and Iris suggests the rest.</span>
            </p>
            <div className={styles.quickDemo} aria-hidden="true">
              <span className={styles.quickDemoTyped}>Book a me</span>
              <span className={styles.quickDemoCaret} />
              <span className={styles.quickDemoGhost}>eting Room</span>
            </div>
            <button type="button" className={styles.quickTry} onClick={openQuickIris}>
              Try Quick Iris
              <ArrowIcon />
            </button>
          </aside>
        </section>

        <section className={styles.section} aria-labelledby="can-do-title">
          <div className={styles.sectionHead}>
            <h2 id="can-do-title" className={styles.sectionTitle}>
              What Iris can do
            </h2>
            <p className={styles.sectionNote}>Each one opens a conversation with Iris.</p>
          </div>
          <div className={styles.capabilities}>
            {CAPABILITIES.map((group) => (
              <div key={group.label} className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupLabel}>{group.label}</h3>
                  <p className={styles.groupBlurb}>{group.blurb}</p>
                </div>
                <ul className={styles.capList}>
                  {group.items.map((c) => (
                    <li key={c.title}>
                      <button type="button" className={styles.cap} onClick={() => openIris(c.prompt)}>
                        <span className={styles.capIcon}>{c.icon}</span>
                        <span className={styles.capText}>
                          <span className={styles.capTitle}>{c.title}</span>
                          <span className={styles.capPrompt}>“{c.prompt}”</span>
                        </span>
                        <span className={styles.capArrow}>
                          <ArrowIcon />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="coming-up-title">
            <div className={styles.panelHead}>
              <h2 id="coming-up-title" className={styles.panelTitle}>
                Coming up
              </h2>
              {upcoming && upcoming.length > 0 && (
                <button type="button" className={styles.textBtn} onClick={() => openIris('Show my upcoming bookings')}>
                  Ask Iris for all
                </button>
              )}
            </div>
            {upcoming === null ? (
              <p className={styles.empty}>Loading your bookings…</p>
            ) : upcoming.length === 0 ? (
              <div className={styles.emptyBlock}>
                <p className={styles.empty}>Nothing booked yet.</p>
                <div className={styles.emptyActions}>
                  <button type="button" className={styles.chip} onClick={() => openIris('Book a desk at my office')}>
                    Book a desk
                  </button>
                  <button type="button" className={styles.chip} onClick={() => openIris('Book a meeting room')}>
                    Book a meeting room
                  </button>
                </div>
              </div>
            ) : (
              <ul className={styles.rows}>
                {upcoming.slice(0, 4).map((b) => (
                  <li key={b.key} className={styles.booking}>
                    {b.photo ? (
                      <img className={styles.thumb} src={b.photo} alt="" />
                    ) : (
                      <span className={[styles.thumb, styles.thumbIcon].join(' ')}>
                        <DeskIcon />
                      </span>
                    )}
                    <div className={styles.bookingText}>
                      <span className={styles.kind}>{b.kind}</span>
                      <span className={styles.rowTitle}>{b.title}</span>
                      <span className={styles.rowMeta}>
                        {b.when} · {b.detail}
                      </span>
                    </div>
                    <div className={styles.bookingActions}>
                      <button type="button" className={styles.textBtn} onClick={() => openIris(b.reschedule)}>
                        Reschedule
                      </button>
                      <button type="button" className={[styles.textBtn, styles.textBtnDanger].join(' ')} onClick={() => openIris(b.cancel)}>
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="today-title">
            <div className={styles.panelHead}>
              <h2 id="today-title" className={styles.panelTitle}>
                Today at {SELECTED_BUILDING.name}
              </h2>
              <button type="button" className={styles.textBtn} onClick={() => openIris("What's happening at my building today?")}>
                Ask Iris
              </button>
            </div>
            {events === null ? (
              <p className={styles.empty}>Loading today’s events…</p>
            ) : events.length === 0 ? (
              <p className={styles.empty}>Nothing on the programme today.</p>
            ) : (
              <ul className={styles.rows}>
                {events.map((e) => {
                  const live = e.start <= minutes && minutes < e.end;
                  const ended = e.end <= minutes;
                  return (
                    <li key={e.id} className={[styles.event, ended ? styles.eventEnded : ''].join(' ').trim()}>
                      <span className={styles.eventTime}>{formatTime(e.start)}</span>
                      <div className={styles.eventText}>
                        <span className={styles.rowTitle}>{e.title}</span>
                        <span className={styles.rowMeta}>
                          {e.location} · {e.category}
                        </span>
                      </div>
                      <span className={[styles.state, live ? styles.stateLive : ended ? styles.stateEnded : ''].join(' ').trim()}>
                        {live ? 'On now' : ended ? 'Ended' : e.spotsLeft ? `${e.spotsLeft} spots left` : e.cta === 'RSVP' ? 'Open to all' : 'Register'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {chats.length > 0 && (
          <section className={styles.section} aria-labelledby="recent-title">
            <div className={styles.sectionHead}>
              <h2 id="recent-title" className={styles.sectionTitle}>
                Pick up where you left off
              </h2>
            </div>
            <ul className={styles.chats}>
              {chats.slice(0, 3).map((chat) => (
                <li key={chat.id}>
                  <button type="button" className={styles.chat} onClick={() => openIrisChat(chat.id)}>
                    <span className={styles.chatTop}>
                      <span className={styles.chatTitle}>{chat.title}</span>
                      <span className={styles.chatTime}>{chatTime(chat, now.getTime())}</span>
                    </span>
                    <span className={styles.chatPreview}>{chatPreview(chat) || 'Open the conversation'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className={styles.foot}>
        <p>Demo: bookings and chats are saved in this browser only.</p>
        {confirmReset ? (
          <span className={styles.confirm}>
            Clear every booking and chat?
            <button
              type="button"
              className={[styles.textBtn, styles.textBtnDanger].join(' ')}
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
            >
              Reset
            </button>
            <button type="button" className={styles.textBtn} onClick={() => setConfirmReset(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className={styles.textBtn} onClick={() => setConfirmReset(true)}>
            Reset demo data
          </button>
        )}
      </footer>
    </div>
  );
}
