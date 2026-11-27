import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import tabStyles from '../seatMap/SeatMapTab.module.css';
import { adminApi } from '../../../../api/adminApi';
import type { AdminSeat, AdminSpaceView, Floor, OrgChart, SpaceZone, SpaceZoneInput, SpaceZoneList, ZoneColor } from '../../../../api/types';
import { useToast } from '../../Toaster';
import { ConfirmPhraseDialog } from '../../ConfirmPhraseDialog';
import { floorLabel } from '../spaceShared';
import { seatPlace } from '../seatMap/seatShared';
import { ZoneCanvas, type ZoneMode } from './ZoneCanvas';
import { ZoneList } from './ZoneList';
import { ZoneDialog, type ZoneDetails } from './ZoneDialog';
import { inZone, levelLabel, type MapZone, type Rect } from './zoneShared';

/** Saving the map spins at least this long. */
const MIN_SAVING_MS = 500;

type Dialog = { kind: 'new'; rect: Rect } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };

interface Props {
  space: AdminSpaceView;
  /** The mapped floor: its plan. */
  floor: Floor;
  buildingName: string;
}

const zonesWord = (n: number) => `${n} ${n === 1 ? 'zone' : 'zones'}`;
const bookingsWord = (n: number) => `${n} upcoming ${n === 1 ? 'booking' : 'bookings'}`;
const sameZone = (a: SpaceZone, b: SpaceZone) =>
  a.name === b.name && a.color === b.color && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.level === b.level && a.unitIds.join() === b.unitIds.join();
/** What the server takes: new zones without their temporary ids. */
const toInput = (zones: MapZone[]): SpaceZoneInput[] =>
  zones.map(({ isNew, id, name, color, x, y, w, h, level, unitIds }) => ({ ...(isNew ? {} : { id }), name, color, x, y, w, h, level, unitIds }));

/**
 * Space Details → Space Zones (Figma 1598:90456, 3039:106709, 1604:187751): the floor plan with its
 * zones on the left and the zones listed on the right. Create Zone, or Edit once there are some,
 * opens the map's tools: Add Zone draws a rectangle, whose seats become the zone's, and asks for its
 * name, colour and who it's for (3039:112228); Move Zone drags and resizes zones. Zones never
 * overlap. The changes save together.
 */
export function ZonesTab({ space, floor, buildingName }: Props) {
  const toast = useToast();
  const [seats, setSeats] = useState<AdminSeat[] | null>(null);
  const [zones, setZones] = useState<MapZone[] | null>(null);
  const [org, setOrg] = useState<OrgChart | null>(null);
  const [loadError, setLoadError] = useState('');
  /** Edit mode's working copy of the zones; null when not editing. */
  const [draft, setDraft] = useState<MapZone[] | null>(null);
  const [mode, setMode] = useState<ZoneMode>('add');
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listHoverId, setListHoverId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pendingColor, setPendingColor] = useState<ZoneColor>('blue');
  /** Upcoming bookings by its teams in each saved zone: deleting the zone cancels them. */
  const [upcoming, setUpcoming] = useState<Map<string, number>>(new Map());
  /** The version the zones were loaded at, sent back with each save. */
  const version = useRef(0);
  const newSeq = useRef(1);

  useEffect(() => {
    let live = true;
    setSeats(null);
    setZones(null);
    setLoadError('');
    const fail = (err: unknown) => live && setLoadError(err instanceof Error ? err.message : 'The zones couldn’t be loaded.');
    adminApi
      .getSeatMap(space.id)
      .then((m) => live && setSeats(m.seats))
      .catch(fail);
    adminApi
      .getZones(space.id)
      .then((list) => live && took(list))
      .catch(fail);
    adminApi
      .getOrg()
      .then((o) => live && setOrg(o))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [space.id]);

  const editing = draft !== null;
  const all = useMemo(() => draft ?? zones ?? [], [draft, zones]);
  const counts = useMemo(() => new Map(all.map((z) => [z.id, (seats ?? []).filter((s) => inZone(s, z)).length])), [all, seats]);
  const dirty = useMemo(() => {
    if (!draft || !zones) return false;
    const before = new Map(zones.map((z) => [z.id, z]));
    return draft.length !== zones.length || draft.some((z) => z.isNew || !before.has(z.id) || !sameZone(z, before.get(z.id)!));
  }, [draft, zones]);

  // Escape lets go of a zone, then leaves edit mode when nothing has changed. With changes it does
  // nothing, so the panel doesn't close on unsaved work. Dialogs handle their own.
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

  /** Zones from the server, as loaded or saved, and their version. */
  function took(list: SpaceZoneList) {
    version.current = list.version;
    setZones(list.zones.map(({ seatIds: _seats, unitNames: _units, upcomingBookings: _bookings, ...z }) => z));
    setUpcoming(new Map(list.zones.map((z) => [z.id, z.upcomingBookings])));
    return list.cancelledBookings ?? 0;
  }

  function startEdit(startMode: ZoneMode) {
    if (!zones) return;
    setDraft(zones.map((z) => ({ ...z })));
    setMode(startMode);
    setSelectedId(null);
  }

  function pick(zone: MapZone) {
    setSelectedId((id) => (id === zone.id ? null : zone.id));
    setFocus((f) => ({ id: zone.id, n: (f?.n ?? 0) + 1 }));
  }

  /** Saves zones straight away (outside edit mode): the list's Edit details and Delete zone. */
  async function persist(next: MapZone[]) {
    return took(await adminApi.saveZones(space.id, toInput(next), version.current));
  }

  async function saveEdit() {
    if (!draft || !zones || saving) return;
    if (!dirty) return setDraft(null);
    const before = new Map(zones.map((z) => [z.id, z]));
    const added = draft.filter((z) => z.isNew).length;
    const changed = draft.filter((z) => !z.isNew && before.has(z.id) && !sameZone(z, before.get(z.id)!)).length;
    const removed = zones.filter((z) => !draft.some((d) => d.id === z.id)).length;
    setSaving(true);
    try {
      const [saved] = await Promise.all([adminApi.saveZones(space.id, toInput(draft), version.current), new Promise((r) => setTimeout(r, MIN_SAVING_MS))]);
      const cancelled = took(saved);
      setDraft(null);
      setSelectedId(null);
      const what = [added ? `added ${zonesWord(added)}` : '', changed ? `updated ${zonesWord(changed)}` : '', removed ? `deleted ${zonesWord(removed)}` : '']
        .filter(Boolean)
        .join(', ');
      toast({
        title: 'Zones saved!',
        description: `${what[0].toUpperCase()}${what.slice(1)} on the ${floorLabel(space.floor)}${cancelled ? `. ${bookingsWord(cancelled)} cancelled` : ''}`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save the zones', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  function addZone(rect: Rect, details: ZoneDetails) {
    const zone: MapZone = { id: `new-${newSeq.current++}`, ...rect, ...details, isNew: true };
    setDraft((d) => (d ? [...d, zone] : d));
    setDialog(null);
    setSelectedId(zone.id);
  }

  async function editZone(zone: MapZone, details: ZoneDetails) {
    if (editing) {
      setDraft((d) => d && d.map((z) => (z.id === zone.id ? { ...z, ...details } : z)));
      setDialog(null);
      return;
    }
    await persist(all.map((z) => (z.id === zone.id ? { ...z, ...details } : z)));
    setDialog(null);
    toast({ title: 'Zone updated!', description: <>Saved the changes to <strong>{details.name}</strong></> });
  }

  /** A zone drawn since editing began goes straight away; a saved one asks first, as its bookings go with it. */
  function deleteZone(zone: MapZone) {
    if (selectedId === zone.id) setSelectedId(null);
    if (zone.isNew) return setDraft((d) => d && d.filter((z) => z.id !== zone.id));
    setDialog({ kind: 'delete', id: zone.id });
  }

  const onColor = useCallback((c: ZoneColor) => setPendingColor(c), []);

  if (loadError) return <p className={tabStyles.message}>{loadError}</p>;
  if (!seats || !zones) return <p className={tabStyles.message}>Loading the zones…</p>;

  const editTarget = dialog?.kind === 'edit' || dialog?.kind === 'delete' ? all.find((z) => z.id === dialog.id) : undefined;
  const pendingBookings = editTarget ? (upcoming.get(editTarget.id) ?? 0) : 0;

  return (
    <div className={tabStyles.tab}>
      <ZoneCanvas
        image={floor.image}
        seats={seats}
        zones={all}
        editing={editing}
        mode={mode}
        onMode={setMode}
        saving={saving}
        selectedId={selectedId}
        hotId={listHoverId}
        focus={focus}
        pending={dialog?.kind === 'new' ? { ...dialog.rect, color: pendingColor } : null}
        onSelect={setSelectedId}
        onChange={(id, rect) => setDraft((d) => d && d.map((z) => (z.id === id ? { ...z, ...rect } : z)))}
        onDrawn={(rect) => setDialog({ kind: 'new', rect })}
        canEdit={zones.length > 0}
        onEdit={() => startEdit('move')}
        onSave={() => void saveEdit()}
        onCancel={() => {
          setDraft(null);
          setSelectedId(null);
        }}
      />
      <ZoneList
        zones={all}
        counts={counts}
        org={org}
        editing={editing}
        selectedId={selectedId}
        onPick={pick}
        onHover={setListHoverId}
        onCreate={() => startEdit('add')}
        onEditZone={(z) => setDialog({ kind: 'edit', id: z.id })}
        onDeleteZone={deleteZone}
      />

      {dialog?.kind === 'new' && (
        <ZoneDialog
          others={all}
          seats={seats.filter((s) => inZone(s, dialog.rect)).length}
          place={place}
          org={org}
          onColor={onColor}
          onClose={() => setDialog(null)}
          onSave={(details) => addZone(dialog.rect, details)}
        />
      )}
      {dialog?.kind === 'edit' && editTarget && (
        <ZoneDialog
          zone={editTarget}
          others={all.filter((z) => z.id !== editTarget.id)}
          seats={counts.get(editTarget.id) ?? 0}
          place={place}
          org={org}
          onClose={() => setDialog(null)}
          onSave={(details) => editZone(editTarget, details)}
        />
      )}
      {dialog?.kind === 'delete' && editTarget && (
        <ConfirmPhraseDialog
          icon="/admin/user/archive-trash.svg"
          title={`Delete ${editTarget.name}?`}
          note={`Its seats stay on the map and become open to everyone.${editing ? '' : ' This can’t be undone.'}`}
          warning={
            <>
              <strong>
                On removing this zone, all future bookings made by its {levelLabel(editTarget.level, 2).toLowerCase()} on the zone’s seats will be
                cancelled{editing ? ' when you save the map' : ''}.
              </strong>{' '}
              {pendingBookings ? `${bookingsWord(pendingBookings)} will be cancelled.` : 'There are no upcoming bookings in it right now.'}
            </>
          }
          item={{
            name: editTarget.name,
            meta: `${counts.get(editTarget.id) ?? 0} seats${pendingBookings ? ` · ${bookingsWord(pendingBookings)}` : ''}`,
          }}
          phrase="Delete"
          confirmLabel="Delete Zone"
          busyLabel="Deleting…"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            // While editing, it goes from the map now and its bookings when the map is saved.
            if (editing) {
              setDraft((d) => d && d.filter((z) => z.id !== editTarget.id));
              setDialog(null);
              return true;
            }
            try {
              const cancelled = await persist(all.filter((z) => z.id !== editTarget.id));
              setDialog(null);
              toast({
                title: 'Zone deleted!',
                description: (
                  <>
                    <strong>{editTarget.name}</strong> was removed from the {floorLabel(space.floor)}
                    {cancelled ? `. ${bookingsWord(cancelled)} ${cancelled === 1 ? 'was' : 'were'} cancelled` : ''}
                  </>
                ),
              });
              return true;
            } catch (err) {
              toast({ tone: 'error', title: 'Couldn’t delete the zone', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
              return false;
            }
          }}
        />
      )}
    </div>
  );
}
