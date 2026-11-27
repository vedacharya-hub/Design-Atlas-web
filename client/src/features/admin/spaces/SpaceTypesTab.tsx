import { useMemo, useState } from 'react';
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import styles from './SpacesPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { SpaceType } from '../../../api/types';
import { AdminModal } from '../AdminModal';
import { useToast } from '../Toaster';
import { SpaceTypeDialog } from './SpaceTypeDialog';
import { BOOKING_KIND_LABEL, typeCode } from './spaceShared';

interface Props {
  types: SpaceType[] | null;
  loadError: string;
  onCreated: (type: SpaceType) => void;
  onChange: (type: SpaceType) => void;
  onDeleted: (type: SpaceType) => void;
}

/** Space types (Figma 1588:140226): the kinds of space and how they're booked, with edit and delete on each. */
export function SpaceTypesTab({ types, loadError, onCreated, onChange, onDeleted }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  // The add dialog, or the edit dialog for a type.
  const [form, setForm] = useState<{ type?: SpaceType } | null>(null);
  const [deleting, setDeleting] = useState<SpaceType | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (types ?? []).filter((t) => !q || [t.name, typeCode(t), BOOKING_KIND_LABEL[t.booking]].some((v) => v.toLowerCase().includes(q)));
  }, [types, query]);

  async function confirmDelete() {
    if (!deleting) return;
    const gone = deleting;
    try {
      await adminApi.deleteSpaceType(gone.id);
      onDeleted(gone);
      setDeleting(null);
      toast({ title: 'Space type deleted!', description: <>Deleted <strong>{gone.name}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t delete ${gone.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.barText}>
          <h2 className={styles.barTitle}>Space Types</h2>
          <p className={styles.barDescription}>The kinds of space members book, and for how long</p>
        </div>
        <div className={styles.controls}>
          <label className={[ui.search, styles.search].join(' ')}>
            <span className={ui.srOnly}>Search space types</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search space types" />
            <img src="/admin/search.svg" alt="" width={20} height={20} />
          </label>
          <button type="button" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={!types} onClick={() => setForm({})}>
            Add Type
            <img src="/admin/add.svg" alt="" width={20} height={20} />
          </button>
        </div>
      </div>

      <div className={styles.table} role="table" aria-label="Space types">
        <div className={[styles.headRow, styles.typeCols].join(' ')} role="row">
          <span role="columnheader">ID</span>
          <span role="columnheader">SPACE</span>
          <span role="columnheader">TYPE</span>
          <span role="columnheader" className={ui.srOnly}>
            Actions
          </span>
        </div>

        {types === null && !loadError && <p className={ui.empty}>Loading space types…</p>}
        {loadError && <p className={ui.empty}>{loadError}</p>}
        {types !== null && shown.length === 0 && <p className={ui.empty}>{types.length === 0 ? 'No space types yet. Add one.' : 'No space types match your search.'}</p>}

        {shown.map((t) => (
          <div key={t.id} className={[styles.row, styles.typeCols].join(' ')} role="row">
            <span role="cell">
              <span className={users.code}>{typeCode(t)}</span>
            </span>
            <span role="cell" className={[styles.cell, styles.nowrap].join(' ')} title={t.name}>
              {t.name}
            </span>
            <span role="cell" className={styles.cell}>
              {BOOKING_KIND_LABEL[t.booking]}
            </span>
            <span role="cell" className={styles.actions}>
              <button type="button" className={ui.iconBtn} aria-label={`Edit ${t.name}`} title="Edit" onClick={() => setForm({ type: t })}>
                <img src="/admin/spaces/edit.svg" alt="" width={20} height={20} />
              </button>
              <button type="button" className={ui.iconBtn} aria-label={`Delete ${t.name}`} title="Delete" onClick={() => setDeleting(t)}>
                <img src="/admin/delete.svg" alt="" width={20} height={20} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {form && (
        <SpaceTypeDialog
          type={form.type}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            if (form.type) onChange(saved);
            else onCreated(saved);
            setForm(null);
          }}
        />
      )}

      {deleting && (
        <AdminModal
          title="Delete space type?"
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
          <p className={ui.confirm}>{typeCode(deleting)} “{deleting.name}” will be removed. This can’t be undone.</p>
        </AdminModal>
      )}
    </>
  );
}
