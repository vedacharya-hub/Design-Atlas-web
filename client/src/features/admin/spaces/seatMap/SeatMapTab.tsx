import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SeatMapTab.module.css';
import { adminApi } from '../../../../api/adminApi';
import type { AdminSeat, AdminSeatMap, AdminSpaceView, AdminUser, Floor, SpaceZoneView } from '../../../../api/types';
import { useToast } from '../../Toaster';
import { floorLabel } from '../spaceShared';
import { SeatCanvas, type EditMode } from './SeatCanvas';
import { SeatList, type SeatFilter } from './SeatList';
import { AssignSeatDialog } from './AssignSeatDialog';
import { NewSeatDialog } from './NewSeatDialog';
import { nearestZone, seatPlace, type MapSeat } from './seatShared';
import { inZone } from '../zones/zoneShared';

/** Saving the map spins at least this long. */
const MIN_SAVING_MS = 500;
const DEFAULT_TYPE = 'Desk & Chair';

type Dialog = { kind: 'assign'; seatId: string } | { kind: 'edit'; seatId: string } | { kind: 'new'; x: number; y: number; zone: string };

interface Props {
  space: AdminSpaceView;
  /** The mapped floor: its plan and zones. */
  floor: Floor;
  buildingName: string;
}

const desks = (n: number) => `${n} ${n === 1 ? 'desk' : 'desks'}`;

/**
 * Space Details → Space Map (Figma 1592:143788): the floor plan on the left and its desks on the
 * right. A free desk can be kept for one person as their permanent seat, after which nobody else can
 * book it; Edit moves desks and adds new ones, up to the space's total spaces, saved together.
 */
export function SeatMapTab({ space, floor, buildingName }: Props) {
  const toast = useToast();
  const [map, setMap] = useState<AdminSeatMap | null>(null);
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  /** The zones drawn in Space Zones, shown on the plan. */
  const [spaceZones, setSpaceZones] = useState<SpaceZoneView[]>([]);
  /** The Space Zones zone picked in the filter (its id), or "all". */
  const [zone, setZone] = useState('all');
  const [filter, setFilter] = useState<SeatFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listHoverId, setListHoverId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  /** Edit mode's working copy of the desks; null when not editing. */
  const [draft, setDraft] = useState<MapSeat[] | null>(null);
  const [mode, setMode] = useState<EditMode>('move');
  const [saving, setSaving] = useState(false);
  const newSeq = useRef(1);

  useEffect(() => {
    let live = true;
    setMap(null);
    setLoadError('');
    adminApi
      .getSeatMap(space.id)
      .then((m) => live && setMap(m))
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'The map couldn’t be loaded.'));
    adminApi
      .getUsers()
      .then((u) => live && setUsers(u))
      .catch(() => {});
    adminApi
      .getZones(space.id)
      .then((z) => live && setSpaceZones(z.zones))
      .catch(() => {});
    adminApi
      .getSpaceTypes()
      .then((t) => live && setTypes(t.map((x) => x.name)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [space.id]);

  const editing = draft !== null;
  const all: MapSeat[] = useMemo(() => draft ?? map?.seats ?? [], [draft, map]);
  /** The floor's bays, which desks are named and listed by. */
  const zones = useMemo(() => [...new Set([...floor.zones, ...all.map((s) => s.zone)])], [floor.zones, all]);
  const picked = zone === 'all' ? undefined : spaceZones.find((z) => z.id === zone);
  // The list keeps to the zone picked; the map shows every desk and fades the rest.
  const shown = useMemo(() => (picked ? all.filter((s) => inZone(s, picked)) : all), [all, picked]);
  const heldBy = useMemo(() => new Map(all.filter((s) => s.assignment).map((s) => [s.assignment!.userId, s])), [all]);
  const limit = map?.limit ?? 0;
  const dirty = useMemo(() => {
    if (!draft || !map) return false;
    const before = new Map(map.seats.map((s) => [s.id, s]));
    return draft.some((s) => s.isNew || before.get(s.id)?.x !== s.x || before.get(s.id)?.y !== s.y);
  }, [draft, map]);

  // Escape closes the "Assign Seat" popover, and leaves edit mode when nothing has changed. With
  // changes it does nothing, so the panel doesn't close on unsaved work. Dialogs handle their own.
  const state = useRef({ dialog, selectedId, editing, dirty });
  state.current = { dialog, selectedId, editing, dirty };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.key !== 'Escape' || e.defaultPrevented || s.dialog) return;
      if (s.selectedId) {
        e.preventDefault();
        setSelectedId(null);
      } else if (s.editing) {
        e.preventDefault();
        if (!s.dirty) setDraft(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const place = seatPlace(buildingName, floorLabel(space.floor));
  const typeChoices = types.length ? types : [DEFAULT_TYPE];

  /** A desk clicked on the map or in the list: a free one offers "Assign Seat", a kept one opens its details. */
  function open(seat: MapSeat | null, toggle = true) {
    if (!seat) return setSelectedId(null);
    if (seat.assignment) {
      setSelectedId(null);
      setDialog({ kind: 'assign', seatId: seat.id });
    } else {
      setSelectedId((id) => (toggle && id === seat.id ? null : seat.id));
    }
  }

  function pickFromList(seat: MapSeat) {
    setFocus((f) => ({ id: seat.id, n: (f?.n ?? 0) + 1 }));
    if (!editing) open(seat, false);
  }

  function startEdit() {
    if (!map) return;
    setDraft(map.seats.map((s) => ({ ...s })));
    setMode('move');
    setSelectedId(null);
  }

  function addAt(x: number, y: number) {
    if (!draft || draft.length >= limit) return;
    const z = nearestZone(draft, x, y, zones[0] ?? 'Open Bay');
    setDialog({ kind: 'new', x, y, zone: z });
  }

  async function saveEdit() {
    if (!draft || !map || saving) return;
    const before = new Map(map.seats.map((s) => [s.id, s]));
    const moves = draft.filter((s) => !s.isNew && (before.get(s.id)?.x !== s.x || before.get(s.id)?.y !== s.y)).map(({ id, x, y }) => ({ id, x, y }));
    const added = draft
      .filter((s) => s.isNew)
      .map(({ x, y, zone: z, spaceType, notes }) => ({
        x,
        y,
        zone: z,
        spaceType,
        notes,
      }));
    if (moves.length === 0 && added.length === 0) return setDraft(null);
    setSaving(true);
    try {
      const [next] = await Promise.all([adminApi.saveSeatLayout(space.id, { moves, added }), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      setMap(next);
      setDraft(null);
      const what = [moves.length ? `moved ${desks(moves.length)}` : '', added.length ? `added ${desks(added.length)}` : ''].filter(Boolean).join(' and ');
      toast({
        title: 'Space map saved!',
        description: `${what[0].toUpperCase()}${what.slice(1)} on the ${floorLabel(space.floor)}`,
      });
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Couldn’t save the map',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  function onAssigned(next: AdminSeat, change: 'assigned' | 'freed') {
    setMap((m) => (m ? { ...m, seats: m.seats.map((s) => (s.id === next.id ? next : s)) } : m));
    setDialog(null);
    toast(
      change === 'assigned'
        ? {
            title: 'Seat assigned!',
            description: (
              <>
                <strong>{next.label}</strong> is now {next.assignment?.name}’s permanent seat
              </>
            ),
          }
        : {
            title: 'Seat freed!',
            description: (
              <>
                <strong>{next.label}</strong> is open for anyone to book
              </>
            ),
          },
    );
  }

  /** The popover's edit icon: a free desk's new type (and number) and note, saved straight away. */
  async function saveSeat(seat: MapSeat, details: { spaceType: string; notes: string }) {
    const next = await adminApi.updateSeat(space.id, seat.id, details);
    setMap((m) => (m ? { ...m, seats: m.seats.map((s) => (s.id === next.id ? next : s)) } : m));
    setDialog(null);
    toast({
      title: 'Space updated!',
      description:
        next.label === seat.label ? (
          <>
            <strong>{next.label}</strong> saved as {next.spaceType}
          </>
        ) : (
          <>
            <strong>{seat.label}</strong> is now <strong>{next.label}</strong> ({next.spaceType})
          </>
        ),
    });
  }

  if (loadError) return <p className={styles.message}>{loadError}</p>;
  if (!map) return <p className={styles.message}>Loading the map…</p>;

  const assignSeat = dialog?.kind === 'assign' ? all.find((s) => s.id === dialog.seatId) : undefined;
  const editSeat = dialog?.kind === 'edit' ? all.find((s) => s.id === dialog.seatId) : undefined;
  const defaultType = typeChoices.includes(DEFAULT_TYPE) ? DEFAULT_TYPE : typeChoices[0];
  const listActive = selectedId ?? (dialog && dialog.kind !== 'new' ? dialog.seatId : null);

  return (
    <div className={styles.tab}>
      <SeatCanvas
        image={floor.image}
        seats={all}
        spaceZones={spaceZones}
        zone={picked ? zone : 'all'}
        onZone={(z) => {
          setZone(z);
          setSelectedId(null);
        }}
        place={`${floorLabel(space.floor)} · ${buildingName}`}
        editing={editing}
        mode={mode}
        onMode={setMode}
        count={all.length}
        limit={limit}
        saving={saving}
        selectedId={selectedId}
        highlightId={listHoverId}
        focus={focus}
        pending={dialog?.kind === 'new' ? { x: dialog.x, y: dialog.y } : null}
        onSelect={(seat) => open(seat)}
        onAssign={(seat) => {
          setSelectedId(null);
          setDialog({ kind: 'assign', seatId: seat.id });
        }}
        onEditSeat={(seat) => {
          setSelectedId(null);
          setDialog({ kind: 'edit', seatId: seat.id });
        }}
        onMove={(id, x, y) => setDraft((d) => d && d.map((s) => (s.id === id ? { ...s, x, y } : s)))}
        onAddAt={addAt}
        onEdit={startEdit}
        onSave={() => void saveEdit()}
        onCancel={() => setDraft(null)}
      />
      <SeatList
        seats={shown}
        zones={zones}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        activeId={listActive}
        onPick={pickFromList}
        onHover={setListHoverId}
      />

      {assignSeat && <AssignSeatDialog spaceId={space.id} seat={assignSeat} place={place} users={users} heldBy={heldBy} onClose={() => setDialog(null)} onSaved={onAssigned} />}
      {dialog?.kind === 'new' && (
        <NewSeatDialog
          seats={all}
          zone={dialog.zone}
          place={place}
          types={typeChoices}
          defaultType={defaultType}
          onClose={() => setDialog(null)}
          onSave={({ spaceType, notes, label }) => {
            const seat: MapSeat = {
              id: `new-${newSeq.current++}`,
              label,
              x: dialog.x,
              y: dialog.y,
              zone: dialog.zone,
              spaceType,
              notes,
              assignment: null,
              isNew: true,
            };
            setDraft((d) => (d ? [...d, seat] : d));
            setDialog(null);
            // The last desk the space takes: back to moving.
            if (all.length + 1 >= limit) setMode('move');
          }}
        />
      )}
      {editSeat && (
        <NewSeatDialog
          seat={editSeat}
          seats={all}
          zone={editSeat.zone}
          place={place}
          types={typeChoices}
          defaultType={defaultType}
          onClose={() => setDialog(null)}
          onSave={(details) => saveSeat(editSeat, details)}
        />
      )}
    </div>
  );
}
