import styles from './GeneralTab.module.css';
import type { Floor } from '../../../api/types';

interface Field {
  label: string;
  value: string;
}

interface Props {
  floor: Floor;
  seatCount: number;
}

export function GeneralTab({ floor, seatCount }: Props) {
  const details: Field[] = [
    { label: 'SPACE ID', value: '#WE-000021' },
    { label: 'BUILDING NAME', value: floor.building },
    { label: 'FLOOR', value: floor.floorLabel },
    { label: 'TOTAL SPACES', value: `${seatCount} Spaces` },
    { label: 'LEASED AREA (Sq.Ft.)', value: '2500 Sq.Ft.' },
    { label: 'CITY', value: 'Bangalore, Karnataka' },
    { label: 'AREA', value: 'Bellandur' },
    { label: 'TIME ZONE', value: 'Asia / Kolkata' },
  ];

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Space Details</h2>
        <div className={styles.grid}>
          {details.map((f) => (
            <div key={f.label} className={styles.field}>
              <span className={styles.label}>{f.label}</span>
              <span className={styles.value}>{f.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={[styles.section, styles.settingsSection].join(' ')}>
        <h2 className={styles.sectionTitle}>Booking Settings</h2>
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.label}>MULTIPLE DAY BOOKING LIMIT</span>
            <span className={styles.value}>0</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>LIMIT FUTURE BOOKINGS (IN DAYS)</span>
            <span className={styles.value}>0</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>BOOKING CAPACITY</span>
            <span className={styles.value}>{seatCount}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>RESERVATION INSTRUCTIONS</span>
            <ul className={styles.list}>
              <li>Booking to be done 1 day before arrival.</li>
              <li>Approval from the admin will be required.</li>
              <li>Booking needs to be done on your assigned dates for office only.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
