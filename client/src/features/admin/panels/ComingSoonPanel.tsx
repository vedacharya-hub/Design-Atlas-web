import styles from './Panels.module.css';
import { AdminPanelHeader } from '../AdminPanelHeader';
import { AdminIcon } from '../AdminMenu';

/** Canvas for admin sections whose design hasn't been shared yet. */
export function ComingSoonPanel({ title, icon }: { title: string; icon: string }) {
  return (
    <>
      <AdminPanelHeader title={title} description={`Manage ${title.toLowerCase()} for your company`} />
      <div className={styles.comingSoon}>
        <span className={styles.comingSoonIcon}>
          <AdminIcon file={icon} size={28} />
        </span>
        <h2 className={styles.comingSoonTitle}>{title} is on its way</h2>
        <p className={styles.comingSoonText}>This section will be set up once its design is ready.</p>
      </div>
    </>
  );
}
