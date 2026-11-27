import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './BulkUploadProvider.module.css';
import { adminApi } from '../../../../api/adminApi';
import type { BulkUploadJob, BulkUserRow } from '../../../../api/types';
import { useToast } from '../../Toaster';

const POLL_MS = 700;
/** A finished upload without failures tidies itself away after this long. */
const HIDE_DONE_MS = 8000;

interface BulkUploads {
  /** Sends the rows to the server, which works through them in the background. */
  start: (rows: BulkUserRow[], counts: { added: number; updated: number }) => Promise<void>;
  job: BulkUploadJob | null;
  /** Goes up whenever the upload adds or changes someone, so lists can reload. */
  revision: number;
}

const BulkUploadContext = createContext<BulkUploads>({ start: async () => {}, job: null, revision: 0 });

export const useBulkUploads = () => useContext(BulkUploadContext);

/**
 * Runs bulk uploads for the whole app: one at a time, polled until done, with a progress bar at the
 * bottom of every page so the admin can keep working, and a toast when it starts and when it ends.
 */
export function BulkUploadProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [job, setJob] = useState<BulkUploadJob | null>(null);
  const [revision, setRevision] = useState(0);
  const [shown, setShown] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const start = useCallback(async (rows: BulkUserRow[], counts: { added: number; updated: number }) => {
    const started = await adminApi.startBulkUpload(rows);
    setJob(started);
    setShown(true);
    setDetailsOpen(false);
    const parts = [counts.added && `adding ${counts.added} ${counts.added === 1 ? 'user' : 'users'}`, counts.updated && `updating ${counts.updated}`].filter(Boolean).join(' and ');
    toastRef.current({
      title: 'We’ve started your upload',
      description: (
        <>
          We’re <strong>{parts}</strong>. Follow along at the bottom of the page.
        </>
      ),
    });
  }, []);

  const jobId = job?.id;
  const running = job?.status === 'running';
  useEffect(() => {
    if (!jobId || !running) return;
    let cancelled = false;
    let seen = 0;
    const poll = async () => {
      try {
        const next = await adminApi.getBulkUpload(jobId);
        if (cancelled) return;
        setJob(next);
        const changed = next.created + next.updated;
        if (changed !== seen || next.status === 'done') {
          seen = changed;
          setRevision((r) => r + 1);
        }
        if (next.status === 'done') {
          const saved = [next.created && `added ${next.created}`, next.updated && `updated ${next.updated}`].filter(Boolean).join(' and ');
          toastRef.current(
            next.failed.length
              ? {
                  tone: 'error',
                  title: 'Upload finished with errors',
                  description: (
                    <>
                      <strong>{next.failed.length}</strong> {next.failed.length === 1 ? 'row wasn’t' : 'rows weren’t'} saved{saved ? `; we ${saved}` : ''}. See the details at the bottom of the page.
                    </>
                  ),
                }
              : { title: 'Upload complete', description: <>We {saved ? <strong>{saved}</strong> : 'checked everyone'}{saved ? ' users' : ''}.</> },
          );
          return;
        }
      } catch {
        // A missed poll: try again next time.
      }
      if (!cancelled) timer = window.setTimeout(poll, POLL_MS);
    };
    let timer = window.setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, running]);

  // Tidy away a clean finish; one with failures stays until it's closed.
  const done = job?.status === 'done';
  const clean = done && job.failed.length === 0;
  useEffect(() => {
    if (!clean || detailsOpen) return;
    const t = setTimeout(() => setShown(false), HIDE_DONE_MS);
    return () => clearTimeout(t);
  }, [clean, detailsOpen]);

  return (
    <BulkUploadContext.Provider value={{ start, job, revision }}>
      {children}
      {job && shown && <ProgressDock job={job} detailsOpen={detailsOpen} onToggleDetails={() => setDetailsOpen((o) => !o)} onClose={() => setShown(false)} />}
    </BulkUploadContext.Provider>
  );
}

/** The bar at the bottom of the page: how far the upload has got, then how it went. */
function ProgressDock({ job, detailsOpen, onToggleDetails, onClose }: { job: BulkUploadJob; detailsOpen: boolean; onToggleDetails: () => void; onClose: () => void }) {
  const done = job.status === 'done';
  const failed = job.failed.length;
  const percent = job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const tone = !done ? 'running' : failed ? 'warning' : 'success';
  const parts = [
    job.created && `${job.created} added`,
    job.updated && `${job.updated} updated`,
    job.unchanged && `${job.unchanged} unchanged`,
    failed && `${failed} not saved`,
  ].filter(Boolean);

  return (
    <section className={[styles.dock, styles[`dock_${tone}`]].join(' ')} aria-label="User upload" aria-live="polite">
      {detailsOpen && failed > 0 && (
        <ul className={styles.failures}>
          {job.failed.map((f, i) => (
            <li key={i}>
              <span className={styles.failName}>{f.name || f.email || 'Unnamed row'}</span>
              <span className={styles.failError}>{f.error}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden="true">
          {done ? (
            <img src={failed ? '/admin/user/toast-error.svg' : '/admin/user/toast-check-circle.svg'} alt="" width={24} height={24} />
          ) : (
            <span className={styles.spinner} />
          )}
        </span>
        <div className={styles.text}>
          <p className={styles.title}>{done ? (failed ? 'Upload finished with errors' : 'Upload complete') : 'Uploading users'}</p>
          <p className={styles.meta}>
            {done ? parts.join(' · ') : `${job.processed} of ${job.total} done${failed ? ` · ${failed} not saved` : ''}`}
          </p>
        </div>
        {done && failed > 0 && (
          <button type="button" className={styles.link} aria-expanded={detailsOpen} onClick={onToggleDetails}>
            {detailsOpen ? 'Hide details' : 'Details'}
          </button>
        )}
        {done ? (
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <img src="/admin/user/toast-close.svg" alt="" width={20} height={20} />
          </button>
        ) : (
          <span className={styles.percent}>{percent}%</span>
        )}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={job.processed}
      >
        <span className={styles.fill} style={{ transform: `scaleX(${job.total ? job.processed / job.total : 0})` }} />
      </div>
    </section>
  );
}
