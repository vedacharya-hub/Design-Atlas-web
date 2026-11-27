import { useRef, type ReactNode, type RefObject } from 'react';
import styles from './HomePage.module.css';
import { asset } from './asset';

interface Props {
  title: string;
  subtitle: string;
  id?: string;
  children?: ReactNode;
}

/** Serif section title + grey subtitle with an optional action slot on the right. */
export function SectionHeader({ title, subtitle, id, children }: Props) {
  return (
    <div className={styles.secHead}>
      <div>
        <h2 className={styles.secTitle} id={id}>{title}</h2>
        <p className={styles.secSub}>{subtitle}</p>
      </div>
      {children && <div className={styles.secActions}>{children}</div>}
    </div>
  );
}

interface ArrowProps {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}

/** The pair of outlined circular arrow buttons used by every carousel section. */
export function CircleArrows({ onPrev, onNext, prevDisabled, nextDisabled, prevLabel = 'Scroll left', nextLabel = 'Scroll right' }: ArrowProps) {
  return (
    <>
      <button type="button" className={[styles.circle, styles.flip].join(' ')} onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel}>
        <img src={asset('i-arrow-nav.svg')} width={20} height={20} alt="" />
      </button>
      <button type="button" className={styles.circle} onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}>
        <img src={asset('i-arrow-nav.svg')} width={20} height={20} alt="" />
      </button>
    </>
  );
}

/** Horizontal scroll rail; returns the ref plus a scroll-by-one-card handler. */
export function useRail(): [RefObject<HTMLDivElement | null>, (dir: 1 | -1) => void] {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: 'smooth' });
  };
  return [ref, scroll];
}
