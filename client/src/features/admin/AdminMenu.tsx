import type { CSSProperties } from 'react';
import styles from './AdminMenu.module.css';

export interface AdminMenuItem<Id extends string> {
  id: Id;
  label: string;
  /** File name under /public/admin. */
  icon: string;
}

export interface AdminMenuGroup<Id extends string> {
  heading: string;
  items: AdminMenuItem<Id>[];
}

interface Props<Id extends string> {
  groups: AdminMenuGroup<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
}

/** "Admin-Menu" (Figma 1580:133491): grouped items, the selected one filled black. */
export function AdminMenu<Id extends string>({ groups, active, onSelect }: Props<Id>) {
  return (
    <nav className={styles.menu} aria-label="Admin">
      {groups.map((group) => (
        <div key={group.heading} className={styles.group}>
          <h2 className={styles.heading}>{group.heading}</h2>
          <ul className={styles.items}>
            {group.items.map((item) => {
              const selected = item.id === active;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[styles.item, selected ? styles.itemActive : ''].join(' ').trim()}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <AdminIcon file={item.icon} />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** A /public/admin icon drawn in the text colour, so one file serves the grey and white states. */
export function AdminIcon({ file, size = 20, className }: { file: string; size?: number; className?: string }) {
  return (
    <span
      className={[styles.icon, className].filter(Boolean).join(' ')}
      style={{ '--icon': `url("/admin/${file}")`, width: size, height: size } as CSSProperties}
      aria-hidden="true"
    />
  );
}
