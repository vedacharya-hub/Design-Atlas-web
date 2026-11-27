import { useState } from 'react';
import styles from './IrisEventCards.module.css';
import roomStyles from './IrisRoomCards.module.css';
import { asset } from '../home/asset';
import { useRail } from '../home/SectionHeader';
import { formatTime } from './irisShared';
import type { BuildingEvent, EventCategory } from '../../api/types';

interface Props {
  title: string;
  subtitle: string;
  events: BuildingEvent[];
  /** YYYY-MM-DD the events are on; drives the date badge and live/ended status. */
  date: string;
}

const CATEGORY_CLASS: Record<EventCategory, string> = {
  Networking: styles.catNetworking,
  Wellness: styles.catWellness,
  Learning: styles.catLearning,
  Community: styles.catCommunity,
};

function localDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Events at <building>" rail in the Iris chat, styled to sit alongside the meeting-room cards. */
export function IrisEventCards({ title, subtitle, events, date }: Props) {
  const [railRef, scroll] = useRail();
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const badge = {
    weekday: day.toLocaleDateString('en-IN', { weekday: 'short' }).toUpperCase(),
    date: day.getDate(),
    month: day.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  };
  const now = new Date();
  const isToday = localDateKey(now) === date;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const toggle = (id: string) =>
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className={roomStyles.section} aria-label={title}>
      <div className={roomStyles.head}>
        <div className={roomStyles.headText}>
          <h3 className={roomStyles.title}>{title}</h3>
          <p className={roomStyles.subtitle}>{subtitle}</p>
        </div>
        {events.length > 1 && (
          <div className={roomStyles.arrows}>
            <button type="button" className={[roomStyles.arrow, roomStyles.arrowPrev].join(' ')} aria-label="Scroll events left" onClick={() => scroll(-1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
            <button type="button" className={roomStyles.arrow} aria-label="Scroll events right" onClick={() => scroll(1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
          </div>
        )}
      </div>

      <div className={roomStyles.rail} ref={railRef} role="list">
        {events.map((e) => {
          const ended = isToday && e.end <= nowMinutes;
          const live = isToday && e.start <= nowMinutes && nowMinutes < e.end;
          const going = joined.has(e.id);
          const spots = e.spotsLeft === undefined ? undefined : e.spotsLeft - (going ? 1 : 0);
          return (
            <article key={e.id} className={[styles.card, ended ? styles.cardEnded : ''].join(' ').trim()} role="listitem" aria-label={e.title}>
              <div className={styles.pic}>
                <img src={asset(e.image)} alt="" />
                <div className={styles.date} aria-hidden="true">
                  <small>{badge.weekday}</small>
                  <b>{badge.date}</b>
                  <i>{badge.month}</i>
                </div>
                {(live || ended) && (
                  <span className={[styles.status, live ? styles.statusLive : ''].join(' ').trim()}>
                    {live ? 'Happening now' : 'Ended'}
                  </span>
                )}
              </div>
              <div className={styles.body}>
                <span className={[styles.category, CATEGORY_CLASS[e.category]].join(' ')}>{e.category}</span>
                <h4 className={styles.name}>{e.title}</h4>
                <div className={styles.rows}>
                  <div>
                    <span className={[styles.icon, styles.iconTime].join(' ')} aria-hidden="true" />
                    {formatTime(e.start)} – {formatTime(e.end)}
                  </div>
                  <div>
                    <span className={[styles.icon, styles.iconPin].join(' ')} aria-hidden="true" />
                    {e.location}
                  </div>
                  {spots !== undefined && (
                    <div>
                      <span className={[styles.icon, styles.iconTeam].join(' ')} aria-hidden="true" />
                      {spots} spots left
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.cta}
                  aria-pressed={going}
                  disabled={ended}
                  onClick={() => toggle(e.id)}
                >
                  {ended ? 'Ended' : going ? (e.cta === 'RSVP' ? 'Going' : 'Registered') : e.cta}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
