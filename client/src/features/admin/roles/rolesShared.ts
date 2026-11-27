import { useEffect, useState } from 'react';
import { adminApi } from '../../../api/adminApi';
import type { AdminRole, AdminUser } from '../../../api/types';
import { ROLES } from '../users/userShared';

export interface Permission {
  key: string;
  title: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  title: string;
  permissions: Permission[];
}

/** Every permission a role can have (Figma 8189:270365), in the server's order. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'workspace',
    title: 'WORKSPACE SERVICES',
    permissions: [
      { key: 'meeting-rooms', title: 'Meeting Room Booking', description: 'Book meeting rooms across available locations' },
      { key: 'private-offices', title: 'Private Office Tab', description: 'Enable booking private offices within company-reserved spaces' },
      { key: 'sit-anywhere', title: '“Sit Anywhere” Access', description: 'Access flexible hot-desk seating without assigned desk' },
      { key: 'desk-selection', title: 'Desk Selection', description: 'Pick a specific desk on the floor map when booking' },
      { key: 'all-zones', title: 'Booking for All Zones', description: 'Book desks in every zone, not just their team’s' },
      { key: 'shared-desks', title: 'Shared desk Booking', description: 'Book desks at other WeWork buildings' },
      { key: 'shared-meeting-rooms', title: 'Shared Meeting Room Booking', description: 'Book meeting rooms at other WeWork buildings' },
      { key: 'shared-private-offices', title: 'Shared Private Office Tab', description: 'Book private offices at other WeWork buildings' },
    ],
  },
  {
    id: 'system',
    title: 'SYSTEM PERMISSIONS',
    permissions: [
      { key: 'company-settings', title: 'Company Settings', description: 'Allow access to company preferences and settings' },
      { key: 'user-settings', title: 'User Settings', description: 'Manage company users and their profiles' },
      { key: 'space-settings', title: 'Space Settings', description: 'Allow access to workspace configuration settings' },
      { key: 'group-bookings', title: 'Enable Group Bookings', description: 'Allow users to book spaces for multiple team members' },
      { key: 'help-support', title: 'Help & Support', description: 'Provide access to help resources and support' },
      { key: 'announcements', title: 'Announcements', description: 'Show company announcements and workspace updates' },
      { key: 'guests', title: 'Guest Management', description: 'Show the tab for managing workspace guests' },
      { key: 'print-hub', title: 'Print Hub', description: 'Show the tab for accessing workspace printing services' },
      { key: 'analytics', title: 'Analytics', description: 'Show insights into workspace usage and booking trends' },
      { key: 'reports', title: 'Reports', description: 'Show the tab for viewing workspace and booking reports' },
      { key: 'company-bookings', title: 'Company Bookings (Within Admin)', description: 'Allow users to view and manage bookings at a company level' },
    ],
  },
];

export const PERMISSION_COUNT = PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0);

/** "#RL-001" */
export const roleCode = (r: Pick<AdminRole, 'number'>) => `#RL-${String(r.number).padStart(3, '0')}`;

export const ROLE_STATUS_LABEL: Record<AdminRole['status'], string> = {
  active: 'ACTIVE',
  inactive: 'ARCHIVED',
};

/** The users who hold the role. */
export const roleMembers = (role: Pick<AdminRole, 'name'>, users: AdminUser[]) => users.filter((u) => u.role === role.name);

/**
 * The roles a user can be given: the active ones from Admin → Roles, or the usual four until
 * they've loaded (or if they can't).
 */
export function useRoleChoices() {
  const [names, setNames] = useState<string[]>(ROLES);
  useEffect(() => {
    let live = true;
    adminApi
      .getRoles()
      .then((roles) => {
        if (live) setNames(roles.filter((r) => r.status === 'active').map((r) => r.name));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return names;
}
