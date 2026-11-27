import { useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import type { AdminAccessLevel, AdminUser } from '../../../api/types';
import { ACCESS_LEVELS } from '../users/userShared';

/** "#AL-001" */
export const accessCode = (a: Pick<AdminAccessLevel, 'number'>) => `#AL-${String(a.number).padStart(3, '0')}`;

export const ACCESS_STATUS_LABEL: Record<AdminAccessLevel['status'], string> = {
  active: 'ACTIVE',
  inactive: 'ARCHIVED',
};

/** The users who hold the access level. */
export const accessMembers = (level: Pick<AdminAccessLevel, 'name'>, users: AdminUser[]) => users.filter((u) => u.accessLevel === level.name);

/** How many buildings it opens: company offices and co-working buildings, each counted once. */
export const accessLocationCount = (level: Pick<AdminAccessLevel, 'officeLocationIds' | 'coworkingLocationIds'>) =>
  new Set([...level.officeLocationIds, ...level.coworkingLocationIds]).size;

/**
 * The access levels a user can be given: the active ones from Admin → Access Control, or the usual
 * four until they've loaded (or if they can't). `keep` stays in the list even if it's archived, so a
 * user who holds an archived level still sees it.
 */
export function useAccessLevelChoices(keep?: string) {
  const [names, setNames] = useState<string[]>(ACCESS_LEVELS);
  useEffect(() => {
    let live = true;
    adminApi
      .getAccessLevels()
      .then((levels) => {
        if (live) setNames(levels.filter((a) => a.status === 'active').map((a) => a.name));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return keep && !names.includes(keep) ? [...names, keep] : names;
}
