import { useEffect, useId, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './SheetCells.module.css';

/** Above the dialog (400) and the row menus (410); below the toasts (470). */
const LAYER_Z = 420;
const LIST_MAX = 240;
const TIP_DELAY_MS = 300;

interface SearchCellProps {
  value: string;
  options: string[];
  /** An empty choice at the top of the list ("No team"). */
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  label: string;
  /** The data sheet's select-cell look, so changed and error tints apply. */
  className: string;
  /** The cell's error: shown in full on hover instead of the value. */
  error?: string;
  onChange: (value: string) => void;
}

/**
 * A data-sheet cell you type into to search its choices (role, business unit, department, team).
 * Arrow keys move through the matches, Enter or a click picks one, Escape backs out without closing
 * the dialog. Leaving with an exact match picks it; anything else goes back to the cell's value.
 */
export function SearchCell({ value, options, emptyLabel, placeholder = 'Select', disabled, label, className, error, onChange }: SearchCellProps) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});

  const q = (query ?? '').trim().toLowerCase();
  const items = [
    ...(emptyLabel !== undefined && !q ? [{ value: '', label: emptyLabel }] : []),
    ...options.filter((o) => !q || o.toLowerCase().includes(q)).map((o) => ({ value: o, label: o })),
  ];

  function position() {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < 160 && r.top > below;
    setPlace({
      position: 'fixed',
      left: r.left,
      width: Math.max(r.width, 200),
      zIndex: LAYER_Z,
      maxHeight: Math.min(LIST_MAX, (up ? r.top : below) - 8),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }
  function openList() {
    if (disabled) return;
    position();
    setOpen(true);
    setActive(Math.max(0, items.findIndex((i) => i.value === value)));
  }
  function close() {
    setOpen(false);
    setQuery(null);
  }
  function commit(next: string) {
    if (next !== value) onChange(next);
    close();
  }

  // Like the row menus: anything scrolling or resizing closes the list.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  return (
    <div ref={wrapRef} className={className} data-tip={error} data-tip-when={error ? 'always' : undefined}>
      <input
        ref={inputRef}
        className={[styles.input, value || query !== null ? '' : styles.inputEmpty].join(' ').trim()}
        value={query ?? (value || '')}
        placeholder={value ? undefined : emptyLabel ?? placeholder}
        disabled={disabled}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
        aria-invalid={!!error || undefined}
        // The full value on hover when it's cut short (unless the error takes its place).
        data-tip={error ? undefined : ''}
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => {
          e.currentTarget.select();
          openList();
        }}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) {
            position();
            setOpen(true);
          }
        }}
        onBlur={(e) => {
          // Read what's in the field now: the last keystroke may not have re-rendered yet.
          const typed = e.currentTarget.value;
          if (query === null && typed === (value || '')) return setOpen(false);
          const match = typed.trim().toLowerCase();
          const exact = options.find((o) => o.toLowerCase() === match);
          if (exact !== undefined) commit(exact);
          else if (!match && emptyLabel !== undefined) commit('');
          else close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) openList();
            else setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            if (open && items[active]) {
              e.preventDefault();
              commit(items[active].value);
            }
          } else if (e.key === 'Escape') {
            // Back out of the list, not the whole dialog.
            if (open || query !== null) {
              e.preventDefault();
              close();
            }
          }
        }}
      />
      {!disabled && <img className={styles.chevron} src="/admin/user/chevron-down.svg" alt="" width={16} height={16} />}
      {open &&
        createPortal(
          <ul ref={listRef} id={`${id}-list`} className={styles.list} style={place} role="listbox" aria-label={label}>
            {items.length === 0 && <li className={styles.none}>No matches</li>}
            {items.map((item, i) => (
              <li
                key={item.value || '(none)'}
                id={`${id}-${i}`}
                data-index={i}
                role="option"
                aria-selected={item.value === value}
                className={[styles.option, i === active ? styles.optionActive : '', item.value ? '' : styles.optionEmpty].join(' ').trim()}
                // Keep focus in the field so its blur doesn't undo the pick.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(item.value)}
              >
                <span className={styles.optionText}>{item.label}</span>
                {item.value === value && <img src="/admin/user/check.svg" alt="" width={16} height={16} />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

/**
 * Hover (or focus) tips for the data sheet. Mark an element with `data-tip`: its text (or an input's
 * value) shows in a dark tip above it after a moment, only when it's cut short with "…", or always
 * with `data-tip-when="always"` (errors, abbreviations). `data-tip-measure` marks the child that
 * gets cut short when it isn't the element itself.
 */
export function useSheetTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef<HTMLElement | null>(null);

  const hide = () => {
    clearTimeout(timer.current);
    current.current = null;
    setTip(null);
  };

  const show = (target: EventTarget | null) => {
    const el = (target instanceof Element ? target.closest('[data-tip]') : null) as HTMLElement | null;
    if (el === current.current) return;
    hide();
    if (!el) return;
    current.current = el;
    timer.current = setTimeout(() => {
      if (current.current !== el || !el.isConnected) return;
      const text = el.dataset.tip || (el instanceof HTMLInputElement ? el.value : '');
      if (!text) return;
      if (el.dataset.tipWhen !== 'always') {
        const measured = el instanceof HTMLInputElement ? el : (el.querySelector<HTMLElement>('[data-tip-measure]') ?? el);
        if (measured.scrollWidth <= measured.clientWidth + 1) return;
      }
      const r = el.getBoundingClientRect();
      const below = r.top < 80;
      setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170), y: below ? r.bottom + 6 : r.top - 6, below });
    }, TIP_DELAY_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    hide,
    handlers: {
      onMouseOver: (e: MouseEvent) => show(e.target),
      onMouseLeave: hide,
      onFocus: (e: FocusEvent) => show(e.target),
      onBlur: hide,
      onKeyDown: hide,
    },
    node: tip
      ? createPortal(
          <div
            role="tooltip"
            className={styles.tip}
            style={{ left: tip.x, top: tip.y, zIndex: LAYER_Z, transform: tip.below ? 'translateX(-50%)' : 'translate(-50%, -100%)' }}
          >
            {tip.text}
          </div>,
          document.body,
        )
      : null,
  };
}
