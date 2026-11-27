import { useState } from 'react';
import styles from './IrisRoomCards.module.css';
import { asset } from '../home/asset';
import { useRail } from '../home/SectionHeader';
import type { MeetingRoom } from '../../api/types';

interface Props {
  title: string;
  subtitle: string;
  rooms: MeetingRoom[];
  /** Id of the room booked from this list; every card is locked once one is booked. */
  bookedId?: string;
  /** False while Iris is busy or after the conversation has moved on. */
  selectable: boolean;
  onSelect: (room: MeetingRoom) => void;
}

/** "Meeting Rooms Available" rail shown in the Iris chat (Figma 9702:312303). */
export function IrisRoomCards({ title, subtitle, rooms, bookedId, selectable, onSelect }: Props) {
  const [railRef, scroll] = useRail();
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const toggleSaved = (id: string) =>
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {rooms.length > 1 && (
          <div className={styles.arrows}>
            <button type="button" className={[styles.arrow, styles.arrowPrev].join(' ')} aria-label="Scroll rooms left" onClick={() => scroll(-1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
            <button type="button" className={styles.arrow} aria-label="Scroll rooms right" onClick={() => scroll(1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.rail} ref={railRef} role="list">
        {rooms.map((room) => {
          const booked = room.id === bookedId;
          return (
            <article key={room.id} className={styles.card} role="listitem" aria-label={room.name}>
              <div className={styles.pic}>
                <img src={asset(room.photo)} alt="" />
              </div>
              <img className={styles.edge} src={asset('mr-overlay.png')} alt="" />
              <div className={styles.shade} />
              <div className={styles.body}>
                <div className={styles.meta}>
                  <span className={styles.muted}>{room.building}</span>
                  <div className={styles.line}>
                    <span className={styles.name}>{room.name}</span>
                    <span className={styles.seat}>
                      <img src="/iris/chair.svg" alt="" width={16.6467} height={16.6467} />
                      {room.capacity} Seater
                    </span>
                  </div>
                  <div className={styles.line}>
                    <span className={styles.muted}>{room.floorLabel}</span>
                    <span className={styles.credits}>
                      {room.creditsPerHour} Credit{room.creditsPerHour === 1 ? '' : 's'}/Hr
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={[styles.select, booked ? styles.selectBooked : ''].join(' ').trim()}
                  disabled={!selectable || !!bookedId}
                  aria-label={booked ? `${room.name} booked` : `Select ${room.name}`}
                  onClick={() => onSelect(room)}
                >
                  {booked ? 'Booked' : 'Select'}
                </button>
              </div>
              <button
                type="button"
                className={styles.heart}
                aria-pressed={saved.has(room.id)}
                aria-label={`Save ${room.name} to favourites`}
                onClick={() => toggleSaved(room.id)}
              >
                <img src="/iris/heart.svg" alt="" width={16.6467} height={16.6467} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
