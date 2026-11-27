import ui from '../AdminControls.module.css';
import styles from './FloorMapFile.module.css';
import type { SpaceFloorMap } from '../../../api/types';
import { fileKind, fileSize } from './spaceShared';

/** The floor plan as a file (Figma "File type icon" with its name and size), and a delete button when editing. */
export function FloorMapFile({ map, onRemove }: { map: SpaceFloorMap; onRemove?: () => void }) {
  return (
    <div className={styles.file}>
      <span className={styles.icon} aria-hidden="true">
        <img src="/admin/spaces/file-page.svg" alt="" width={32} height={40} />
        <span className={styles.kind}>{fileKind(map.name)}</span>
      </span>
      <span className={styles.text}>
        <span className={styles.name} title={map.name}>
          {map.name}
        </span>
        <span className={styles.meta}>1 Page • {fileSize(map.size)}</span>
      </span>
      {onRemove && (
        <button type="button" className={ui.iconBtn} aria-label={`Remove ${map.name}`} title="Remove" onClick={onRemove}>
          <img src="/admin/delete.svg" alt="" width={20} height={20} />
        </button>
      )}
    </div>
  );
}
