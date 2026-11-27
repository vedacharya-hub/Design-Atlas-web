import { useMemo, useState } from 'react';
// Shared controls; this tab's rules last.
import ui from '../AdminControls.module.css';
import styles from './OverageAllocationTab.module.css';
import { adminApi } from '../../../api/adminApi';
import type { AdminUser, CreditOverview, OrgChart, Team, TeamOverage } from '../../../api/types';
import { AdminModal } from '../AdminModal';
import { BrandSwitch } from '../BrandSwitch';
import { useToast } from '../Toaster';
import { useSheetTip } from '../users/bulk/SheetCells';
import { Stepper } from './Stepper';
import { UsageBar } from './UsageBar';
import { credits, daysLeft, daysLeftText, percentOf } from './creditShared';

/** The company limit moves in fifties, a team's in fives. */
const COMPANY_STEP = 50;
const TEAM_STEP = 5;
/** Where a new team allocation starts, if there's room. */
const TEAM_START = 20;

interface Props {
  overview: CreditOverview;
  org: OrgChart;
  users: AdminUser[];
  onChange: (overview: CreditOverview) => void;
}

interface TeamRow {
  team: Team;
  overage: TeamOverage;
  members: number;
}
interface DeptRow {
  id: string;
  name: string;
  teams: TeamRow[];
}
interface UnitRow {
  id: string;
  name: string;
  departments: DeptRow[];
  teams: TeamRow[];
}

/** What a group's teams with their own limit have used of them; the rest share the free pool. */
function totals(rows: TeamRow[]) {
  const limited = rows.filter((r) => r.overage.limit !== null);
  return {
    limited: limited.length,
    used: limited.reduce((n, r) => n + r.overage.used, 0),
    limit: limited.reduce((n, r) => n + (r.overage.limit ?? 0), 0),
  };
}

/**
 * Credit Overage Allocation (Figma 5876:230515 off, 5414:242598 on, 8636:304024 editing a team).
 * Turned on, the company's overage is capped at a pool for the 30-day cycle. A team can be given
 * its own limit carved out of that pool; teams without one share what's left of it (the free pool).
 * Departments and business units show their teams' limits added up.
 */
export function OverageAllocationTab({ overview, org, users, onChange }: Props) {
  const toast = useToast();
  const tip = useSheetTip();
  const [limitDraft, setLimitDraft] = useState<number | null>(null);
  const [teamDraft, setTeamDraft] = useState<{ teamId: string; value: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  // Business Unit → Department → Team, active ones that have teams.
  const units = useMemo<UnitRow[]>(() => {
    const overageOf = new Map(overview.teams.map((t) => [t.teamId, t]));
    const memberCount = (t: Team) => users.filter((u) => u.team === t.name).length;
    return org.businessUnits
      .filter((b) => b.status === 'active')
      .map((b) => {
        const departments = org.departments
          .filter((d) => d.businessUnitId === b.id && d.status === 'active')
          .map((d) => ({
            id: d.id,
            name: d.name,
            teams: org.teams
              .filter((t) => t.departmentId === d.id && overageOf.has(t.id))
              .map((t) => ({ team: t, overage: overageOf.get(t.id)!, members: memberCount(t) })),
          }))
          .filter((d) => d.teams.length > 0);
        return { id: b.id, name: b.name, departments, teams: departments.flatMap((d) => d.teams) };
      })
      .filter((b) => b.departments.length > 0);
  }, [overview.teams, org, users]);

  // Open to start: the first department where a team has its own limit.
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = units.flatMap((u) => u.departments).find((d) => d.teams.some((t) => t.overage.limit !== null)) ?? units[0]?.departments[0];
    return new Set(first ? [first.id] : []);
  });

  const pool = overview.overage.limit;
  const allocated = overview.teams.reduce((n, t) => n + (t.limit ?? 0), 0);
  // While the company limit is being edited, the free pool follows the draft.
  const freePool = Math.max(0, (limitDraft ?? pool) - allocated);
  const freeUsed = overview.teams.reduce((n, t) => n + (t.limit === null ? t.used : 0), 0);
  const roomFor = (o: TeamOverage) => pool - (allocated - (o.limit ?? 0));

  async function run(task: () => Promise<CreditOverview>, done: (next: CreditOverview) => void, failTitle: string) {
    setSaving(true);
    try {
      const next = await task();
      onChange(next);
      done(next);
    } catch (err) {
      toast({ tone: 'error', title: failTitle, description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  function setEnabled(enabled: boolean) {
    setConfirmOff(false);
    void run(
      () => adminApi.updateOverage({ enabled }),
      (next) => {
        setLimitDraft(null);
        setTeamDraft(null);
        toast(
          enabled
            ? { title: 'Overage limits are on', description: <>The company can use up to <strong>{credits(next.overage.limit)}</strong> overage credits this cycle</> }
            : { title: 'Overage limits are off', description: <>Overage is unlimited again; team limits are kept for when you turn them back on</> },
        );
      },
      `Couldn’t turn overage limits ${enabled ? 'on' : 'off'}`,
    );
  }

  function saveLimit(value = limitDraft) {
    if (value === null || saving) return;
    if (value === pool) return setLimitDraft(null);
    void run(
      () => adminApi.updateOverage({ limit: value }),
      (next) => {
        setLimitDraft(null);
        toast({ title: 'Overage limit saved', description: <>The company can use up to <strong>{credits(next.overage.limit)}</strong> overage credits each cycle</> });
      },
      'Couldn’t change the overage limit',
    );
  }

  function saveTeam(row: TeamRow, value: number | null) {
    if (saving) return;
    if (value === row.overage.limit) return setTeamDraft(null);
    void run(
      () => adminApi.setTeamOverage(row.team.id, value),
      () => {
        setTeamDraft(null);
        toast(
          value === null
            ? { title: `${row.team.name} is back on the free pool`, description: <>It shares what’s left of the company’s overage</> }
            : { title: `${row.team.name} can use up to ${credits(value)} overage credits`, description: <>Carved out of the company’s overage limit</> },
        );
      },
      `Couldn’t change ${row.team.name}’s limit`,
    );
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groupSummary = (rows: TeamRow[]) => {
    const t = totals(rows);
    return t.limited > 0 ? (
      <span className={styles.figure}>
        {credits(t.used)}/{credits(t.limit)}
        <span className={styles.muted}> Overage Credits</span>
      </span>
    ) : (
      <span className={styles.muted}>Free Pool Overage</span>
    );
  };

  return (
    <div className={styles.wrap} {...tip.handlers}>
      <section className={styles.card} aria-labelledby="overage-title">
        <header className={styles.head}>
          <div className={styles.headText}>
            <h2 id="overage-title" className={styles.title}>
              Overage Credit Management
            </h2>
            <p className={styles.subtitle}>Cap the company’s overage each cycle, and give teams limits within it.</p>
          </div>
          <BrandSwitch
            checked={overview.overage.enabled}
            label="Overage Credit Management"
            onChange={saving ? undefined : (on) => (on ? setEnabled(true) : setConfirmOff(true))}
          />
        </header>

        {!overview.overage.enabled ? (
          <p className={styles.off}>
            Overage is unlimited: once the company’s credits run out, everyone can keep booking, and the overage is billed at the end of each 30-day
            cycle. Turn this on to cap it at a limit for the whole company, then give teams limits of their own within it.
          </p>
        ) : (
          <>
            <div className={styles.usage}>
              <div className={styles.usageHead}>
                <h3 className={styles.usageTitle}>Overage Credit Usage</h3>
                {limitDraft === null ? (
                  <button type="button" className={styles.pill} onClick={() => setLimitDraft(pool)}>
                    Edit Limit
                  </button>
                ) : (
                  <div className={styles.editRow}>
                    <span className={styles.hint}>Company limit</span>
                    <Stepper
                      value={limitDraft}
                      min={Math.max(1, allocated)}
                      max={1_000_000}
                      step={COMPANY_STEP}
                      label="Company overage limit"
                      autoFocus
                      onChange={setLimitDraft}
                      onEnter={(v) => saveLimit(v)}
                      onEscape={() => setLimitDraft(null)}
                    />
                    <button type="button" className={[styles.pill, styles.save].join(' ')} disabled={saving} onClick={() => saveLimit()}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className={styles.textBtn} disabled={saving} onClick={() => setLimitDraft(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <UsageBar
                label="Overage allocated to teams"
                total={limitDraft ?? pool}
                minLabelPercent={4}
                segments={units.map((u) => {
                  const t = totals(u.teams);
                  return {
                    key: u.id,
                    value: t.limit,
                    color: '#3659f5',
                    title: `${u.name}: ${credits(t.limit)} credits allocated to ${t.limited} ${t.limited === 1 ? 'team' : 'teams'}`,
                  };
                })}
              />
              <div className={styles.usageFoot}>
                <p className={styles.count}>
                  <strong>{credits(allocated)}</strong>/{credits(limitDraft ?? pool)} Allocated
                </p>
                <p className={styles.meta}>
                  Next Allotment : <strong>{daysLeftText(daysLeft(overview))}</strong>
                </p>
              </div>
              <ul className={styles.legend}>
                <li>
                  <span className={[styles.dot, styles.dotAllocated].join(' ')} />
                  Allocated Credits
                </li>
                <li>
                  <span className={[styles.dot, styles.dotFree].join(' ')} />
                  Non - Allocated ({credits(freePool)} free pool, {credits(freeUsed)} used)
                </li>
              </ul>
            </div>

            <div className={styles.units}>
              {units.map((u) => (
                <section key={u.id} className={styles.unit} aria-label={`${u.name} business unit`}>
                  <div className={styles.unitHead}>
                    <span className={styles.kind}>BUSINESS UNIT</span>
                    <span className={styles.name}>{u.name}</span>
                    <span className={styles.unitTotals}>
                      {groupSummary(u.teams)}
                      <span>
                        {u.teams.length} {u.teams.length === 1 ? 'Team' : 'Teams'}
                      </span>
                    </span>
                  </div>
                  {u.departments.map((d) => {
                    const expanded = open.has(d.id);
                    return (
                      <div key={d.id} role="group" aria-label={`${d.name} department`}>
                        <div className={styles.row}>
                          <button type="button" className={styles.deptToggle} aria-expanded={expanded} aria-controls={`dept-${d.id}`} onClick={() => toggle(d.id)}>
                            <img className={[styles.chevron, expanded ? styles.chevronOpen : ''].join(' ').trim()} src="/admin/access/chevron.svg" alt="" width={20} height={20} />
                            <span className={styles.kind}>DEPARTMENT</span>
                            <span className={styles.name}>{d.name}</span>
                          </button>
                          <span className={styles.right}>
                            {groupSummary(d.teams)}
                            <span className={styles.figure}>
                              {d.teams.length} {d.teams.length === 1 ? 'Team' : 'Teams'}
                            </span>
                          </span>
                        </div>
                        {expanded && (
                          <div id={`dept-${d.id}`}>
                            {d.teams.map((row) => {
                              const o = row.overage;
                              const draft = teamDraft?.teamId === row.team.id ? teamDraft.value : null;
                              const room = roomFor(o);
                              const limit = draft ?? o.limit;
                              const percent = limit === null ? 0 : percentOf(o.used, limit);
                              // Reached its limit: it can't book past it until the next cycle.
                              const over = limit !== null && o.used > 0 && o.used >= limit;
                              return (
                                <div key={row.team.id} className={[styles.row, styles.teamRow].join(' ')}>
                                  <span className={styles.teamText}>
                                    <span className={styles.code}>{row.team.code}</span>
                                    <span className={styles.name}>{row.team.name}</span>
                                    <span className={styles.divider} aria-hidden="true" />
                                    <span className={styles.muted}>
                                      {row.members} {row.members === 1 ? 'Member' : 'Members'}
                                    </span>
                                  </span>

                                  {limit === null ? (
                                    <span className={styles.right}>
                                      <span
                                        className={styles.info}
                                        tabIndex={0}
                                        role="img"
                                        aria-label="About the free pool"
                                        data-tip={
                                          room > 0
                                            ? `Shares the company’s free pool: ${credits(Math.max(0, freePool - freeUsed))} of ${credits(freePool)} credits left this cycle. Used ${credits(o.used)} so far.`
                                            : `Used ${credits(o.used)} overage credits so far. The company’s limit is fully allocated, so there’s no free pool left; raise the limit to give this team one.`
                                        }
                                        data-tip-when="always"
                                      >
                                        <img src="/admin/company/info.svg" alt="" width={20} height={20} />
                                      </span>
                                      <button
                                        type="button"
                                        className={styles.pill}
                                        disabled={room <= 0}
                                        onClick={() => setTeamDraft({ teamId: row.team.id, value: Math.min(room, Math.max(TEAM_START, Math.ceil(o.used / TEAM_STEP) * TEAM_STEP)) })}
                                      >
                                        Allocate
                                      </button>
                                    </span>
                                  ) : (
                                    <span className={styles.right}>
                                      <span className={styles.usedGroup}>
                                        <strong className={styles.percent}>{percent}% Used</strong>
                                        <span className={styles.meter} aria-hidden="true">
                                          <span className={[styles.meterFill, over ? styles.meterOver : ''].join(' ').trim()} style={{ width: `${Math.min(100, percent)}%` }} />
                                        </span>
                                        <span className={styles.divider} aria-hidden="true" />
                                        <span className={styles.figure}>
                                          {credits(o.used)}/{credits(limit)}
                                          <span className={styles.muted}> Overage Credits</span>
                                        </span>
                                      </span>
                                      {draft === null ? (
                                        <button
                                          type="button"
                                          className={ui.iconBtn}
                                          aria-label={`Edit ${row.team.name}’s overage limit`}
                                          title="Edit limit"
                                          onClick={() => setTeamDraft({ teamId: row.team.id, value: o.limit ?? 0 })}
                                        >
                                          <img src="/admin/company/edit.svg" alt="" width={20} height={20} />
                                        </button>
                                      ) : (
                                        <span className={styles.editRow}>
                                          {o.limit !== null && (
                                            <button type="button" className={styles.textBtn} disabled={saving} onClick={() => saveTeam(row, null)}>
                                              Use free pool
                                            </button>
                                          )}
                                          <Stepper
                                            value={draft}
                                            min={0}
                                            max={Math.max(0, room)}
                                            step={TEAM_STEP}
                                            label={`${row.team.name} overage limit, up to ${credits(Math.max(0, room))}`}
                                            autoFocus
                                            onChange={(value) => setTeamDraft({ teamId: row.team.id, value })}
                                            onEnter={(value) => saveTeam(row, value)}
                                            onEscape={() => setTeamDraft(null)}
                                          />
                                          <button type="button" className={[styles.pill, styles.save].join(' ')} disabled={saving} onClick={() => saveTeam(row, draft)}>
                                            {saving ? 'Saving…' : 'Save'}
                                          </button>
                                          <button type="button" className={styles.textBtn} disabled={saving} onClick={() => setTeamDraft(null)}>
                                            Cancel
                                          </button>
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>

            <p className={styles.note}>
              <img src="/admin/company/info.svg" alt="" width={20} height={20} />
              Teams without a limit share what’s left of the company’s overage. Usage resets every 30 days, when overage is billed.
            </p>
          </>
        )}
      </section>

      {confirmOff && (
        <AdminModal
          title="Turn off overage limits?"
          width={440}
          onClose={() => setConfirmOff(false)}
          footer={
            <>
              <button type="button" className={[ui.btn, ui.btnSecondary].join(' ')} onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
              <button type="button" className={[ui.btn, ui.btnDanger].join(' ')} onClick={() => setEnabled(false)}>
                Turn off
              </button>
            </>
          }
        >
          <p className={ui.confirm}>
            Overage becomes unlimited for the whole company: once credits run out, everyone can keep booking, and it’s all billed at the end of the cycle.
            The company limit and the teams’ limits are kept for when you turn this back on.
          </p>
        </AdminModal>
      )}
      {tip.node}
    </div>
  );
}
