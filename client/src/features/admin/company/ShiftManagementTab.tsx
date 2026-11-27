import { useEffect, useState } from 'react';
// Shared controls, the Users table's tags and badges; this tab's rules last.
import ui from '../AdminControls.module.css';
import users from '../users/UsersPanel.module.css';
import styles from './ShiftManagementTab.module.css';
import { adminApi } from '../../../api/adminApi';
import type { CompanyShift } from '../../../api/types';
import { BrandSwitch } from '../BrandSwitch';
import { useToast } from '../Toaster';
import { ShiftDialog } from './ShiftDialog';
import { DeleteShiftDialog } from './DeleteShiftDialog';
import { SHIFT_STATUS_LABEL, shiftCode, shiftTimings } from './companyShared';

/**
 * Shift Management (Figma 3124:197371): the company's shifts with their timings and status. The
 * switch turns a shift on or off (an off shift isn't offered when booking); the pencil edits it;
 * the bin deletes it, cancelling its bookings (3149:645418). Add Shift opens 3145:640716.
 */
export function ShiftManagementTab() {
  const toast = useToast();
  const [shifts, setShifts] = useState<CompanyShift[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<{ shift?: CompanyShift } | null>(null);
  const [deleting, setDeleting] = useState<CompanyShift | null>(null);

  useEffect(() => {
    adminApi
      .getCompanyShifts()
      .then(setShifts)
      .catch(() => setLoadError('Couldn’t load the shifts. Please try again.'));
  }, []);

  const replace = (next: CompanyShift) => setShifts((list) => (list ?? []).map((s) => (s.id === next.id ? next : s)));

  async function setStatus(s: CompanyShift, on: boolean) {
    const status = on ? 'active' : 'inactive';
    replace({ ...s, status });
    try {
      replace(await adminApi.updateCompanyShift(s.id, { status }));
      toast(
        on
          ? { title: `${s.name} is on`, description: <>People can book it again</> }
          : { title: `${s.name} is off`, description: <>It isn’t offered when booking; its bookings stay</> },
      );
    } catch (err) {
      replace(s);
      toast({ tone: 'error', title: `Couldn’t turn ${s.name} ${on ? 'on' : 'off'}`, description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  async function remove(s: CompanyShift) {
    try {
      const { cancelledBookings: n } = await adminApi.deleteCompanyShift(s.id);
      setShifts((list) => (list ?? []).filter((x) => x.id !== s.id));
      setDeleting(null);
      toast({
        title: `${s.name} was deleted`,
        description: n ? <>{n === 1 ? 'The booking' : `All ${n} bookings`} made for it {n === 1 ? 'was' : 'were'} cancelled</> : <>There were no bookings for it</>,
      });
      return true;
    } catch (err) {
      toast({ tone: 'error', title: `Couldn’t delete ${s.name}`, description: err instanceof Error ? err.message : 'Please try again.' });
      return false;
    }
  }

  return (
    <div className={styles.wrap}>
      <section className={styles.card} aria-labelledby="all-shifts-title">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="all-shifts-title" className={styles.title}>
              All Shifts
            </h2>
            <p className={styles.subtitle}>Turn this on to split the floor into shifts.</p>
          </div>
          <button type="button" className={styles.add} disabled={!shifts} onClick={() => setDialog({})}>
            Add Shift
            <img src="/admin/add.svg" alt="" width={20} height={20} />
          </button>
        </header>

        <div role="table" aria-label="Shifts">
          <div className={[styles.cols, styles.headRow].join(' ')} role="row">
            {['ID', 'SHIFT NAME', 'TIMINGS', 'STATUS'].map((h) => (
              <span key={h} role="columnheader">
                {h}
              </span>
            ))}
            <span role="columnheader" className={ui.srOnly}>
              Actions
            </span>
          </div>

          {shifts === null && !loadError && <p className={ui.empty}>Loading shifts…</p>}
          {loadError && <p className={ui.empty}>{loadError}</p>}
          {shifts?.length === 0 && <p className={ui.empty}>No shifts yet. Add one to split the day into shifts.</p>}

          {shifts?.map((s) => {
            const on = s.status === 'active';
            return (
              <div key={s.id} className={[styles.cols, styles.row].join(' ')} role="row">
                <span role="cell">
                  <span className={users.code}>{shiftCode(s)}</span>
                </span>
                <span role="cell" className={styles.name} title={s.name}>
                  {s.name}
                </span>
                <span role="cell" className={styles.timings}>
                  {shiftTimings(s)}
                </span>
                <span role="cell">
                  <span className={[ui.badge, users[`status_${s.status}`]].join(' ')}>{SHIFT_STATUS_LABEL[s.status]}</span>
                </span>
                <span role="cell" className={styles.actions}>
                  <BrandSwitch checked={on} label={`${s.name} on`} onChange={(next) => void setStatus(s, next)} />
                  <button type="button" className={ui.iconBtn} aria-label={`Edit ${s.name}`} title="Edit" onClick={() => setDialog({ shift: s })}>
                    <img src="/admin/company/edit.svg" alt="" width={20} height={20} />
                  </button>
                  <button type="button" className={ui.iconBtn} aria-label={`Delete ${s.name}`} title="Delete" onClick={() => setDeleting(s)}>
                    <img src="/admin/company/bin.svg" alt="" width={20} height={20} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <p className={styles.note}>
          <img src="/admin/company/info.svg" alt="" width={20} height={20} />
          This enables shifts to all your spaces
        </p>
      </section>

      {dialog && (
        <ShiftDialog
          shift={dialog.shift}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setShifts((list) => (list?.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [...(list ?? []), saved]));
            setDialog(null);
          }}
        />
      )}

      {deleting && <DeleteShiftDialog shift={deleting} onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
    </div>
  );
}
