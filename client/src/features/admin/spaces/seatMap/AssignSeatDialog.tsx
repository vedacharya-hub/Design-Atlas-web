import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
// The Add New Team dialog's shell and the form fields; this dialog's rules last.
import shell from '../../users/AddOrgUnitDialog.module.css';
import fields from '../../users/UserFormFields.module.css';
import styles from './SeatDialog.module.css';
import { adminApi } from '../../../../api/adminApi';
import type { AdminSeat, AdminUser } from '../../../../api/types';
import { TextField } from '../../users/UserFormFields';
import { avatarSrc } from '../../users/userShared';
import { todayKey } from '../../events/eventShared';
import { useToast } from '../../Toaster';
import { assignedSince, seatDate, type MapSeat } from './seatShared';

/** Save and Remove spin at least this long, so a fast reply doesn't flicker past. */
const MIN_SAVING_MS = 500;

interface Props {
  spaceId: string;
  seat: MapSeat;
  /** "WeWork Vaishnavi Signature • 2nd Floor" */
  place: string;
  users: AdminUser[];
  /** Who already has a permanent seat, and which. */
  heldBy: Map<string, MapSeat>;
  onClose: () => void;
  onSaved: (seat: AdminSeat, change: 'assigned' | 'freed') => void;
}

/**
 * Assign Seat: first nobody (Figma 3039:110690), then the person picked with the date it's theirs
 * from and a note (3025:298488); the desk's type stays as it is. A permanent seat opens with Remove to free it
 * (1595:91011). One permanent seat per person: anyone holding another is shown but can't be picked.
 */
export function AssignSeatDialog({ spaceId, seat, place, users, heldBy, onClose, onSaved }: Props) {
  const toast = useToast();
  const current = seat.assignment;
  const [userId, setUserId] = useState(current?.userId ?? '');
  const [query, setQuery] = useState(current?.name ?? '');
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(current?.effectiveFrom ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const today = todayKey();

  const listOpenRef = useRef(listOpen);
  listOpenRef.current = listOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // Escape shuts the list first, then the dialog; the panel behind stays open.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (listOpenRef.current) setListOpen(false);
      else if (!busyRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (!current) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = users.find((u) => u.id === userId);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const people = users.filter((u) => u.status === 'active' || u.id === userId);
    // While a chosen name sits in the box, show everyone.
    if (!q || (picked && query === picked.name)) return people;
    return people.filter((u) => [u.name, u.email, u.department, u.team].some((v) => v.toLowerCase().includes(q)));
  }, [users, query, userId, picked]);
  /** The other desk a person already holds, if any. */
  const heldElsewhere = (id: string) => {
    const s = heldBy.get(id);
    return s && s.id !== seat.id ? s : undefined;
  };

  function pick(u: AdminUser) {
    if (heldElsewhere(u.id)) return;
    setUserId(u.id);
    setQuery(u.name);
    setListOpen(false);
    setError('');
  }
  function clear() {
    setUserId('');
    setQuery('');
    setListOpen(true);
    setActive(0);
    inputRef.current?.focus();
  }

  function onComboKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!listOpen) return setListOpen(true);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (matches.length ? (a + dir + matches.length) % matches.length : 0));
    } else if (e.key === 'Enter' && listOpen) {
      e.preventDefault();
      const u = matches[active];
      if (u) pick(u);
    }
  }

  const ready = !!userId && !!effectiveFrom;
  const unchanged = !!current && userId === current.userId && effectiveFrom === current.effectiveFrom && notes.trim() === current.notes;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    if (unchanged) return onClose();
    setBusy('save');
    setError('');
    try {
      const [next] = await Promise.all([
        adminApi.assignSeat(spaceId, seat.id, {
          userId,
          effectiveFrom,
          notes: notes.trim(),
        }),
        new Promise((r) => setTimeout(r, MIN_SAVING_MS)),
      ]);
      onSaved(next, 'assigned');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setBusy(null);
      toast({
        tone: 'error',
        title: `Couldn’t assign ${seat.label}`,
        description: message,
      });
    }
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setError('');
    try {
      const [next] = await Promise.all([adminApi.freeSeat(spaceId, seat.id), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      onSaved(next, 'freed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setBusy(null);
      toast({
        tone: 'error',
        title: `Couldn’t free ${seat.label}`,
        description: message,
      });
    }
  }

  const who =
    picked ??
    (current
      ? {
          name: current.name,
          email: current.email,
          avatar: current.avatar,
          department: current.team,
          team: '',
        }
      : undefined);

  return (
    <div className={shell.backdrop}>
      <div className={shell.dialog} role="dialog" aria-modal="true" aria-labelledby="assign-seat-title" aria-describedby="assign-seat-place">
        <header className={shell.head}>
          <div className={shell.headText}>
            <h2 id="assign-seat-title" className={[shell.title, styles.title].join(' ')}>
              Assign Seat - {seat.zone} - {seat.label}
            </h2>
            <p id="assign-seat-place" className={[shell.subtitle, styles.subtitle].join(' ')}>
              {place}
            </p>
          </div>
          <button type="button" className={shell.close} aria-label="Close" disabled={!!busy} onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="assign-seat-form" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void save(e)} noValidate>
          {who ? (
            <div className={styles.banner}>
              <div className={styles.person}>
                <img className={styles.avatar} src={avatarSrc(who)} alt="" width={40} height={40} />
                <div className={styles.personText}>
                  <span className={styles.personName}>{who.name}</span>
                  <span className={styles.personMeta}>{who.email}</span>
                  <span className={styles.personMeta}>{[who.department || who.team, effectiveFrom ? assignedSince(effectiveFrom, today) : ''].filter(Boolean).join(' • ')}</span>
                </div>
              </div>
              <span className={styles.permanent}>Permanent</span>
            </div>
          ) : (
            <div className={[styles.banner, styles.bannerEmpty].join(' ')}>
              <img className={styles.orb} src="/admin/spaces/map/orb.png" alt="" width={32} height={32} />
              No one is assigned to the seat Yet
            </div>
          )}

          <div className={[fields.field, styles.combo].join(' ')}>
            <label className={fields.label} htmlFor="assign-seat-employee">
              Employee
            </label>
            <div className={[fields.input, styles.comboBox].join(' ')}>
              <input
                ref={inputRef}
                id="assign-seat-employee"
                className={styles.comboInput}
                role="combobox"
                aria-expanded={listOpen}
                aria-controls="assign-seat-people"
                aria-autocomplete="list"
                aria-activedescendant={listOpen && matches[active] ? `assign-seat-person-${matches[active].id}` : undefined}
                autoComplete="off"
                value={query}
                placeholder="Search Employee"
                onClick={() => setListOpen(true)}
                onBlur={(e) => {
                  // Leaving for an option keeps it open long enough to be clicked.
                  if (!e.relatedTarget?.closest?.('[data-people]')) setListOpen(false);
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (picked && e.target.value !== picked.name) setUserId('');
                  setListOpen(true);
                  setActive(0);
                }}
                onKeyDown={onComboKey}
              />
              {query && (
                <button type="button" className={styles.clear} aria-label="Clear employee" onClick={clear}>
                  <img src="/admin/spaces/map/clear.svg" alt="" width={20} height={20} />
                </button>
              )}
            </div>
            {listOpen && (
              <div className={fields.userMenu} data-people>
                <div id="assign-seat-people" className={fields.userOptions} role="listbox" aria-label="Employees">
                  {matches.length === 0 && <p className={fields.userEmpty}>No one matches “{query.trim()}”.</p>}
                  {matches.map((u, i) => {
                    const held = heldElsewhere(u.id);
                    return (
                      <button
                        key={u.id}
                        id={`assign-seat-person-${u.id}`}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={u.id === userId}
                        aria-disabled={!!held || undefined}
                        disabled={!!held}
                        title={held ? `${u.name} already has ${held.label} (${held.zone}). Free that seat first.` : undefined}
                        className={[fields.userOption, styles.option, i === active ? styles.optionActive : ''].join(' ').trim()}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => pick(u)}
                      >
                        <img className={fields.userOptionAvatar} src={avatarSrc(u)} alt="" width={28} height={28} />
                        <span className={fields.userOptionText}>
                          <span className={fields.userOptionName}>{u.name}</span>
                          <span className={fields.userOptionEmail}>{u.email}</span>
                        </span>
                        {held ? <span className={styles.held}>Has {held.label}</span> : u.id === userId && <img src="/admin/user/check.svg" alt="" width={20} height={20} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <label className={fields.field}>
            <span className={fields.label}>Effective from</span>
            <span className={[fields.input, styles.date].join(' ')}>
              <span className={[styles.dateValue, effectiveFrom ? '' : styles.dateEmpty].join(' ').trim()}>{effectiveFrom ? seatDate(effectiveFrom) : 'Date'}</span>
              <img src="/admin/spaces/map/calendar.svg" alt="" width={20} height={20} />
              <input
                ref={dateRef}
                className={styles.dateInput}
                type="date"
                value={effectiveFrom}
                aria-label="Effective from"
                onClick={() => dateRef.current?.showPicker?.()}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </span>
          </label>

          <TextField label="Notes" value={notes} placeholder="Add notes" onChange={(v) => setNotes(v.slice(0, 200))} />

          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={[shell.foot, current ? styles.footSplit : ''].join(' ').trim()}>
          {current && (
            <button type="button" className={styles.remove} disabled={!!busy} aria-busy={busy === 'remove'} onClick={() => void remove()}>
              {busy === 'remove' ? 'Removing…' : 'Remove'}
              {busy === 'remove' && <span className={styles.removeSpinner} aria-hidden="true" />}
            </button>
          )}
          <div className={current ? styles.footRight : undefined} style={current ? undefined : { display: 'contents' }}>
            <button type="button" className={shell.secondary} disabled={!!busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="assign-seat-form" className={shell.primary} disabled={!ready || !!busy} aria-busy={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save'}
              {busy === 'save' ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
