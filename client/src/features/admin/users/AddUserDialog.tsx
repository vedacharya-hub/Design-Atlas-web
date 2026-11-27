import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react';
import styles from './AddUserDialog.module.css';
import fieldStyles from './UserFormFields.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, AdminUserLookup, MembershipTag, NewAdminUser, WorkLocation } from '../../../api/types';
import { SelectField, TextField } from './UserFormFields';
import { useToast } from '../Toaster';
import { avatarSrc, fitOrg, readPhoto, splitName, type OrgChoices } from './userShared';
import { useRoleChoices } from '../roles/rolesShared';
import { useAccessLevelChoices } from '../accessControl/accessShared';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const phoneOk = (v: string) => v.replace(/\D/g, '').length >= 10;
/** How long "New User added successfully!" stays before the dialog closes itself. */
const SUCCESS_MS = 2000;

/** Chip text for each membership tag (Figma shows PO as "PRIVATE OFFICE"). */
const TAG_LABEL: Record<MembershipTag, string> = { PO: 'PRIVATE OFFICE', ATLAS: 'ATLAS', AA: 'ALL ACCESS' };
const MEMBERSHIP_CHOICES: { key: string; label: string; tags: MembershipTag[] }[] = [
  { key: 'PO+ATLAS', label: 'Private Office + Atlas', tags: ['PO', 'ATLAS'] },
  { key: 'AA', label: 'All Access', tags: ['AA'] },
];

type Form = NewAdminUser;

const EMPTY: Form = {
  email: '',
  phone: '',
  firstName: '',
  lastName: '',
  businessUnit: '',
  department: '',
  team: '',
  role: 'Employee',
  accessLevel: 'Level 1',
  membership: [],
  homeLocationId: '',
  avatar: undefined,
  leftHotStamp: '',
  rightHotStamp: '',
};

/** The directory check for the email typed so far. */
type Lookup = { state: 'idle' | 'checking' | 'error'; email: string } | { state: AdminUserLookup['match']; email: string; user: AdminUser | null };

interface Props {
  locations: WorkLocation[];
  /** Business unit → department → team choices. */
  org: OrgChoices;
  onClose: () => void;
  /** After the success message: the new (or brought back) user. */
  onCreated: (user: AdminUser) => void;
  /** "View user" on the already-exists message. */
  onViewExisting: (userId: string) => void;
}

/**
 * Add User (Figma 10227:235348 → 10227:235639 → 3015:296180): general details, then the WeWork key
 * card, then a success message that closes itself after two seconds. The email is checked against
 * the directory as it's typed: an active member stops the flow, a past record fills the form in.
 */
export function AddUserDialog({ locations, org, onClose, onCreated, onViewExisting }: Props) {
  const roleChoices = useRoleChoices();
  const accessChoices = useAccessLevelChoices();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle', email: '' });
  // The past record the form was filled from, so a different email can clear it again.
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ email?: boolean; phone?: boolean }>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<AdminUser | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lookupSeq = useRef(0);
  const toast = useToast();

  const homeChoices = useMemo(() => locations.filter((l) => l.privateOffice), [locations]);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const email = form.email.trim();

  // Check the email a moment after typing stops.
  useEffect(() => {
    if (!EMAIL_RE.test(email)) {
      setLookup({ state: 'idle', email });
      return;
    }
    setLookup({ state: 'checking', email });
    const seq = ++lookupSeq.current;
    const timer = setTimeout(() => {
      adminApi
        .lookupUser(email)
        .then((result) => {
          if (seq === lookupSeq.current) applyLookup(email, result);
        })
        .catch(() => {
          if (seq === lookupSeq.current) setLookup({ state: 'error', email });
        });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  function applyLookup(checked: string, { match, user }: AdminUserLookup) {
    setLookup({ state: match, email: checked, user });
    if (match === 'returning' && user) {
      if (user.id === filledFrom) return;
      const [firstName, lastName] = splitName(user.name);
      setForm((f) => ({
        ...f,
        phone: user.phone,
        firstName,
        lastName,
        businessUnit: user.businessUnit,
        department: user.department,
        team: user.team,
        role: user.role || 'Employee',
        accessLevel: user.accessLevel || 'Level 1',
        membership: user.membership,
        homeLocationId: homeChoices.some((l) => l.id === user.homeLocationId) ? user.homeLocationId : '',
        avatar: user.avatar,
        leftHotStamp: user.keyCard.leftHotStamp,
        rightHotStamp: user.keyCard.rightHotStamp,
      }));
      setFilledFrom(user.id);
    } else if (filledFrom) {
      // The email moved off the past record: start the rest of the form afresh.
      setForm((f) => ({ ...EMPTY, email: f.email }));
      setFilledFrom(null);
    }
  }

  // The check only counts for the email currently in the field.
  const current = lookup.email === email ? lookup : { state: 'idle' as const, email };
  const emailFree = current.state === 'none' || current.state === 'returning';
  const canNext =
    emailFree &&
    phoneOk(form.phone) &&
    !!form.firstName.trim() &&
    !!form.lastName.trim() &&
    !!form.businessUnit &&
    !!form.department &&
    !!form.role &&
    !!form.accessLevel &&
    form.membership.length > 0 &&
    !!form.homeLocationId;

  // Escape closes (menus inside claim it first); the page stays still behind the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !created) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, created]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLInputElement>('input[type=email]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Success shows for two seconds, then the dialog closes on its own. The callback sits in a ref so
  // a re-render of the page underneath doesn't restart the clock.
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  useEffect(() => {
    if (!created) return;
    const timer = setTimeout(() => onCreatedRef.current(created), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [created]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      set({ avatar: await readPhoto(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That photo can’t be used.');
    }
  }

  function next(e?: FormEvent) {
    e?.preventDefault();
    if (!canNext) return;
    setError('');
    setStep(2);
  }

  async function create(e?: FormEvent) {
    e?.preventDefault();
    setCreating(true);
    setError('');
    try {
      const { avatar, ...rest } = form;
      const payload: NewAdminUser = {
        ...rest,
        email,
        phone: form.phone.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        leftHotStamp: form.leftHotStamp.trim(),
        rightHotStamp: form.rightHotStamp.trim(),
        ...(avatar ? { avatar } : {}),
      };
      setCreated(await adminApi.createUser(payload));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      toast({ tone: 'error', title: 'Couldn’t create the user', description: message });
    } finally {
      setCreating(false);
    }
  }

  const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') || 'the new user';
  const cardReady = !!form.leftHotStamp.trim() && !!form.rightHotStamp.trim();

  let emailHelp: ReactNode = null;
  let emailTone: 'error' | 'success' | 'neutral' = 'neutral';
  if (touched.email && form.email && !EMAIL_RE.test(email)) {
    emailHelp = 'Enter a valid email address.';
    emailTone = 'error';
  } else if (current.state === 'checking') {
    emailHelp = 'Checking the directory…';
  } else if (current.state === 'error') {
    emailHelp = 'Couldn’t check this email. Try again in a moment.';
    emailTone = 'error';
  } else if (current.state === 'exists' && current.user) {
    const existing = current.user;
    emailTone = 'error';
    emailHelp = (
      <>
        This user already exists.{' '}
        <button type="button" className={styles.inlineLink} onClick={() => onViewExisting(existing.id)}>
          View user
        </button>
      </>
    );
  } else if (current.state === 'returning' && current.user) {
    emailTone = 'success';
    emailHelp = 'Past record found: details filled in for you to review.';
  }

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="add-user-title">
        {created ? (
          <div className={styles.success} role="status">
            <span className={styles.successBadge}>
              <img src="/admin/user/success-check.svg" alt="" width={40} height={40} />
            </span>
            <p className={styles.successText}>New User added successfully!</p>
          </div>
        ) : (
          <>
            <header className={styles.head}>
              <div className={styles.headText}>
                <h2 id="add-user-title" className={styles.title}>
                  Add New User
                </h2>
                <p className={styles.subtitle}>Add a teammate to your organisation’s WeWork workplace</p>
              </div>
              <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
                <img src="/admin/user/close.svg" alt="" width={24} height={24} />
              </button>
            </header>

            <div className={styles.steps}>
              <span className={styles.stepName}>{step === 1 ? 'General' : 'New Card Activation'}</span>
              <span className={styles.stepLine} aria-hidden="true" />
              <span className={styles.stepCount} aria-label={`Step ${step} of 2`}>
                <span className={styles.stepNumber}>{step}</span>/2 Steps
              </span>
            </div>

            {step === 1 ? (
              <form id="add-user-general" key="general" className={styles.body} onSubmit={next} noValidate>
                <div className={styles.avatarWrap}>
                  <img className={styles.avatar} src={avatarSrc(form)} alt="" width={80} height={80} />
                  <button type="button" className={styles.avatarEdit} aria-label="Add a photo" onClick={() => photoRef.current?.click()}>
                    <img src="/admin/user/edit-16.svg" alt="" width={16} height={16} />
                  </button>
                  <input
                    ref={photoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className={styles.srOnly}
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      void onPhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className={styles.grid}>
                  <TextField
                    label="Email ID*"
                    type="email"
                    autoComplete="off"
                    placeholder="name@company.com"
                    required
                    value={form.email}
                    invalid={emailTone === 'error'}
                    help={emailHelp}
                    helpTone={emailTone}
                    onChange={(v) => set({ email: v })}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  />
                  <TextField
                    label="Phone No. *"
                    type="tel"
                    autoComplete="off"
                    placeholder="+91 99999 77777"
                    required
                    value={form.phone}
                    invalid={!!touched.phone && !!form.phone && !phoneOk(form.phone)}
                    help={touched.phone && form.phone && !phoneOk(form.phone) ? 'Enter a valid phone number.' : null}
                    helpTone="error"
                    onChange={(v) => set({ phone: v })}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  />
                  <TextField label="First name*" required value={form.firstName} onChange={(v) => set({ firstName: v })} />
                  <TextField label="Last name*" required value={form.lastName} onChange={(v) => set({ lastName: v })} />
                  {/* Each level only offers what sits under the one above it. */}
                  <SelectField
                    wide
                    required
                    label="Business Unit*"
                    value={form.businessUnit}
                    choices={org.businessUnits}
                    onChange={(v) => set(fitOrg(org, { businessUnit: v, department: form.department, team: form.team }))}
                  />
                  <SelectField
                    required
                    label="Department*"
                    value={form.department}
                    choices={org.departmentsIn(form.businessUnit)}
                    onChange={(v) => set(fitOrg(org, { businessUnit: form.businessUnit, department: v, team: form.team }))}
                  />
                  <SelectField label="Team" value={form.team} choices={org.teamsIn(form.department)} onChange={(v) => set({ team: v })} />
                </div>

                <hr className={styles.rule} />

                <div className={styles.grid}>
                  <SelectField required label="Role*" value={form.role} choices={roleChoices} onChange={(v) => set({ role: v })} />
                  <SelectField required label="Access Level*" value={form.accessLevel} choices={accessChoices} onChange={(v) => set({ accessLevel: v })} />
                  <MembershipField value={form.membership} onChange={(membership) => set({ membership })} />
                  <SelectField
                    wide
                    required
                    label="Home Location*"
                    value={form.homeLocationId}
                    choices={homeChoices.map((l) => ({ value: l.id, label: l.name }))}
                    onChange={(v) => set({ homeLocationId: v })}
                  />
                </div>

                <div className={styles.note}>
                  <p>NOTE:</p>
                  <p>
                    Permissions for using the services and access to locations for co-working and other tools will be allocated by role basis. Only
                    buildings with your private office can be a home location.
                  </p>
                </div>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              <form id="add-user-card" key="card" className={[styles.body, styles.bodyCard].join(' ')} onSubmit={(e) => void create(e)} noValidate>
                <div className={styles.cardIntro}>
                  <TiltCard />
                  <div className={styles.cardFor}>
                    <span className={styles.cardForLabel}>Activate Keycard for</span>
                    <span className={styles.cardForName}>{fullName}</span>
                  </div>
                  <span className={[styles.cardState, cardReady ? styles.cardStateReady : ''].join(' ').trim()}>{cardReady ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <div className={styles.stamps}>
                  <TextField label="Left Hot Stamp" placeholder="e.g. 8932DHDNSNFN" value={form.leftHotStamp} onChange={(v) => set({ leftHotStamp: v })} />
                  <TextField label="Right Hot Stamp" placeholder="e.g. 8932DHDNSNFN" value={form.rightHotStamp} onChange={(v) => set({ rightHotStamp: v })} />
                </div>
                <div className={styles.note}>
                  <p>NOTE:</p>
                  <p>Card details are optional. Add both hot stamps to activate the card now, or add them later from the user’s details.</p>
                </div>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </form>
            )}

            <footer className={styles.foot}>
              {step === 1 ? (
                <>
                  <button type="button" className={styles.secondary} onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" form="add-user-general" className={styles.primary} disabled={!canNext}>
                    Next
                    <img src="/admin/user/arrow-forward-white.svg" alt="" width={20} height={20} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setError('');
                      setStep(1);
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" form="add-user-card" className={[styles.primary, styles.primaryHug].join(' ')} disabled={creating}>
                    {creating ? 'Creating…' : 'Create User'}
                    <img src="/admin/user/check-white.svg" alt="" width={20} height={20} />
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/** Membership as chips (PRIVATE OFFICE + ATLAS, or ALL ACCESS); the field opens the two choices. */
function MembershipField({ value, onChange }: { value: MembershipTag[]; onChange: (tags: MembershipTag[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className={[fieldStyles.field, fieldStyles.fieldWide, styles.membership].join(' ')} ref={ref}>
      <span className={fieldStyles.label} id="add-user-membership">
        Membership*
      </span>
      <div
        className={[fieldStyles.input, styles.chipInput].join(' ')}
        role="button"
        tabIndex={0}
        aria-labelledby="add-user-membership"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {value.length === 0 ? (
          <>
            <span className={styles.chipPlaceholder}>Select</span>
            <img className={styles.chipChevron} src="/admin/user/chevron-down.svg" alt="" width={20} height={20} />
          </>
        ) : (
          value.map((tag) => (
            <span key={tag} className={styles.chip}>
              {TAG_LABEL[tag]}
              {/* PO and ATLAS come as a pair, so removing either clears the membership. */}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remove ${TAG_LABEL[tag].toLowerCase()} membership`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
              >
                <img src="/admin/user/chip-close.svg" alt="" width={16} height={16} />
              </button>
            </span>
          ))
        )}
      </div>
      {open && (
        <div className={styles.menu} role="listbox" aria-labelledby="add-user-membership">
          {MEMBERSHIP_CHOICES.map((m) => {
            const selected = m.tags.length === value.length && m.tags.every((t) => value.includes(t));
            return (
              <button
                key={m.key}
                type="button"
                role="option"
                aria-selected={selected}
                className={styles.menuItem}
                onClick={() => {
                  onChange(m.tags);
                  setOpen(false);
                }}
              >
                <span className={styles.menuChips}>
                  {m.tags.map((t) => (
                    <span key={t} className={styles.chip}>
                      {TAG_LABEL[t]}
                    </span>
                  ))}
                </span>
                <span className={styles.menuLabel}>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The key card, tilting toward the pointer with a moving glare and a one-off shine on hover. */
function TiltCard() {
  const ref = useRef<HTMLDivElement>(null);
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || still) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    for (const prop of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(prop);
  }

  return (
    <div className={styles.cardStage}>
      <div ref={ref} className={styles.bigCard} aria-hidden="true" onPointerMove={onMove} onPointerLeave={onLeave}>
        <img className={styles.bigCardLogo} src="/admin/user/wework-logo-lg.svg" alt="" width={87.6304} height={17.5577} />
        <span className={styles.bigCardShine} />
      </div>
    </div>
  );
}
