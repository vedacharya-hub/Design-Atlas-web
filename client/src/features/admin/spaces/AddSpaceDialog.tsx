import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
// The Add New Team dialog's shell, then this dialog's own rules.
import shell from '../users/AddOrgUnitDialog.module.css';
import styles from './AddSpaceDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, AdminSpaceView, SpaceFloorMap } from '../../../api/types';
import { SelectField, TextField } from '../users/UserFormFields';
import { useToast } from '../Toaster';
import { FloorMapFile } from './FloorMapFile';
import { FLOOR_MAP_ACCEPT, floorLabel, isFloorMapFile, readFloorMap } from './spaceShared';

/** Save shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 600;
/** How long "Space added Successfully!" stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

interface Props {
  buildings: AdminBuilding[];
  spaces: AdminSpaceView[];
  onClose: () => void;
  onCreated: (space: AdminSpaceView) => void;
}

/**
 * Add New Space (Figma 3189:94333): the floor plan, the building and floor, the leasing area, WeWork's
 * floor ID (filled in, not editable) and the total capacity. Save spins while it saves, then
 * "Space added Successfully!" (3189:94749) stands in for the form for two seconds.
 */
export function AddSpaceDialog({ buildings, spaces, onClose, onCreated }: Props) {
  const toast = useToast();
  const active = buildings.filter((b) => b.status === 'active');
  const [buildingId, setBuildingId] = useState(active[0]?.id ?? '');
  const [floor, setFloor] = useState('');
  const [leasedArea, setLeasedArea] = useState('');
  const [capacity, setCapacity] = useState('');
  const [floorId] = useState(() => crypto.randomUUID());
  const [floorMap, setFloorMap] = useState<SpaceFloorMap | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ space: AdminSpaceView; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const building = active.find((b) => b.id === buildingId);
  // Floors of the building without a space yet.
  const floorChoices = useMemo(() => {
    if (!building) return [];
    const taken = new Set(spaces.filter((s) => s.buildingId === building.id).map((s) => s.floor));
    return Array.from({ length: building.floors }, (_, i) => i + 1)
      .filter((n) => !taken.has(n))
      .map((n) => ({ value: String(n), label: floorLabel(n) }));
  }, [building, spaces]);

  const area = Number(leasedArea.replace(/[,\s]/g, ''));
  const seats = Number(capacity);
  const areaOk = !!leasedArea.trim() && Number.isFinite(area) && area > 0;
  const seatsOk = /^\d+$/.test(capacity.trim()) && seats >= 1 && seats <= 10000;
  const ready = !!building && !!floor && areaOk && seatsOk && !reading;

  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const createdRef = useRef(created);
  createdRef.current = created;

  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => onCreatedRef.current(created.space), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [created]);

  // Escape closes; during the success message it just closes it sooner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (createdRef.current) onCreatedRef.current(createdRef.current.space);
      else onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!isFloorMapFile(file)) {
      setError('The floor plan must be a PNG, JPG, WebP or SVG image.');
      return;
    }
    setError('');
    setReading(true);
    try {
      setFloorMap({ name: file.name, size: file.size, url: await readFloorMap(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file couldn’t be read.');
    } finally {
      setReading(false);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || saving || !building) return;
    setSaving(true);
    setError('');
    const minWait = new Promise((r) => setTimeout(r, MIN_SAVING_MS));
    try {
      const [space] = await Promise.all([
        adminApi.createSpace({ buildingId: building.id, floor: Number(floor), leasedArea: area, capacity: seats, floorId, floorMap }),
        minWait,
      ]);
      setCreated({ space, height: dialogRef.current?.offsetHeight ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setSaving(false);
      toast({ tone: 'error', title: 'Couldn’t add the space', description: message });
    }
  }

  if (created) {
    return (
      <div className={shell.backdrop} onMouseDown={() => onCreated(created.space)}>
        <div
          className={[shell.dialog, styles.dialog].join(' ')}
          style={{ height: created.height || undefined }}
          role="dialog"
          aria-modal="true"
          aria-label="Space added"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={shell.success} role="status">
            <span className={shell.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={shell.successText}>Space added Successfully!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell.backdrop}>
      <div ref={dialogRef} className={[shell.dialog, styles.dialog].join(' ')} role="dialog" aria-modal="true" aria-labelledby="add-space-title">
        <header className={shell.head}>
          <h2 id="add-space-title" className={shell.title}>
            Add New Space
          </h2>
          <button type="button" className={shell.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <form id="add-space" className={[shell.body, styles.body].join(' ')} onSubmit={(e) => void submit(e)} noValidate>
          {floorMap ? (
            <div className={styles.picked}>
              <FloorMapFile map={floorMap} onRemove={() => setFloorMap(null)} />
            </div>
          ) : (
            <button
              type="button"
              className={[styles.drop, dragging ? styles.dropOver : ''].join(' ').trim()}
              aria-describedby="add-space-drop-note"
              disabled={reading}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void pick(e.dataTransfer.files[0]);
              }}
            >
              <img src="/admin/user/upload-folder.png" alt="" width={40} height={40} />
              <span id="add-space-drop-note" className={styles.dropText}>
                {reading ? (
                  <strong>Reading the floor plan…</strong>
                ) : (
                  <>
                    <strong>Click to Upload Floor Plan</strong> or drag and drop
                  </>
                )}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={FLOOR_MAP_ACCEPT}
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <SelectField
            required
            label="Building Name"
            value={buildingId}
            choices={active.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(id) => {
              setBuildingId(id);
              setFloor('');
            }}
          />
          <div className={styles.pair}>
            <SelectField required label="Floor Number" placeholder={floorChoices.length ? 'Select' : 'No free floors'} value={floor} choices={floorChoices} onChange={setFloor} />
            <TextField label="Leasing Area (Sq.Ft)" value={leasedArea} placeholder="e.g. 16000" onChange={(v) => setLeasedArea(v.replace(/[^\d.,]/g, ''))} />
          </div>
          <TextField label="WeWork Space Floor ID" value={floorId} locked lockedTitle="Assigned by WeWork" />
          <TextField label="Total Space Capacity" value={capacity} placeholder="e.g. 120" onChange={(v) => setCapacity(v.replace(/\D/g, ''))} />
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
          <button type="submit" form="add-space" className={shell.primary} disabled={!ready || saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save'}
            {saving ? <span className={shell.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
          </button>
        </footer>
      </div>
    </div>
  );
}
