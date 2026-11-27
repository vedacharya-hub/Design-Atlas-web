import { useCallback, useEffect, useState } from 'react';
import users from '../users/UsersPanel.module.css';
import styles from './SpacesPanel.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminBuilding, AdminSpaceView, SpaceType } from '../../../api/types';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AllSpacesTab } from './AllSpacesTab';
import { BuildingsTab } from './BuildingsTab';
import { SpaceTypesTab } from './SpaceTypesTab';
import { SpaceDetailsPanel } from './SpaceDetailsPanel';
import { BuildingDetailsPanel } from './BuildingDetailsPanel';

type Tab = 'spaces' | 'buildings' | 'types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'spaces', label: 'All Spaces' },
  { id: 'buildings', label: 'Building' },
  { id: 'types', label: 'Space types' },
];

/**
 * Admin → Spaces: All Spaces (Figma 1588:138055), Building (1588:138969) and Space types
 * (1588:140226), switched by the tabs in the header. A space opens its details from the right
 * (1592:143530); so does a building.
 */
export function SpacesPanel() {
  const [tab, setTab] = useState<Tab>('spaces');
  const [spaces, setSpaces] = useState<AdminSpaceView[] | null>(null);
  const [buildings, setBuildings] = useState<AdminBuilding[] | null>(null);
  const [types, setTypes] = useState<SpaceType[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [openSpaceId, setOpenSpaceId] = useState<string | null>(null);
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([adminApi.getSpaces(), adminApi.getBuildings(), adminApi.getSpaceTypes()]).then(([s, b, t]) => {
        setSpaces(s);
        setBuildings(b);
        setTypes(t);
        setLoadError('');
      }),
    [],
  );

  useEffect(() => {
    load().catch(() => setLoadError('Couldn’t load spaces. Please try again.'));
  }, [load]);

  /** Archiving or editing a building changes its spaces too. */
  const reloadSpaces = () => adminApi.getSpaces().then(setSpaces);

  const replaceSpace = (next: AdminSpaceView) => setSpaces((list) => (list ?? []).map((s) => (s.id === next.id ? next : s)));
  const replaceBuilding = (next: AdminBuilding) => setBuildings((list) => (list ?? []).map((b) => (b.id === next.id ? next : b)));
  const openSpace = spaces?.find((s) => s.id === openSpaceId);
  const openBuilding = buildings?.find((b) => b.id === openBuildingId);

  return (
    <>
      <AdminPanelHeader title="Spaces" description="Configure your work spaces and space settings" divider>
        <div className={[users.segmented, styles.segmented].join(' ')} role="tablist" aria-label="Space views">
          {TABS.map((t, i) => {
            const selected = t.id === tab;
            // Dividers only sit between two unselected tabs.
            const divided = i > 0 && !selected && TABS[i - 1].id !== tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={[users.segment, selected ? users.segmentActive : '', divided ? users.segmentDivided : ''].join(' ').trim()}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </AdminPanelHeader>

      {tab === 'spaces' && (
        <AllSpacesTab
          spaces={spaces}
          buildings={buildings ?? []}
          loadError={loadError}
          onCreated={(created) => setSpaces((list) => [...(list ?? []), created])}
          onChange={replaceSpace}
          onOpen={setOpenSpaceId}
        />
      )}
      {tab === 'buildings' && (
        <BuildingsTab
          buildings={buildings}
          spaces={spaces ?? []}
          loadError={loadError}
          onCreated={(created) => setBuildings((list) => [...(list ?? []), created])}
          onChange={(next) => {
            replaceBuilding(next);
            void reloadSpaces();
          }}
          onOpen={setOpenBuildingId}
        />
      )}
      {tab === 'types' && (
        <SpaceTypesTab
          types={types}
          loadError={loadError}
          onCreated={(created) => setTypes((list) => [...(list ?? []), created])}
          onChange={(next) => setTypes((list) => (list ?? []).map((t) => (t.id === next.id ? next : t)))}
          onDeleted={(gone) => setTypes((list) => (list ?? []).filter((t) => t.id !== gone.id))}
        />
      )}

      {openBuilding && (
        <BuildingDetailsPanel
          key={openBuilding.id}
          building={openBuilding}
          spaces={(spaces ?? []).filter((s) => s.buildingId === openBuilding.id)}
          onClose={() => setOpenBuildingId(null)}
          onChange={(next) => {
            replaceBuilding(next);
            void reloadSpaces();
          }}
          onOpenSpace={(id) => {
            setOpenBuildingId(null);
            setOpenSpaceId(id);
          }}
        />
      )}
      {openSpace && (
        <SpaceDetailsPanel
          key={openSpace.id}
          space={openSpace}
          spaces={spaces ?? []}
          buildings={buildings ?? []}
          onClose={() => setOpenSpaceId(null)}
          onChange={replaceSpace}
        />
      )}
    </>
  );
}
