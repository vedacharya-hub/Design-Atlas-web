import { useEffect, useRef, useState, type FormEvent } from 'react';
// The Add New Team dialog's shell, then this dialog's own rules.
import shell from '../users/AddOrgUnitDialog.module.css';
import styles from './AddRoleDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminRole } from '../../../api/types';
import { TextField } from '../users/UserFormFields';
import { useToast } from '../Toaster';
import { PermissionGroups } from './PermissionGroups';
import { useRestrictedServices } from '../company/companyShared';

/** Create shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_CREATING_MS = 600;
/** How long "Role added successfully!" stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

interface Props {
  onClose: () => void;
  onCreated: (role: AdminRole) => void;
}

/**
 * Create Role (Figma 8349:200956, the full list of permissions 8189:270365): the name and
 * description, then a switch for each permission. Create spins while it saves, then "Role added
 * successfully!" stands in for the form for two seconds.
 */
export function AddRoleDialog({ onClose, onCreated }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ role: AdminRole; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restricted = useRestrictedServices();

  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const createdRef = useRef(created);
  createdRef.current = created;

  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => onCreatedRef.current(created.role), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [created]);

  // Escape closes; during the success message it just closes it sooner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (createdRef.current) onCreatedRef.current(createdRef.current.role);
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
      const [role] = await Promise.all([
        adminApi.createRole({ name: trimmed, description: description.trim(), permissions }),
        new Promise((r) => setTimeout(r, MIN_CREATING_MS)),
      ]);
      setCreated({ role, height: dialogRef.current?.offsetHeight ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: `Couldn’t add ${trimmed}`, description: message });
    }
  }

  if (created) {
    return (
      <div className={shell.backdrop} onMouseDown={() => onCreated(created.role)}>
        <div
          className={[shell.dialog, styles.dialog].join(' ')}
          style={{ height: created.height || undefined }}
          role="dialog"
          aria-modal="true"
          aria-label="Role added"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={shell.success} role="status">
            <span className={shell.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={shell.successText}>Role added successfully!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell.backdrop}>
      <div ref={dialogRef} className={[shell.dialog, styles.dialog].join(' ')} role="dialog" aria-modal="true" aria-labelledby="add-role-title">
        <header className={[shell.head, styles.head].join(' ')}>
          <div className={shell.headText}>
            <h2 id="add-role-title" className={styles.title}>
              Create Role
            </h2>
            <p className={styles.subtitle}>Define role and associated permissions for services access</p>
          </div>
          <button type="button" className={[shell.close, styles.close].join(' ')} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="add-role" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <div className={styles.fields}>
            <TextField label="Role name" value={name} placeholder="e.g. Manager" onChange={setName} />
            <TextField label="Description" value={description} placeholder="What people with this role do" onChange={setDescription} />
          </div>
          <PermissionGroups value={permissions} restricted={restricted} onChange={setPermissions} />
          {error && (
            <p className={shell.error} role="alert">
              {error}
            </p>
          )}
        </form>

        <footer className={shell.foot}>
          <button type="button" className={shell.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-role" className={[shell.primary, styles.create].join(' ')} disabled={!name.trim() || saving} aria-busy={saving}>
            {saving ? 'Creating…' : 'Create'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
