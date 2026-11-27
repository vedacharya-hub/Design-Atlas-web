import { useEffect, useState } from 'react';
import styles from './ShiftsTab.module.css';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Edit, Trash, Clock, Plus, Layers, Warning, Info, Check } from '../../../components/ui/icons';
import { ShiftFloorMap } from '../ShiftFloorMap';
import { adminApi } from '../../../api/adminApi';
import type { Floor, FloorShift, Seat } from '../../../api/types';

const PALETTE = ['#3659f5', '#f97316', '#7c3aed', '#0ea5e9', '#db2777', '#11a830'];
const DELETE_CONFIRM_PHRASE = 'delete shift';

interface Props {
  floor: Floor;
  seats: Seat[];
  onFloorChange: () => void;
}

interface Draft {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
}

type ConfirmState = { kind: 'edit'; pending: Draft } | { kind: 'delete'; shift: FloorShift };

export function ShiftsTab({ floor, seats, onFloorChange }: Props) {
  const [shifts, setShifts] = useState<FloorShift[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [deleteText, setDeleteText] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const refreshShifts = () => {
    adminApi.getShifts(floor.id).then((list) => {
      setShifts(list);
      setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? null)));
    });
  };

  useEffect(() => {
    refreshShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.id]);

  useEffect(() => {
    if (!savedNotice) return;
    const t = setTimeout(() => setSavedNotice(false), 4000);
    return () => clearTimeout(t);
  }, [savedNotice]);

  const selected = shifts.find((s) => s.id === selectedId) ?? null;

  async function toggleEnabled(next: boolean) {
    setBusy(true);
    try {
      await adminApi.setShiftsEnabled(floor.id, next);
      onFloorChange();
    } finally {
      setBusy(false);
    }
  }

  async function commitDraft(target: Draft) {
    setBusy(true);
    try {
      if (target.id) {
        await adminApi.updateShift(floor.id, target.id, {
          name: target.name,
          startTime: target.startTime,
          endTime: target.endTime,
          color: target.color,
        });
      } else {
        const created = await adminApi.createShift(floor.id, {
          name: target.name,
          startTime: target.startTime,
          endTime: target.endTime,
          color: target.color,
        });
        setSelectedId(created.id);
      }
      setDraft(null);
      setSavedNotice(true);
      refreshShifts();
    } finally {
      setBusy(false);
    }
  }

  function handleSaveClick() {
    if (!draft || !draft.name.trim()) return;
    // Editing an existing shift can cancel bookings already made within it — confirm first.
    if (draft.id) {
      setConfirm({ kind: 'edit', pending: draft });
    } else {
      commitDraft(draft);
    }
  }

  async function confirmEdit() {
    if (confirm?.kind !== 'edit') return;
    const pending = confirm.pending;
    setConfirm(null);
    await commitDraft(pending);
  }

  async function confirmDelete() {
    if (confirm?.kind !== 'delete') return;
    const shift = confirm.shift;
    setBusy(true);
    try {
      await adminApi.deleteShift(floor.id, shift.id);
      if (selectedId === shift.id) setSelectedId(null);
      refreshShifts();
    } finally {
      setBusy(false);
      setConfirm(null);
      setDeleteText('');
    }
  }

  function closeConfirm() {
    setConfirm(null);
    setDeleteText('');
  }

  async function toggleShiftEnabled(shift: FloorShift, next: boolean) {
    setShifts((prev) => prev.map((s) => (s.id === shift.id ? { ...s, enabled: next } : s)));
    await adminApi.updateShift(floor.id, shift.id, { enabled: next });
  }

  async function toggleSeat(seatId: string) {
    if (!selected) return;
    const has = selected.seatIds.includes(seatId);
    const seatIds = has ? selected.seatIds.filter((id) => id !== seatId) : [...selected.seatIds, seatId];
    setShifts((prev) => prev.map((s) => (s.id === selected.id ? { ...s, seatIds } : s)));
    await adminApi.updateShift(floor.id, selected.id, { seatIds });
  }

  return (
    <div className={styles.root}>
      <div className={styles.configBox}>
        <div className={styles.enableRow}>
          <div>
            <div className={styles.enableTitle}>Enable Shifts</div>
            <p className={styles.enableDesc}>
              Turn this on to split the floor into shifts. This is a floor-wide switch — turning it off closes
              every shift here immediately, turning it on opens them all again.
            </p>
          </div>
          <Switch checked={floor.shiftsEnabled} onChange={toggleEnabled} disabled={busy} aria-label="Enable shifts" />
        </div>

        <div className={[styles.configBody, floor.shiftsEnabled ? styles.configBodyOpen : ''].join(' ')}>
          <div className={styles.configBodyInner}>
            <div className={styles.listHeader}>
              <span className={styles.listHeaderTitle}>
                Shifts <span className={styles.listHeaderCount}>{shifts.length}</span>
              </span>
              <Button
                variant="secondary"
                onClick={() => setDraft({ name: '', startTime: '09:00', endTime: '17:00', color: PALETTE[shifts.length % PALETTE.length] })}
              >
                <Plus width={14} height={14} /> Add Shift
              </Button>
            </div>
            <div className={styles.shiftList}>
              {shifts.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  className={[
                    styles.shiftRow,
                    s.id === selectedId ? styles.shiftRowActive : '',
                    !s.enabled ? styles.shiftRowOff : '',
                  ].join(' ')}
                  onClick={() => {
                    setSelectedId(s.id);
                    setAssignMode(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSelectedId(s.id);
                      setAssignMode(false);
                    }
                  }}
                >
                  <div className={styles.shiftRowMain}>
                    <span className={styles.dot} style={{ background: s.color }} />
                    <span className={styles.shiftName}>{s.name}</span>
                    <span className={styles.shiftTime}>
                      <Clock width={12} height={12} /> {s.startTime} – {s.endTime}
                    </span>
                    <span className={styles.shiftCount}>{s.seatIds.length} desks</span>
                    {!s.enabled && <span className={styles.offBadge}>Off</span>}
                  </div>
                  <div className={styles.shiftRowControls}>
                    <span className={styles.switchGuard} onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={s.enabled}
                        onChange={(next) => toggleShiftEnabled(s, next)}
                        disabled={busy}
                        aria-label={`Enable ${s.name}`}
                      />
                    </span>
                    <span className={styles.shiftActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Edit ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraft({ id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime, color: s.color });
                        }}
                      >
                        <Edit width={13} height={13} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={`Delete ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirm({ kind: 'delete', shift: s });
                        }}
                      >
                        <Trash width={13} height={13} />
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {draft && (
              <div className={styles.form}>
                <div className={styles.formRow}>
                  <label className={styles.field}>
                    <span>Shift name</span>
                    <input value={draft.name} placeholder="e.g. Morning Shift" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span>Start time</span>
                    <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span>End time</span>
                    <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
                  </label>
                </div>
                <div className={styles.swatches}>
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Use color ${c}`}
                      className={[styles.swatch, draft.color === c ? styles.swatchActive : ''].join(' ')}
                      style={{ background: c }}
                      onClick={() => setDraft({ ...draft, color: c })}
                    />
                  ))}
                </div>
                <div className={styles.formActions}>
                  <Button variant="secondary" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveClick} disabled={!draft.name.trim() || busy}>
                    {draft.id ? 'Save changes' : 'Create shift'}
                  </Button>
                </div>
              </div>
            )}

            {shifts.length === 0 && !draft && (
              <p className={styles.noShiftsHint}>No shifts yet. Add one above to start assigning desks.</p>
            )}

            <div className={styles.globalNotice}>
              <Info width={14} height={14} />
              <span>This enables shifts to all your spaces.</span>
            </div>
            {savedNotice && (
              <div className={[styles.globalNotice, styles.savedNotice].join(' ')}>
                <Check width={14} height={14} />
                <span>Saved — this enables shifts to all your spaces.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {!floor.shiftsEnabled ? (
        <div className={styles.emptyState}>
          <Layers width={28} height={28} />
          <p>Shift management is turned off for this space.</p>
          <span>Turn it on above to create shifts and assign desks to each one.</span>
        </div>
      ) : selected ? (
        <div className={styles.mapSection}>
          <div className={styles.mapHead}>
            <div>
              <h3 className={styles.mapTitle}>{selected.name}</h3>
              <span className={styles.mapSub}>
                {selected.startTime} – {selected.endTime} · {selected.seatIds.length} desks assigned
              </span>
            </div>
            <Button variant={assignMode ? 'primary' : 'secondary'} onClick={() => setAssignMode((m) => !m)}>
              {assignMode ? 'Done assigning' : 'Assign desks'}
            </Button>
          </div>
          <ShiftFloorMap
            image={floor.image}
            seats={seats}
            assignedSeatIds={selected.seatIds}
            color={selected.color}
            editable={assignMode}
            onSeatClick={(seat) => toggleSeat(seat.id)}
          />
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No shifts yet.</p>
          <span>Add a shift above to start assigning desks on the map.</span>
        </div>
      )}

      {confirm?.kind === 'edit' && (
        <Modal onClose={closeConfirm} labelledBy="edit-shift-warning-title">
          <div className={styles.confirmHead}>
            <span className={styles.confirmIcon}>
              <Warning width={20} height={20} />
            </span>
            <h3 id="edit-shift-warning-title" className={styles.confirmTitle}>
              Editing this shift affects existing bookings
            </h3>
          </div>
          <p className={styles.confirmBody}>
            Changing "{confirm.pending.name}" will affect all bookings made for this shift — every booking within
            it will be cancelled. This can't be undone.
          </p>
          <div className={styles.confirmActions}>
            <Button variant="secondary" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmEdit} disabled={busy}>
              Continue &amp; save
            </Button>
          </div>
        </Modal>
      )}

      {confirm?.kind === 'delete' && (
        <Modal onClose={closeConfirm} labelledBy="delete-shift-warning-title">
          <div className={styles.confirmHead}>
            <span className={styles.confirmIcon}>
              <Warning width={20} height={20} />
            </span>
            <h3 id="delete-shift-warning-title" className={styles.confirmTitle}>
              Delete "{confirm.shift.name}"?
            </h3>
          </div>
          <p className={styles.confirmBody}>
            Deleting this shift will affect all bookings made for it — every booking within this shift will be
            cancelled. This can't be undone.
          </p>
          <label className={styles.confirmField}>
            <span>
              Type <strong>delete shift</strong> to confirm
            </span>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
              autoFocus
            />
          </label>
          <div className={styles.confirmActions}>
            <Button variant="secondary" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={busy || deleteText.trim().toLowerCase() !== DELETE_CONFIRM_PHRASE}
            >
              Delete shift
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
