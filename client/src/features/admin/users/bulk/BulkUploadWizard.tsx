import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
// The admin search field first, so the wizard's own rules win.
import ui from '../../AdminControls.module.css';
import styles from './BulkUploadWizard.module.css';
import type { AdminUser, OrgChart } from '../../../../api/types';
import { ACCESS_LEVELS, MEMBERSHIPS, ROLES, avatarSrc } from '../userShared';
import { useRowMenu } from '../useRowMenu';
import { RowMenu } from '../RowMenu';
import { useToast } from '../../Toaster';
import { useBulkUploads } from './BulkUploadProvider';
import { SHEET_ACCEPT, SheetError, readSheetFile, saveFile } from './sheetFile';
import { SearchCell, useSheetTip } from './SheetCells';
import {
  FIELD_LABEL,
  checkRows,
  fieldText,
  keepExisting,
  readRows,
  templateFile,
  toPayload,
  uploadRows,
  type DraftRow,
  type Field,
  type RowCheck,
} from './bulkRows';

type Step = 1 | 2 | 3;
type View = 'all' | 'new' | 'updates' | 'exists' | 'attention' | 'removed';

const STEP_NOTE: Record<Step, string> = {
  1: 'Step 1 of 3 · Upload a sheet of the people to add',
  2: 'Step 2 of 3 · Check the people in your sheet and fix anything flagged',
  3: 'Step 3 of 3 · Confirm what the upload will change',
};
const MAX_ROWS = 1000;
const ROW_MENU_HEIGHT = 56;
/** A cleared row fades out over this long. */
const LEAVE_MS = 260;

// ---------- icons ----------
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const DownloadIcon = () => (
  <Icon>
    <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M3.5 16.5h13" />
  </Icon>
);
const SheetIcon = () => (
  <svg width={28} height={28} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect x="4" y="3" width="20" height="22" rx="3" fill="#11a830" />
    <path d="M9 9h10M9 14h10M9 19h10M14 9v10" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
  </svg>
);

interface Props {
  users: AdminUser[];
  org: OrgChart;
  onClose: () => void;
}

/**
 * Upload Users (Figma 10331:235985): three steps under a stepper. 1, upload an Excel sheet (or
 * download the template); 2, check the people in it on an editable data sheet styled like All Users
 * (Figma 1578:126781), where people already set up exactly as the sheet says are greyed out; 3, a
 * summary of who's new, whose status changes and whose details change. Starting the upload hands it
 * to the server and the progress bar at the bottom of the page.
 */
export function BulkUploadWizard({ users, org, onClose }: Props) {
  const toast = useToast();
  const bulk = useBulkUploads();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<{ name: string; rows: number } | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<View>('all');
  const [starting, setStarting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const checks = useMemo(() => checkRows(drafts, users, org), [drafts, users, org]);
  const ready = useMemo(() => uploadRows(drafts, checks), [drafts, checks]);
  const counts = useMemo(() => {
    const c = { all: drafts.length, new: 0, updates: 0, exists: 0, attention: 0, removed: 0, status: 0, info: 0 };
    for (const d of drafts) {
      const check = checks.get(d.key)!;
      if (d.removed) {
        c.removed++;
        continue;
      }
      if (check.kind === 'new') c.new++;
      else if (check.kind === 'exists') c.exists++;
      else c.updates++;
      if (Object.keys(check.errors).length) c.attention++;
      else if (check.kind === 'status') c.status++;
      else if (check.kind === 'info') c.info++;
    }
    return c;
  }, [drafts, checks]);
  const added = ready.filter((d) => checks.get(d.key)!.kind === 'new').length;
  const dirty = drafts.length > 0;

  function requestClose() {
    if (dirty && !confirmClose) setConfirmClose(true);
    else onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (confirmClose) setConfirmClose(false);
      else requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  async function readFile(picked: File | undefined) {
    if (!picked) return;
    setReading(true);
    setReadError('');
    try {
      const rows = await readSheetFile(picked);
      const { drafts: next, missing } = readRows(rows, org);
      if (missing.length) throw new SheetError(`We couldn’t find ${missing.map((f) => `a ${FIELD_LABEL[f]}`).join(' or ')} column. Download the template to see the columns we read.`);
      if (next.length === 0) throw new SheetError('There’s nobody in this sheet yet. Add one person per row under the headings.');
      if (next.length > MAX_ROWS) throw new SheetError(`Upload up to ${MAX_ROWS} people at a time; this sheet has ${next.length}.`);
      setDrafts(keepExisting(next, users));
      setFile({ name: picked.name, rows: next.length });
      setView('all');
      setStep(2);
    } catch (err) {
      setReadError(err instanceof SheetError ? err.message : 'We couldn’t read this file. Save it as .xlsx or .csv and try again.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function pickFile() {
    inputRef.current?.click();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  }

  function update(key: number, patch: Partial<DraftRow>) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  async function startUpload() {
    if (starting || ready.length === 0) return;
    setStarting(true);
    try {
      await bulk.start(ready.map(toPayload), { added, updated: ready.length - added });
      onClose();
    } catch (err) {
      setStarting(false);
      toast({ tone: 'error', title: 'Couldn’t start the upload', description: err instanceof Error ? err.message : 'Please try again.' });
    }
  }

  const nextDisabled = step === 1 ? !file : step === 2 ? counts.attention > 0 || ready.length === 0 : starting || ready.length === 0;

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="bulk-upload-title">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="bulk-upload-title" className={styles.title}>
              Upload Users
            </h2>
            <p className={styles.subtitle}>{STEP_NOTE[step]}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={requestClose}>
            <img src="/admin/user/close.svg" alt="" width={24} height={24} />
          </button>
        </header>

        <Stepper step={step} />

        <input ref={inputRef} type="file" accept={SHEET_ACCEPT} hidden onChange={(e: ChangeEvent<HTMLInputElement>) => void readFile(e.target.files?.[0])} />

        <div className={[styles.body, step === 1 ? styles.bodyUpload : ''].join(' ').trim()}>
          {step === 1 && (
            <div
              className={[styles.drop, dragging ? styles.dropActive : '', readError ? styles.dropError : ''].join(' ').trim()}
              role="button"
              tabIndex={0}
              aria-label="Upload an Excel sheet"
              aria-describedby="bulk-drop-note"
              onClick={pickFile}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pickFile();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
              }}
              onDrop={onDrop}
            >
              <div className={styles.dropInner}>
                {file && !readError ? (
                  <SheetIcon />
                ) : (
                  <span className={styles.folder}>
                    <img src="/admin/user/upload-folder.png" alt="" />
                  </span>
                )}
                <p className={styles.dropLine}>
                  {reading ? (
                    <span className={styles.dropMuted}>Reading your sheet…</span>
                  ) : file && !readError ? (
                    <>
                      <span className={styles.dropStrong}>{file.name}</span>
                      <span className={styles.dropMuted}>
                        · {file.rows} {file.rows === 1 ? 'person' : 'people'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.dropStrong}>Click to Upload</span>
                      <span className={styles.dropMuted}>or drag and drop</span>
                    </>
                  )}
                </p>
                <p id="bulk-drop-note" className={readError ? styles.dropErrorText : styles.dropNote} role={readError ? 'alert' : undefined}>
                  {readError || (file ? 'Click or drop another file to replace it.' : 'An Excel sheet (.xlsx) or .csv, with one person per row. Use the template for the right columns.')}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <DataSheet
              drafts={drafts}
              checks={checks}
              counts={counts}
              view={view}
              org={org}
              onView={setView}
              onChange={update}
            />
          )}

          {step === 3 && <Summary drafts={ready} checks={checks} skipped={counts.exists} removed={counts.removed} />}
        </div>

        {/* While asking to discard, everything above the footer is greyed out; a click there keeps editing. */}
        {confirmClose && <div className={styles.dim} aria-hidden="true" onMouseDown={() => setConfirmClose(false)} />}

        <footer className={styles.foot}>
          {confirmClose ? (
            <div className={styles.confirm} role="alertdialog" aria-label="Discard this upload?">
              <span className={styles.confirmText}>Discard this sheet and your edits?</span>
              <div className={styles.footEnd}>
                <button type="button" className={styles.secondary} autoFocus onClick={() => setConfirmClose(false)}>
                  Keep editing
                </button>
                <button type="button" className={styles.danger} onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.footStart}>
                {step === 1 ? (
                  <button type="button" className={styles.secondary} onClick={() => saveFile(templateFile(org), 'users-upload-template.xlsx')}>
                    <DownloadIcon />
                    Download template
                  </button>
                ) : (
                  <button type="button" className={styles.secondary} onClick={() => setStep((s) => (s - 1) as Step)}>
                    <img src="/admin/user/arrow-left.svg" alt="" width={20} height={20} />
                    Back
                  </button>
                )}
              </div>
              <div className={styles.footMiddle}>
                {step === 2 && (
                  <p className={[styles.footNote, counts.attention ? styles.footNoteError : ''].join(' ').trim()} aria-live="polite">
                    {counts.attention
                      ? `Fix or remove ${counts.attention} ${counts.attention === 1 ? 'row' : 'rows'} to continue`
                      : ready.length === 0
                        ? 'Everyone in this sheet is already set up'
                        : `${counts.new} new · ${counts.updates} to update · ${counts.exists + counts.removed} skipped`}
                  </p>
                )}
                {step === 3 && (
                  <p className={styles.footNote}>
                    {ready.length} {ready.length === 1 ? 'person' : 'people'} will be added or updated
                  </p>
                )}
              </div>
              <div className={styles.footEnd}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={nextDisabled}
                  onClick={() => (step === 3 ? void startUpload() : setStep((s) => (s + 1) as Step))}
                >
                  {step === 3 ? (starting ? 'Starting…' : 'Start upload') : step === 2 ? 'Review summary' : 'Next'}
                  <img src={step === 3 ? '/admin/user/check-white.svg' : '/admin/user/arrow-forward-white.svg'} alt="" width={20} height={20} />
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/** Three numbered steps joined by lines; the line after a step turns green once that step is reached. */
function Stepper({ step }: { step: Step }) {
  return (
    <ol className={styles.stepper} aria-label="Upload steps">
      {([1, 2, 3] as Step[]).map((n) => (
        <li key={n} className={styles.stepItem} aria-current={n === step ? 'step' : undefined}>
          <span className={[styles.stepDot, n < step ? styles.stepDone : n === step ? styles.stepOn : ''].join(' ').trim()}>
            {n < step ? <img src="/admin/user/check-white.svg" alt="" width={14} height={14} /> : n}
            <span className={styles.srOnly}>{n < step ? ' (done)' : n === step ? ' (current)' : ''}</span>
          </span>
          {n < 3 && <span className={[styles.stepLine, n <= step ? styles.stepLineOn : ''].join(' ').trim()} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

// ---------- step 2: the data sheet ----------
interface Counts {
  all: number;
  new: number;
  updates: number;
  exists: number;
  attention: number;
  removed: number;
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'updates', label: 'Updates' },
  { id: 'exists', label: 'Already exist' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'removed', label: 'Removed' },
];

/** The sheet's columns after the row number and person: role and access, then the business unit down to the team. */
const COLUMNS: { label: string; full?: string }[] = [
  { label: 'ROW' },
  { label: 'USER' },
  { label: 'ROLE' },
  { label: 'ACCESS' },
  { label: 'BU', full: 'Business Unit' },
  { label: 'DEPARTMENT' },
  { label: 'TEAM' },
  { label: 'MEMBERSHIP' },
  { label: 'STATUS' },
];

function inView(view: View, d: DraftRow, c: RowCheck) {
  if (view === 'all') return true;
  if (view === 'removed') return d.removed;
  if (d.removed) return false;
  if (view === 'attention') return Object.keys(c.errors).length > 0;
  if (view === 'new') return c.kind === 'new';
  if (view === 'exists') return c.kind === 'exists';
  return c.kind === 'status' || c.kind === 'info';
}

function DataSheet({
  drafts,
  checks,
  counts,
  view,
  org,
  onView,
  onChange,
}: {
  drafts: DraftRow[];
  checks: Map<number, RowCheck>;
  counts: Counts;
  view: View;
  org: OrgChart;
  onView: (view: View) => void;
  onChange: (key: number, patch: Partial<DraftRow>) => void;
}) {
  const rowMenu = useRowMenu(ROW_MENU_HEIGHT);
  const tip = useSheetTip();
  const [query, setQuery] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  // Outside All, editing a row puts a check in place of its ⋯ and keeps the row here even if the
  // edit takes it out of this view (a fix in Needs attention, say), until the check is clicked.
  // Marks belong to the view they were made in.
  const [edited, setEdited] = useState<{ view: View; rows: Record<number, 'editing' | 'leaving'> }>({ view, rows: {} });
  const marks = edited.view === view ? edited.rows : {};
  const mark = (key: number, state: 'editing' | 'leaving' | null) =>
    setEdited((e) => {
      const rows = { ...(e.view === view ? e.rows : {}) };
      if (state) rows[key] = state;
      else delete rows[key];
      return { view, rows };
    });

  /** A field edit; outside All the row gets its check. */
  function edit(key: number, patch: Partial<DraftRow>) {
    onChange(key, patch);
    if (view !== 'all' && !marks[key]) mark(key, 'editing');
  }

  /** The check: a row that no longer belongs here fades out; one that still does just loses its check. */
  function done(d: DraftRow) {
    if (inView(view, d, checks.get(d.key)!)) return mark(d.key, null);
    mark(d.key, 'leaving');
    setTimeout(() => {
      mark(d.key, null);
      tableRef.current?.focus();
    }, LEAVE_MS);
  }

  const q = query.trim().toLowerCase();
  const rows = drafts.filter(
    (d) => (inView(view, d, checks.get(d.key)!) || marks[d.key]) && (!q || d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q)),
  );

  const active = <T extends { status: string; name: string }>(list: T[]) => list.filter((u) => u.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const bus = active(org.businessUnits);
  const deps = active(org.departments);
  const tms = active(org.teams);

  /** Picking a team brings its department and business unit; a department, its business unit. */
  function setOrg(d: DraftRow, field: 'team' | 'department' | 'businessUnit', value: string) {
    if (field === 'team') {
      const team = tms.find((t) => t.name === value);
      const dept = team && deps.find((x) => x.id === team.departmentId);
      const bu = dept && bus.find((b) => b.id === dept.businessUnitId);
      return edit(d.key, { team: value, ...(dept && bu ? { department: dept.name, businessUnit: bu.name } : {}) });
    }
    if (field === 'department') {
      const dept = deps.find((x) => x.name === value);
      const bu = dept && bus.find((b) => b.id === dept.businessUnitId);
      const teamFits = !d.team || tms.some((t) => t.name === d.team && t.departmentId === dept?.id);
      return edit(d.key, { department: value, ...(bu ? { businessUnit: bu.name } : {}), ...(teamFits ? {} : { team: '' }) });
    }
    const bu = bus.find((b) => b.name === value);
    const dept = deps.find((x) => x.name === d.department);
    const deptFits = !!dept && dept.businessUnitId === bu?.id;
    edit(d.key, { businessUnit: value, ...(deptFits ? {} : { department: '', team: '' }) });
  }

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBar}>
        <div className={styles.views} role="tablist" aria-label="Show rows">
          {VIEWS.filter((v) => v.id !== 'removed' || counts.removed > 0).map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={[styles.view, view === v.id ? styles.viewOn : '', v.id === 'attention' && counts.attention ? styles.viewAlert : ''].join(' ').trim()}
              onClick={() => onView(v.id)}
            >
              {v.label}
              <span className={styles.viewCount}>{counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className={styles.sheetTools}>
          <label className={[ui.search, styles.sheetSearch].join(' ')}>
            <span className={styles.srOnly}>Search by name or email</span>
            <input value={query} placeholder="Search name or email" onChange={(e) => setQuery(e.target.value)} />
            <img src="/admin/search.svg" alt="" width={18} height={18} />
          </label>
          <span className={styles.total}>
            Total records <strong className={styles.totalCount}>{drafts.length}</strong>
          </span>
        </div>
      </div>

      <div
        ref={tableRef}
        className={styles.table}
        role="table"
        aria-label="People in your sheet"
        tabIndex={-1}
        {...tip.handlers}
        onScroll={tip.hide}
      >
        <div className={[styles.grid, styles.headRow].join(' ')} role="row">
          {COLUMNS.map((h) => (
            <span key={h.label} role="columnheader" data-tip={h.full ?? h.label} data-tip-when={h.full ? 'always' : undefined}>
              {h.full ? (
                <>
                  <span aria-hidden="true">{h.label}</span>
                  <span className={styles.srOnly}>{h.full}</span>
                </>
              ) : (
                h.label
              )}
            </span>
          ))}
          <span role="columnheader" className={styles.actionsHead}>
            <span className={styles.srOnly}>Actions</span>
          </span>
        </div>

        {tip.node}
        {rows.length === 0 && <p className={styles.empty}>{q ? `No one here matches “${query.trim()}”.` : 'No rows here.'}</p>}

        {rows.map((d) => {
          const check = checks.get(d.key)!;
          const locked = check.kind === 'exists' && !d.unlocked;
          const off = locked || d.removed;
          const changed = (f: Field) => check.changes.find((c) => c.field === f);
          const note = (f: Field) => {
            // The user cell holds both the name and the email.
            const error = check.errors[f] ?? (f === 'name' ? check.errors.email : undefined);
            if (error) return { text: error, tone: 'error' as const };
            const was = changed(f);
            return was ? { text: `Was ${fieldText(f, was.from)}`, tone: 'changed' as const } : null;
          };
          const cell = (f: Field, control: ReactNode, wide = false) => {
            const n = off ? null : note(f);
            return (
              <div
                role="cell"
                className={[styles.cell, wide ? styles.cellWide : '', n?.tone === 'error' ? styles.cellError : n?.tone === 'changed' ? styles.cellChanged : ''].join(' ').trim()}
              >
                {control}
                {n && (
                  <span className={n.tone === 'error' ? styles.noteError : styles.noteChanged} data-tip={n.text}>
                    {n.text}
                  </span>
                )}
              </div>
            );
          };
          const options = (list: string[], current: string, empty?: string) => {
            const known = list.includes(current) || (!current && empty !== undefined);
            return (
              <>
                {empty !== undefined && <option value="">{empty}</option>}
                {!known && current && <option value={current}>{current}</option>}
                {list.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </>
            );
          };
          const deptChoices = deps.filter((x) => !d.businessUnit || bus.find((b) => b.name === d.businessUnit)?.id === x.businessUnitId).map((x) => x.name);
          const teamChoices = tms.filter((t) => !d.department || deps.find((x) => x.name === d.department)?.id === t.departmentId).map((t) => t.name);
          const label = (f: Field) => `${FIELD_LABEL[f]} for row ${d.sheetRow}`;
          /** The error to show in full when hovering the field. */
          const error = (f: Field) => (off ? undefined : check.errors[f]);
          const marked = marks[d.key];
          // Edited and no longer belonging here (fixed, in Needs attention): ready to clear.
          const resolved = !!marked && !inView(view, d, check);
          const selectClass = [styles.select, off ? styles.selectOff : ''].join(' ').trim();

          return (
            <div
              key={d.key}
              role="row"
              className={[
                styles.grid,
                styles.row,
                locked ? styles.rowLocked : '',
                d.removed ? styles.rowRemoved : '',
                resolved ? styles.rowFixed : '',
                marked === 'leaving' ? styles.rowLeaving : '',
              ]
                .join(' ')
                .trim()}
            >
              <div role="cell">
                <span className={styles.rowNo}>{d.sheetRow}</span>
              </div>

              {cell(
                'name',
                <div className={styles.user}>
                  <img className={styles.avatar} src={avatarSrc(check.match ?? {})} alt="" />
                  <div className={styles.userText}>
                    <input
                      className={[styles.input, styles.inputName, check.errors.name && !off ? styles.inputBad : ''].join(' ').trim()}
                      value={d.name}
                      placeholder="Name"
                      disabled={off}
                      aria-label={label('name')}
                      aria-invalid={!!check.errors.name && !off}
                      data-tip={error('name') ?? ''}
                      data-tip-when={error('name') ? 'always' : undefined}
                      onChange={(e) => edit(d.key, { name: e.target.value })}
                    />
                    <input
                      className={[styles.input, styles.inputEmail, check.errors.email && !off ? styles.inputBad : ''].join(' ').trim()}
                      value={d.email}
                      placeholder="Email"
                      type="email"
                      disabled={off}
                      aria-label={label('email')}
                      aria-invalid={!!check.errors.email && !off}
                      data-tip={error('email') ?? ''}
                      data-tip-when={error('email') ? 'always' : undefined}
                      onChange={(e) => edit(d.key, { email: e.target.value })}
                    />
                  </div>
                </div>,
                true,
              )}
              {/* Role and access, then the business unit down to the team; type to search the choices. */}
              {cell(
                'role',
                <SearchCell
                  className={selectClass}
                  value={d.role}
                  options={ROLES}
                  disabled={off}
                  label={label('role')}
                  error={error('role')}
                  onChange={(v) => edit(d.key, { role: v })}
                />,
              )}
              {cell(
                'accessLevel',
                <SelectCell value={d.accessLevel} disabled={off} label={label('accessLevel')} error={error('accessLevel')} onChange={(v) => edit(d.key, { accessLevel: v })}>
                  {options(ACCESS_LEVELS, d.accessLevel, d.accessLevel ? undefined : 'Select')}
                </SelectCell>,
              )}
              {cell(
                'businessUnit',
                <SearchCell
                  className={selectClass}
                  value={d.businessUnit}
                  options={bus.map((b) => b.name)}
                  disabled={off}
                  label={label('businessUnit')}
                  error={error('businessUnit')}
                  onChange={(v) => setOrg(d, 'businessUnit', v)}
                />,
              )}
              {cell(
                'department',
                <SearchCell
                  className={selectClass}
                  value={d.department}
                  options={deptChoices}
                  disabled={off}
                  label={label('department')}
                  error={error('department')}
                  onChange={(v) => setOrg(d, 'department', v)}
                />,
              )}
              {cell(
                'team',
                <SearchCell
                  className={selectClass}
                  value={d.team}
                  options={teamChoices}
                  emptyLabel="No team"
                  disabled={off}
                  label={label('team')}
                  error={error('team')}
                  onChange={(v) => setOrg(d, 'team', v)}
                />,
              )}
              {cell(
                'membership',
                <SelectCell
                  value={d.membership}
                  disabled={off}
                  label={label('membership')}
                  error={error('membership')}
                  face={
                    MEMBERSHIPS.some((m) => m.key === d.membership) ? (
                      <span className={styles.tags}>
                        {MEMBERSHIPS.find((m) => m.key === d.membership)!.tags.map((t) => (
                          <span key={t} className={[styles.badge, styles.tag].join(' ')}>
                            {t}
                          </span>
                        ))}
                      </span>
                    ) : undefined
                  }
                  onChange={(v) => edit(d.key, { membership: v })}
                >
                  {!MEMBERSHIPS.some((m) => m.key === d.membership) && <option value={d.membership}>{d.membership || 'Select'}</option>}
                  {MEMBERSHIPS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </SelectCell>,
              )}
              {d.removed || locked ? (
                <div role="cell" className={styles.cell}>
                  <span className={[styles.badge, styles.badgeMuted].join(' ')}>{d.removed ? 'REMOVED' : 'ALREADY EXISTS'}</span>
                </div>
              ) : (
                cell(
                  'status',
                  <SelectCell
                    value={d.status}
                    label={label('status')}
                    error={error('status')}
                    face={
                      d.status === 'active' || d.status === 'inactive' ? (
                        <span className={[styles.badge, d.status === 'active' ? styles.badgeActive : styles.badgeInactive].join(' ')}>{d.status.toUpperCase()}</span>
                      ) : undefined
                    }
                    onChange={(v) => edit(d.key, { status: v })}
                  >
                    {d.status !== 'active' && d.status !== 'inactive' && <option value={d.status}>{d.status}</option>}
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </SelectCell>,
                )
              )}

              <div role="cell" className={styles.actions} ref={rowMenu.menu?.id === String(d.key) ? rowMenu.ref : undefined}>
                {marked ? (
                  // Edited: a check in place of the ⋯ until it's clicked. Green once the row no longer
                  // belongs in this view (clicking clears it from here); plain while it still does.
                  <button
                    type="button"
                    className={[styles.fixed, resolved ? '' : styles.fixedPending].join(' ').trim()}
                    aria-label={resolved ? `Row ${d.sheetRow} is done. Clear it from this list` : `Done editing row ${d.sheetRow}`}
                    data-tip={resolved ? 'Done. Click to clear it from this list.' : 'Click when you’re done editing.'}
                    data-tip-when="always"
                    disabled={marked === 'leaving'}
                    onClick={() => done(d)}
                  >
                    <img src={resolved ? '/admin/user/check-white.svg' : '/admin/user/check.svg'} alt="" width={20} height={20} />
                  </button>
                ) : (
                <button
                  type="button"
                  className={styles.more}
                  aria-label={`More actions for row ${d.sheetRow}`}
                  aria-haspopup="menu"
                  aria-expanded={rowMenu.menu?.id === String(d.key)}
                  onClick={(e) => rowMenu.open(String(d.key), e.currentTarget)}
                >
                  <img src="/admin/more.svg" alt="" width={20} height={20} />
                </button>
                )}
                {!marked && rowMenu.menu?.id === String(d.key) && (
                  <RowMenu state={rowMenu} className={styles.menu}>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        rowMenu.close();
                        if (d.removed) onChange(d.key, { removed: false });
                        else if (locked) edit(d.key, { unlocked: true });
                        else onChange(d.key, { removed: true });
                      }}
                    >
                      {d.removed ? 'Add back to upload' : locked ? 'Edit this row' : 'Remove from upload'}
                    </button>
                  </RowMenu>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A data-sheet cell with a short dropdown (access level, membership, status): shows the value (or a
 * badge `face`) and opens the native list. Hovering shows the full value when it's cut short, or the
 * cell's error in full.
 */
function SelectCell({
  value,
  disabled,
  label,
  placeholder,
  face,
  error,
  children,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  face?: ReactNode;
  error?: string;
  children: ReactNode;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={[styles.select, disabled ? styles.selectOff : ''].join(' ').trim()}
      data-tip={error ?? (face ? undefined : value)}
      data-tip-when={error ? 'always' : undefined}
    >
      <span className={styles.selectFace}>
        {face ?? (
          <span className={value ? styles.selectValue : styles.selectPlaceholder} data-tip-measure>
            {value || placeholder || 'Select'}
          </span>
        )}
      </span>
      {!disabled && <img className={styles.chevron} src="/admin/user/chevron-down.svg" alt="" width={16} height={16} />}
      <select value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

// ---------- step 3: summary ----------
function Summary({ drafts, checks, skipped, removed }: { drafts: DraftRow[]; checks: Map<number, RowCheck>; skipped: number; removed: number }) {
  const of = (kind: RowCheck['kind']) => drafts.filter((d) => checks.get(d.key)!.kind === kind);
  const groups = [
    { kind: 'new' as const, title: 'New users', note: 'Added to your organisation, active unless the sheet says inactive.', rows: of('new') },
    { kind: 'status' as const, title: 'Status changes', note: 'Activated or made inactive.', rows: of('status') },
    { kind: 'info' as const, title: 'Info changes', note: 'Role, access level, business unit, department, team, membership or name updated.', rows: of('info') },
  ];

  return (
    <div className={styles.summary}>
      <div className={styles.tiles}>
        {groups.map((g) => (
          <div key={g.kind} className={[styles.tile, styles[`tile_${g.kind}`]].join(' ')}>
            <span className={styles.tileCount}>{g.rows.length}</span>
            <span className={styles.tileTitle}>{g.title}</span>
            <span className={styles.tileNote}>{g.note}</span>
          </div>
        ))}
      </div>
      {(skipped > 0 || removed > 0) && (
        <p className={styles.skipped}>
          Not in this upload: {[skipped && `${skipped} already set up as the sheet says`, removed && `${removed} removed by you`].filter(Boolean).join(', ')}.
        </p>
      )}

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.kind} className={styles.group} aria-label={g.title}>
            <h3 className={styles.groupTitle}>
              {g.title}
              <span className={styles.groupCount}>{g.rows.length}</span>
            </h3>
            <ul className={styles.people}>
              {g.rows.map((d) => {
                const check = checks.get(d.key)!;
                return (
                  <li key={d.key} className={styles.person}>
                    <img className={styles.personAvatar} src={avatarSrc(check.match ?? {})} alt="" />
                    <span className={styles.personText}>
                      <span className={styles.personName}>{d.name}</span>
                      <span className={styles.personEmail}>{d.email}</span>
                    </span>
                    <span className={styles.personChange}>
                      {g.kind === 'new'
                        ? [d.role, fieldText('accessLevel', d.accessLevel), d.team || d.department, MEMBERSHIPS.find((m) => m.key === d.membership)?.label, d.status === 'inactive' ? 'Inactive' : '']
                            .filter(Boolean)
                            .join(' · ')
                        : check.changes.map((c) => (
                            <span key={c.field} className={styles.changeLine}>
                              <span className={styles.changeField}>{FIELD_LABEL[c.field]}:</span> {fieldText(c.field, c.from)} <span aria-label="to">→</span>{' '}
                              <strong>{fieldText(c.field, c.to)}</strong>
                            </span>
                          ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
