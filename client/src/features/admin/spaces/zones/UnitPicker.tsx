import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import fields from '../../users/UserFormFields.module.css';
import styles from './UnitPicker.module.css';

export interface PickableUnit {
  id: string;
  name: string;
  archived: boolean;
}

interface Props {
  /** "Teams" */
  label: string;
  /** "teams", for the placeholder and messages. */
  noun: string;
  units: PickableUnit[];
  /** The ids picked, in the order they were picked. */
  value: string[];
  invalid?: boolean;
  /** A line under the field. */
  help?: string;
  onChange: (ids: string[]) => void;
}

/** Letters typed before the matches show. */
export const MIN_SEARCH = 3;
/** Above the dialog's backdrop (400); below the toasts (470). */
const MENU_Z = 410;
/** Roughly the open list's height, to open it upwards near the bottom of the window. */
const MENU_HEIGHT = 240;

/**
 * Picks one or more teams (or departments, or business units) for a zone. The field is its own
 * search: the ones picked sit in it as chips with a ×, and from the third letter typed the matches
 * drop down to add (click, or arrows and Enter). Backspace in an empty field takes off the last one.
 * Escape closes the matches without closing the dialog. The list is drawn at the end of the page so
 * the dialog's scrolling body doesn't clip it.
 */
export function UnitPicker({ label, noun, units, value, invalid, help, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  /** Escape closed the matches; typing opens them again. */
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const listId = useId();
  const helpId = useId();
  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const picked = value.map((id) => byId.get(id)).filter((u) => u !== undefined);

  const q = query.trim().toLowerCase();
  // Matches, those starting with what's typed first.
  const matches = useMemo(() => {
    if (q.length < MIN_SEARCH) return [];
    const hits = units.filter((u) => u.name.toLowerCase().includes(q));
    return [...hits.filter((u) => u.name.toLowerCase().startsWith(q)), ...hits.filter((u) => !u.name.toLowerCase().startsWith(q))];
  }, [units, q]);
  const open = focused && !dismissed && q.length >= MIN_SEARCH;
  const optionId = (u: PickableUnit) => `${listId}-${u.id}`;

  // Keep the highlighted match on one that can be added.
  useEffect(() => {
    setActive(Math.max(0, matches.findIndex((u) => !value.includes(u.id))));
  }, [matches, value]);

  // Escape closes the matches, caught on the window before the dialog's own Escape (on the document).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setDismissed(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Pinned under the field (or over it, near the bottom of the window), following it as the dialog
  // scrolls and as chips wrap onto more lines.
  useLayoutEffect(() => {
    if (!open) return;
    const follow = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < MENU_HEIGHT && r.top > below;
      setPlace({
        position: 'fixed',
        left: r.left,
        width: r.width,
        zIndex: MENU_Z,
        ...(up ? { bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 16 } : { top: r.bottom + 6, maxHeight: below - 16 }),
      });
    };
    follow();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
  }, [open, value.length]);

  function add(u: PickableUnit) {
    if (!value.includes(u.id)) onChange([...value, u.id]);
    setQuery('');
    inputRef.current?.focus();
  }

  /** The next match (by `step`) that isn't already added. */
  function move(step: 1 | -1) {
    if (!matches.length) return;
    let i = active;
    for (let n = 0; n < matches.length; n++) {
      i = (i + step + matches.length) % matches.length;
      if (!value.includes(matches[i].id)) return setActive(i);
    }
  }

  const current = open ? matches[active] : undefined;
  const addable = current && !value.includes(current.id) ? current : undefined;

  return (
    <div className={fields.field}>
      <span className={fields.label} id={labelId}>
        {label}
      </span>
      {/* A click anywhere in the box (not on a chip's ×) goes to the search. */}
      <div
        ref={boxRef}
        className={[fields.input, styles.box, invalid ? styles.invalid : ''].join(' ').trim()}
        onMouseDown={(e) => {
          if (e.target !== inputRef.current && !(e.target as HTMLElement).closest('button')) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {picked.map((u) => (
          <span key={u.id} className={styles.chip} title={u.archived ? `${u.name} (archived)` : u.name}>
            <span className={styles.chipName}>{u.name}</span>
            {u.archived && <span className={styles.chipNote}>archived</span>}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove ${u.name}`}
              onClick={() => {
                onChange(value.filter((v) => v !== u.id));
                inputRef.current?.focus();
              }}
            >
              <img src="/admin/user/chip-close.svg" alt="" width={16} height={16} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={styles.search}
          value={query}
          placeholder={picked.length ? `Add more ${noun}` : `Type ${MIN_SEARCH} letters to search ${noun}`}
          role="combobox"
          aria-labelledby={labelId}
          aria-describedby={help ? helpId : undefined}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={current ? optionId(current) : undefined}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!open) return;
              e.preventDefault();
              move(e.key === 'ArrowDown' ? 1 : -1);
            } else if (e.key === 'Enter') {
              // Enter adds the highlighted match; with something typed it never submits the dialog.
              if (!query.trim()) return;
              e.preventDefault();
              if (addable) add(addable);
            } else if (e.key === 'Backspace' && !query && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <img className={styles.icon} src="/admin/user/search.svg" alt="" width={20} height={20} />
      </div>
      {help && (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      )}

      {open &&
        place &&
        createPortal(
          <div
            id={listId}
            className={styles.menu}
            style={place}
            role="listbox"
            aria-labelledby={labelId}
            // Picking keeps the focus in the search.
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.length === 0 && (
              <p className={styles.empty}>
                No {noun} match “{query.trim()}”.
              </p>
            )}
            {matches.map((u, i) => {
              const added = value.includes(u.id);
              return (
                <div
                  key={u.id}
                  id={optionId(u)}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={added || undefined}
                  className={[styles.option, i === active && !added ? styles.optionActive : '', added ? styles.optionAdded : ''].join(' ').trim()}
                  onMouseEnter={() => !added && setActive(i)}
                  onClick={() => !added && add(u)}
                >
                  <span className={styles.optionName}>
                    <Highlight text={u.name} query={q} />
                  </span>
                  {u.archived && <span className={styles.optionNote}>Archived</span>}
                  {added ? (
                    <span className={styles.optionAddedLabel}>
                      <img src="/admin/user/check.svg" alt="" width={16} height={16} />
                      Added
                    </span>
                  ) : (
                    <span className={styles.optionAdd}>Add</span>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** The name with the part that matches the search in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query);
  if (!query || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong>{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}
