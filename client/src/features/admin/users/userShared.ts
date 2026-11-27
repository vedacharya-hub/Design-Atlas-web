import type { AdminUser, MembershipTag, OrgChart, Team, UserStatus } from '../../../api/types';

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'ACTIVE',
  inactive: 'INACTIVE',
};
export const STATUSES: UserStatus[] = ['active', 'inactive'];

/** The two membership variants: PO and ATLAS together, or AA. */
export const MEMBERSHIPS: { key: string; label: string; tags: MembershipTag[] }[] = [
  { key: 'PO+ATLAS', label: 'PO + ATLAS', tags: ['PO', 'ATLAS'] },
  { key: 'AA', label: 'AA', tags: ['AA'] },
];
export const membershipKey = (tags: MembershipTag[]) => (tags.includes('AA') ? 'AA' : 'PO+ATLAS');
export const membershipLabel = (tags: MembershipTag[]) => MEMBERSHIPS.find((m) => m.key === membershipKey(tags))!.label;

export const ROLES = ['Employee', 'Manager', 'Admin', 'Super Admin'];
/** The usual access levels, until Admin → Access Control's have loaded (useAccessLevelChoices). */
export const ACCESS_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Level 4'];

/** A stored file name under /admin/avatars, or a photo uploaded from the details panel. */
export const avatarSrc = (u: Pick<AdminUser, 'avatar'>) =>
  u.avatar?.startsWith('data:') ? u.avatar : `/admin/avatars/${u.avatar ?? 'gradient.png'}`;

export const dash = (v: string) => v || '-';

/** First word, then the rest (the HR record keeps a single full name). */
export function splitName(name: string): [string, string] {
  const [first, ...rest] = name.trim().split(/\s+/);
  return [first ?? '', rest.join(' ')];
}

/** A square crop of the picked photo, 176px (2× the largest avatar), as a JPEG data URL. */
export function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 176;
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file isn’t an image we can use.'));
    };
    img.src = url;
  });
}

/**
 * Choices for the business unit → department → team fields, following the company structure:
 * departments of the chosen business unit, teams of the chosen department. Archived units aren't offered.
 */
export interface OrgChoices {
  businessUnits: string[];
  departmentsIn: (businessUnit: string) => string[];
  teamsIn: (department: string) => string[];
}

export function orgChoices(org: OrgChart | null): OrgChoices {
  const active = <T extends { status: UserStatus }>(list: T[]) => list.filter((u) => u.status === 'active');
  const byName = (a: string, b: string) => a.localeCompare(b);
  const bus = org ? active(org.businessUnits) : [];
  const deps = org ? active(org.departments) : [];
  const tms = org ? active(org.teams) : [];
  return {
    businessUnits: bus.map((b) => b.name).sort(byName),
    departmentsIn: (businessUnit) => {
      const bu = org?.businessUnits.find((b) => b.name === businessUnit);
      return bu ? deps.filter((d) => d.businessUnitId === bu.id).map((d) => d.name).sort(byName) : [];
    },
    teamsIn: (department) => {
      const dp = org?.departments.find((d) => d.name === department);
      return dp ? tms.filter((t) => t.departmentId === dp.id).map((t) => t.name).sort(byName) : [];
    },
  };
}

/** After the business unit or department changes, drop a department or team that no longer fits under it. */
export function fitOrg(choices: OrgChoices, next: { businessUnit: string; department: string; team: string }) {
  const department = choices.departmentsIn(next.businessUnit).includes(next.department) ? next.department : '';
  const team = department && choices.teamsIn(department).includes(next.team) ? next.team : '';
  return { businessUnit: next.businessUnit, department, team };
}

/** A team's members: everyone whose team it is, with its manager first (counted even if their own team is another). */
export function teamMembers(team: Team, users: AdminUser[]): AdminUser[] {
  const members = users.filter((u) => u.team === team.name);
  const manager = team.managerId ? users.find((u) => u.id === team.managerId) : undefined;
  return manager ? [manager, ...members.filter((u) => u.id !== manager.id)] : members;
}
