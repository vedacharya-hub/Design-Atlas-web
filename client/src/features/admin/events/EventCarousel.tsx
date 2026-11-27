import { useState, type KeyboardEvent } from 'react';
import styles from './EventCarousel.module.css';
import { dateChip } from './eventShared';

/**
 * An event's photos as the members' event card shows them: one at a time with the date chip in the
 * corner and, for more than one, the indicators along the bottom (click one, or use the arrow keys).
 */
export function EventCarousel({ images, date, height, title }: { images: string[]; date: string; height: number; title: string }) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, images.length - 1));
  const chip = date ? dateChip(date) : null;

  function onKeyDown(e: KeyboardEvent) {
    if (images.length < 2) return;
    if (e.key === 'ArrowRight') setIndex((current + 1) % images.length);
    else if (e.key === 'ArrowLeft') setIndex((current - 1 + images.length) % images.length);
    else return;
    e.preventDefault();
  }

  return (
    <div
      className={styles.carousel}
      style={{ height }}
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${title || 'the event'}`}
      tabIndex={images.length > 1 ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      {images.map((src, i) => (
        <img key={src.slice(0, 64) + i} className={[styles.photo, i === current ? styles.photoOn : ''].join(' ').trim()} src={src} alt="" aria-hidden={i !== current} />
      ))}
      {chip && (
        <span className={styles.chip} aria-hidden="true">
          <span className={styles.chipDay}>{chip.weekday}</span>
          <span className={styles.chipDate}>{chip.day}</span>
          <span className={styles.chipMonth}>{chip.month}</span>
        </span>
      )}
      {images.length > 1 && (
        <span className={styles.indicators}>
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              className={[styles.indicator, i === current ? styles.indicatorOn : ''].join(' ').trim()}
              aria-label={`Photo ${i + 1} of ${images.length}`}
              aria-current={i === current || undefined}
              tabIndex={-1}
              onClick={() => setIndex(i)}
            />
          ))}
        </span>
      )}
    </div>
  );
}
