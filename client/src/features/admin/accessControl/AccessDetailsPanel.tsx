import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// The side panel shell; this panel's rules last.
import panel from '../users/UserDetailsPanel.module.css';
import styles from './AccessDetailsPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminAccessLevel, AdminAccessLevelUpdate, AdminUser, WorkLocation } from '../../../api/types';
import { useToast } from '../Toaster';
import { SaveButton, type SaveStatus } from '../users/SaveButton';
import { StatusSelect } from '../users/UserDetailsPanel';
import { TextField } from '../users/UserFormFields';
import { MembersSection } from '../MembersSection';
import { GlobalLocations, LocationTree } from './LocationTree';
import { ACCESS_STATUS_LABEL, accessCode, accessLocationCount, accessMembers } from './accessShared';

/** Saving spins at least this long, then "Saved" holds this long before the details come back. */
const MIN_SAVING_MS = 500;
const SAVED_HOLD_MS = 1000;
const PAGE_SIZE = 8;

type Tab = 'office' | 'coworking' | 'accounts';

interface Draft {
  name: string;
  description: string;
  status: AdminAccessLevel['status'];
  officeLocationIds: string[];
  coworkingLocationIds: string[];
  globalAccess: boolean;
}

interface Props {
  level: AdminAccessLevel;
  levels: AdminAccessLevel[];
  users: AdminUser[];
  locations: WorkLocation[];
  onClose: () => void;
  /** After a save; the page reloads users too, as a rename moves them. */
  onChange: (level: AdminAccessLevel) => void;
  /** After an account was moved to another level. */
  onUsersChange: () => Promise<void>;
}

/**
 * Access Control Details from the right (Figma 3145:642807 Office Locations, 3145:643646 Co-Working
 * Locations, 3145:644337 Associated accounts). The pencil turns the name, description and status
 * into fields and the location switches on; the accounts can be moved to another level any time.
 */
export function AccessDetailsPanel({ level, levels, users, locations, onClose, onChange, onUsersChange }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('office');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editing = draft !== null;
  const shown = draft ?? level;
  const members = useMemo(() => accessMembers(level, users), [level, users]);
  const offices = useMemo(() => locations.filter((l) => l.privateOffice), [locations]);

  // Escape backs out of editing first, then closes. Menus inside claim it before this.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (draft) cancelEdit();
      else setClosing(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(savedTimer.current);
      opener?.focus?.();
    };
  }, []);

  const close = () => setClosing(true);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  function startEdit() {
    setDraft({
      name: level.name,
      description: level.description,
      status: level.status,
      officeLocationIds: level.officeLocationIds,
      coworkingLocationIds: level.coworkingLocationIds,
      globalAccess: level.globalAccess,
    });
    setError('');
    setQuery('');
    // The accounts aren't part of the edit; the locations are.
    if (tab === 'accounts') setTab('office');
  }
  function cancelEdit() {
    clearTimeout(savedTimer.current);
    setDraft(null);
    setSaveStatus('idle');
    setError('');
  }

  /** Save → Saving… → Saved, held a moment on the edit view, then back to the details. A failure stays on "Try again". */
  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || saveStatus === 'saving') return;
    const name = draft.name.trim();
    if (!name) {
      setError('Give the access level a name.');
      setSaveStatus('error');
      return;
    }
    const patch: AdminAccessLevelUpdate = {};
    if (name !== level.name) patch.name = name;
    if (draft.description.trim() !== level.description) patch.description = draft.description.trim();
    if (draft.status !== level.status) patch.status = draft.status;
    if (draft.officeLocationIds.join() !== level.officeLocationIds.join()) patch.officeLocationIds = draft.officeLocationIds;
    if (draft.coworkingLocationIds.join() !== level.coworkingLocationIds.join()) patch.coworkingLocationIds = draft.coworkingLocationIds;
    if (draft.globalAccess !== level.globalAccess) patch.globalAccess = draft.globalAccess;
    if (Object.keys(patch).length === 0) return cancelEdit();
    clearTimeout(savedTimer.current);
    setSaveStatus('saving');
    setError('');
    try {
      const [next] = await Promise.all([adminApi.updateAccessLevel(level.id, patch), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      onChange(next);
      setSaveStatus('saved');
      toast(
        patch.status === 'inactive'
          ? { title: `${next.name} was archived!`, description: <>It can’t be given to anyone new</> }
          : { title: `${next.name} was updated!`, description: <>Saved your changes to <strong>{next.name}</strong></> },
      );
      savedTimer.current = setTimeout(() => {
        // The Save button leaves with the edit view: keep focus in the panel.
        const hadFocus = (document.activeElement as HTMLButtonElement | null)?.form?.id === 'access-edit';
        setDraft(null);
        setSaveStatus('idle');
        if (hadFocus) panelRef.current?.focus();
      }, SAVED_HOLD_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSaveStatus('error');
      setError(message);
      toast({ tone: 'error', title: `Couldn’t save ${level.name}`, description: message });
    }
  }

  const others = levels.filter((a) => a.status === 'active' && a.id !== level.id);
  async function move(u: AdminUser, toId: string) {
    const to = others.find((a) => a.id === toId);
    if (!to) return;
    try {
      await adminApi.updateUser(u.id, { accessLevel: to.name });
      await onUsersChange();
      toast({ title: `${u.name} is now on ${to.name}`, description: <>Moved from <strong>{level.name}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t change ${u.name}’s access level`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'office', label: 'Office Locations' },
    { id: 'coworking', label: 'Co-Working Locations' },
    ...(editing ? [] : [{ id: 'accounts' as const, label: 'Associated accounts' }]),
  ];
  const search = (
    <label className={[panel.search, styles.search].join(' ')}>
      <span className={panel.srOnly}>Search locations</span>
      <input
        value={query}
        placeholder="Search Locations, Building"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      />
      <img src="/admin/search.svg" alt="" width={20} height={20} />
    </label>
  );

  return (
    <>
      <div className={[panel.backdrop, closing ? panel.backdropOut : ''].join(' ').trim()} onMouseDown={close} />
      <div
        ref={panelRef}
        className={[panel.panel, styles.panel, closing ? panel.panelOut : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${level.name}` : `${level.name} access level`}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose();
        }}
      >
        <header className={panel.head}>
          <div className={panel.headText}>
            <h2 className={panel.headTitle}>Access Control Details</h2>
            <p className={panel.headSub}>
              {accessCode(level)} • {accessLocationCount(shown)}/{locations.length} locations
              {shown.globalAccess ? ' and every centre abroad' : ''}
            </p>
          </div>
          {editing ? (
            <SaveButton status={saveStatus} form="access-edit" className={panel.saveBtn} />
          ) : (
            <div className={panel.headActions}>
              <button type="button" className={panel.editBtn} aria-label="Edit access level" onClick={startEdit}>
                <img src="/admin/user/edit-24.svg" alt="" width={24} height={24} />
              </button>
              <button type="button" className={panel.closeBtn} aria-label="Close" onClick={close}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </div>
          )}
        </header>

        <form id="access-edit" className={panel.body} onSubmit={(e) => void save(e)} noValidate>
          <section className={[panel.hero, styles.hero].join(' ')}>
            <div className={panel.strip} aria-hidden="true" />
            <div className={styles.heroRow}>
              <h3 className={styles.name}>{draft?.name.trim() || level.name}</h3>
              {editing ? (
                <StatusSelect value={draft.status} label="Access level status" labels={ACCESS_STATUS_LABEL} onChange={(status) => set({ status })} />
              ) : (
                <span className={[panel.status, panel[`status_${level.status}`], styles.badge].join(' ')}>{ACCESS_STATUS_LABEL[level.status]}</span>
              )}
            </div>
            <div className={[panel.tabs, styles.tabs].join(' ')} role="tablist" aria-label="Access level details">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={[panel.tab, tab === t.id ? panel.tabActive : ''].join(' ').trim()}
                  onClick={() => {
                    setTab(t.id);
                    setQuery('');
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p className={panel.error} role="alert">
              {error}
            </p>
          )}

          {tab === 'office' && (
            <div className={styles.content}>
              {editing ? (
                <div className={styles.fields}>
                  <TextField label="Access level Name" value={draft.name} onChange={(name) => set({ name })} />
                  <TextField label="Description" value={draft.description} placeholder="Who it’s for and where it lets them in" onChange={(description) => set({ description })} />
                  {search}
                </div>
              ) : (
                <div className={styles.description}>
                  <p className={styles.label}>DESCRIPTION</p>
                  <p className={styles.text}>{level.description || 'No description'}</p>
                </div>
              )}
              <LocationTree
                title="ALL COMPANY OFFICE LOCATIONS"
                locations={offices}
                value={shown.officeLocationIds}
                onChange={editing ? (officeLocationIds) => set({ officeLocationIds }) : undefined}
                query={editing ? query : ''}
              />
            </div>
          )}

          {tab === 'coworking' && (
            <div className={[styles.content, styles.coworking].join(' ')}>
              <div className={styles.toolbar}>
                {search}
                <p className={styles.centres}>
                  <strong>{shown.coworkingLocationIds.length}</strong>/{locations.length} Centers
                </p>
              </div>
              <LocationTree
                title="ALL INDIA LOCATIONS"
                locations={locations}
                value={shown.coworkingLocationIds}
                onChange={editing ? (coworkingLocationIds) => set({ coworkingLocationIds }) : undefined}
                query={query}
              />
              <GlobalLocations value={shown.globalAccess} onChange={editing ? (globalAccess) => set({ globalAccess }) : undefined} />
            </div>
          )}

          {tab === 'accounts' && (
            <MembersSection
              className={styles.accounts}
              label={`${level.name} accounts`}
              tableLabel={`Users with ${level.name} access`}
              members={members}
              empty="No one has this access level yet."
              moves={others.map((a) => ({ id: a.id, label: `Move to ${a.name}` }))}
              onMove={move}
              pageSize={PAGE_SIZE}
            />
          )}
        </form>
      </div>
    </>
  );
}
