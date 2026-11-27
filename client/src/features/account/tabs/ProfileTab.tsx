import { useRef, useState } from 'react';
import styles from './ProfileTab.module.css';
import { Button } from '../../../components/ui/Button';
import { VerifiedBadge } from '../../../components/ui/icons';
import type { AccountDetails, Member } from '../../../api/types';

interface Props {
  user: Member;
  details: AccountDetails;
  onNavigateTab: (tab: string) => void;
}

export function ProfileTab({ user, details }: Props) {
  const { kyc } = details;
  const [name, setName] = useState(user.name);
  const [dob, setDob] = useState(kyc.dob ?? '');
  const [gender, setGender] = useState(kyc.gender ?? '');
  const [nationality, setNationality] = useState(kyc.nationality ?? '');
  const [country, setCountry] = useState(kyc.country ?? '');
  const [state, setState] = useState(kyc.state ?? '');
  const kycRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.root}>
      <div className={styles.statusBanner}>
        {kyc.verified ? (
          <>
            <VerifiedBadge className={styles.statusIcon} />
            <div>
              <div className={styles.statusTitle}>Identity verified</div>
              <div className={styles.statusSub}>Your KYC details are up to date.</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className={styles.statusTitle}>Complete your KYC</div>
              <div className={styles.statusSub}>Verify your identity to unlock all account features.</div>
            </div>
            <Button onClick={() => kycRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Complete KYC
            </Button>
          </>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Personal details</h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Full name</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <span className={styles.readOnly}>{user.email}</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Phone number</span>
            <span className={styles.readOnly}>{kyc.phone}</span>
          </label>
        </div>
      </div>

      <div className={styles.section} ref={kycRef}>
        <h3 className={styles.sectionTitle}>KYC information</h3>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Date of birth</span>
            <input type="date" className={styles.input} value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Gender</span>
            <select className={styles.input} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Select</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Nationality</span>
            <input className={styles.input} value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Country</span>
            <input className={styles.input} value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>State</span>
            <input className={styles.input} value={state} onChange={(e) => setState(e.target.value)} />
          </label>
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="secondary">Cancel</Button>
        <Button>Save changes</Button>
      </div>
    </div>
  );
}
