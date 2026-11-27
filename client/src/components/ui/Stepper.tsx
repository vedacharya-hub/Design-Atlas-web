import styles from './Stepper.module.css';
import { Check } from './icons';

interface Props {
  current: 1 | 2;
  total?: number;
}

/** Two-dot progress rail (step 1 → step 2). */
export function Stepper({ current, total = 2 }: Props) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className={styles.rail}>
      {steps.map((n, idx) => (
        <div key={n} className={styles.segment}>
          <span
            className={[
              styles.dot,
              n < current ? styles.done : '',
              n === current ? styles.active : '',
            ].join(' ')}
          >
            {n < current ? <Check width={12} height={12} /> : n}
          </span>
          {idx < steps.length - 1 && (
            <span className={[styles.line, n < current ? styles.lineDone : ''].join(' ')} />
          )}
        </div>
      ))}
    </div>
  );
}
