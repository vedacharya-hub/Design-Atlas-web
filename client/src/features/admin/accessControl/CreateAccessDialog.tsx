import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// The Add New Team dialog's shell, Create Role's header and fields, the side panel's search; this dialog's rules last.
import shell from '../users/AddOrgUnitDialog.module.css';
import roleDialog from '../roles/AddRoleDialog.module.css';
import panel from '../users/UserDetailsPanel.module.css';
import styles from './CreateAccessDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminAccessLevel, WorkLocation } from '../../../api/types';
import { TextField } from '../users/UserFormFields';
import { useToast } from '../Toaster';
import { GlobalLocations, LocationTree } from './LocationTree';

/** Create shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_CREATING_MS = 600;
/** How long "Access level created successfully!" stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

interface Props {
  locations: WorkLocation[];
  onClose: () => void;
  onCreated: (level: AdminAccessLevel) => void;
}

/**
 * Create Access Control (Figma 3066:106945): the level's name and description, a search, then a
 * switch for every company office, every WeWork building in India and the global centres. Create
 * spins while it saves, then "Access level created successfully!" (3066:106722) stands in for the
 * form for two seconds.
 */
export function CreateAccessDialog({ locations, onClose, onCreated }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [officeIds, setOfficeIds] = useState<string[]>([]);
  const [coworkingIds, setCoworkingIds] = useState<string[]>([]);
  const [globalAccess, setGlobalAccess] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ level: AdminAccessLevel; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const offices = useMemo(() => locations.filter((l) => l.privateOffice), [locations]);

  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const createdRef = useRef(created);
  createdRef.current = created;

  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => onCreatedRef.current(created.level), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [created]);

  // Escape closes; during the success message it just closes it sooner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (createdRef.current) onCreatedRef.current(createdRef.current.level);
      else onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    try {
      const [level] = await Promise.all([
        adminApi.createAccessLevel({ name: trimmed, description: description.trim(), officeLocationIds: officeIds, coworkingLocationIds: coworkingIds, globalAccess }),
        new Promise((r) => setTimeout(r, MIN_CREATING_MS)),
      ]);
      setCreated({ level, height: dialogRef.current?.offsetHeight ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: `Couldn’t create ${trimmed}`, description: message });
    }
  }

  if (created) {
    return (
      <div className={shell.backdrop} onMouseDown={() => onCreated(created.level)}>
        <div
          className={[shell.dialog, roleDialog.dialog].join(' ')}
          style={{ height: created.height || undefined }}
          role="dialog"
          aria-modal="true"
          aria-label="Access level created"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={shell.success} role="status">
            <span className={shell.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={shell.successText}>Access level created successfully!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell.backdrop}>
      <div ref={dialogRef} className={[shell.dialog, roleDialog.dialog, styles.dialog].join(' ')} role="dialog" aria-modal="true" aria-labelledby="create-access-title">
        <header className={[shell.head, roleDialog.head].join(' ')}>
          <div className={shell.headText}>
            <h2 id="create-access-title" className={roleDialog.title}>
              Create Access Control
            </h2>
            <p className={roleDialog.subtitle}>Define permissions, service access, and coworking locations</p>
          </div>
          <button type="button" className={[shell.close, roleDialog.close].join(' ')} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="create-access" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <div className={roleDialog.fields}>
            <TextField label="Access level Name" value={name} placeholder="e.g. Level 1" onChange={setName} />
            <TextField label="Description" value={description} placeholder="Who it’s for and where it lets them in" onChange={setDescription} />
          </div>

          <label className={[panel.search, styles.search].join(' ')}>
            <span className={panel.srOnly}>Search locations</span>
            <input
              value={query}
              placeholder="Search Locations, Building"
              onChange={(e) => setQuery(e.target.value)}
              // Enter searches; it shouldn't create the level.
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>

          <LocationTree title="ALL COMPANY OFFICE LOCATIONS" locations={offices} value={officeIds} onChange={setOfficeIds} query={query} />

          <div className={styles.coworking}>
            <LocationTree title="ALL WEWORK CO - WORKING LOCATIONS" locations={locations} value={coworkingIds} onChange={setCoworkingIds} query={query} />
            <GlobalLocations value={globalAccess} onChange={setGlobalAccess} />
          </div>

          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={shell.foot}>
          <button type="button" className={shell.secondary} onClick={onClose}>
            Back
          </button>
          <button type="submit" form="create-access" className={[shell.primary, roleDialog.create].join(' ')} disabled={!name.trim() || saving} aria-busy={saving}>
            {saving ? 'Creating…' : 'Create'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/arrow-forward-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
