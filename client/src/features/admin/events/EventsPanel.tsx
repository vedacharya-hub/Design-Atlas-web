import { useEffect, useMemo, useState } from 'react';
// Shared controls first, then the Users table's menus, so this panel's own rules win.
import ui from '../AdminControls.module.css';
import table from '../users/UsersPanel.module.css';
import styles from './EventsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminEvent, AdminUser, WorkLocation } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { RowMenu } from '../users/RowMenu';
import { useRowMenu } from '../users/useRowMenu';
import { EventFormDialog } from './EventFormDialog';
import { EventDetailsPanel } from './EventDetailsPanel';
import { EventsFilterPanel, NO_EVENT_FILTERS, countEventFilters, matchesEventFilters, type EventFilters } from './EventsFilterPanel';
import { STATUS_LABEL, clock, eventCode, shortBuilding, shortDate } from './eventShared';

/** Room for the row menu (four items). */
const ROW_MENU_HEIGHT = 174;

/** Admin → Events → List (Figma 8825:276822): search, filters, Add New Event, and the events table. */
export function EventsPanel() {
  const toast = useToast();
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<EventFilters>(NO_EVENT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  // The create dialog, or the edit dialog for an event.
  const [form, setForm] = useState<{ event?: AdminEvent } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);

  useEffect(() => {
    Promise.all([adminApi.getEvents(), adminApi.getLocations(), adminApi.getUsers()])
      .then(([e, l, u]) => {
        setEvents(e);
        setLocations(l);
        setUsers(u);
      })
      .catch(() => setLoadError('Couldn’t load events. Please try again.'));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (events ?? []).filter((e) => matchesEventFilters(e, filters) && (!q || e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)));
  }, [events, query, filters]);
  const viewing = viewingId ? events?.find((e) => e.id === viewingId) : undefined;
  const filterCount = countEventFilters(filters);

  const replace = (next: AdminEvent) => setEvents((list) => (list ?? []).map((e) => (e.id === next.id ? next : e)));

  async function setArchived(e: AdminEvent, archived: boolean) {
    try {
      replace(await adminApi.updateEvent(e.id, { archived }));
      toast(
        archived
          ? { title: 'Event archived!', description: <><strong>{e.title}</strong> won’t be shown to members</> }
          : { title: 'Event restored!', description: <><strong>{e.title}</strong> is back on the schedule</> },
      );
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t ${archived ? 'archive' : 'restore'} the event`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const gone = deleting;
    try {
      await adminApi.deleteEvent(gone.id);
      setEvents((list) => (list ?? []).filter((e) => e.id !== gone.id));
      setDeleting(null);
      toast({ title: 'Event deleted!', description: <>Deleted <strong>{gone.title}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t delete the event', description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <AdminPanelHeader title="Events" description="Create events for members and see who’s coming">
        <div className={styles.searchFilter}>
          <label className={ui.search}>
            <span className={ui.srOnly}>Search events</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or location" />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>
          <button
            type="button"
            className={[ui.btn, ui.btnSecondary, filterCount ? ui.btnSecondaryOn : ''].join(' ').trim()}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(true)}
          >
            <img src="/admin/filter.svg" alt="" width={24} height={24} />
            Filter
            {filterCount > 0 && <span className={ui.filterCount}>{filterCount}</span>}
          </button>
        </div>
        <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!events || locations.length === 0} onClick={() => setForm({})}>
          Add New Event
          <img src="/admin/add.svg" alt="" width={20} height={20} />
        </button>
      </AdminPanelHeader>

      <div className={styles.table} role="table" aria-label="Events">
        <div className={styles.headRow} role="row">
          {['ID', 'TITLE', 'TIME & DATE', 'LOCATION', 'STATUS'].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {events === null && !loadError && <p className={ui.empty}>Loading events…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {events !== null && shown.length === 0 && (
          <p className={ui.empty}>{events.length === 0 ? 'No events yet. Add one to give members something to look forward to.' : 'No events match your search or filters.'}</p>
        )}

        {shown.map((e) => (
          <div key={e.id} className={[styles.row, e.status === 'archived' ? styles.rowArchived : ''].join(' ').trim()} role="row">
            <span role="cell" className={styles.id}>
              {eventCode(e)}
            </span>
            <span role="cell" className={styles.title} title={e.title}>
              {e.title}
            </span>
            <span role="cell" className={styles.cell}>
              {clock(e.time)}, {shortDate(e.date)}
            </span>
            <span role="cell" className={styles.cell} title={e.location}>
              {shortBuilding(e.location)}
            </span>
            <span role="cell">
              <span className={[ui.badge, styles[`badge_${e.status}`]].join(' ')}>{STATUS_LABEL[e.status]}</span>
            </span>
            <span role="cell" className={styles.actions}>
              <button type="button" className={ui.iconBtn} aria-label={`View ${e.title}`} title="View" onClick={() => setViewingId(e.id)}>
                <img src="/admin/eye.svg" alt="" width={20} height={20} />
              </button>
              <div className={ui.filterWrap} ref={rowMenu.menu?.id === e.id ? rowMenu.ref : undefined}>
                <button
                  type="button"
                  className={ui.iconBtn}
                  aria-label={`More actions for ${e.title}`}
                  aria-haspopup="menu"
                  aria-expanded={rowMenu.menu?.id === e.id}
                  onClick={(ev) => rowMenu.open(e.id, ev.currentTarget)}
                >
                  <img src="/admin/more.svg" alt="" width={20} height={20} />
                </button>
                {rowMenu.menu?.id === e.id && (
                  <RowMenu state={rowMenu} className={table.menu}>
                    <button
                      type="button"
                      role="menuitem"
                      className={table.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        setViewingId(e.id);
                      }}
                    >
                      View details
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={table.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        setForm({ event: e });
                      }}
                    >
                      Edit event
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={table.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        void setArchived(e, !e.archived);
                      }}
                    >
                      {e.archived ? 'Restore event' : 'Archive event'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={[table.menuItem, table.menuItemDanger].join(' ')}
                      onClick={() => {
                        rowMenu.close();
                        setDeleting(e);
                      }}
                    >
                      Delete event
                    </button>
                  </RowMenu>
                )}
              </div>
            </span>
          </div>
        ))}
      </div>

      {filterOpen && events && (
        <EventsFilterPanel events={events} locations={locations} value={filters} onApply={setFilters} onClose={() => setFilterOpen(false)} />
      )}

      {viewing && (
        <EventDetailsPanel
          key={viewing.id}
          event={viewing}
          users={users}
          onClose={() => setViewingId(null)}
          onEdit={() => setForm({ event: viewing })}
          onChange={replace}
          onDeleted={(gone) => {
            setEvents((list) => (list ?? []).filter((e) => e.id !== gone.id));
            setViewingId(null);
          }}
        />
      )}

      {form && (
        <EventFormDialog
          event={form.event}
          locations={locations}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setEvents((list) => (form.event ? (list ?? []).map((e) => (e.id === saved.id ? saved : e)) : [...(list ?? []), saved]));
            setForm(null);
          }}
        />
      )}

      {deleting && (
        <AdminModal
          title="Delete event?"
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
            {eventCode(deleting)} “{deleting.title}” will be removed for everyone{deleting.rsvps.length > 0 ? `, along with its ${deleting.rsvps.length} RSVPs` : ''}. This can’t be undone.
          </p>
        </AdminModal>
      )}
    </>
  );
}
