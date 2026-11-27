import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import styles from './EventFormDialog.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminEvent, NewAdminEvent, WorkLocation } from '../../../api/types';
import { useToast } from '../Toaster';
import { PickerField, SelectBox, TextArea, TextInput, ToggleRow } from './EventFields';
import { EventCarousel } from './EventCarousel';
import { MAX_IMAGES, clock, fullDay, readEventImage, todayKey } from './eventShared';

type Step = 1 | 2 | 3;
const STEP_NAME: Record<Step, string> = { 1: 'Primary Information', 2: 'Upload Image', 3: 'Preview' };
const CAPACITIES = [10, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300, 500, 1000];
const DESCRIPTION_MAX = 2000;
/** An upload's bar runs for at least this long, so it reads as one. */
const UPLOAD_MS = 700;
/** Create shows its spinner at least this long, so a fast save doesn't flicker past it. */
const MIN_SAVING_MS = 600;
/** How long the success message stays before the dialog closes itself. */
const SUCCESS_MS = 2000;
const DEFAULT_LOCATION = 'loc-vaishnavi';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Form {
  title: string;
  description: string;
  capacity: number;
  locationId: string;
  date: string;
  time: number | null;
  listingDate: string;
  rsvpRequired: boolean;
  featured: boolean;
}

/** A photo on step 2: reading (`src` null, `progress` 0–100) or ready. */
interface Upload {
  id: number;
  name: string;
  /** What the thumbnail shows while it reads. */
  preview: string;
  src: string | null;
  progress: number;
}

interface Props {
  /** Editing this event; creating one when absent. */
  event?: AdminEvent;
  locations: WorkLocation[];
  onClose: () => void;
  /** After the success message: the saved event. */
  onSaved: (event: AdminEvent) => void;
}

/**
 * Create New Event (Figma 1580:129122 Primary Information, 1580:129250 Upload Image, 1580:129346
 * Preview): a 522px dialog with a step bar. Create spins while it saves, then "New Event added
 * successfully!" (1580:129447) stands in for the form for two seconds before the dialog closes.
 * Edit Event is the same dialog, filled in.
 */
export function EventFormDialog({ event, locations, onClose, onSaved }: Props) {
  const toast = useToast();
  const editing = !!event;
  const today = todayKey();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Form>(() => ({
    title: event?.title ?? '',
    description: event?.description ?? '',
    capacity: event?.capacity ?? 100,
    locationId: event?.locationId ?? (locations.some((l) => l.id === DEFAULT_LOCATION) ? DEFAULT_LOCATION : locations[0]?.id ?? ''),
    date: event?.date ?? '',
    time: event?.time ?? null,
    listingDate: event?.listingDate ?? '',
    rsvpRequired: event?.rsvpRequired ?? true,
    featured: event?.featured ?? false,
  }));
  const seq = useRef(0);
  const [uploads, setUploads] = useState<Upload[]>(() =>
    (event?.images ?? []).map((src, i) => ({ id: ++seq.current, name: src.startsWith('data:') ? `Photo ${i + 1}` : src.split('/').pop() ?? `Photo ${i + 1}`, preview: src, src, progress: 100 })),
  );
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [done, setDone] = useState<{ event: AdminEvent; height: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const location = locations.find((l) => l.id === form.locationId);
  const listingLate = !!form.listingDate && !!form.date && form.listingDate > form.date;
  const stepOneReady = !!form.title.trim() && !!form.description.trim() && !!form.date && form.time !== null && !!form.listingDate && !listingLate && !!form.locationId;
  const ready = uploads.filter((u) => u.src);
  const reading = uploads.some((u) => !u.src);
  const stepTwoReady = ready.length > 0 && !reading;
  const images = ready.map((u) => u.src!);

  // The callbacks sit in refs so a re-render of the page underneath doesn't restart the clock.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const stateRef = useRef({ done, viewing, saving });
  stateRef.current = { done, viewing, saving };

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => onSavedRef.current(done.event), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [done]);

  // Escape closes the photo first, then the dialog; during the success message it just ends it
  // sooner. Claimed before a panel underneath sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      const s = stateRef.current;
      if (s.viewing) setViewing(null);
      else if (s.done) onSavedRef.current(s.done.event);
      else if (!s.saving) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  async function addFiles(list: FileList | File[]) {
    setUploadError('');
    const files = [...list];
    const room = MAX_IMAGES - uploads.length;
    if (files.length > room) setUploadError(room > 0 ? `Up to ${MAX_IMAGES} images: added the first ${room}.` : `An event can have up to ${MAX_IMAGES} images.`);
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!file.type.startsWith('image/')) {
        setUploadError(`${file.name} isn’t an image.`);
        continue;
      }
      const id = ++seq.current;
      const preview = URL.createObjectURL(file);
      setUploads((u) => [...u, { id, name: file.name, preview, src: null, progress: 0 }]);
      const started = Date.now();
      const tick = setInterval(() => {
        const progress = Math.min(92, Math.round(((Date.now() - started) / UPLOAD_MS) * 92));
        setUploads((u) => u.map((x) => (x.id === id && !x.src ? { ...x, progress } : x)));
      }, 40);
      try {
        const [src] = await Promise.all([readEventImage(file), wait(UPLOAD_MS)]);
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, src, preview: src, progress: 100 } : x)));
      } catch (err) {
        setUploads((u) => u.filter((x) => x.id !== id));
        setUploadError(err instanceof Error ? err.message : 'That image can’t be used.');
      } finally {
        clearInterval(tick);
        URL.revokeObjectURL(preview);
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (saving || form.time === null) return;
    setSaving(true);
    setSaveError('');
    const payload: NewAdminEvent = {
      title: form.title.trim(),
      description: form.description.trim(),
      capacity: form.capacity,
      locationId: form.locationId,
      date: form.date,
      time: form.time,
      listingDate: form.listingDate,
      rsvpRequired: form.rsvpRequired,
      featured: form.featured,
      images,
    };
    try {
      const [saved] = await Promise.all([event ? adminApi.updateEvent(event.id, payload) : adminApi.createEvent(payload), wait(MIN_SAVING_MS)]);
      setDone({ event: saved, height: dialogRef.current?.offsetHeight ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSaving(false);
      setSaveError(message);
      toast({ tone: 'error', title: editing ? 'Couldn’t save the event' : 'Couldn’t create the event', description: message });
    }
  }

  if (done) {
    return (
      <div className={styles.backdrop} onMouseDown={() => onSaved(done.event)}>
        <div className={styles.dialog} style={{ height: done.height || undefined }} role="dialog" aria-modal="true" aria-label="Event saved" onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.success} role="status">
            <span className={styles.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={styles.successText}>{editing ? 'Event updated successfully!' : 'New Event added successfully!'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="event-form-title">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="event-form-title" className={styles.title}>
              {editing ? 'Edit Event' : 'Create New Event'}
            </h2>
            <p className={styles.subtitle}>{editing ? 'Update the details members see for this event' : 'Add an event for members to discover and RSVP to'}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Close" disabled={saving} onClick={onClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <div className={styles.steps}>
          <span className={styles.stepName}>{STEP_NAME[step]}</span>
          <span className={styles.stepLine} aria-hidden="true" />
          <span className={styles.stepCount} aria-label={`Step ${step} of 3`}>
            <span className={styles.stepNumber}>{step}</span>/3 Steps
          </span>
        </div>

        {step === 1 && (
          <div key="step-1" className={[styles.body, styles.bodyForm].join(' ')}>
            <TextInput label="Event name" value={form.title} placeholder="e.g. WeWork Mixer: Meet Your Neighbours" maxLength={120} onChange={(title) => set({ title })} />
            <TextArea
              label="Description*"
              value={form.description}
              placeholder="What’s happening, who it’s for, anything members should bring"
              maxLength={DESCRIPTION_MAX}
              onChange={(description) => set({ description })}
            />
            <SelectBox
              label="Capacity"
              value={String(form.capacity)}
              choices={[...new Set([...CAPACITIES, form.capacity])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => set({ capacity: Number(v) })}
            />
            <SelectBox
              card
              label="Building"
              icon="/admin/events/building.svg"
              value={form.locationId}
              choices={locations.map((l) => ({ value: l.id, label: l.name }))}
              onChange={(locationId) => set({ locationId })}
            />
            <div className={styles.pair}>
              <PickerField label="Event Date*" type="date" value={form.date} min={editing ? undefined : today} onChange={(v) => set({ date: (v as string) ?? '' })} />
              <PickerField label="Time*" type="time" value={form.time} onChange={(v) => set({ time: v as number | null })} />
            </div>
            <PickerField
              label="Listing Date*"
              type="date"
              value={form.listingDate}
              max={form.date || undefined}
              invalid={listingLate}
              help={listingLate ? 'Members need to see it before it happens: pick a date on or before the event date.' : undefined}
              onChange={(v) => set({ listingDate: (v as string) ?? '' })}
            />
            <ToggleRow
              title="RSVP Required"
              description="Members reserve a spot to attend, up to the capacity."
              checked={form.rsvpRequired}
              onChange={(rsvpRequired) => set({ rsvpRequired })}
            />
            <ToggleRow title="Featured" description="Shows the event first on members’ events list." checked={form.featured} onChange={(featured) => set({ featured })} />
          </div>
        )}

        {step === 2 && (
          <div key="step-2" className={[styles.body, styles.bodyUpload].join(' ')}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div
              className={[styles.drop, dragging ? styles.dropActive : ''].join(' ').trim()}
              role="button"
              tabIndex={0}
              aria-label="Upload images"
              aria-describedby="event-upload-note"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={onDrop}
            >
              <span className={styles.folder}>
                <img src="/admin/user/upload-folder.png" alt="" />
              </span>
              <span className={styles.dropLine}>
                <strong>Click to Upload</strong> or drag and drop images for the event
              </span>
            </div>
            <p id="event-upload-note" className={uploadError ? styles.uploadError : styles.uploadNote} role={uploadError ? 'alert' : undefined}>
              {uploadError || `Up to ${MAX_IMAGES} images. The first one is the cover members see.`}
            </p>

            {uploads.length > 0 && (
              <section className={styles.uploads} aria-labelledby="event-uploads-title">
                <h3 id="event-uploads-title" className={styles.uploadsTitle}>
                  UPLOAD IMAGES
                </h3>
                <ul className={styles.uploadList}>
                  {uploads.map((u) => (
                    <li key={u.id} className={styles.upload}>
                      <img className={styles.thumb} src={u.preview} alt="" />
                      {u.src ? (
                        <span className={styles.uploadName} title={u.name}>
                          {u.name}
                        </span>
                      ) : (
                        <span className={styles.progress} role="progressbar" aria-label={`Uploading ${u.name}`} aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100}>
                          <span className={styles.bar}>
                            <span className={styles.barFill} style={{ width: `${u.progress}%` }} />
                          </span>
                          <span className={styles.percent}>{u.progress}%</span>
                        </span>
                      )}
                      <span className={styles.uploadActions}>
                        {u.src && (
                          <button type="button" className={styles.iconBtn} aria-label={`View ${u.name}`} onClick={() => setViewing(u.src)}>
                            <img src="/admin/events/eye.svg" alt="" width={20} height={20} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label={`Remove ${u.name}`}
                          disabled={!u.src}
                          onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))}
                        >
                          <img src="/admin/events/delete.svg" alt="" width={20} height={20} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {step === 3 && (
          <div key="step-3" className={[styles.body, styles.bodyPreview].join(' ')}>
            <div className={styles.preview}>
              <EventCarousel images={images} date={form.date} height={221} title={form.title} />
              <div className={styles.previewText}>
                <div className={styles.previewHead}>
                  <h3 className={styles.previewTitle}>{form.title.trim()}</h3>
                  <p className={styles.previewDescription}>{form.description.trim()}</p>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewIcon}>
                    <img src="/admin/events/time.svg" alt="" width={20} height={20} />
                  </span>
                  <span className={styles.previewStrong}>
                    {form.date && fullDay(form.date)}
                    {form.time !== null && `, ${clock(form.time, true)}`}
                  </span>
                </div>
                <div className={[styles.previewRow, styles.previewRowTop].join(' ')}>
                  <span className={styles.previewIcon}>
                    <img src="/admin/events/pin.svg" alt="" width={20} height={20} />
                  </span>
                  <span className={styles.previewPlace}>
                    <span className={styles.previewStrong}>{location?.name}</span>
                    <span className={styles.previewAddress}>{location?.address}</span>
                  </span>
                </div>
              </div>
            </div>
            {/* What members will press: shown, not live here. */}
            <div className={styles.previewCtas} aria-hidden="true">
              <span className={styles.previewSave}>
                Save
                <img src="/admin/events/heart.svg" alt="" width={24} height={24} />
              </span>
              {form.rsvpRequired && <span className={styles.previewRsvp}>RSVP</span>}
            </div>
            {saveError && (
              <p className={styles.saveError} role="alert">
                {saveError}
              </p>
            )}
          </div>
        )}

        <footer className={styles.foot}>
          {step === 1 ? (
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancel
            </button>
          ) : (
            <button type="button" className={styles.secondary} disabled={saving} onClick={() => setStep((s) => (s - 1) as Step)}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className={styles.primary}
              disabled={step === 1 ? !stepOneReady : !stepTwoReady}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {step === 1 ? 'Next - Upload Images' : 'Next - Preview'}
              <img src="/admin/user/arrow-forward-white.svg" alt="" width={20} height={20} />
            </button>
          ) : (
            <button type="button" className={styles.primary} disabled={saving} aria-busy={saving} onClick={() => void submit()}>
              {saving ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save' : 'Create'}
              {saving ? <span className={styles.spinner} aria-hidden="true" /> : <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />}
            </button>
          )}
        </footer>

        {viewing && (
          <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Image preview" onMouseDown={() => setViewing(null)}>
            <img src={viewing} alt="" />
          </div>
        )}
      </div>
    </div>
  );
}
