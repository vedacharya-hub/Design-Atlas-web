import { useEffect, useRef, useState, type FormEvent } from 'react';
// Shared controls; this tab's rules last.
import ui from '../AdminControls.module.css';
import styles from './GeneralInfoTab.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminRole, CompanySettings } from '../../../api/types';
import { BrandSwitch } from '../BrandSwitch';
import { ConfirmPhraseDialog } from '../ConfirmPhraseDialog';
import { useToast } from '../Toaster';
import { TextField } from '../users/UserFormFields';
import { useSheetTip } from '../users/bulk/SheetCells';
import { SERVICE_GROUPS, readLogo, type ServiceCard } from './companyShared';

/**
 * General Info & Permissions (Figma 7991:258087): the logo, the company's name and domain, then the
 * Atlas and co-working services everyone can use. A service turned off here is off for every role:
 * Admin → Roles shows it locked as “Restricted by admin”, and the role's members can't use it.
 * Turning one off cancels its upcoming bookings, so it asks first: “Turn Off” has to be typed.
 */
export function GeneralInfoTab() {
  const toast = useToast();
  const tip = useSheetTip();
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<{ name: string; domain: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** The service waiting on “Turn Off” to be typed. */
  const [turningOff, setTurningOff] = useState<ServiceCard | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The latest settings, so switches flipped quickly build on each other.
  const latest = useRef(company);
  latest.current = company;

  useEffect(() => {
    adminApi
      .getCompany()
      .then(setCompany)
      .catch(() => setLoadError('Couldn’t load the company settings. Please try again.'));
    adminApi.getRoles().then(setRoles).catch(() => undefined);
  }, []);

  if (loadError) return <p className={ui.empty}>{loadError}</p>;
  if (!company) return <p className={ui.empty}>Loading company settings…</p>;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!editing || savingName) return;
    setSavingName(true);
    try {
      const next = await adminApi.updateCompany({ name: editing.name.trim(), domain: editing.domain.trim() });
      setCompany(next);
      setEditing(null);
      toast({ title: 'Company details saved!', description: <>Saved as <strong>{next.name}</strong></> });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t save the company details', description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setSavingName(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const logo = await readLogo(file);
      setCompany(await adminApi.updateCompany({ logo }));
      toast({ title: 'Logo updated!', description: <>It shows wherever the company’s logo does</> });
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t upload the logo', description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** Turns a service on or off for everyone: true when it saved. */
  async function toggle(card: ServiceCard, on: boolean): Promise<boolean> {
    const before = latest.current!;
    // Show it straight away; put it back if the save fails.
    const optimistic = { ...before, services: { ...before.services, [card.key]: on } };
    latest.current = optimistic;
    setCompany(optimistic);
    const holders = roles.filter((r) => r.permissions.includes(card.key));
    try {
      setCompany(await adminApi.updateCompany({ services: { [card.key]: on } }));
      toast(
        on
          ? { title: `${card.title} is back on`, description: <>Roles that include it can use it again</> }
          : {
              title: `${card.title} is off for everyone`,
              description: holders.length ? (
                <>
                  {holders.length === 1 ? <strong>{holders[0].name}</strong> : <>{holders.length} roles</>} now {holders.length === 1 ? 'shows' : 'show'} it as restricted
                </>
              ) : (
                <>No role includes it</>
              ),
            },
      );
      return true;
    } catch (err) {
      setCompany((c) => (c ? { ...c, services: { ...c.services, [card.key]: !on } } : c));
      toast({ tone: 'error', title: `Couldn’t turn ${card.title} ${on ? 'on' : 'off'}`, description: err instanceof Error ? err.message : 'Please try again.' });
      return false;
    }
  }

  /** On goes straight through; off cancels bookings, so it waits for the confirmation. */
  function flip(card: ServiceCard, on: boolean) {
    if (on) void toggle(card, true);
    else setTurningOff(card);
  }

  async function confirmTurnOff(card: ServiceCard) {
    const done = await toggle(card, false);
    if (done) setTurningOff(null);
    return done;
  }

  return (
    <div className={styles.general} {...tip.handlers}>
      <section className={styles.identity} aria-label="Company">
        <div className={styles.logoBlock}>
          <span className={[styles.logo, company.logo ? styles.logoSet : ''].join(' ').trim()}>
            {company.logo && <img src={company.logo} alt={`${company.name} logo`} width={120} height={120} />}
          </span>
          <label className={[styles.upload, uploading ? styles.uploadBusy : ''].join(' ').trim()}>
            <input
              ref={fileRef}
              className={ui.srOnly}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              disabled={uploading}
              onChange={(e) => void uploadLogo(e.target.files?.[0])}
            />
            <img src="/admin/company/upload.svg" alt="" width={24} height={24} />
            {uploading ? 'Uploading…' : company.logo ? 'Change Logo' : 'Upload Logo'}
          </label>
        </div>

        {editing ? (
          <form className={styles.nameForm} onSubmit={(e) => void saveName(e)} noValidate>
            <TextField label="Company name" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} />
            <TextField label="Domain" value={editing.domain} placeholder="company.com" onChange={(domain) => setEditing({ ...editing, domain })} />
            <div className={styles.nameActions}>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} disabled={savingName} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className={[ui.btn, ui.btnPrimary].join(' ')} disabled={savingName || !editing.name.trim() || !editing.domain.trim()}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className={styles.nameRow}>
            <div className={styles.nameText}>
              <h2 className={styles.companyName}>{company.name}</h2>
              <p className={styles.domain}>{company.domain}</p>
            </div>
            <button type="button" className={styles.pencil} aria-label="Edit company name and domain" onClick={() => setEditing({ name: company.name, domain: company.domain })}>
              <img src="/admin/company/pencil.svg" alt="" width={20} height={20} />
            </button>
          </div>
        )}
      </section>

      <div className={styles.services}>
        {SERVICE_GROUPS.map((g) => (
          <section key={g.id} className={styles.group} aria-labelledby={`service-${g.id}`}>
            <div className={styles.groupHead}>
              <h3 id={`service-${g.id}`} className={styles.groupTitle}>
                {g.title}
              </h3>
              <span className={styles.info} tabIndex={0} role="img" aria-label={g.info} data-tip={g.info} data-tip-when="always">
                <img src="/admin/company/info.svg" alt="" width={20} height={20} />
              </span>
            </div>
            {g.rows.map((row, i) => (
              <div key={i} className={styles.row} style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                {row.map((card) => (
                  <div key={card.key} className={[styles.card, card.shaded ? styles.cardShaded : ''].join(' ').trim()}>
                    <span className={styles.cardText}>
                      <span id={`service-${card.key}`} className={styles.cardTitle}>
                        {card.title}
                      </span>
                      <span id={`service-${card.key}-note`} className={styles.cardNote}>
                        {card.description}
                      </span>
                    </span>
                    <BrandSwitch
                      checked={company.services[card.key] !== false}
                      labelledBy={`service-${card.key}`}
                      describedBy={`service-${card.key}-note`}
                      onChange={(on) => flip(card, on)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
      {tip.node}

      {turningOff && (
        <ConfirmPhraseDialog
          icon="/admin/company/power-white.svg"
          title={<>Turn off {turningOff.title}?</>}
          note="Turning this off will cancel all further bookings made with it, for everyone at the company, and no one can use it until it’s turned back on. Cancelled bookings can’t be restored."
          item={{ name: turningOff.title, meta: SERVICE_GROUPS.find((g) => g.rows.flat().includes(turningOff))?.label }}
          phrase="Turn Off"
          confirmLabel="Turn Off"
          busyLabel="Turning off…"
          onCancel={() => setTurningOff(null)}
          onConfirm={() => confirmTurnOff(turningOff)}
        />
      )}
    </div>
  );
}
