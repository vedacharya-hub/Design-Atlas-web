export type SeatStatus = 'available' | 'unavailable' | 'partial';

export interface Seat {
  id: string;
  label: string;
  x: number; // percentage of floor image width
  y: number; // percentage of floor image height
  zone: string;
  status: SeatStatus;
  /** The space type (Admin → Spaces → Space types) the desk is, e.g. "Desk & Chair". */
  spaceType?: string;
  /** The admin’s note on the desk itself. */
  notes?: string;
  /** Kept for one person as their permanent seat: nobody else can book it. Admin only. */
  assignment?: SeatAssignment | null;
}

/** A permanent seat: who it’s kept for, from when, and the admin’s note. */
export interface SeatAssignment {
  /** An AdminUser id. */
  userId: string;
  /** YYYY-MM-DD. */
  effectiveFrom: string;
  notes: string;
}

export interface Floor {
  id: string;
  building: string;
  floorLabel: string;
  officeNo: string;
  image: string;
  zones: string[];
  shiftsEnabled: boolean;
}

export interface FloorShift {
  id: string;
  floorId: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  seatIds: string[];
  enabled: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  team: string;
  isCurrentUser?: boolean;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly';
  daysOfWeek: number[]; // 0=Mon … 6=Sun
  endDate: string;
}

export interface BookingAssignment {
  memberId: string;
  seatId: string;
}

export interface Booking {
  id: string;
  floorId: string;
  shift: string;
  date: string;
  mode: 'self' | 'others';
  assignments: BookingAssignment[];
  recurrence?: RecurrenceRule;
  createdAt: string;
}

/**
 * Credits draw down the allotment first; once that's exhausted, usage spills into the overage
 * allotment (a second, separate cap) — the two bars represent sequential tiers, not parallel ones.
 */
export interface CompanyCredits {
  creditAllotment: number;
  creditAllotmentUsed: number;
  overageAllotment: number;
  overageUsed: number;
  avgMonthlyUsage: number;
  todayUsage: number;
}

export type OrgUnitType = 'business-unit' | 'department' | 'team';

/** A node in the Business Unit → Department → Team hierarchy that credits can be allotted to. */
export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
}

/**
 * A "credit group" — a dedicated credit allocation carved out for one org unit. A unit with no
 * group draws freely from its parent's pool; giving it a group of its own caps it independently.
 */
export interface CreditGroup {
  id: string;
  orgUnitId: string;
  allocatedCredits: number;
  usedCredits: number;
  /**
   * Every group can always keep booking past its allocation using overage credits — there is no
   * "blocked" state. `overageCap` is only meaningful while
   * `CreditAllocationSettings.overageManagementEnabled` is true: undefined means the group draws
   * on the shared company overage pool with no individual ceiling (stops only when the shared
   * pool itself runs out); a number caps this group at that amount within the shared pool. While
   * the master switch is off, overage is unconditionally unlimited regardless of this field.
   */
  overageCap?: number;
}

export interface CreditAllocationSettings {
  enabled: boolean;
  /** The company-wide credit pool that Business Unit allocations draw down from. */
  totalCreditLimit: number;
  /**
   * Master switch for overage limits, off by default — while off, every group has unlimited
   * overage and `overageLimit` is not enforced. While on, overage draws down a shared company
   * pool capped at `overageLimit` (minimum 50).
   */
  overageManagementEnabled: boolean;
  /** The company-wide overage cushion — shared once a group's own allocation runs out. */
  overageLimit: number;
}

export interface FilterOptions {
  buildings: string[];
  floors: { id: string; label: string; building: string }[];
  offices: { floorId: string; officeNo: string }[];
  shifts: { id: string; label: string }[];
}

export type AccountType = 'on-demand' | 'private-office';

export interface KycInfo {
  verified: boolean;
  dob?: string;
  gender?: string;
  nationality?: string;
  country?: string;
  state?: string;
  phone: string;
}

export interface Subscription {
  planName: string;
  status: 'active' | 'expired';
  billingCycle: string;
  price: string;
  renewsOn: string;
}

export interface LoyaltyBenefit {
  title: string;
  description: string;
  icon: 'discount' | 'unlock';
}

export interface LoyaltyMembership {
  building: string;
  address: string;
  deskId: string;
  contactEmail: string;
  planName: string;
  durationMonths: number;
  startDate: string;
  endDate: string;
}

export interface Loyalty {
  isMember: boolean;
  tier?: string;
  benefits: LoyaltyBenefit[];
  membership?: LoyaltyMembership;
}

export interface PassBalance {
  credits: number;
  bundles: number;
}

export interface AccountDetails {
  accountType: AccountType;
  kyc: KycInfo;
  subscription: Subscription;
  loyalty: Loyalty;
  passes: PassBalance;
}

export interface MeetingRoom {
  id: string;
  name: string;
  building: string;
  floorLabel: string;
  capacity: number;
  creditsPerHour: number;
  /** Photo file name under /home. */
  photo: string;
}

/** Start/end are minutes from midnight on `date` (YYYY-MM-DD). */
export interface RoomSlot {
  date: string;
  start: number;
  end: number;
  guests: number;
}

export interface RoomAvailability extends RoomSlot {
  rooms: MeetingRoom[];
}

export interface RoomBooking extends RoomSlot {
  id: string;
  roomId: string;
  credits: number;
  createdAt: string;
}

export type EventCategory = 'Wellness' | 'Community' | 'Learning' | 'Networking';

/** An event on a building's programme for one day; start/end are minutes from midnight. */
export interface BuildingEvent {
  id: string;
  building: string;
  title: string;
  category: EventCategory;
  location: string;
  start: number;
  end: number;
  capacity?: number;
  spotsLeft?: number;
  cta: 'RSVP' | 'Register';
  /** Photo file name under /home. */
  image: string;
}

/** One of the 100 hot desks (D1–D100) at Vaishnavi Signature. */
export interface Desk {
  id: string;
  number: number;
  building: string;
  floorLabel: string;
  zone: string;
  features: string[];
}

/** A full-day desk reservation for the signed-in member. */
export interface DeskBooking {
  id: string;
  deskId: string;
  memberId: string;
  date: string;
  /** Shared by the days booked together in one request. */
  groupId: string;
  /** 9-digit booking ID shown to the member. */
  reference: string;
  createdAt: string;
  desk: Desk;
}

export interface DeskOption {
  desk: Desk;
  kind: 'favourite' | 'recent' | 'nearby';
  reason: string;
}

export interface DeskRecommendations {
  dates: string[];
  /** Requested dates the member doesn't already have a desk on. */
  needed: string[];
  /** The member's own bookings on any of the requested dates. */
  existing: DeskBooking[];
  favourites: string[];
  recent: string[];
  /** Favourite/recent desks that aren't free on every needed date. */
  unavailable: { deskId: string; kind: 'favourite' | 'recent' }[];
  options: DeskOption[];
  /** Desks free on every needed date. */
  freeDesks: Desk[];
}

/** A bookable private office in the building (Iris private office booking). */
export interface PrivateOffice {
  id: string;
  name: string;
  building: string;
  floorLabel: string;
  capacity: number;
  creditsPerDay: number;
  /** Photo file name under /home. */
  photo: string;
}

/** One day in a private office; the days booked together share `groupId` and `reference`. */
export interface OfficeBooking {
  id: string;
  officeId: string;
  memberId: string;
  date: string;
  groupId: string;
  /** 9-digit booking ID shown to the member. */
  reference: string;
  credits: number;
  createdAt: string;
  office: PrivateOffice;
}

export type AnnouncementStatus = 'active' | 'scheduled' | 'archived' | 'completed';

/** An admin announcement shown to members from one date to another (YYYY-MM-DD, inclusive). */
export interface Announcement {
  id: string;
  /** Shown as #001, #002 … */
  number: number;
  title: string;
  message: string;
  from: string;
  to: string;
  /** A building name, or "Company Level" for everyone. */
  location: string;
  archived: boolean;
  createdAt: string;
  status: AnnouncementStatus;
}

export interface NewAnnouncement {
  title: string;
  message: string;
  from: string;
  to: string;
  location: string;
}

/** Archiving a user (from the row's ⋯ menu) makes them inactive; restoring makes them active. */
export type UserStatus = 'active' | 'inactive';
/** PO (private office) and ATLAS come together; AA stands alone. */
export type MembershipTag = 'PO' | 'ATLAS' | 'AA';

/** A person in the company directory managed from Admin → Users. */
export interface AdminUser {
  id: string;
  /** Shown as #WE-000021. */
  code: string;
  name: string;
  email: string;
  role: string;
  /** Empty until the user is placed in a team. */
  team: string;
  department: string;
  businessUnit: string;
  status: UserStatus;
  membership: MembershipTag[];
  /** Photo file under /admin/avatars, or an uploaded photo as a data URL; the gradient placeholder when absent. */
  avatar?: string;
  /** Job title, e.g. "Senior Associate, Inside Sales". */
  designation: string;
  phone: string;
  /** The name of the access level they hold (Admin → Access Control), e.g. "Level 1". */
  accessLevel: string;
  /** A WorkLocation id. */
  homeLocationId: string;
  /** Where they sit in their home building, e.g. "Ground floor". */
  floor: string;
  /** Buildings the user is tied to (Associated locations). */
  associatedLocationIds: string[];
  /** Co-working buildings the user can work from. */
  coworkingLocationIds: string[];
  keyCard: KeyCard;
}

/** The user's building key card: the two hot-stamped codes printed on it, and whether it opens doors. */
export interface KeyCard {
  leftHotStamp: string;
  rightHotStamp: string;
  status: UserStatus;
}

/** Business Unit → Department → Team → users. Users name their team, department and business unit. */
export interface BusinessUnit {
  id: string;
  /** Shown as #BU-1201. */
  code: string;
  name: string;
  status: UserStatus;
}
export interface Department {
  id: string;
  /** Shown as #DP-1201. */
  code: string;
  name: string;
  businessUnitId: string;
  status: UserStatus;
}
export interface Team {
  id: string;
  /** Shown as #TM-1201. */
  code: string;
  name: string;
  departmentId: string;
  status: UserStatus;
  /** The AdminUser who leads the team; they count as a member even if their own team is another. */
  managerId?: string;
}
export interface OrgChart {
  businessUnits: BusinessUnit[];
  departments: Department[];
  teams: Team[];
}
/** Edits from the team details panel (or a rename of a department / business unit). */
export interface OrgUnitUpdate {
  name?: string;
  status?: UserStatus;
  /** Teams: move to another department. */
  departmentId?: string;
  /** Departments: move to another business unit. */
  businessUnitId?: string;
  /** Teams: null clears the manager. */
  managerId?: string | null;
}
/** The three levels, as they appear in URLs. */
export type OrgKind = 'business-units' | 'departments' | 'teams';

/** A WeWork building users can be tied to from Admin → Users. */
export interface WorkLocation {
  id: string;
  name: string;
  address: string;
  /** The city the building is in, e.g. "Bengaluru": Access Control groups buildings by it. */
  city: string;
  /** A short building code, e.g. "MM1210". */
  code: string;
  /** The company has a private office here; only these buildings can be a user's home location. */
  privateOffice: boolean;
}

/** The fields an admin can change from the user details panel. */
export type AdminUserUpdate = Partial<
  Pick<
    AdminUser,
    | 'status'
    | 'avatar'
    | 'designation'
    | 'role'
    | 'team'
    | 'department'
    | 'businessUnit'
    | 'accessLevel'
    | 'homeLocationId'
    | 'membership'
    | 'associatedLocationIds'
    | 'coworkingLocationIds'
    | 'keyCard'
  >
>;

/** Add User: step 1 (general details) plus the optional key card from step 2. */
export interface NewAdminUser {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  businessUnit: string;
  department: string;
  team: string;
  role: string;
  accessLevel: string;
  membership: MembershipTag[];
  homeLocationId: string;
  /** An uploaded photo (data URL), or the past record's photo file. */
  avatar?: string;
  leftHotStamp: string;
  rightHotStamp: string;
}

/** What the directory knows about an email before a user is added. */
export interface AdminUserLookup {
  /** "exists": an active member with a membership; "returning": a past record to fill the form from. */
  match: 'none' | 'exists' | 'returning';
  user: AdminUser | null;
}

/** One row of a bulk upload, as the admin confirmed it in the Upload Users wizard. */
export interface BulkUserRow {
  email: string;
  name: string;
  role: string;
  /** An access level’s name; left out, new people get their role's usual level and existing people keep theirs. */
  accessLevel?: string;
  team: string;
  department: string;
  businessUnit: string;
  membership: MembershipTag[];
  status: UserStatus;
}

/** A bulk upload running on the server, one row at a time. */
export interface BulkUploadJob {
  id: string;
  status: 'running' | 'done';
  total: number;
  processed: number;
  created: number;
  updated: number;
  /** Rows that matched a user exactly, so nothing changed. */
  unchanged: number;
  failed: { email: string; name: string; error: string }[];
  startedAt: string;
  finishedAt?: string;
}

/** My Bookings: the four product lines, with office desks split into one person's desk and team desks. */
export type MyBookingKind = 'meeting-room' | 'shared-desk' | 'office-desk' | 'team-desks' | 'private-office';

export interface BookingPerson {
  id: string;
  name: string;
  email?: string;
  /** Photo file under /admin/avatars, if they have one. */
  avatar?: string;
  avatarColor?: string;
  /** Invited from outside the company. */
  guest?: boolean;
}

/** One booking as My Bookings lists it, whichever product it's for. */
export interface MyBooking {
  id: string;
  kind: MyBookingKind;
  title: string;
  location: string;
  /** Shown as #120021. */
  reference: string;
  /** The second tag: "10 Seats", "Shared Desk", "Office Desk", "BPO". */
  tag: string;
  /** Photo file under /home; team desks have none. */
  photo?: string;
  /** A WeWork space, or the member company's own office. */
  space: 'wework' | 'office';
  /** Every day it covers (YYYY-MM-DD), in order. */
  dates: string[];
  /** Minutes from midnight; all-day bookings run 9:00 AM to 8:00 PM. */
  start: number;
  end: number;
  allDay: boolean;
  credits?: number;
  /** Desks taken: several for a team on one day, or a private office's. */
  desks?: number;
  cancelled: boolean;
  createdBy: BookingPerson;
  createdByMe: boolean;
  /** Attendees (meeting rooms) or members (everything else), the booker first. */
  people: BookingPerson[];
  /** Guests can be invited (meeting rooms and private offices you booked). */
  guestsAllowed: boolean;
}

/** Admin → Events: archived wins; otherwise it follows the listing and event dates. */
export type AdminEventStatus = 'active' | 'scheduled' | 'archived' | 'completed';

/** What an admin fills in to create an event (Create New Event, steps 1 and 2). */
export interface NewAdminEvent {
  title: string;
  description: string;
  capacity: number;
  /** A WorkLocation id. */
  locationId: string;
  /** YYYY-MM-DD and minutes after midnight. */
  date: string;
  time: number;
  /** When members start seeing it (YYYY-MM-DD), on or before the event date. */
  listingDate: string;
  rsvpRequired: boolean;
  featured: boolean;
  /** Photos: files under the public folder, or data URLs from an upload. */
  images: string[];
}

/** An event in Admin → Events, with its building's name and address and its status. */
export interface AdminEvent extends NewAdminEvent {
  id: string;
  /** Shown as #001, #002 … */
  number: number;
  archived: boolean;
  /** Who created it (an AdminUser) and when (YYYY-MM-DD). */
  createdBy: { id: string; name: string };
  createdOn: string;
  /** AdminUser ids of the members who RSVP'd. */
  rsvps: string[];
  location: string;
  address: string;
  status: AdminEventStatus;
}

export type AdminEventUpdate = Partial<NewAdminEvent & { archived: boolean }>;

// ---------- Admin → Spaces: buildings, the company's spaces in them, and space types ----------
export type SpaceStatus = 'active' | 'inactive';

/** A WeWork building where the company has space. It shares its id with its WorkLocation. */
export interface AdminBuilding {
  id: string;
  /** Shown as #WE-01, #WE-02 … */
  number: number;
  name: string;
  address: string;
  city: string;
  state: string;
  /** The neighbourhood, e.g. Bellandur. */
  area: string;
  /** IANA, e.g. Asia/Kolkata. */
  timeZone: string;
  floors: number;
  /** Square feet the company leases here. */
  leasedArea: number;
  status: SpaceStatus;
}

export type NewAdminBuilding = Pick<AdminBuilding, 'name' | 'address' | 'city' | 'state' | 'area' | 'timeZone' | 'floors' | 'leasedArea'>;
export type AdminBuildingUpdate = Partial<NewAdminBuilding & { status: SpaceStatus }>;

/** A floor plan as uploaded: its file name and size, and where to show it from. */
export interface SpaceFloorMap {
  name: string;
  /** Bytes, as uploaded. */
  size: number;
  /** A data URL, or a file the server or client serves. */
  url: string;
}

export interface SpaceBookingSettings {
  /** How many days one booking may span (0: no limit). */
  multiDayLimit: number;
  /** How far ahead members may book, in days (0: no limit). */
  futureLimitDays: number;
  /** One instruction per line. */
  instructions: string;
  /** Members may only book between these dates (YYYY-MM-DD), on these days (0 = Monday … 5 = Saturday). */
  restricted: boolean;
  restrictFrom: string;
  restrictUntil: string;
  restrictDays: number[];
}

/** A floor (or part of one) the company has in a building. */
export interface AdminSpace {
  id: string;
  /** Shown as #WE-000021. */
  number: number;
  buildingId: string;
  floor: number;
  /** Office numbers on the floor, e.g. 022 - 026; may be blank. */
  officeNo: string;
  /** Total spaces (seats). */
  capacity: number;
  /** Square feet. */
  leasedArea: number;
  /** WeWork's id for the private space / floor. */
  floorId: string;
  floorMap: SpaceFloorMap | null;
  /** The booking floor plan with seats, zones and shifts, once the space has been mapped. */
  seatMapId?: string;
  status: SpaceStatus;
  booking: SpaceBookingSettings;
}

/** A space as the admin pages get it: with its building's details and how many spaces are booked today. */
export interface AdminSpaceView extends AdminSpace {
  building: string;
  city: string;
  state: string;
  area: string;
  timeZone: string;
  booked: number;
}

export type NewAdminSpace = Pick<AdminSpace, 'buildingId' | 'floor' | 'leasedArea' | 'capacity' | 'floorId' | 'floorMap'>;
export type AdminSpaceUpdate = Partial<Pick<AdminSpace, 'buildingId' | 'floor' | 'capacity' | 'floorMap' | 'status' | 'booking'>>;

/** A desk on a space’s seat map as admins see it, with the person it’s kept for. */
export interface AdminSeat {
  id: string;
  label: string;
  /** Percent of the floor plan’s width and height. */
  x: number;
  y: number;
  zone: string;
  spaceType: string;
  notes: string;
  assignment: AdminSeatAssignment | null;
}
export interface AdminSeatAssignment extends SeatAssignment {
  name: string;
  email: string;
  team: string;
  avatar?: string;
}
/** A space’s seat map: its desks and how many it may have (the space’s total spaces). */
export interface AdminSeatMap {
  seats: AdminSeat[];
  limit: number;
}
export type SeatAssignmentInput = Pick<SeatAssignment, 'userId' | 'effectiveFrom' | 'notes'>;
/** A free desk's type and note, from the map's edit icon. */
export type SeatUpdateInput = { spaceType?: string; notes?: string };
/** Edit mode’s changes, saved together: desks moved, and new desks with where they go. */
export interface SeatLayoutInput {
  moves: { id: string; x: number; y: number }[];
  added: { x: number; y: number; zone: string; spaceType: string; notes: string }[];
}

/** The colours a zone can take on the map. */
export type ZoneColor = 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'teal' | 'yellow' | 'red';
/** Who a zone is for: a business unit, a department or a team. */
export type ZoneLevel = 'business-unit' | 'department' | 'team';
/**
 * A zone drawn on a space's floor plan: a rectangle, in percent of the plan's width and height like
 * the desks. The desks inside it are its seats. Zones on a floor never overlap.
 */
export interface SpaceZone {
  id: string;
  name: string;
  color: ZoneColor;
  x: number;
  y: number;
  w: number;
  h: number;
  level: ZoneLevel;
  /** The business units, departments or teams (by id) the zone is for: at least one, all at its level. */
  unitIds: string[];
}
/** A zone with the names of who it's for and the desks inside it now. */
export interface SpaceZoneView extends SpaceZone {
  unitNames: string[];
  seatIds: string[];
  /** Bookings from today on with a desk in the zone: deleting the zone cancels them. */
  upcomingBookings: number;
}
/**
 * A zone on a booking floor as members see it: where it is, who it's for, its desks, and which
 * members may book them. Desks outside every zone are open to all.
 */
export interface FloorZone {
  id: string;
  name: string;
  color: ZoneColor;
  x: number;
  y: number;
  w: number;
  h: number;
  level: ZoneLevel;
  /** Who it's for: the zone's active units, in the order they were picked. */
  unitNames: string[];
  seatIds: string[];
  memberIds: string[];
}
/** Zones as saved from the map: new ones have no id yet. */
export type SpaceZoneInput = Omit<SpaceZone, 'id'> & { id?: string };
/** A floor's zones and the version they're at; each save bumps it. */
export interface SpaceZoneList {
  zones: SpaceZoneView[];
  version: number;
  /** After a save: upcoming bookings cancelled because their zone was deleted. */
  cancelledBookings?: number;
}

/** Whether a space type is booked for the whole day or for a stretch of time. */
export type SpaceBookingKind = 'full-day' | 'time-duration';

export interface SpaceType {
  id: string;
  /** Shown as #ST-01. */
  number: number;
  name: string;
  booking: SpaceBookingKind;
}

export type NewSpaceType = Pick<SpaceType, 'name' | 'booking'>;

// ---------- Admin → Roles ----------
/** A role users hold, and the services and admin areas it opens up. */
export interface AdminRole {
  id: string;
  /** Shown as #RL-001. */
  number: number;
  name: string;
  description: string;
  /** Archived roles stay on the users who have them, but can't be given to anyone else. */
  status: 'active' | 'inactive';
  /** Keys of the permissions the role has (see the permission groups on the Roles page). */
  permissions: string[];
}

export type NewAdminRole = Pick<AdminRole, 'name' | 'description' | 'permissions'>;
export type AdminRoleUpdate = Partial<NewAdminRole & { status: AdminRole['status'] }>;

// ---------- Admin → Access Control ----------
/** An access level: the buildings people who hold it can get into. AdminUser.accessLevel is its name. */
export interface AdminAccessLevel {
  id: string;
  /** Shown as #AL-001. */
  number: number;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  /** Company office buildings (WorkLocations with a private office) they can enter. */
  officeLocationIds: string[];
  /** WeWork buildings in India they can co-work from. */
  coworkingLocationIds: string[];
  /** Every WeWork centre outside India too. */
  globalAccess: boolean;
}
export type NewAdminAccessLevel = Pick<AdminAccessLevel, 'name' | 'description' | 'officeLocationIds' | 'coworkingLocationIds' | 'globalAccess'>;
export type AdminAccessLevelUpdate = Partial<NewAdminAccessLevel & { status: AdminAccessLevel['status'] }>;

// ---------- Admin → Company Settings ----------
/** The company's profile and the services everyone in it can use. */
export interface CompanySettings {
  name: string;
  /** e.g. "google.com" */
  domain: string;
  /** A PNG data URL, or absent for the placeholder. */
  logo?: string;
  /**
   * The workspace services (role permission keys) the company allows. Off here is off for every
   * role and everyone who holds it, whatever the role says.
   */
  services: Record<string, boolean>;
  /** Licences the company holds per membership: every active user with that membership (PO, ATLAS) uses one. */
  licences: Record<'PO' | 'ATLAS', number>;
}
export type CompanySettingsUpdate = Partial<Pick<CompanySettings, 'name' | 'domain' | 'logo'>> & { services?: Record<string, boolean> };

/**
 * Admin → Company Settings → Co-working Permissions: which WeWork buildings the company's people
 * may work from. A building turned off here is off for everyone; users who have it show it as
 * restricted. WeWork's centres outside India are allowed or not all together.
 */
export interface CoworkingPermissions {
  /** WorkLocation ids turned off for the whole company. */
  disabledLocationIds: string[];
  /** The centres outside India. */
  global: boolean;
  /** How many centres the global switch covers. */
  globalCentres: number;
}
export type CoworkingPermissionsUpdate = Pick<CoworkingPermissions, 'disabledLocationIds' | 'global'>;

/** A company-wide shift: the time windows people book desks for. */
export interface CompanyShift {
  id: string;
  /** Shown as #SFT01. */
  number: number;
  name: string;
  /** "09:00" */
  startTime: string;
  /** "17:00"; earlier than the start when it runs past midnight. */
  endTime: string;
  status: 'active' | 'inactive';
}
export type NewCompanyShift = Pick<CompanyShift, 'name' | 'startTime' | 'endTime'>;
export type CompanyShiftUpdate = Partial<NewCompanyShift & { status: CompanyShift['status'] }>;

// ---------- Admin → Credits ----------
/**
 * The company's credits this billing cycle. Every 30 days it gets a fresh allotment; anything booked
 * past it is overage, billed at the end of the cycle.
 */
export interface CreditOverview {
  /** When this cycle started (YYYY-MM-DD). */
  cycleStart: string;
  cycleDays: number;
  /** Credits the company gets each cycle. */
  allotment: number;
  /** Of those, used so far this cycle. */
  allotmentUsed: number;
  /** Booked past the allotment this cycle. */
  overageUsed: number;
  avgMonthlyUsage: number;
  overage: OverageSettings;
  /** Each active team's overage this cycle, and its own limit if it has one. */
  teams: TeamOverage[];
}
export interface OverageSettings {
  /** Off: overage is unlimited. On: the company's overage is capped at `limit`, its pool. */
  enabled: boolean;
  limit: number;
}
export interface TeamOverage {
  teamId: string;
  /** Overage credits the team used this cycle. */
  used: number;
  /** Its own cap, carved out of the company pool; null while it shares what's left (the free pool). */
  limit: number | null;
}
