/* The Upload Users sheet as rows the admin can review: reading the columns, checking every cell
   against the company structure, and sorting people into new users, status changes, info changes
   and people already set up exactly as the sheet says. */
import type { AdminUser, BulkUserRow, OrgChart, UserStatus } from '../../../../api/types';
import { ACCESS_LEVELS, MEMBERSHIPS, ROLES, membershipKey } from '../userShared';
import { buildXlsx, type SheetRows } from './sheetFile';

export type Field = 'name' | 'email' | 'role' | 'accessLevel' | 'team' | 'department' | 'businessUnit' | 'membership' | 'status';

/** A sheet row as the admin is editing it. Membership is a MEMBERSHIPS key and status a UserStatus when valid. */
export interface DraftRow {
  key: number;
  /** Row number in the sheet (the header is row 1). */
  sheetRow: number;
  name: string;
  email: string;
  role: string;
  /** LEVEL 1 … LEVEL 4 when valid. */
  accessLevel: string;
  team: string;
  department: string;
  businessUnit: string;
  membership: string;
  status: string;
  /** Left out of the upload. */
  removed: boolean;
  /** An existing, unchanged user the admin opened for editing anyway. */
  unlocked: boolean;
}

export type RowKind = 'new' | 'status' | 'info' | 'exists';

export interface RowCheck {
  kind: RowKind;
  /** The user with this email, if there is one. */
  match?: AdminUser;
  errors: Partial<Record<Field, string>>;
  /** For existing users: what the upload would change. */
  changes: { field: Field; from: string; to: string }[];
}

export const FIELD_LABEL: Record<Field, string> = {
  name: 'Name',
  email: 'Email',
  role: 'Role',
  accessLevel: 'Access Level',
  team: 'Team',
  department: 'Department',
  businessUnit: 'Business Unit',
  membership: 'Membership',
  status: 'Status',
};

// The sheet's columns, in the data sheet's order: role and access, then the business unit down to the team.
const TEMPLATE_COLUMNS: Field[] = ['name', 'email', 'role', 'accessLevel', 'businessUnit', 'department', 'team', 'membership', 'status'];

/** Header spellings we accept for each column, compared lower-case with only letters kept. */
const HEADERS: Record<Field, string[]> = {
  name: ['name', 'fullname', 'username', 'user', 'employeename', 'employee'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'workemail', 'officialemail'],
  role: ['role', 'userrole'],
  accessLevel: ['accesslevel', 'access', 'level', 'accesslvl'],
  team: ['team', 'teamname'],
  department: ['department', 'dept', 'departmentname'],
  businessUnit: ['businessunit', 'bu', 'businessunitname'],
  membership: ['membership', 'plan', 'membershiptype'],
  status: ['status', 'userstatus'],
};
const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function readMembership(raw: string) {
  const v = letters(raw);
  if (!v) return '';
  if (v === 'aa') return 'AA';
  if (v === 'poatlas' || v === 'atlaspo' || v === 'poandatlas') return 'PO+ATLAS';
  return raw.trim();
}

function readStatus(raw: string): string {
  const v = letters(raw);
  if (!v) return '';
  if (v === 'active' || v === 'yes' || v === 'enabled') return 'active';
  if (v === 'inactive' || v === 'archived' || v === 'no' || v === 'disabled') return 'inactive';
  return raw.trim();
}

/** "level 2", "L2" or "2" → "Level 2"; anything else stays as written, to be flagged. */
function readAccess(raw: string): string {
  const named = ACCESS_LEVELS.find((a) => same(a, raw));
  if (named) return named;
  const digit = /^\s*(?:l(?:evel|vl)?\s*)?(\d)\s*$/i.exec(raw)?.[1];
  const level = digit ? `Level ${digit}` : '';
  return ACCESS_LEVELS.includes(level) ? level : raw.trim();
}

/** A new person's access level when the sheet leaves it blank, as when they're added by hand. */
const ACCESS_BY_ROLE: Record<string, string> = { Employee: 'Level 1', Manager: 'Level 2', Admin: 'Level 3', 'Super Admin': 'Level 4' };

/** A unit's stored name for whatever case the sheet used. */
const canonical = (list: { name: string }[], raw: string) => list.find((u) => same(u.name, raw))?.name ?? raw.trim();

/**
 * Turns sheet rows into editable rows. The header row is the first one (within the top five) with an
 * Email column; blank rows are skipped. A missing department or business unit is filled in from the
 * team (or department) when that's known.
 */
export function readRows(rows: SheetRows, org: OrgChart): { drafts: DraftRow[]; missing: Field[] } {
  const headerAt = rows.slice(0, 5).findIndex((r) => r.some((c) => HEADERS.email.includes(letters(c))));
  if (headerAt < 0) return { drafts: [], missing: ['name', 'email'] };
  const header = rows[headerAt].map(letters);
  const col = (field: Field) => header.findIndex((h) => HEADERS[field].includes(h));
  const at = Object.fromEntries(TEMPLATE_COLUMNS.map((f) => [f, col(f)])) as Record<Field, number>;
  // First and last name in separate columns also make a name.
  const first = header.indexOf('firstname');
  const last = header.indexOf('lastname');
  const missing = (['name', 'email'] as Field[]).filter((f) => at[f] < 0 && !(f === 'name' && first >= 0));

  const drafts: DraftRow[] = [];
  rows.slice(headerAt + 1).forEach((row, i) => {
    const cell = (field: Field) => (at[field] >= 0 ? (row[at[field]] ?? '').trim() : '');
    if (!row.some((c) => c?.trim())) return;
    const name = cell('name') || [first, last].filter((c) => c >= 0).map((c) => (row[c] ?? '').trim()).filter(Boolean).join(' ');
    let team = canonical(org.teams, cell('team'));
    let department = canonical(org.departments, cell('department'));
    let businessUnit = canonical(org.businessUnits, cell('businessUnit'));
    const teamUnit = org.teams.find((t) => t.name === team);
    if (teamUnit && !department) department = org.departments.find((d) => d.id === teamUnit.departmentId)?.name ?? '';
    const deptUnit = org.departments.find((d) => d.name === department);
    if (deptUnit && !businessUnit) businessUnit = org.businessUnits.find((b) => b.id === deptUnit.businessUnitId)?.name ?? '';
    drafts.push({
      key: i,
      sheetRow: headerAt + i + 2,
      name,
      email: cell('email'),
      role: ROLES.find((r) => same(r, cell('role'))) ?? cell('role'),
      accessLevel: readAccess(cell('accessLevel')),
      team,
      department,
      businessUnit,
      membership: readMembership(cell('membership')),
      status: readStatus(cell('status')),
      removed: false,
      unlocked: false,
    });
  });
  return { drafts, missing };
}

/**
 * Blank cells keep what's on file for people who already exist (so a sheet with only some columns
 * changes only those); the team, department and business unit count as one group. New people start
 * active unless the sheet says otherwise, at their role's usual access level.
 */
export function keepExisting(drafts: DraftRow[], users: AdminUser[]): DraftRow[] {
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  return drafts.map((d) => {
    const match = byEmail.get(d.email.trim().toLowerCase());
    if (!match) return { ...d, status: d.status || 'active', accessLevel: d.accessLevel || (ACCESS_BY_ROLE[d.role] ?? '') };
    const noOrg = !d.team && !d.department && !d.businessUnit;
    return {
      ...d,
      name: d.name || match.name,
      role: d.role || match.role,
      accessLevel: d.accessLevel || match.accessLevel,
      membership: d.membership || membershipKey(match.membership),
      status: d.status || match.status,
      ...(noOrg ? { team: match.team, department: match.department, businessUnit: match.businessUnit } : {}),
    };
  });
}

const membershipText = (key: string) => MEMBERSHIPS.find((m) => m.key === key)?.label ?? key;
const statusText = (s: string) => (s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : s);

/** What each field shows in a change line ("Team: Platform → DevOps"). */
export function fieldText(field: Field, value: string) {
  if (!value) return '–';
  if (field === 'membership') return membershipText(value);
  if (field === 'accessLevel') return value.replace(/^LEVEL\b/, 'Level');
  if (field === 'status') return statusText(value);
  return value;
}

/** Checks every row: errors per cell, and whether it adds, changes or matches a user. */
export function checkRows(drafts: DraftRow[], users: AdminUser[], org: OrgChart): Map<number, RowCheck> {
  const active = <T extends { status: UserStatus }>(list: T[]) => list.filter((u) => u.status === 'active');
  const bus = active(org.businessUnits);
  const deps = active(org.departments);
  const tms = active(org.teams);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const firstRowFor = new Map<string, DraftRow>();
  const checks = new Map<number, RowCheck>();

  for (const d of drafts) {
    const email = d.email.trim().toLowerCase();
    const errors: RowCheck['errors'] = {};
    const match = byEmail.get(email);

    if (!d.name.trim()) errors.name = 'Add a name.';
    if (!email) errors.email = 'Add an email.';
    else if (!EMAIL.test(email)) errors.email = 'This isn’t a valid email.';
    else if (!d.removed) {
      const earlier = firstRowFor.get(email);
      if (earlier) errors.email = `Also on row ${earlier.sheetRow}. Remove one of them.`;
      else firstRowFor.set(email, d);
    }
    if (!d.role) errors.role = 'Pick a role.';
    else if (!ROLES.includes(d.role)) errors.role = `“${d.role}” isn’t a role. Pick one.`;
    if (!d.accessLevel) errors.accessLevel = 'Pick an access level.';
    else if (!ACCESS_LEVELS.includes(d.accessLevel)) errors.accessLevel = `“${d.accessLevel}” isn’t an access level. Pick Level 1 to Level 4.`;
    if (!d.membership) errors.membership = 'Pick a membership.';
    else if (!MEMBERSHIPS.some((m) => m.key === d.membership)) errors.membership = `“${d.membership}” isn’t a membership. Pick PO + ATLAS or AA.`;
    if (d.status !== 'active' && d.status !== 'inactive') errors.status = `“${d.status}” isn’t a status. Pick Active or Inactive.`;

    // Business unit and department are required for new people; the team is optional.
    const bu = bus.find((b) => b.name === d.businessUnit);
    if (d.businessUnit && !bu) errors.businessUnit = `There’s no active business unit called “${d.businessUnit}”.`;
    else if (!d.businessUnit && !match) errors.businessUnit = 'Pick a business unit.';
    const dept = deps.find((x) => x.name === d.department);
    if (d.department && !dept) errors.department = `There’s no active department called “${d.department}”.`;
    else if (dept && bu && dept.businessUnitId !== bu.id) errors.department = `${d.department} isn’t part of ${d.businessUnit}.`;
    else if (!d.department && !match) errors.department = 'Pick a department.';
    const team = tms.find((t) => t.name === d.team);
    if (d.team && !team) errors.team = `There’s no active team called “${d.team}”.`;
    else if (team && (!dept || team.departmentId !== dept.id)) errors.team = `${d.team} isn’t part of ${d.department || 'that department'}.`;

    const changes: RowCheck['changes'] = [];
    let kind: RowKind = 'new';
    if (match) {
      const now: Record<Field, string> = {
        name: match.name,
        email: match.email,
        role: match.role,
        accessLevel: match.accessLevel,
        team: match.team,
        department: match.department,
        businessUnit: match.businessUnit,
        membership: membershipKey(match.membership),
        status: match.status,
      };
      for (const f of ['name', 'role', 'accessLevel', 'businessUnit', 'department', 'team', 'membership', 'status'] as Field[]) {
        if ((now[f] ?? '') !== (d[f] ?? '')) changes.push({ field: f, from: now[f], to: d[f] });
      }
      kind = changes.length === 0 ? 'exists' : changes.some((c) => c.field === 'status') ? 'status' : 'info';
    }
    checks.set(d.key, { kind, match, errors: kind === 'exists' && !d.unlocked ? {} : errors, changes });
  }
  return checks;
}

/** Rows that go into the upload: kept, error-free, and adding or changing someone. */
export function uploadRows(drafts: DraftRow[], checks: Map<number, RowCheck>) {
  return drafts.filter((d) => {
    const c = checks.get(d.key)!;
    return !d.removed && c.kind !== 'exists' && Object.keys(c.errors).length === 0;
  });
}

export function toPayload(d: DraftRow): BulkUserRow {
  return {
    email: d.email.trim(),
    name: d.name.trim(),
    role: d.role,
    accessLevel: d.accessLevel,
    team: d.team,
    department: d.department,
    businessUnit: d.businessUnit,
    membership: MEMBERSHIPS.find((m) => m.key === d.membership)!.tags,
    status: d.status as UserStatus,
  };
}

/** The template: a Users sheet with dropdowns, and an Options sheet listing what each column accepts. */
export function templateFile(org: OrgChart): Blob {
  const active = <T extends { status: UserStatus; name: string }>(list: T[]) => list.filter((u) => u.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const bus = active(org.businessUnits);
  const deps = active(org.departments);
  const tms = active(org.teams);
  const buName = (id: string) => org.businessUnits.find((b) => b.id === id)?.name ?? '';
  const deptOf = (id: string) => org.departments.find((d) => d.id === id);

  const options: string[][] = [['Role', 'Access Level', 'Membership', 'Status', '', 'Business Unit', '', 'Department', 'In Business Unit', '', 'Team', 'In Department', 'In Business Unit']];
  const height = Math.max(ROLES.length, ACCESS_LEVELS.length, bus.length, deps.length, tms.length);
  for (let i = 0; i < height; i++) {
    const team = tms[i];
    const teamDept = team ? deptOf(team.departmentId) : undefined;
    options.push([
      ROLES[i] ?? '',
      ACCESS_LEVELS[i] ?? '',
      MEMBERSHIPS[i]?.label ?? '',
      ['Active', 'Inactive'][i] ?? '',
      '',
      bus[i]?.name ?? '',
      '',
      deps[i]?.name ?? '',
      deps[i] ? buName(deps[i].businessUnitId) : '',
      '',
      team?.name ?? '',
      teamDept?.name ?? '',
      teamDept ? buName(teamDept.businessUnitId) : '',
    ]);
  }
  const range = (col: string, n: number) => `Options!$${col}$2:$${col}$${n + 1}`;
  // Users: A name, B email, C role, D access level, E business unit, F department, G team, H membership, I status.
  return buildXlsx([
    {
      name: 'Users',
      rows: [TEMPLATE_COLUMNS.map((f) => FIELD_LABEL[f])],
      widths: [26, 32, 16, 14, 20, 22, 22, 16, 12],
      lists: [
        { cells: 'C2:C1001', choices: ROLES },
        { cells: 'D2:D1001', choices: ACCESS_LEVELS },
        { cells: 'E2:E1001', range: range('F', bus.length) },
        { cells: 'F2:F1001', range: range('H', deps.length) },
        { cells: 'G2:G1001', range: range('K', tms.length) },
        { cells: 'H2:H1001', choices: MEMBERSHIPS.map((m) => m.label) },
        { cells: 'I2:I1001', choices: ['Active', 'Inactive'] },
      ],
    },
    { name: 'Options', rows: options, widths: [14, 12, 14, 10, 3, 20, 3, 20, 18, 3, 22, 20, 18] },
  ]);
}
