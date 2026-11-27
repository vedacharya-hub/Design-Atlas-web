import { useState } from 'react';
import styles from './IrisOfficeCards.module.css';
import rail from './IrisRoomCards.module.css';
import { asset } from '../home/asset';
import { useRail } from '../home/SectionHeader';
import type { PrivateOffice } from '../../api/types';

interface Props {
  title: string;
  subtitle: string;
  offices: PrivateOffice[];
  /** Id of the office picked from this list; every card locks once one is picked. */
  picked?: string;
  /** False while Iris is busy or after the conversation has moved on. */
  selectable: boolean;
  onSelect: (office: PrivateOffice) => void;
}

/** "Private Offices Available" rail in the Iris chat; cards from Figma 4963:165644. */
export function IrisOfficeCards({ title, subtitle, offices, picked, selectable, onSelect }: Props) {
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
    <section className={rail.section} aria-label={title}>
      <div className={rail.head}>
        <div className={rail.headText}>
          <h3 className={rail.title}>{title}</h3>
          <p className={rail.subtitle}>{subtitle}</p>
        </div>
        {offices.length > 1 && (
          <div className={rail.arrows}>
            <button type="button" className={[rail.arrow, rail.arrowPrev].join(' ')} aria-label="Scroll offices left" onClick={() => scroll(-1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
            <button type="button" className={rail.arrow} aria-label="Scroll offices right" onClick={() => scroll(1)}>
              <img src="/iris/arrow.svg" alt="" width={20} height={20} />
            </button>
          </div>
        )}
      </div>

      <div className={rail.rail} ref={railRef} role="list">
        {offices.map((office) => {
          const chosen = office.id === picked;
          return (
            <article key={office.id} className={styles.card} role="listitem" aria-label={office.name}>
              <div className={styles.pic}>
                <img src={asset(office.photo)} alt="" />
              </div>
              <img className={styles.edge} src={asset('po-overlay.png')} alt="" />
              <div className={styles.body}>
                <div className={styles.meta}>
                  <div className={styles.line}>
                    <span className={styles.name}>{office.name}</span>
                    <span className={styles.seat}>
                      <img src="/iris/chair-24.svg" alt="" width={24} height={24} />
                      {office.capacity} Seater
                    </span>
                  </div>
                  <div className={styles.line}>
                    <span className={[styles.muted, styles.building].join(' ')}>{office.building}</span>
                    <span className={styles.muted}>{office.floorLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={[styles.book, chosen ? styles.bookChosen : ''].join(' ').trim()}
                  disabled={!selectable || !!picked}
                  aria-label={chosen ? `${office.name} selected` : `Book ${office.name}`}
                  onClick={() => onSelect(office)}
                >
                  {chosen ? 'Selected' : 'Book'}
                </button>
              </div>
              <button
                type="button"
                className={styles.heart}
                aria-pressed={saved.has(office.id)}
                aria-label={`Save ${office.name} to favourites`}
                onClick={() => toggleSaved(office.id)}
              >
                <img src="/iris/heart-20.svg" alt="" width={20} height={20} />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
