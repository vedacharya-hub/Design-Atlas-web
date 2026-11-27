import { useEffect, useRef, useState, type FormEvent } from 'react';
import shell from '../users/AddOrgUnitDialog.module.css';
import styles from './AddSpaceDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, NewAdminBuilding } from '../../../api/types';
import { SelectField, TextField } from '../users/UserFormFields';
import { useToast } from '../Toaster';
import { TIME_ZONES } from './spaceShared';

/** Save shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 600;

interface Props {
  /** Edit this building; without it, add a new one. */
  building?: AdminBuilding;
  /** Stacked over a side panel. */
  raised?: boolean;
  onClose: () => void;
  onSaved: (building: AdminBuilding) => void;
}

/**
 * Add Building, or edit one, in the Add New Space dialog's shell: the name and address, the city,
 * state, area and time zone, the number of floors and the leased area. Save spins while it saves.
 */
export function BuildingDialog({ building, raised, onClose, onSaved }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: building?.name ?? '',
    address: building?.address ?? '',
    city: building?.city ?? '',
    state: building?.state ?? '',
    area: building?.area ?? '',
    timeZone: building?.timeZone ?? 'Asia/Kolkata',
    floors: building ? String(building.floors) : '',
    leasedArea: building ? String(building.leasedArea) : '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes this dialog only, not the panel it may sit over.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const floors = Number(form.floors);
  const area = Number(form.leasedArea);
  const ready =
    !!form.name.trim() && !!form.address.trim() && !!form.city.trim() && !!form.state.trim() && Number.isInteger(floors) && floors >= 1 && floors <= 200 && area >= 1;
  const zones = TIME_ZONES.includes(form.timeZone) ? TIME_ZONES : [form.timeZone, ...TIME_ZONES];

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    const payload: NewAdminBuilding = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      area: form.area.trim(),
      timeZone: form.timeZone,
      floors,
      leasedArea: area,
    };
    try {
      const [saved] = await Promise.all([
        building ? adminApi.updateBuilding(building.id, payload) : adminApi.createBuilding(payload),
        new Promise((r) => setTimeout(r, MIN_SAVING_MS)),
      ]);
      onSaved(saved);
      toast(
        building
          ? { title: `${saved.name} was updated!`, description: <>Saved your changes to <strong>{saved.name}</strong></> }
          : { title: `${saved.name} was added!`, description: <>Add its floors from <strong>All Spaces</strong></> },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: building ? `Couldn’t save ${building.name}` : 'Couldn’t add the building', description: message });
    }
  }

  return (
    <div className={shell.backdrop} style={raised ? { zIndex: 420 } : undefined}>
      <div className={[shell.dialog, styles.dialog].join(' ')} role="dialog" aria-modal="true" aria-labelledby="building-dialog-title">
        <header className={shell.head}>
          <h2 id="building-dialog-title" className={shell.title}>
            {building ? 'Edit Building' : 'Add Building'}
          </h2>
          <button type="button" className={shell.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="building-dialog" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          <TextField label="Building Name" value={form.name} placeholder="e.g. WeWork Galaxy" onChange={(name) => set({ name })} />
          <TextField label="Address" value={form.address} placeholder="Street, neighbourhood, city, PIN code" onChange={(address) => set({ address })} />
          <div className={styles.pair}>
            <TextField label="City" value={form.city} placeholder="e.g. Bengaluru" onChange={(city) => set({ city })} />
            <TextField label="State" value={form.state} placeholder="e.g. Karnataka" onChange={(state) => set({ state })} />
          </div>
          <div className={styles.pair}>
            <TextField label="Area" value={form.area} placeholder="e.g. Bellandur" onChange={(v) => set({ area: v })} />
            <SelectField required label="Time Zone" value={form.timeZone} choices={zones} onChange={(timeZone) => set({ timeZone })} />
          </div>
          <div className={styles.pair}>
            <TextField label="Floors" value={form.floors} placeholder="e.g. 10" onChange={(v) => set({ floors: v.replace(/\D/g, '') })} />
            <TextField label="Leased Area (Sq.Ft)" value={form.leasedArea} placeholder="e.g. 16000" onChange={(v) => set({ leasedArea: v.replace(/\D/g, '') })} />
          </div>
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
          <button type="submit" form="building-dialog" className={shell.primary} disabled={!ready || saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
