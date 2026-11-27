import styles from './Tabs.module.css';

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}

/** Pill-style segmented tabs used for MySelf / Others. */
export function Tabs({ items, value, onChange }: Props) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          disabled={item.disabled}
          className={[styles.trigger, value === item.value ? styles.active : ''].join(' ')}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
