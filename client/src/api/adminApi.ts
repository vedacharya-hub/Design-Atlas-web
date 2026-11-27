import type {
  CoworkingPermissions,
  CoworkingPermissionsUpdate,
  MyBooking,
  AdminUser,
  BusinessUnit,
  Department,
  OrgChart,
  OrgKind,
  OrgUnitUpdate,
  Team,
  AdminUserLookup,
  AdminUserUpdate,
  Announcement,
  AdminEvent,
  AdminEventUpdate,
  NewAdminEvent,
  AdminBuilding,
  AdminBuildingUpdate,
  NewAdminBuilding,
  AdminSpaceView,
  AdminSeat,
  AdminSeatMap,
  SeatAssignmentInput,
  SeatLayoutInput,
  SeatUpdateInput,
  SpaceZoneInput,
  SpaceZoneList,
  AdminSpaceUpdate,
  NewAdminSpace,
  SpaceType,
  NewSpaceType,
  AdminRole,
  AdminRoleUpdate,
  NewAdminRole,
  AdminAccessLevel,
  AdminAccessLevelUpdate,
  NewAdminAccessLevel,
  CompanySettings,
  CompanySettingsUpdate,
  CompanyShift,
  CompanyShiftUpdate,
  NewCompanyShift,
  CreditOverview,
  BulkUploadJob,
  BulkUserRow,
  CompanyCredits,
  CreditAllocationSettings,
  CreditGroup,
  Floor,
  FloorShift,
  NewAdminUser,
  NewAnnouncement,
  OrgUnit,
  Seat,
  UserStatus,
  WorkLocation,
} from './types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `${url} failed: ${res.status}`);
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const adminApi = {
  /** Everyone's bookings across the product lines (Admin → Company Bookings). */
  getCompanyBookings: () => req<{ bookings: MyBooking[] }>('/api/admin/company-bookings').then((r) => r.bookings),
  /** Cancels an office desk, team desks or meeting room booking; resolves to the bookings after. */
  cancelCompanyBooking: (id: string) =>
    req<{ bookings: MyBooking[] }>(`/api/admin/company-bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => r.bookings),
  getAnnouncements: () => req<{ announcements: Announcement[] }>('/api/admin/announcements').then((r) => r.announcements),
  createAnnouncement: (payload: NewAnnouncement) => req<Announcement>('/api/admin/announcements', { method: 'POST', ...json(payload) }),
  setAnnouncementArchived: (id: string, archived: boolean) =>
    req<Announcement>(`/api/admin/announcements/${id}`, { method: 'PATCH', ...json({ archived }) }),
  deleteAnnouncement: (id: string) => req<Announcement>(`/api/admin/announcements/${id}`, { method: 'DELETE' }),

  getEvents: () => req<{ events: AdminEvent[] }>('/api/admin/events').then((r) => r.events),
  createEvent: (payload: NewAdminEvent) => req<AdminEvent>('/api/admin/events', { method: 'POST', ...json(payload) }),
  /** Edit any details, or archive / restore with `{ archived }`. */
  updateEvent: (id: string, patch: AdminEventUpdate) => req<AdminEvent>(`/api/admin/events/${id}`, { method: 'PATCH', ...json(patch) }),
  deleteEvent: (id: string) => req<AdminEvent>(`/api/admin/events/${id}`, { method: 'DELETE' }),

  getUsers: () => req<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users),
  /** Add User: whether the email is new, an existing member, or a past record to fill the form from. */
  lookupUser: (email: string) => req<AdminUserLookup>('/api/admin/users/lookup', { method: 'POST', ...json({ email }) }),
  /** Creates the user, or brings back the past record with that email. */
  createUser: (payload: NewAdminUser) => req<AdminUser>('/api/admin/users', { method: 'POST', ...json(payload) }),
  /** Archive (inactive) or restore (active). */
  setUserStatus: (id: string, status: UserStatus) => req<AdminUser>(`/api/admin/users/${id}`, { method: 'PATCH', ...json({ status }) }),
  /** Bulk Action: makes all of them active or inactive at once; returns them as saved. */
  setUsersStatus: (ids: string[], status: UserStatus) =>
    req<{ users: AdminUser[] }>('/api/admin/users/status', { method: 'POST', ...json({ ids, status }) }).then((r) => r.users),
  /** Saves edits from the user details panel; only the fields sent change. */
  updateUser: (id: string, patch: AdminUserUpdate) => req<AdminUser>(`/api/admin/users/${id}`, { method: 'PATCH', ...json(patch) }),
  getLocations: () => req<{ locations: WorkLocation[] }>('/api/admin/locations').then((r) => r.locations),
  /** Starts a bulk upload in the background; poll getBulkUpload for its progress. */
  startBulkUpload: (rows: BulkUserRow[]) => req<BulkUploadJob>('/api/admin/users/bulk', { method: 'POST', ...json({ rows }) }),
  getBulkUpload: (id: string) => req<BulkUploadJob>(`/api/admin/users/bulk/${id}`),

  /** Business Unit → Department → Team. */
  getOrg: () => req<OrgChart>('/api/admin/org'),
  createBusinessUnit: (name: string) => req<BusinessUnit>('/api/admin/org/business-units', { method: 'POST', ...json({ name }) }),
  createDepartment: (name: string, businessUnitId: string) =>
    req<Department>('/api/admin/org/departments', { method: 'POST', ...json({ name, businessUnitId }) }),
  createTeam: (name: string, departmentId: string, managerId?: string) =>
    req<Team>('/api/admin/org/teams', { method: 'POST', ...json({ name, departmentId, managerId }) }),
  /** Rename, move, change a team's manager, or archive / restore. Users follow renames and moves. */
  updateOrgUnit: <T extends BusinessUnit | Department | Team>(kind: OrgKind, id: string, patch: OrgUnitUpdate) =>
    req<T>(`/api/admin/org/${kind}/${id}`, { method: 'PATCH', ...json(patch) }),
  /** Archive (inactive) or restore (active) a unit. */
  setOrgStatus: <T extends BusinessUnit | Department | Team>(kind: OrgKind, id: string, status: UserStatus) =>
    req<T>(`/api/admin/org/${kind}/${id}`, { method: 'PATCH', ...json({ status }) }),

  /** Admin → Spaces: the company's spaces, the buildings they're in, and space types. */
  getSpaces: () => req<{ spaces: AdminSpaceView[] }>('/api/admin/spaces').then((r) => r.spaces),
  createSpace: (payload: NewAdminSpace) => req<AdminSpaceView>('/api/admin/spaces', { method: 'POST', ...json(payload) }),
  /** Edit a space, or archive / restore it with `{ status }`. */
  updateSpace: (id: string, patch: AdminSpaceUpdate) => req<AdminSpaceView>(`/api/admin/spaces/${id}`, { method: 'PATCH', ...json(patch) }),
  getBuildings: () => req<{ buildings: AdminBuilding[] }>('/api/admin/buildings').then((r) => r.buildings),
  createBuilding: (payload: NewAdminBuilding) => req<AdminBuilding>('/api/admin/buildings', { method: 'POST', ...json(payload) }),
  /** Edit a building, or archive / restore it; archiving it archives its spaces too. */
  updateBuilding: (id: string, patch: AdminBuildingUpdate) => req<AdminBuilding>(`/api/admin/buildings/${id}`, { method: 'PATCH', ...json(patch) }),
  /** A mapped space's desks, with who each permanent seat is kept for, and how many desks it may have. */
  getSeatMap: (spaceId: string) => req<AdminSeatMap>(`/api/admin/spaces/${spaceId}/seats`),
  /** Keeps a desk for one person: nobody else can book it. */
  assignSeat: (spaceId: string, seatId: string, input: SeatAssignmentInput) =>
    req<AdminSeat>(`/api/admin/spaces/${spaceId}/seats/${seatId}/assignment`, { method: 'PUT', ...json(input) }),
  /** A free desk's type and note; a new type renumbers it (D12 → M1). */
  updateSeat: (spaceId: string, seatId: string, input: SeatUpdateInput) =>
    req<AdminSeat>(`/api/admin/spaces/${spaceId}/seats/${seatId}`, { method: 'PATCH', ...json(input) }),
  /** Frees a permanent seat for anyone to book. */
  freeSeat: (spaceId: string, seatId: string) => req<AdminSeat>(`/api/admin/spaces/${spaceId}/seats/${seatId}/assignment`, { method: 'DELETE' }),
  /** Saves edit mode: desks moved and desks added. */
  saveSeatLayout: (spaceId: string, layout: SeatLayoutInput) => req<AdminSeatMap>(`/api/admin/spaces/${spaceId}/seats`, { method: 'PUT', ...json(layout) }),
  /** The zones drawn on a mapped space's plan, with the desks inside each, and the version they're at. */
  getZones: (spaceId: string) => req<SpaceZoneList>(`/api/admin/spaces/${spaceId}/zones`),
  /**
   * Saves the map's zones together, replacing the ones there; new zones have no id. `version` is the
   * one they were loaded at: if someone else has saved since, it's refused (409) rather than overwriting.
   */
  saveZones: (spaceId: string, zones: SpaceZoneInput[], version: number) =>
    req<SpaceZoneList>(`/api/admin/spaces/${spaceId}/zones`, { method: 'PUT', ...json({ zones, version }) }),
  getSpaceTypes: () => req<{ types: SpaceType[] }>('/api/admin/space-types').then((r) => r.types),
  createSpaceType: (payload: NewSpaceType) => req<SpaceType>('/api/admin/space-types', { method: 'POST', ...json(payload) }),
  updateSpaceType: (id: string, patch: Partial<NewSpaceType>) => req<SpaceType>(`/api/admin/space-types/${id}`, { method: 'PATCH', ...json(patch) }),
  deleteSpaceType: (id: string) => req<SpaceType>(`/api/admin/space-types/${id}`, { method: 'DELETE' }),

  /** Admin → Roles. */
  getRoles: () => req<{ roles: AdminRole[] }>('/api/admin/roles').then((r) => r.roles),
  createRole: (payload: NewAdminRole) => req<AdminRole>('/api/admin/roles', { method: 'POST', ...json(payload) }),
  /** Rename (its users follow), change its permissions, or archive / restore it with `{ status }`. */
  updateRole: (id: string, patch: AdminRoleUpdate) => req<AdminRole>(`/api/admin/roles/${id}`, { method: 'PATCH', ...json(patch) }),

  /** Admin → Access Control. */
  getAccessLevels: () => req<{ accessLevels: AdminAccessLevel[] }>('/api/admin/access-levels').then((r) => r.accessLevels),
  createAccessLevel: (payload: NewAdminAccessLevel) => req<AdminAccessLevel>('/api/admin/access-levels', { method: 'POST', ...json(payload) }),
  /** Rename (its users follow), change what it opens, or archive / restore it with `{ status }`. */
  updateAccessLevel: (id: string, patch: AdminAccessLevelUpdate) =>
    req<AdminAccessLevel>(`/api/admin/access-levels/${id}`, { method: 'PATCH', ...json(patch) }),

  /** Admin → Company Settings: the profile and the services everyone can use. */
  /** Company Settings → Co-working Permissions: the buildings turned off for everyone, and the centres abroad. */
  getCoworking: () => req<CoworkingPermissions>('/api/admin/coworking'),
  saveCoworking: (update: CoworkingPermissionsUpdate) => req<CoworkingPermissions>('/api/admin/coworking', { method: 'PUT', ...json(update) }),
  getCompany: () => req<CompanySettings>('/api/admin/company'),
  /** `services` only needs the ones that change; a `logo` of '' removes it. */
  updateCompany: (patch: CompanySettingsUpdate) => req<CompanySettings>('/api/admin/company', { method: 'PATCH', ...json(patch) }),
  /** Admin → Credits: this cycle's credits and overage, and each team's overage limit. */
  getCreditOverview: () => req<CreditOverview>('/api/admin/credits/overview'),
  /** Turn overage limits on or off, or change the company's overage pool. */
  updateOverage: (patch: { enabled?: boolean; limit?: number }) => req<CreditOverview>('/api/admin/credits/overage', { method: 'PATCH', ...json(patch) }),
  /** A team's own overage limit within the pool, or null to put it back on the free pool. */
  setTeamOverage: (teamId: string, limit: number | null) =>
    req<CreditOverview>(`/api/admin/credits/overage/teams/${teamId}`, { method: 'PUT', ...json({ limit }) }),

  getCompanyShifts: () => req<{ shifts: CompanyShift[] }>('/api/admin/shifts').then((r) => r.shifts),
  createCompanyShift: (payload: NewCompanyShift) => req<CompanyShift>('/api/admin/shifts', { method: 'POST', ...json(payload) }),
  /** Rename it, change its timings, or turn it on and off with `{ status }`. */
  updateCompanyShift: (id: string, patch: CompanyShiftUpdate) => req<CompanyShift>(`/api/admin/shifts/${id}`, { method: 'PATCH', ...json(patch) }),
  /** Deletes the shift and cancels every booking made for it. */
  deleteCompanyShift: (id: string) =>
    req<{ shift: CompanyShift; cancelledBookings: number }>(`/api/admin/shifts/${id}`, { method: 'DELETE' }),

  getFloor: (id: string) => req<Floor>(`/api/floors/${id}`),
  getSeats: (floorId: string) => req<Seat[]>(`/api/floors/${floorId}/seats`),
  getShifts: (floorId: string) => req<FloorShift[]>(`/api/floors/${floorId}/shifts`),

  setShiftsEnabled: (floorId: string, enabled: boolean) =>
    req<Floor>(`/api/floors/${floorId}/shifts-enabled`, { method: 'PATCH', ...json({ enabled }) }),

  createShift: (floorId: string, payload: { name: string; startTime: string; endTime: string; color: string }) =>
    req<FloorShift>(`/api/floors/${floorId}/shifts`, { method: 'POST', ...json(payload) }),

  updateShift: (
    floorId: string,
    shiftId: string,
    payload: Partial<Pick<FloorShift, 'name' | 'startTime' | 'endTime' | 'color' | 'seatIds' | 'enabled'>>,
  ) => req<FloorShift>(`/api/floors/${floorId}/shifts/${shiftId}`, { method: 'PUT', ...json(payload) }),

  deleteShift: (floorId: string, shiftId: string) =>
    req<null>(`/api/floors/${floorId}/shifts/${shiftId}`, { method: 'DELETE' }),

  getCredits: () => req<CompanyCredits>('/api/credits'),

  getCreditAllocationSettings: () => req<CreditAllocationSettings>('/api/credit-allocation-settings'),

  updateCreditAllocationSettings: (
    payload: Partial<Pick<CreditAllocationSettings, 'enabled' | 'totalCreditLimit' | 'overageManagementEnabled' | 'overageLimit'>>,
  ) => req<CreditAllocationSettings>('/api/credit-allocation-settings', { method: 'PATCH', ...json(payload) }),

  getOrgUnits: () => req<OrgUnit[]>('/api/org-units'),

  getCreditGroups: () => req<CreditGroup[]>('/api/credit-groups'),

  createCreditGroup: (payload: { orgUnitId: string; allocatedCredits: number; overageCap?: number }) =>
    req<CreditGroup>('/api/credit-groups', { method: 'POST', ...json(payload) }),

  updateCreditGroup: (
    id: string,
    payload: Partial<Pick<CreditGroup, 'allocatedCredits'>> & { overageCap?: number | null },
  ) => req<CreditGroup>(`/api/credit-groups/${id}`, { method: 'PUT', ...json(payload) }),

  deleteCreditGroup: (id: string) => req<null>(`/api/credit-groups/${id}`, { method: 'DELETE' }),
};
