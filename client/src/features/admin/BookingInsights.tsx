import { useCallback, useEffect, useState } from 'react';
import styles from './BookingInsights.module.css';
import { ArrowUpRight, LightbulbFlash } from '../../components/ui/icons';

interface Insight {
  id: string;
  color: 'yellow' | 'green' | 'lilac';
  lead: string;
  emphasis: string;
}

const INSIGHTS: Insight[] = [
  { id: 'bookings', color: 'yellow', lead: 'Last Week desk booking was ', emphasis: 'increased by 21%' },
  { id: 'noshows', color: 'green', lead: "This month's no-shows ", emphasis: 'dropped by 12%' },
  { id: 'peak', color: 'yellow', lead: 'Peak booking hours are ', emphasis: '9–11 AM' },
  { id: 'credits', color: 'lilac', lead: 'Credit usage is ', emphasis: 'up 8% this quarter' },
];

const AUTO_ADVANCE_MS = 6000;

/** Stacked "Booking Insights" carousel — front card advances the deck, dots jump to a slide directly. */
export function BookingInsights() {
  const [active, setActive] = useState(0);

  const advance = useCallback(() => {
    setActive((i) => (i + 1) % INSIGHTS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(advance, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [active, advance]);

  return (
    <div className={styles.stack}>
      {INSIGHTS.map((insight, i) => {
        const depth = (i - active + INSIGHTS.length) % INSIGHTS.length;
        const isFront = depth === 0;
        const onActivate = () => (isFront ? advance() : setActive(i));

        return (
          <div
            key={insight.id}
            className={[styles.card, styles[insight.color]].join(' ')}
            style={{
              transform: `translate(${depth * 40}px, ${depth * 40}px)`,
              zIndex: INSIGHTS.length - depth,
              boxShadow: `0 ${4 + depth * 2}px ${12 + depth * 4}px rgba(0, 0, 0, ${0.1 + depth * 0.03})`,
            }}
            role="button"
            tabIndex={0}
            onClick={onActivate}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate();
              }
            }}
            aria-label={isFront ? 'Show next insight' : `Bring insight ${i + 1} to front`}
          >
            <div className={styles.cardInner}>
              <div className={styles.cardTop}>
                <span className={styles.cardLabel}>
                  <LightbulbFlash width={16} height={16} />
                  Booking Insights
                </span>
                <ArrowUpRight width={16} height={16} />
              </div>
              <p className={styles.cardText}>
                {insight.lead}
                <strong>{insight.emphasis}</strong>
              </p>
            </div>

            {isFront && (
              <div className={styles.indicator}>
                {INSIGHTS.map((_, dot) => (
                  <button
                    key={dot}
                    type="button"
                    className={[styles.dot, dot === active ? styles.dotActive : ''].join(' ')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActive(dot);
                    }}
                    aria-label={`Go to insight ${dot + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
