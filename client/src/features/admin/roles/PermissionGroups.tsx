import { Fragment, useId, useRef, useState } from 'react';
import styles from './PermissionGroups.module.css';
import { BrandSwitch } from '../BrandSwitch';
import { PERMISSION_GROUPS } from './rolesShared';
import { useSheetTip } from '../users/bulk/SheetCells';
import { RESTRICTED_TIP } from '../company/companyShared';

interface Props {
  /** The keys switched on. */
  value: string[];
  /** Without it the switches only show the role's permissions. */
  onChange?: (keys: string[]) => void;
  /**
   * Services the company has turned off (Company Settings): shown off and locked, with “Restricted by
   * admin” on hover. The role keeps its own setting for when they’re turned back on.
   */
  restricted?: string[];
}

/**
 * A role's permissions (Figma 8349:200956, 3120:194910, 3124:196131): Workspace Services, then
 * System Permissions under the "Service permissions" rule. Each card's header shows how many are
 * on and folds the card away.
 */
export function PermissionGroups({ value, onChange, restricted = [] }: Props) {
  const id = useId();
  const tip = useSheetTip();
  const locked = new Set(restricted);
  const [folded, setFolded] = useState<string[]>([]);
  const on = new Set(value);
  // The latest keys, so switches flipped before the next render build on each other.
  const latest = useRef(value);
  latest.current = value;

  function toggle(key: string, next: boolean) {
    if (!onChange) return;
    const keys = new Set(latest.current);
    if (next) keys.add(key);
    else keys.delete(key);
    // Keep the catalogue's order.
    latest.current = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)).filter((k) => keys.has(k));
    onChange(latest.current);
  }

  return (
    <div className={styles.groups} {...tip.handlers}>
      {PERMISSION_GROUPS.map((g, i) => {
        const open = !folded.includes(g.id);
        const count = g.permissions.filter((p) => on.has(p.key) && !locked.has(p.key)).length;
        return (
          <Fragment key={g.id}>
            {i > 0 && (
              <p className={styles.rule}>
                <span>SERVICE PERMISSIONS</span>
              </p>
            )}
            <section className={styles.card} aria-labelledby={`${id}-${g.id}`}>
              <button
                type="button"
                className={styles.head}
                aria-expanded={open}
                aria-controls={`${id}-${g.id}-list`}
                onClick={() => setFolded((f) => (open ? [...f, g.id] : f.filter((x) => x !== g.id)))}
              >
                <span id={`${id}-${g.id}`} className={styles.title}>
                  {g.title}
                </span>
                <span className={styles.count}>
                  {count}/{g.permissions.length}
                </span>
                <img className={[styles.chevron, open ? '' : styles.chevronFolded].join(' ').trim()} src="/admin/user/chevron-down.svg" alt="" width={20} height={20} />
              </button>
              {open && (
                <ul id={`${id}-${g.id}-list`} className={styles.list}>
                  {g.permissions.map((p) => (
                    <li
                      key={p.key}
                      className={[styles.row, locked.has(p.key) ? styles.rowRestricted : ''].join(' ').trim()}
                      data-tip={locked.has(p.key) ? RESTRICTED_TIP : undefined}
                      data-tip-when={locked.has(p.key) ? 'always' : undefined}
                    >
                      <span className={styles.text}>
                        <span id={`${id}-${p.key}`} className={styles.name}>
                          {p.title}
                          {locked.has(p.key) && <span className={styles.restricted}>Restricted by admin</span>}
                        </span>
                        <span id={`${id}-${p.key}-note`} className={styles.note}>
                          {p.description}
                        </span>
                      </span>
                      <BrandSwitch
                        checked={on.has(p.key)}
                        disabled={locked.has(p.key)}
                        label={onChange ? undefined : p.title}
                        labelledBy={onChange ? `${id}-${p.key}` : undefined}
                        describedBy={onChange ? `${id}-${p.key}-note` : undefined}
                        onChange={onChange ? (next) => toggle(p.key, next) : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Fragment>
        );
      })}
      {tip.node}
    </div>
  );
}
