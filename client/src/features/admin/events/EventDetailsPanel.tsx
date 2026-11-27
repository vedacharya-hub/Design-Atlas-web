import { useEffect, useMemo, useRef, useState } from 'react';
// Shared controls, the user table, then the side panel shell; this panel's own rules last.
import ui from '../AdminControls.module.css';
import table from '../users/UsersPanel.module.css';
import panel from '../users/UserDetailsPanel.module.css';
import styles from './EventDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminEvent, AdminUser } from '../../../api/types';
import { useToast } from '../Toaster';
import { AdminModal } from '../AdminModal';
import { pageList } from '../users/UserDetailsPanel';
import { avatarSrc } from '../users/userShared';
import { downloadCsv, useDismiss } from '../users/useRowMenu';
import { ToggleRow } from './EventFields';
import { EventCarousel } from './EventCarousel';
import { STATUS_LABEL, clock, eventCode, longDate } from './eventShared';

type Tab = 'general' | 'rsvps';

/** Members per page on RSVP'd (Figma 9931:283953). */
const PAGE_SIZE = 9;
/** Same as the panel's slide-out; a timer rather than animationend, which a hidden tab never fires. */
const CLOSE_MS = 240;

interface Props {
  event: AdminEvent;
  users: AdminUser[];
  onClose: () => void;
  onEdit: () => void;
  /** After a toggle changed on the server. */
  onChange: (event: AdminEvent) => void;
  onDeleted: (event: AdminEvent) => void;
}

/**
 * Event Details (Figma 1580:129926 General, 9931:283953 RSVP'd) in the right-hand panel: the photos
 * and details with the RSVP and Featured switches (they save as they change) and Delete; and who has
 * RSVP'd, searchable and paged.
 */
export function EventDetailsPanel({ event, users, onClose, onEdit, onChange, onDeleted }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState<'rsvpRequired' | 'featured' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const confirmRef = useRef(false);
  confirmRef.current = confirmDelete;

  function close() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, CLOSE_MS);
  }

  // Escape closes, unless a menu or dialog inside claims it first (the delete question closes itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !confirmRef.current) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  async function toggle(field: 'rsvpRequired' | 'featured', on: boolean) {
    setSaving(field);
    try {
      onChange(await adminApi.updateEvent(event.id, { [field]: on }));
      toast(
        field === 'rsvpRequired'
          ? { title: on ? 'RSVP is now required' : 'RSVP is no longer required', description: <>Updated <strong>{event.title}</strong></> }
          : { title: on ? 'Event featured!' : 'Event no longer featured', description: <><strong>{event.title}</strong> {on ? 'shows first on members’ events list' : 'is back in date order'}</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t update the event', description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await adminApi.deleteEvent(event.id);
      setConfirmDelete(false);
      toast({ title: 'Event deleted!', description: <>Deleted <strong>{event.title}</strong></> });
      onDeleted(event);
    } catch (err) {
      setDeleting(false);
      toast({ tone: 'error', title: 'Couldn’t delete the event', description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, styles.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={`${event.title} event`}
        tabIndex={-1}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Event Details</h2>
            <p className={panel.headSub}>
              {event.location} • {eventCode(event)}
            </p>
          </div>
          <div className={panel.headActions}>
            <button type="button" className={panel.editBtn} aria-label="Edit event" onClick={onEdit}>
              <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
            </button>
            <button type="button" className={panel.closeBtn} aria-label="Close" onClick={close}>
              <img src="/admin/user/close.svg" alt="" width={24} height={24} />
            </button>
          </div>
        </header>

        <div className={panel.body}>
          <section className={[panel.hero, styles.hero].join(' ')}>
            <div className={panel.strip} aria-hidden="true" />
            <div className={styles.heroRow}>
              <h3 className={styles.title}>{event.title}</h3>
              <span className={[panel.status, styles[`status_${event.status}`]].join(' ')}>{STATUS_LABEL[event.status]}</span>
            </div>
            <div className={[panel.tabs, styles.tabs].join(' ')} role="tablist" aria-label="Event details">
              <button type="button" role="tab" aria-selected={tab === 'general'} className={[panel.tab, styles.tab, tab === 'general' ? panel.tabActive : ''].join(' ')} onClick={() => setTab('general')}>
                General
              </button>
              <button type="button" role="tab" aria-selected={tab === 'rsvps'} className={[panel.tab, styles.tab, tab === 'rsvps' ? panel.tabActive : ''].join(' ')} onClick={() => setTab('rsvps')}>
                RSVP’d
              </button>
            </div>
          </section>

          {tab === 'general' ? (
            <div className={styles.general}>
              <EventCarousel images={event.images} date={event.date} height={248} title={event.title} />
              <dl className={styles.facts}>
                <Fact label="EVENT NAME" value={event.title} />
                <Fact label="DESCRIPTION" value={event.description} small />
                <div className={styles.factPair}>
                  <Fact label="EVENT DATE" value={`${longDate(event.date)}, ${clock(event.time)}`} />
                  <Fact label="LISTING DATE" value={longDate(event.listingDate)} />
                </div>
                <div className={styles.factPair}>
                  <Fact label="LOCATION" value={event.location} />
                  <Fact label="CAPACITY" value={String(event.capacity)} />
                </div>
              </dl>
              <div className={styles.toggles}>
                <ToggleRow
                  title="RSVP Required"
                  description="Members reserve a spot to attend, up to the capacity."
                  checked={event.rsvpRequired}
                  disabled={saving !== null}
                  onChange={(on) => void toggle('rsvpRequired', on)}
                />
                <ToggleRow
                  title="Featured"
                  description="Shows the event first on members’ events list."
                  checked={event.featured}
                  disabled={saving !== null}
                  onChange={(on) => void toggle('featured', on)}
                />
              </div>
              <div className={styles.footer}>
                <button type="button" className={styles.delete} onClick={() => setConfirmDelete(true)}>
                  <img src="/admin/events/delete.svg" alt="" width={18} height={18} />
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <Rsvps event={event} users={users} />
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className={styles.modalLayer}>
          <AdminModal
            title="Delete event?"
            width={440}
            onClose={() => !deleting && setConfirmDelete(false)}
            footer={
              <>
                <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} disabled={deleting} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button type="button" className={[ui.btn, ui.btnDanger].join(' ')} disabled={deleting} onClick={() => void remove()}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            }
          >
            <p className={ui.confirm}>
              {eventCode(event)} “{event.title}” will be removed for everyone{event.rsvps.length > 0 ? `, along with its ${event.rsvps.length} RSVPs` : ''}. This can’t be undone.
            </p>
          </AdminModal>
        </div>
      )}
    </>
  );
}

function Fact({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={small ? styles.factText : styles.factValue}>{value}</dd>
    </div>
  );
}

/** RSVP'd: search, the count with a ⋯ to download the list, and the members, nine to a page. */
function Rsvps({ event, users }: { event: AdminEvent; users: AdminUser[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, menuRef, () => setMenuOpen(false));

  const members = useMemo(() => event.rsvps.map((id) => users.find((u) => u.id === id)).filter((u): u is AdminUser => !!u), [event.rsvps, users]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? members.filter((u) => `${u.name} ${u.email} ${u.code}`.toLowerCase().includes(q)) : members;
  }, [members, query]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function exportCsv() {
    setMenuOpen(false);
    downloadCsv(
      `${event.title.replace(/[^\w]+/g, '-').toLowerCase()}-rsvps.csv`,
      ['ID', 'Name', 'Email'],
      members.map((u) => [`#${u.code}`, u.name, u.email]),
    );
  }

  return (
    <div className={styles.rsvps}>
      <div className={styles.rsvpBar}>
        <label className={panel.search}>
          <span className={panel.srOnly}>Search members</span>
          <input
            value={query}
            placeholder="Search Members"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <img src="/admin/search.svg" alt="" width={20} height={20} />
        </label>
        <span className={styles.rsvpTools}>
          <span className={styles.rsvpCount}>
            {members.length} {members.length === 1 ? 'Member' : 'Members'}
          </span>
          <div className={ui.filterWrap} ref={menuRef}>
            <button type="button" className={ui.iconBtn} aria-label="More options" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((o) => !o)}>
              <img src="/admin/more.svg" alt="" width={20} height={20} />
            </button>
            {menuOpen && (
              <div className={table.moreMenu} role="menu">
                <button type="button" role="menuitem" className={table.moreItem} disabled={members.length === 0} onClick={exportCsv}>
                  <img src="/admin/download.svg" alt="" width={20} height={20} />
                  Download as CSV
                </button>
              </div>
            )}
          </div>
        </span>
      </div>

      <div className={styles.card}>
        <div role="table" aria-label={`Members who RSVP’d to ${event.title}`}>
          <div className={styles.headRow} role="row">
            <span role="columnheader">ID</span>
            <span role="columnheader">USER</span>
          </div>
          {rows.length === 0 && (
            <p className={styles.empty}>
              {members.length > 0 ? `No members match “${query.trim()}”.` : event.rsvpRequired ? 'No one has RSVP’d yet.' : 'RSVP isn’t required for this event, so there’s no list.'}
            </p>
          )}
          {rows.map((u) => (
            <div key={u.id} className={styles.row} role="row">
              <span role="cell">
                <span className={table.code}>#{u.code}</span>
              </span>
              <span role="cell" className={table.user}>
                <img className={table.avatar} src={avatarSrc(u)} alt="" width={40} height={40} />
                <span className={table.userText}>
                  <span className={table.name}>{u.name}</span>
                  <span className={table.email} title={u.email}>
                    {u.email}
                  </span>
                </span>
              </span>
            </div>
          ))}
        </div>

        {pages > 1 && (
          <nav className={[panel.pagination, styles.pagination].join(' ')} aria-label="Pages">
            <button type="button" className={panel.pageStep} disabled={current === 1} onClick={() => setPage(current - 1)}>
              <img src="/admin/user/arrow-left.svg" alt="" width={20} height={20} />
              Previous
            </button>
            <span className={panel.pageNumbers}>
              {pageList(current, pages).map((p, i) =>
                p === 'gap' ? (
                  <span key={`gap-${i}`} className={panel.pageNumber} aria-hidden="true">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={[panel.pageNumber, p === current ? panel.pageNumberOn : ''].join(' ').trim()}
                    aria-label={`Page ${p}`}
                    aria-current={p === current ? 'page' : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
            </span>
            <button type="button" className={panel.pageStep} disabled={current === pages} onClick={() => setPage(current + 1)}>
              Next
              <img src="/admin/user/arrow-forward.svg" alt="" width={20} height={20} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
