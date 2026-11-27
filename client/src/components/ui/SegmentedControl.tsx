import styles from './SegmentedControl.module.css';

interface Props {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

/** Dark pill segmented control used for Office Desk / Shared Desk. */
export function SegmentedControl({ items, value, onChange }: Props) {
  return (
    <div className={styles.wrap}>
      {items.map((item) => (
        <button
          key={item.value}
          className={[styles.seg, value === item.value ? styles.active : ''].join(' ')}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
