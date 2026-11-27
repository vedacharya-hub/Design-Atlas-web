import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// Shared controls first, so this panel's own rules (e.g. the COMPLETED badge) win.
import ui from '../AdminControls.module.css';
import styles from './AnnouncementsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { SELECTED_BUILDING } from '../../home/selectedBuilding';
import type { Announcement, AnnouncementStatus, NewAnnouncement } from '../../../api/types';

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  active: 'ACTIVE',
  scheduled: 'SCHEDULED',
  archived: 'ARCHIVED',
  completed: 'COMPLETED',
};
const STATUS_ORDER: AnnouncementStatus[] = ['active', 'scheduled', 'completed', 'archived'];
const LOCATIONS = ['Company Level', SELECTED_BUILDING.name, 'Prestige Central'];

const announcementId = (a: Announcement) => `#${String(a.number).padStart(3, '0')}`;

/** "12 Mar, 2026" */
function formatDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}, ${y}`;
}

function todayKey() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function StatusBadge({ status }: { status: AnnouncementStatus }) {
  return <span className={[ui.badge, styles[`badge_${status}`]].join(' ')}>{STATUS_LABEL[status]}</span>;
}

/** Admin → Announcement → List (Figma 1580:128800). */
export function AnnouncementsPanel() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Set<AnnouncementStatus>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    adminApi
      .getAnnouncements()
      .then(setItems)
      .catch(() => setLoadError("Couldn't load announcements. Please try again."));
  }, []);

  // The filter menu closes on any click outside it.
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (a) => (statuses.size === 0 || statuses.has(a.status)) && (!q || a.title.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)),
    );
  }, [items, query, statuses]);

  const replace = (next: Announcement) => {
    setItems((list) => (list ?? []).map((a) => (a.id === next.id ? next : a)));
    setViewing((v) => (v?.id === next.id ? next : v));
  };

  async function toggleArchived(a: Announcement) {
    try {
      replace(await adminApi.setAnnouncementArchived(a.id, !a.archived));
      toast(
        a.archived
          ? { title: 'Announcement restored!', description: <><strong>{a.title}</strong> is back on the schedule</> }
          : { title: 'Announcement archived!', description: <><strong>{a.title}</strong> won’t be shown to members</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${a.archived ? 'restore' : 'archive'} the announcement`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const gone = deleting;
    try {
      await adminApi.deleteAnnouncement(gone.id);
      setItems((list) => (list ?? []).filter((a) => a.id !== gone.id));
      setDeleting(null);
      toast({ title: 'Announcement deleted!', description: <>Deleted <strong>{gone.title}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete the announcement', description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  const toggleStatus = (s: AnnouncementStatus) =>
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <>
      <AdminPanelHeader title="Announcement" description="Configure your work spaces and space settings">
        <div className={styles.searchFilter}>
          <label className={ui.search}>
            <span className={ui.srOnly}>Search announcements</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or location" />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>
          <div className={ui.filterWrap} ref={filterRef}>
            <button
              type="button"
              className={[ui.btn, ui.btnSecondary, statuses.size ? ui.btnSecondaryOn : ''].join(' ').trim()}
              aria-expanded={filterOpen}
              aria-haspopup="true"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <img src="/admin/filter.svg" alt="" width={24} height={24} />
              Filter
              {statuses.size > 0 && <span className={ui.filterCount}>{statuses.size}</span>}
            </button>
            {filterOpen && (
              <div className={ui.filterMenu} role="group" aria-label="Filter by status">
                <span className={ui.filterTitle}>Status</span>
                {STATUS_ORDER.map((s) => (
                  <label key={s} className={ui.filterOption}>
                    <input type="checkbox" checked={statuses.has(s)} onChange={() => toggleStatus(s)} />
                    <StatusBadge status={s} />
                  </label>
                ))}
                <button type="button" className={ui.filterClear} disabled={statuses.size === 0} onClick={() => setStatuses(new Set())}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
        <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} onClick={() => setAdding(true)}>
          Add Announcement
          <img src="/admin/add.svg" alt="" width={20} height={20} />
        </button>
      </AdminPanelHeader>

      <div className={styles.table} role="table" aria-label="Announcements">
        <div className={styles.headRow} role="row">
          {['ID', 'TITLE', 'FROM', 'TO', 'LOCATION', 'STATUS'].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {items === null && !loadError && <p className={ui.empty}>Loading announcements…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {items !== null && shown.length === 0 && (
          <p className={ui.empty}>{items.length === 0 ? 'No announcements yet. Add one to let members know what’s happening.' : 'No announcements match your search or filters.'}</p>
        )}

        {shown.map((a) => (
          <div key={a.id} className={styles.row} role="row">
            <span role="cell" className={styles.id}>
              {announcementId(a)}
            </span>
            <span role="cell" className={styles.title} title={a.title}>
              {a.title}
            </span>
            <span role="cell" className={styles.cell}>
              {formatDate(a.from)}
            </span>
            <span role="cell" className={styles.cell}>
              {formatDate(a.to)}
            </span>
            <span role="cell" className={styles.cell}>
              {a.location}
            </span>
            <span role="cell">
              <StatusBadge status={a.status} />
            </span>
            <span role="cell" className={styles.actions}>
              <button type="button" className={ui.iconBtn} aria-label={`View ${announcementId(a)}`} title="View" onClick={() => setViewing(a)}>
                <img src="/admin/eye.svg" alt="" width={20} height={20} />
              </button>
              <button
                type="button"
                className={[ui.iconBtn, a.archived ? ui.iconBtnOn : ''].join(' ').trim()}
                aria-label={`${a.archived ? 'Restore' : 'Archive'} ${announcementId(a)}`}
                aria-pressed={a.archived}
                title={a.archived ? 'Restore' : 'Archive'}
                onClick={() => void toggleArchived(a)}
              >
                <img src="/admin/archive.svg" alt="" width={20} height={20} />
              </button>
              <button type="button" className={ui.iconBtn} aria-label={`Delete ${announcementId(a)}`} title="Delete" onClick={() => setDeleting(a)}>
                <img src="/admin/delete.svg" alt="" width={20} height={20} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {adding && (
        <AddAnnouncementModal
          onClose={() => setAdding(false)}
          onCreated={(a) => {
            setItems((list) => [...(list ?? []), a]);
            setAdding(false);
            toast({ title: 'Announcement added!', description: <>Published <strong>{a.title}</strong> for {a.location}</> });
          }}
        />
      )}

      {viewing && (
        <AdminModal
          title={viewing.title}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} onClick={() => void toggleArchived(viewing)}>
                {viewing.archived ? 'Restore' : 'Archive'}
              </button>
              <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} onClick={() => setViewing(null)}>
                Done
              </button>
            </>
          }
        >
          <dl className={ui.details}>
            <div>
              <dt>ID</dt>
              <dd>{announcementId(viewing)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={viewing.status} />
              </dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{formatDate(viewing.from)}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{formatDate(viewing.to)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{viewing.location}</dd>
            </div>
          </dl>
          <p className={ui.message}>{viewing.message || 'No message.'}</p>
        </AdminModal>
      )}

      {deleting && (
        <AdminModal
          title="Delete announcement?"
          width={440}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className={[ui.btn, ui.btnDanger].join(' ')} onClick={() => void confirmDelete()}>
                Delete
              </button>
            </>
          }
        >
          <p className={ui.confirm}>
            {announcementId(deleting)} “{deleting.title}” will be removed for everyone. This can’t be undone.
          </p>
        </AdminModal>
      )}
    </>
  );
}

function AddAnnouncementModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Announcement) => void }) {
  const today = todayKey();
  const [form, setForm] = useState<NewAnnouncement>({ title: '', message: '', from: today, to: today, location: LOCATIONS[0] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<NewAnnouncement>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!form.title.trim()) return setError('Add a title for the announcement.');
    if (form.to < form.from) return setError('The end date must be on or after the start date.');
    setSaving(true);
    try {
      onCreated(await adminApi.createAnnouncement(form));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: 'Couldn’t add the announcement', description: message });
    }
  }

  return (
    <AdminModal
      title="Add Announcement"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-announcement" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={saving}>
            {saving ? 'Adding…' : 'Add Announcement'}
          </button>
        </>
      }
    >
      <form id="add-announcement" className={ui.form} onSubmit={(e) => void submit(e)}>
        <label className={ui.field}>
          <span>Title</span>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Diwali celebrations at the café" maxLength={80} />
        </label>
        <label className={ui.field}>
          <span>Message</span>
          <textarea value={form.message} onChange={(e) => set({ message: e.target.value })} rows={4} placeholder="What should members know?" />
        </label>
        <div className={ui.fieldRow}>
          <label className={ui.field}>
            <span>From</span>
            <input type="date" value={form.from} min={today} onChange={(e) => set({ from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} />
          </label>
          <label className={ui.field}>
            <span>To</span>
            <input type="date" value={form.to} min={form.from} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
        <label className={ui.field}>
          <span>Location</span>
          <select value={form.location} onChange={(e) => set({ location: e.target.value })}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </AdminModal>
  );
}
