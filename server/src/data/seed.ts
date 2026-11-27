import type {
  Seat,
  Floor,
  FloorShift,
  Member,
  Booking,
  SeatStatus,
  OrgUnit,
  CreditGroup,
  CreditAllocationSettings,
  MeetingRoom,
  RoomBooking,
  BuildingEvent,
  Desk,
  DeskBooking,
  PrivateOffice,
  OfficeBooking,
  Announcement,
  AdminEvent,
  AdminUser,
  AdminBuilding,
  AdminSpace,
  SpaceBookingSettings,
  SpaceType,
  AdminRole,
  AdminAccessLevel,
  CompanySettings,
  CompanyShift,
  OverageSettings,
  TeamOverage,
  MembershipTag,
  WorkLocation,
  BusinessUnit,
  Department,
  Team,
  MyBookingKind,
} from '../types.js';

/**
 * Seat coordinates are taken directly from the Figma frame `1124:65429`
 * (the seat-overlay group that sits on top of the floor-plan image).
 * The overlay frame is 575.94 x 560.27; we store the raw Figma x/y and
 * convert to percentages so seats scale with any rendered map size.
 */
const FRAME_W = 575.94;
const FRAME_H = 560.27;

interface RawSeat {
  fx: number;
  fy: number;
  zone: string;
  status: SeatStatus;
}

// Right-hand cluster (grid of 4 rows). Matches the "South Bay" block in the design.
const SOUTH_X = [
  495.6779, 472.2345, 456.3269, 431.2073, 416.9732, 393.5285, 380.9694,
  355.8511, 334.9173, 311.474, 292.2166, 271.2828,
];
const SOUTH_ROWS = [488.9801, 507.4002, 525.8215, 541.7301];

// Left-hand cluster. Matches the "West Bay" block in the design.
const WEST: Array<[number, number]> = [
  [144.0152, 519.9603], [120.5704, 519.9603], [101.313, 521.6351],
  [101.313, 503.214], [77.8669, 503.214], [77.8669, 521.6351],
  [77.8669, 538.3806], [37.6785, 503.214], [37.6785, 521.6351],
  [37.6785, 538.3806], [61.9593, 538.3806], [144.0152, 538.3806],
];

function buildRawSeats(): RawSeat[] {
  const raw: RawSeat[] = [];

  // South Bay grid — mostly booked, a few partial/available, to exercise the flow.
  let i = 0;
  for (const fy of SOUTH_ROWS) {
    for (const fx of SOUTH_X) {
      const mod = i % 5;
      const status: SeatStatus =
        mod === 0 ? 'available' : mod === 1 ? 'partial' : 'unavailable';
      raw.push({ fx, fy, zone: 'South Bay', status });
      i++;
    }
  }

  // West Bay — mostly available.
  WEST.forEach(([fx, fy], idx) => {
    const status: SeatStatus =
      idx % 4 === 3 ? 'partial' : idx % 7 === 6 ? 'unavailable' : 'available';
    raw.push({ fx, fy, zone: 'West Bay', status });
  });

  return raw;
}

/**
 * Desks kept for one person (Admin → Spaces → Space Map): seat id → the AdminUser (AU-22 Aashray,
 * AU-23 Priya, AU-28 Arjun), from when, and a note.
 */
const PERMANENT_SEATS: Record<string, { userId: string; effectiveFrom: string; notes: string }> = {
  'S-003': { userId: 'AU-22', effectiveFrom: '2025-05-12', notes: 'Permanent Seat' },
  'S-015': { userId: 'AU-23', effectiveFrom: '2025-03-17', notes: 'Near the team pod' },
  'S-050': { userId: 'AU-28', effectiveFrom: '2025-01-06', notes: '' },
};

/**
 * A space type's letters on the map: D for desks, M for meeting rooms, FB for phone booths and C for
 * cabins; any other type goes by its initials ("Focus Pod" → FP).
 */
export function seatPrefix(spaceType: string): string {
  const t = spaceType.toLowerCase();
  if (t.includes('meeting')) return 'M';
  if (t.includes('phone') || t.includes('booth')) return 'FB';
  if (t.includes('cabin')) return 'C';
  if (t.includes('desk')) return 'D';
  const initials = spaceType
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/gi, '')[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
  return initials || 'D';
}

/** Labels count up within each type: every desk here is a D, D1–D60. */
function makeSeats(): Seat[] {
  const perPrefix: Record<string, number> = {};
  return buildRawSeats().map((r, idx) => {
    const id = `S-${String(idx + 1).padStart(3, '0')}`;
    const spaceType = idx % 3 === 0 ? 'Desk, Chair with 1 Monitor' : 'Desk & Chair';
    const prefix = seatPrefix(spaceType);
    const n = (perPrefix[prefix] = (perPrefix[prefix] ?? 0) + 1);
    return {
      id,
      label: `${prefix}${n}`,
      x: +((r.fx / FRAME_W) * 100).toFixed(3),
      y: +((r.fy / FRAME_H) * 100).toFixed(3),
      zone: r.zone,
      status: r.status,
      spaceType,
      notes: '',
      assignment: PERMANENT_SEATS[id] ?? null,
    };
  });
}

export const floors: Floor[] = [
  {
    id: 'floor-2',
    building: 'Amazon - WeWork Vaishnavi Signature',
    floorLabel: '2nd Floor',
    officeNo: 'Office No - 120-140',
    image: '/floorplan.png',
    zones: ['South Bay', 'West Bay', 'North Bay', 'Open Bay'],
    shiftsEnabled: true,
  },
];

/** Shift colors cycle through this palette when the admin creates a new shift. */
export const shiftColorPalette = ['#3659f5', '#f97316', '#7c3aed', '#0ea5e9', '#db2777', '#11a830'];

/** Floor-scoped, admin-editable shifts (distinct from the flat booking-filter `shifts` below). */
export const floorShifts: Record<string, FloorShift[]> = {
  'floor-2': [
    {
      id: 'fshift-1',
      floorId: 'floor-2',
      name: 'Morning Shift',
      startTime: '09:00',
      endTime: '14:00',
      color: shiftColorPalette[0],
      // First South Bay row + half of West Bay.
      seatIds: [...Array(12)].map((_, i) => `S-${String(i + 1).padStart(3, '0')}`)
        .concat([...Array(6)].map((_, i) => `S-${String(i + 49).padStart(3, '0')}`)),
      enabled: true,
    },
    {
      id: 'fshift-2',
      floorId: 'floor-2',
      name: 'Evening Shift',
      startTime: '14:00',
      endTime: '20:00',
      color: shiftColorPalette[1],
      // Second South Bay row + the rest of West Bay.
      seatIds: [...Array(12)].map((_, i) => `S-${String(i + 13).padStart(3, '0')}`)
        .concat([...Array(6)].map((_, i) => `S-${String(i + 55).padStart(3, '0')}`)),
      enabled: true,
    },
  ],
};

/** Company-wide shifts (Admin → Company Settings → Shift Management); the active ones are the booking filter's shifts. */
export const companyShifts: CompanyShift[] = [
  { id: 'shift-1', number: 1, name: 'Morning Shift', startTime: '09:00', endTime: '17:00', status: 'active' },
  { id: 'shift-2', number: 2, name: 'Evening Shift', startTime: '17:00', endTime: '02:00', status: 'inactive' },
  { id: 'shift-3', number: 3, name: 'Night Shift', startTime: '02:00', endTime: '09:00', status: 'active' },
];
let companyShiftSeq = companyShifts.length + 1;
export const nextCompanyShiftNumber = () => companyShiftSeq++;

export const members: Member[] = [
  { id: 'u-001', name: 'Ved Acharya', email: 'ved.acharya@wework.co.in', avatarColor: '#3659f5', team: 'Product', isCurrentUser: true },
  { id: 'u-002', name: 'Priya Sharma', email: 'priya.sharma@wework.co.in', avatarColor: '#1dca40', team: 'Design' },
  { id: 'u-003', name: 'Rahul Verma', email: 'rahul.verma@wework.co.in', avatarColor: '#ffd500', team: 'Engineering' },
  { id: 'u-004', name: 'Ananya Iyer', email: 'ananya.iyer@wework.co.in', avatarColor: '#d70000', team: 'Sales' },
  { id: 'u-005', name: 'Karan Mehta', email: 'karan.mehta@wework.co.in', avatarColor: '#10169f', team: 'Engineering' },
  { id: 'u-006', name: 'Sneha Reddy', email: 'sneha.reddy@wework.co.in', avatarColor: '#697586', team: 'Marketing' },
  { id: 'u-007', name: 'Arjun Nair', email: 'arjun.nair@wework.co.in', avatarColor: '#11a830', team: 'Finance' },
  { id: 'u-008', name: 'Meera Joshi', email: 'meera.joshi@wework.co.in', avatarColor: '#202939', team: 'People' },
];

/** Live seat state, seeded per floor. Mutated by bookings. */
export const seatsByFloor: Record<string, Seat[]> = {
  'floor-2': makeSeats(),
};

export const bookings: Booking[] = [];

/**
 * Company-wide credit usage for the admin "Credits" tab. The allotment is fully drawn down
 * (used === allotment) before overage usage kicks in.
 */
export const companyCredits = {
  creditAllotment: 99908,
  creditAllotmentUsed: 99908,
  overageAllotment: 99908,
  overageUsed: 7481.5,
  avgMonthlyUsage: 95230,
  todayUsage: 3140,
};

/** Business Unit → Department → Team hierarchy for the admin "Credit Allocation" tab. */
export const orgUnits: OrgUnit[] = [
  { id: 'bu-1', name: 'Amazon India', type: 'business-unit', parentId: null },
  { id: 'dept-1', name: 'Engineering', type: 'department', parentId: 'bu-1' },
  { id: 'dept-2', name: 'Sales', type: 'department', parentId: 'bu-1' },
  { id: 'team-1', name: 'Platform', type: 'team', parentId: 'dept-1' },
  { id: 'team-2', name: 'Mobile', type: 'team', parentId: 'dept-1' },
  { id: 'team-3', name: 'Enterprise Sales', type: 'team', parentId: 'dept-2' },
  { id: 'team-4', name: 'SMB Sales', type: 'team', parentId: 'dept-2' },
];

/**
 * Seeded dedicated allocations — units not listed here draw freely from their parent's pool.
 * Every group can always draw overage once its allocation runs out; Platform is seeded past its
 * own allocation and capped at 15 overage credits to demonstrate a per-team ceiling within the
 * shared company overage pool. Enterprise Sales is seeded with a 0 overage limit — effectively no
 * overage room. Amazon India (the Business Unit pool) is left uncapped.
 */
export const creditGroups: CreditGroup[] = [
  { id: 'cg-1', orgUnitId: 'bu-1', allocatedCredits: 200, usedCredits: 0 },
  { id: 'cg-2', orgUnitId: 'team-1', allocatedCredits: 80, usedCredits: 92, overageCap: 15 },
  { id: 'cg-3', orgUnitId: 'team-3', allocatedCredits: 50, usedCredits: 50, overageCap: 0 },
];

export const creditAllocationSettings: CreditAllocationSettings = {
  enabled: true,
  totalCreditLimit: 300,
  overageManagementEnabled: true,
  overageLimit: 100,
};

/** Meeting rooms bookable through Iris (Vaishnavi Signature, open 8:00 AM - 10:00 PM). */
export const meetingRooms: MeetingRoom[] = [
  { id: 'mr-24a', name: 'Room 24 A', building: 'Vaishnavi Signature', floorLabel: '8th Floor', capacity: 8, creditsPerHour: 2, photo: 'mr-1.jpg' },
  { id: 'mr-24b', name: 'Room 24 B', building: 'Vaishnavi Signature', floorLabel: '8th Floor', capacity: 4, creditsPerHour: 1, photo: 'mr-2.jpg' },
  { id: 'mr-12c', name: 'Room 12 C', building: 'Vaishnavi Signature', floorLabel: '6th Floor', capacity: 6, creditsPerHour: 2, photo: 'mr-3.jpg' },
  { id: 'mr-board', name: 'Boardroom', building: 'Vaishnavi Signature', floorLabel: '9th Floor', capacity: 12, creditsPerHour: 4, photo: 'mr-4c.jpg' },
  { id: 'mr-7a', name: 'Room 7 A', building: 'Vaishnavi Signature', floorLabel: '7th Floor', capacity: 5, creditsPerHour: 1, photo: 'qs-1.jpg' },
  { id: 'mr-huddle3', name: 'Huddle 3', building: 'Vaishnavi Signature', floorLabel: '8th Floor', capacity: 3, creditsPerHour: 1, photo: 'qs-office.jpg' },
];

export const ROOM_HOURS = { open: 8 * 60, close: 22 * 60 };

/** Private offices bookable by the day through Iris, at the member's building. */
export const privateOffices: PrivateOffice[] = [
  { id: 'po-118', name: 'Office - 118 - 119', building: 'Vaishnavi Signature', floorLabel: '8th Floor', capacity: 4, creditsPerDay: 8, photo: 'qs-office.jpg' },
  { id: 'po-120', name: 'Office - 120 - 125', building: 'Vaishnavi Signature', floorLabel: '8th Floor', capacity: 8, creditsPerDay: 14, photo: 'po-office-120.jpg' },
  { id: 'po-204', name: 'Office - 204 - 206', building: 'Vaishnavi Signature', floorLabel: '2nd Floor', capacity: 6, creditsPerDay: 10, photo: 'mr-2.jpg' },
  { id: 'po-310', name: 'Office - 310 - 316', building: 'Vaishnavi Signature', floorLabel: '3rd Floor', capacity: 12, creditsPerDay: 20, photo: 'qs-3.jpg' },
];

/** Private office bookings (in-memory). */
export const officeBookings: OfficeBooking[] = [];
let officeSeq = 1;
export const nextOfficeBookingId = () => `PO-${String(officeSeq++).padStart(4, '0')}`;

/** Recurring daily reservations (minutes from midnight) so availability varies through the day. */
export const roomDailyBusy: Record<string, Array<[number, number]>> = {
  'mr-24a': [[10 * 60, 11 * 60], [15 * 60, 16 * 60 + 30]],
  'mr-24b': [[12 * 60, 13 * 60], [17 * 60, 18 * 60]],
  'mr-12c': [[9 * 60, 10 * 60 + 30], [14 * 60, 15 * 60], [19 * 60, 20 * 60]],
  'mr-board': [[11 * 60, 13 * 60], [16 * 60, 17 * 60]],
  'mr-7a': [[13 * 60, 14 * 60 + 30]],
  'mr-huddle3': [[18 * 60, 19 * 60]],
};

/** Bookings made through the API (in-memory, like `bookings`). */
export const roomBookings: RoomBooking[] = [];

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** Each building's weekly event programme. */
export const buildingEvents: BuildingEvent[] = [
  { id: 'ev-vs-yoga', building: 'Vaishnavi Signature', title: 'Sunrise Yoga on the Terrace', category: 'Wellness', location: 'Terrace, 10th Floor', start: 8 * 60, end: 9 * 60, days: WEEKDAYS, capacity: 20, spotsLeft: 6, cta: 'RSVP', image: 'exp-t4.jpg' },
  { id: 'ev-vs-coffee', building: 'Vaishnavi Signature', title: 'Coffee & Croissants', category: 'Community', location: 'Café, Ground Floor', start: 10 * 60, end: 11 * 60, days: EVERY_DAY, cta: 'RSVP', image: 'hero-photo.jpg' },
  { id: 'ev-vs-lunch', building: 'Vaishnavi Signature', title: 'Lunch & Learn: Designing with AI', category: 'Learning', location: 'Event Space, 3rd Floor', start: 13 * 60, end: 14 * 60, days: [2, 4], capacity: 40, spotsLeft: 12, cta: 'Register', image: 'exp-main.jpg' },
  { id: 'ev-vs-office-hours', building: 'Vaishnavi Signature', title: "Founders' Office Hours", category: 'Networking', location: 'Room 12 C, 6th Floor', start: 16 * 60, end: 17 * 60, days: [1, 3], capacity: 8, spotsLeft: 4, cta: 'Register', image: 'exp-t1.jpg' },
  { id: 'ev-vs-mixer', building: 'Vaishnavi Signature', title: 'WeWork Mixer: Meet Your Neighbours', category: 'Networking', location: 'Rooftop, 10th Floor', start: 18 * 60, end: 20 * 60, days: WEEKDAYS, capacity: 60, spotsLeft: 18, cta: 'RSVP', image: 'bk-room-a.jpg' },
  { id: 'ev-vs-brunch', building: 'Vaishnavi Signature', title: 'Weekend Brunch Social', category: 'Community', location: 'Café, Ground Floor', start: 11 * 60, end: 13 * 60, days: [0, 6], capacity: 30, spotsLeft: 9, cta: 'RSVP', image: 'exp-t3.jpg' },
  { id: 'ev-pc-breakfast', building: 'Prestige Central', title: 'Member Breakfast', category: 'Community', location: 'Lounge, 2nd Floor', start: 9 * 60, end: 10 * 60, days: WEEKDAYS, cta: 'RSVP', image: 'hero-photo.jpg' },
  { id: 'ev-pc-pitch', building: 'Prestige Central', title: 'Startup Pitch Night', category: 'Networking', location: 'Event Hall, 5th Floor', start: 18 * 60 + 30, end: 20 * 60 + 30, days: [3], capacity: 80, spotsLeft: 25, cta: 'Register', image: 'exp-main.jpg' },
];

/** The 100-person Google Office (120 - 126) on the 2nd floor of Vaishnavi Signature: desks D1–D100 in pods of ten. */
export const desks: Desk[] = Array.from({ length: 100 }, (_, i) => {
  const number = i + 1;
  const features: string[] = [];
  if (number % 10 === 1 || number % 10 === 0) features.push('Window seat');
  if (number % 2 === 0) features.push('Dual monitor');
  if (number % 5 === 3) features.push('Standing desk');
  return {
    id: `D${number}`,
    number,
    building: 'Vaishnavi Signature',
    floorLabel: '2nd Floor',
    zone: `Pod ${String.fromCharCode(65 + Math.floor(i / 10))}`,
    features,
  };
});

function shiftDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let deskSeq = 1;
export const nextDeskBookingId = () => `DB-${String(deskSeq++).padStart(4, '0')}`;
let deskReference = 104735421;
export const nextDeskReference = () => String(deskReference++);

/** The current member's desk history (relative to server start) — D12 is their usual desk. */
export const deskBookings: DeskBooking[] = [
  { deskId: 'D12', offset: -1 },
  { deskId: 'D12', offset: -2 },
  { deskId: 'D14', offset: -5 },
  { deskId: 'D12', offset: -6 },
  { deskId: 'D12', offset: -8 },
].map(({ deskId, offset }) => {
  const id = nextDeskBookingId();
  return { id, deskId, memberId: 'u-001', date: shiftDate(offset), groupId: id, reference: nextDeskReference(), createdAt: new Date().toISOString() };
});

/** Desks each member has starred. */
export const favouriteDesks: Record<string, string[]> = { 'u-001': ['D27'] };

/** Admin announcements, dated around today so every status shows up. */
let announcementSeq = 1;
const announcement = (title: string, message: string, from: number, to: number, location: string, archived = false): Announcement => ({
  id: `AN-${announcementSeq}`,
  number: announcementSeq++,
  title,
  message,
  from: shiftDate(from),
  to: shiftDate(to),
  location,
  archived,
  createdAt: new Date().toISOString(),
});
export const announcements: Announcement[] = [
  announcement('Diwali celebrations at the café', 'Join us for sweets, music and rangoli at the ground floor café from 4 PM.', -1, 3, 'Vaishnavi Signature'),
  announcement('Quarterly town hall', 'The Q4 town hall is in the 9th floor event space. Remote dial-in details will follow.', 6, 6, 'Company Level'),
  announcement('Parking access update', 'Basement parking now needs the new keycard. Collect yours from reception.', -20, -5, 'Company Level', true),
  announcement('Fire drill', 'A building-wide fire drill took place at 11 AM. Thanks for taking part.', -9, -9, 'Vaishnavi Signature'),
  announcement('New coffee machines on 8th floor', 'Fresh espresso machines are now on the 8th floor pantry.', -30, -16, 'Vaishnavi Signature'),
  announcement('Lift maintenance – Tower B', 'Lifts 3 and 4 were serviced over the weekend.', -14, -12, 'Prestige Central'),
];
export const nextAnnouncementNumber = () => announcementSeq++;

/** Admin events, dated around today so every status shows up. RSVPs are AdminUser ids (AU-21 is Ved). */
let adminEventSeq = 1;
const adminEvent = (
  title: string,
  description: string,
  o: { locationId: string; day: number; time: number; listed: number; capacity: number; images: string[]; by: [string, string]; created: number; rsvps?: string[]; rsvpRequired?: boolean; featured?: boolean; archived?: boolean },
): AdminEvent => ({
  id: `EV-${adminEventSeq}`,
  number: adminEventSeq++,
  title,
  description,
  capacity: o.capacity,
  locationId: o.locationId,
  date: shiftDate(o.day),
  time: o.time,
  listingDate: shiftDate(o.listed),
  rsvpRequired: o.rsvpRequired ?? true,
  featured: o.featured ?? false,
  images: o.images,
  archived: o.archived ?? false,
  createdBy: { id: o.by[0], name: o.by[1] },
  createdOn: shiftDate(o.created),
  rsvps: o.rsvps ?? [],
});
const VED: [string, string] = ['AU-21', 'Ved Acharya'];
const PRIYA: [string, string] = ['AU-23', 'Priya Sharma'];
export const adminEvents: AdminEvent[] = [
  adminEvent(
    'WeWork Mixer: Meet Your Neighbours',
    'Join us for an evening of networking and collaboration at WeWork Vaishnavi Signature. Connect with fellow professionals, share ideas, and forge valuable partnerships in a relaxed and inspiring atmosphere.',
    { locationId: 'loc-vaishnavi', day: 3, time: 18 * 60, listed: -4, capacity: 100, images: ['/admin/events/auditorium.jpg', '/home/bk-room-a.jpg', '/home/exp-main.jpg'], by: VED, created: -6, rsvps: ['AU-21', 'AU-22', 'AU-23', 'AU-25', 'AU-26', 'AU-27', 'AU-28', 'AU-29', 'AU-24'], featured: true },
  ),
  adminEvent(
    'Lunch & Learn: Designing with AI',
    'A hands-on session on bringing AI into everyday design work, with lunch from the café. Bring a laptop and a problem you are working on.',
    { locationId: 'loc-vaishnavi', day: 12, time: 13 * 60, listed: 4, capacity: 40, images: ['/home/exp-main.jpg'], by: PRIYA, created: -1 },
  ),
  adminEvent(
    'Coffee & Croissants',
    'Start the day with fresh coffee, croissants and your neighbours at the ground floor café.',
    { locationId: 'loc-galaxy', day: 1, time: 10 * 60, listed: -3, capacity: 60, images: ['/home/hero-photo.jpg'], by: VED, created: -5, rsvps: ['AU-22', 'AU-25', 'AU-27'], rsvpRequired: false },
  ),
  adminEvent(
    'Quarterly Town Hall',
    "Leadership shares the quarter's results and plans, followed by open questions. Remote dial-in details are in the calendar invite.",
    { locationId: 'loc-rmz-latitude', day: 2, time: 16 * 60 + 30, listed: -7, capacity: 200, images: ['/admin/events/auditorium.jpg'], by: PRIYA, created: -9, rsvps: ['AU-21', 'AU-23', 'AU-24', 'AU-29'], featured: true },
  ),
  adminEvent(
    'Diwali Celebration',
    'Sweets, music and rangoli on the terrace. Wear something festive!',
    { locationId: 'loc-vaishnavi', day: 20, time: 17 * 60, listed: 6, capacity: 150, images: ['/home/exp-t3.jpg'], by: VED, created: 0 },
  ),
  adminEvent(
    'Sunrise Yoga on the Terrace',
    'An easy-paced flow to start the week. Mats are provided; arrive five minutes early.',
    { locationId: 'loc-vaishnavi', day: -5, time: 8 * 60, listed: -12, capacity: 20, images: ['/home/exp-t4.jpg'], by: VED, created: -14, rsvps: ['AU-21', 'AU-26', 'AU-28'] },
  ),
  adminEvent(
    "Founders' Office Hours",
    'Book a slot with our partners for advice on fundraising, hiring and growth.',
    { locationId: 'loc-prestige-central', day: 6, time: 15 * 60, listed: -2, capacity: 8, images: ['/home/exp-t1.jpg'], by: PRIYA, created: -3, archived: true },
  ),
  adminEvent(
    'Weekend Brunch Social',
    'Brunch, board games and good company. Families welcome.',
    { locationId: 'loc-embassy-tv', day: -12, time: 11 * 60 + 30, listed: -20, capacity: 30, images: ['/home/exp-t3.jpg'], by: VED, created: -21, rsvps: ['AU-22', 'AU-27'], rsvpRequired: false },
  ),
];
export const nextAdminEventNumber = () => adminEventSeq++;

/**
 * WeWork buildings users can be tied to (Admin → Users → Associated locations / Co-Working). The
 * company (Google) has private offices in six of them, which are the only possible home locations.
 */
const LOCATIONS: Omit<WorkLocation, 'city' | 'code'>[] = [
  { id: 'loc-vaishnavi', name: 'WeWork Vaishnavi Signature', address: '36 Infantry Road, Tasker Town, Shivaji Nagar, Bengaluru, KA - 560001', privateOffice: true },
  { id: 'loc-prestige-central', name: 'WeWork Prestige Central', address: 'Prestige Central, Infantry Road, Shivaji Nagar, Bengaluru, KA - 560001', privateOffice: true },
  { id: 'loc-galaxy', name: 'WeWork Galaxy', address: '43 Residency Road, Shanthala Nagar, Ashok Nagar, Bengaluru, KA - 560025', privateOffice: false },
  { id: 'loc-embassy-tv', name: 'WeWork Embassy TechVillage', address: 'Outer Ring Road, Devarabeesanahalli, Bellandur, Bengaluru, KA - 560103', privateOffice: true },
  { id: 'loc-rmz-latitude', name: 'WeWork RMZ Latitude Commercial', address: 'Bellary Road, Hebbal, Bengaluru, KA - 560024', privateOffice: false },
  { id: 'loc-symbiosis', name: 'WeWork Salarpuria Symbiosis', address: 'Bannerghatta Main Road, Arekere, Bengaluru, KA - 560076', privateOffice: false },
  { id: 'loc-prestige-atlanta', name: 'WeWork Prestige Atlanta', address: '80 Feet Road, Koramangala 1A Block, Bengaluru, KA - 560034', privateOffice: false },
  { id: 'loc-prestige-cube', name: 'WeWork Prestige Cube', address: 'Hosur Road, Adugodi, Koramangala, Bengaluru, KA - 560030', privateOffice: false },
  { id: 'loc-golflinks', name: 'WeWork Embassy Golflinks', address: 'Intermediate Ring Road, Domlur, Bengaluru, KA - 560071', privateOffice: false },
  { id: 'loc-enam-sambhav', name: 'WeWork Enam Sambhav', address: 'C-20, G Block, Bandra Kurla Complex, Mumbai, MH - 400051', privateOffice: true },
  { id: 'loc-raheja-platinum', name: 'WeWork Raheja Platinum', address: 'Sag Baug Road, Marol, Andheri East, Mumbai, MH - 400059', privateOffice: false },
  { id: 'loc-oberoi-commerz', name: 'WeWork Oberoi Commerz II', address: 'Oberoi Garden City, Goregaon East, Mumbai, MH - 400063', privateOffice: false },
  { id: 'loc-vijay-diamond', name: 'WeWork Vijay Diamond', address: 'Cross Road B, MIDC, Andheri East, Mumbai, MH - 400093', privateOffice: false },
  { id: 'loc-dlf-forum', name: 'WeWork DLF Forum', address: 'Cyber City, DLF Phase III, Gurugram, HR - 122002', privateOffice: true },
  { id: 'loc-two-horizon', name: 'WeWork Two Horizon Center', address: 'Golf Course Road, DLF Phase 5, Gurugram, HR - 122002', privateOffice: false },
  { id: 'loc-blue-one', name: 'WeWork Blue One Square', address: 'Udyog Vihar Phase 4, Gurugram, HR - 122016', privateOffice: false },
  { id: 'loc-berger-delhi-one', name: 'WeWork Berger Delhi One', address: 'Sector 16B, Noida, UP - 201301', privateOffice: false },
  { id: 'loc-krishe-emerald', name: 'WeWork Krishe Emerald', address: 'Kondapur Main Road, HITEC City, Hyderabad, TS - 500081', privateOffice: true },
  { id: 'loc-rmz-spire', name: 'WeWork RMZ Spire', address: 'HITEC City, Madhapur, Hyderabad, TS - 500081', privateOffice: false },
  { id: 'loc-futura', name: 'WeWork Futura', address: 'Magarpatta Road, Kirtane Baugh, Hadapsar, Pune, MH - 411013', privateOffice: false },
  { id: 'loc-panchshil', name: 'WeWork Panchshil Business Park', address: 'Balewadi High Street, Baner, Pune, MH - 411045', privateOffice: false },
];
/** "…, Bengaluru, KA - 560001" → "Bengaluru". */
export const cityOf = (address: string) => {
  const parts = address.split(',').map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : '';
};
const CITY_CODE: Record<string, string> = { Bengaluru: 'BL', Mumbai: 'MM', Gurugram: 'GG', Noida: 'ND', Hyderabad: 'HY', Pune: 'PN' };
let locationSeq = 1201;
/** A building code: two letters for the city and a running number ("MM1210"). */
export const nextLocationCode = (city: string) =>
  `${CITY_CODE[city] ?? (city.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'WW')}${locationSeq++}`;
export const workLocations: WorkLocation[] = LOCATIONS.map((l) => {
  const city = cityOf(l.address);
  return { ...l, city, code: nextLocationCode(city) };
});
const ALL_LOCATION_IDS = workLocations.map((l) => l.id);
const BENGALURU_IDS = ALL_LOCATION_IDS.slice(0, 9);

/** The company structure for Admin → Users: Business Unit → Department → Team. Managers are AdminUser ids (AU-21 is Ved). */
export const businessUnits: BusinessUnit[] = [
  { id: 'bu-engineering', code: 'BU-1201', name: 'Engineering', status: 'active' },
  { id: 'bu-sales', code: 'BU-1202', name: 'Sales', status: 'active' },
  { id: 'bu-growth', code: 'BU-1203', name: 'Growth', status: 'active' },
  { id: 'bu-operations', code: 'BU-1204', name: 'Operations', status: 'active' },
  { id: 'bu-product', code: 'BU-1205', name: 'Product', status: 'active' },
  { id: 'bu-real-estate', code: 'BU-1206', name: 'Real Estate', status: 'inactive' },
];
export const departments: Department[] = [
  { id: 'dp-engineering', code: 'DP-1201', name: 'Engineering', businessUnitId: 'bu-engineering', status: 'active' },
  { id: 'dp-quality', code: 'DP-1202', name: 'Quality Assurance', businessUnitId: 'bu-engineering', status: 'active' },
  { id: 'dp-inside-sales', code: 'DP-1203', name: 'Inside Sales', businessUnitId: 'bu-sales', status: 'active' },
  { id: 'dp-sales', code: 'DP-1204', name: 'Sales', businessUnitId: 'bu-sales', status: 'active' },
  { id: 'dp-marketing', code: 'DP-1205', name: 'Marketing', businessUnitId: 'bu-growth', status: 'active' },
  { id: 'dp-finance', code: 'DP-1206', name: 'Finance', businessUnitId: 'bu-operations', status: 'active' },
  { id: 'dp-people', code: 'DP-1207', name: 'People', businessUnitId: 'bu-operations', status: 'active' },
  { id: 'dp-product', code: 'DP-1208', name: 'Product', businessUnitId: 'bu-product', status: 'active' },
  { id: 'dp-leasing', code: 'DP-1209', name: 'Leasing', businessUnitId: 'bu-real-estate', status: 'inactive' },
];
export const teams: Team[] = [
  { id: 'tm-asset', code: 'TM-1201', name: 'Asset management', departmentId: 'dp-engineering', status: 'active', managerId: 'AU-23' },
  { id: 'tm-platform', code: 'TM-1202', name: 'Platform', departmentId: 'dp-engineering', status: 'active', managerId: 'AU-24' },
  { id: 'tm-devops', code: 'TM-1203', name: 'DevOps', departmentId: 'dp-engineering', status: 'active' },
  { id: 'tm-qa', code: 'TM-1204', name: 'QA Automation', departmentId: 'dp-quality', status: 'active' },
  { id: 'tm-inside-sales', code: 'TM-1205', name: 'Inside Sales', departmentId: 'dp-inside-sales', status: 'active', managerId: 'AU-22' },
  { id: 'tm-enterprise', code: 'TM-1206', name: 'Enterprise Sales', departmentId: 'dp-sales', status: 'active', managerId: 'AU-25' },
  { id: 'tm-brand', code: 'TM-1207', name: 'Brand', departmentId: 'dp-marketing', status: 'active', managerId: 'AU-27' },
  { id: 'tm-performance', code: 'TM-1208', name: 'Performance Marketing', departmentId: 'dp-marketing', status: 'inactive' },
  { id: 'tm-payroll', code: 'TM-1209', name: 'Payroll', departmentId: 'dp-finance', status: 'active', managerId: 'AU-28' },
  { id: 'tm-people-ops', code: 'TM-1210', name: 'People Ops', departmentId: 'dp-people', status: 'active', managerId: 'AU-29' },
  { id: 'tm-product-design', code: 'TM-1211', name: 'Product Design', departmentId: 'dp-product', status: 'active', managerId: 'AU-21' },
];
let orgSeq = { 'business-units': 1207, departments: 1210, teams: 1212 };
/** The next #BU / #DP / #TM number for a new unit. */
export const nextOrgNumber = (kind: keyof typeof orgSeq) => orgSeq[kind]++;

/** Access follows seniority unless set otherwise. */
const ACCESS_BY_ROLE: Record<string, string> = { Employee: 'Level 1', Manager: 'Level 2', Admin: 'Level 3', 'Super Admin': 'Level 4' };

/** A printable key card code ("8932DHDNSNFN F&F") made from the user number, so it stays stable across restarts. */
const hotStamp = (n: number, salt: number) => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = String(1000 + ((n * 7919 + salt * 104729) % 9000));
  for (let i = 0, x = n * 31 + salt * 17; i < 8; i++, x = (x * 1103515245 + 12345) % 2147483648) code += letters[x % letters.length];
  return `${code} F&F`;
};

/** Details a new directory entry starts with, before an admin edits them. */
export const adminUserDefaults = (n: number, role: string, department: string, status: AdminUser['status']) => ({
  designation: `${role === 'Employee' ? 'Associate' : role}${department ? `, ${department}` : ''}`,
  phone: `+91 9${String(8000 + ((n * 37) % 2000)).padStart(4, '0')} ${String(10000 + ((n * 7331) % 90000))}`,
  accessLevel: ACCESS_BY_ROLE[role] ?? 'Level 1',
  homeLocationId: 'loc-vaishnavi',
  floor: 'Ground floor',
  associatedLocationIds: ['loc-vaishnavi', 'loc-prestige-central', 'loc-galaxy'],
  coworkingLocationIds: BENGALURU_IDS,
  keyCard: { leftHotStamp: hotStamp(n, 1), rightHotStamp: hotStamp(n, 2), status },
});

/** The company directory for Admin → Users: the members above plus a few colleagues. */
let adminUserSeq = 21;
const PO_ATLAS: MembershipTag[] = ['PO', 'ATLAS'];
const AA: MembershipTag[] = ['AA'];
const adminUser = (
  name: string,
  role: string,
  team: string,
  department: string,
  businessUnit: string,
  status: AdminUser['status'],
  membership: MembershipTag[],
  avatar?: string,
  details: Partial<AdminUser> = {},
): AdminUser => {
  const n = adminUserSeq++;
  return {
    id: `AU-${n}`,
    code: `WE-${String(n).padStart(6, '0')}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@wework.co.in`,
    role,
    team,
    department,
    businessUnit,
    status,
    membership,
    avatar,
    ...adminUserDefaults(n, role, department, status),
    ...details,
  };
};
export const adminUsers: AdminUser[] = [
  adminUser('Ved Acharya', 'Super Admin', 'Product Design', 'Product', 'Product', 'active', PO_ATLAS, 'user-1.png', {
    designation: 'Lead Product Designer',
    floor: '4th floor',
  }),
  adminUser('Aashray Maliel', 'Employee', '', 'Inside Sales', 'Sales', 'active', AA, 'user-4.png', {
    designation: 'Senior Associate, Inside Sales',
    phone: '+91 99999 77777',
    keyCard: { leftHotStamp: '8932DHDNSNFN F&F', rightHotStamp: '8932DHDNSNFN F&F', status: 'active' },
    coworkingLocationIds: ALL_LOCATION_IDS,
  }),
  adminUser('Priya Sharma', 'Employee', 'Asset management', 'Engineering', 'Engineering', 'active', PO_ATLAS, 'user-2.png', {
    homeLocationId: 'loc-embassy-tv',
    floor: '2nd floor',
    associatedLocationIds: ['loc-embassy-tv', 'loc-vaishnavi'],
  }),
  adminUser('Rahul Verma', 'Manager', 'Platform', 'Engineering', 'Engineering', 'inactive', PO_ATLAS),
  adminUser('Ananya Iyer', 'Employee', 'Enterprise Sales', 'Sales', 'Sales', 'active', AA, undefined, {
    homeLocationId: 'loc-enam-sambhav',
    floor: '6th floor',
    associatedLocationIds: ['loc-enam-sambhav', 'loc-raheja-platinum'],
    coworkingLocationIds: ALL_LOCATION_IDS.slice(9, 13),
  }),
  adminUser('Karan Mehta', 'Employee', 'Asset management', 'Engineering', 'Engineering', 'active', PO_ATLAS),
  adminUser('Sneha Reddy', 'Admin', 'Brand', 'Marketing', 'Growth', 'inactive', AA, 'user-3.png'),
  adminUser('Arjun Nair', 'Employee', 'Payroll', 'Finance', 'Operations', 'active', PO_ATLAS),
  adminUser('Meera Joshi', 'Manager', 'People Ops', 'People', 'Operations', 'active', AA, undefined, {
    homeLocationId: 'loc-krishe-emerald',
    floor: '3rd floor',
    associatedLocationIds: ['loc-krishe-emerald', 'loc-rmz-spire', 'loc-vaishnavi'],
    coworkingLocationIds: ALL_LOCATION_IDS,
  }),
];
export const nextAdminUserNumber = () => adminUserSeq++;

/**
 * My Bookings history around today: past, cancelled and upcoming bookings in every product line,
 * including a few that colleagues made with Ved in them ("Created For Me"). Bookings made through
 * Iris and the booking pages are added to these live.
 */
export interface BookingHistoryRecord {
  id: string;
  kind: MyBookingKind;
  title: string;
  location: string;
  tag: string;
  photo?: string;
  space: 'wework' | 'office';
  /** Days from today to the first day, and how many days it runs. */
  offset: number;
  days: number;
  start: number;
  end: number;
  allDay: boolean;
  credits?: number;
  cancelled: boolean;
  createdById: string;
  peopleIds: string[];
}

const DAY = { start: 9 * 60, end: 20 * 60, allDay: true };
const at = (fromHour: number, toHour: number) => ({ start: Math.round(fromHour * 60), end: Math.round(toHour * 60), allDay: false });
const room = (title: string, seats: number, photo: string) => ({ kind: 'meeting-room' as const, title, location: 'WeWork Vaishnavi Signature', tag: `${seats} Seats`, photo, space: 'wework' as const });
const SHARED = { kind: 'shared-desk' as const, title: 'Desk at Prestige Central', location: 'WeWork Prestige Central', tag: 'Shared Desk', photo: 'qs-2.jpg', space: 'wework' as const };
const officeDesk = (deskId: string) => ({ kind: 'office-desk' as const, title: `Desk ${deskId}`, location: 'Vaishnavi Signature', tag: 'Office Desk', photo: 'ft-photo.jpg', space: 'office' as const });
const TEAM = { kind: 'team-desks' as const, title: 'Team Desks at Office', location: 'Vaishnavi Signature', tag: 'Office Desk', space: 'office' as const };
const bpo = (office: string, photo: string) => ({ kind: 'private-office' as const, title: `BPO - Office - ${office}`, location: 'WeWork Vaishnavi Signature', tag: 'BPO', photo, space: 'wework' as const });
const ME = 'u-001';

let historySeq = 1001;
const history = (
  base: Pick<BookingHistoryRecord, 'kind' | 'title' | 'location' | 'tag' | 'space'> & { photo?: string },
  when: { start: number; end: number; allDay: boolean },
  offset: number,
  days: number,
  details: { credits?: number; cancelled?: boolean; by?: string; people?: string[] } = {},
): BookingHistoryRecord => ({
  id: `H-${historySeq++}`,
  ...base,
  ...when,
  offset,
  days,
  credits: details.credits,
  cancelled: details.cancelled ?? false,
  createdById: details.by ?? ME,
  peopleIds: details.people ?? [details.by ?? ME],
});

export const bookingHistory: BookingHistoryRecord[] = [
  // Meeting rooms
  history(room('Room 12 C', 6, 'mr-3.jpg'), at(16, 18), 3, 1, { credits: 4, people: [ME, 'u-002', 'u-005'] }),
  history(room('Boardroom', 12, 'mr-4c.jpg'), at(10, 12), -2, 1, { credits: 8, people: [ME, 'u-003', 'u-004', 'u-005', 'u-006', 'u-007', 'u-008'] }),
  history(room('Room 24 A', 8, 'mr-1.jpg'), at(15, 16), -2, 1, { credits: 2, cancelled: true, people: [ME, 'u-002', 'u-006', 'u-007', 'u-008'] }),
  history(room('Room 24 B', 4, 'mr-2.jpg'), at(11, 12), 6, 1, { credits: 1, by: 'u-002', people: ['u-002', ME, 'u-007'] }),
  history(room('Boardroom', 12, 'mr-4c.jpg'), at(14, 15.5), -33, 1, { credits: 6, people: [ME, 'u-003', 'u-004'] }),
  // Shared desks
  history(SHARED, DAY, 1, 1, { credits: 3 }),
  history(SHARED, DAY, 9, 2, { credits: 6 }),
  history(SHARED, DAY, -12, 2, { credits: 6 }),
  history(SHARED, DAY, -12, 2, { credits: 6, cancelled: true }),
  history(SHARED, DAY, -38, 1, { credits: 3 }),
  // Office desks: one person's desk, single or several days
  history(officeDesk('D27'), DAY, 4, 2),
  history(officeDesk('D18'), DAY, -20, 2, { cancelled: true }),
  // Office desks: several desks on one day (team desks)
  history(TEAM, DAY, 2, 1, { people: [ME, 'u-003', 'u-005', 'u-007'] }),
  history(TEAM, DAY, 5, 1, { by: 'u-008', people: ['u-008', ME, 'u-006'] }),
  history(TEAM, DAY, -9, 1, { people: [ME, 'u-002', 'u-004', 'u-006'] }),
  history(TEAM, DAY, -9, 1, { cancelled: true, people: [ME, 'u-003', 'u-005', 'u-008'] }),
  // Bookable private offices (BPO)
  history(bpo('120 - 125', 'po-office-120.jpg'), DAY, 7, 2, { credits: 28, people: [ME, 'u-002', 'u-004'] }),
  history(bpo('120 - 125', 'po-office-120.jpg'), DAY, -15, 1, { credits: 14, people: [ME, 'u-002', 'u-003', 'u-004', 'u-005', 'u-006'] }),
  history(bpo('310 - 316', 'qs-3.jpg'), DAY, -15, 1, { credits: 20, cancelled: true, people: [ME, 'u-003', 'u-005', 'u-007', 'u-008'] }),
  history(bpo('120 - 125', 'po-office-120.jpg'), DAY, -45, 1, { credits: 14, people: [ME, 'u-004'] }),
];

/**
 * Colleagues' bookings that don't involve Ved: only Admin → Company Bookings lists them, beside
 * everything in My Bookings, so the company view has the whole office's bookings.
 */
export const companyBookingHistory: BookingHistoryRecord[] = [
  history(room('Room 12 C', 6, 'mr-3.jpg'), at(10, 11), 1, 1, { credits: 2, by: 'u-003', people: ['u-003', 'u-004'] }),
  history(room('Boardroom', 12, 'mr-4c.jpg'), at(14, 16), 4, 1, { credits: 8, by: 'u-006', people: ['u-006', 'u-002', 'u-005', 'u-007'] }),
  history(room('Room 24 A', 8, 'mr-1.jpg'), at(9.5, 10.5), -3, 1, { credits: 2, by: 'u-005', people: ['u-005', 'u-008'] }),
  history(officeDesk('D12'), DAY, 1, 1, { by: 'u-004' }),
  history(officeDesk('D31'), DAY, 3, 3, { by: 'u-007' }),
  history(officeDesk('D08'), DAY, -6, 1, { by: 'u-002' }),
  history(officeDesk('D22'), DAY, 8, 1, { by: 'u-005', cancelled: true }),
  history(TEAM, DAY, 6, 1, { by: 'u-003', people: ['u-003', 'u-004', 'u-006', 'u-007', 'u-008'] }),
  history(SHARED, DAY, 2, 1, { credits: 3, by: 'u-006' }),
  history(bpo('310 - 316', 'qs-3.jpg'), DAY, 10, 1, { credits: 20, by: 'u-008', people: ['u-008', 'u-002', 'u-003', 'u-005', 'u-006'] }),
];

/** The record's days as date keys, counted from today. */
export const historyDates = (r: BookingHistoryRecord) => Array.from({ length: r.days }, (_, i) => shiftDate(r.offset + i));


// ---------- Admin → Spaces ----------
/** What the Building tab knows about each building beyond its work location. */
const BUILDING_FACTS: Record<string, Pick<AdminBuilding, 'city' | 'state' | 'area' | 'timeZone' | 'floors' | 'leasedArea'>> = {
  'loc-vaishnavi': { city: 'Bengaluru', state: 'Karnataka', area: 'Shivaji Nagar', timeZone: 'Asia/Kolkata', floors: 10, leasedArea: 16600 },
  'loc-prestige-central': { city: 'Bengaluru', state: 'Karnataka', area: 'Shivaji Nagar', timeZone: 'Asia/Kolkata', floors: 8, leasedArea: 36600 },
  'loc-embassy-tv': { city: 'Bengaluru', state: 'Karnataka', area: 'Bellandur', timeZone: 'Asia/Kolkata', floors: 12, leasedArea: 42000 },
  'loc-enam-sambhav': { city: 'Mumbai', state: 'Maharashtra', area: 'Bandra Kurla Complex', timeZone: 'Asia/Kolkata', floors: 9, leasedArea: 28400 },
  'loc-dlf-forum': { city: 'Gurugram', state: 'Haryana', area: 'DLF Phase III', timeZone: 'Asia/Kolkata', floors: 7, leasedArea: 21800 },
  'loc-krishe-emerald': { city: 'Hyderabad', state: 'Telangana', area: 'HITEC City', timeZone: 'Asia/Kolkata', floors: 11, leasedArea: 18500 },
};

/** The buildings where the company has private offices, in work-location order. */
export const adminBuildings: AdminBuilding[] = workLocations
  .filter((l) => l.privateOffice)
  .map((l, i) => ({ id: l.id, number: i + 1, name: l.name, address: l.address, ...BUILDING_FACTS[l.id], status: 'active' }));
let buildingSeq = adminBuildings.length + 1;
export const nextBuildingNumber = () => buildingSeq++;

/** A new space's booking settings: no limits, no instructions, not restricted. */
export const defaultSpaceBooking = (): SpaceBookingSettings => ({
  multiDayLimit: 0,
  futureLimitDays: 0,
  instructions: '',
  restricted: false,
  restrictFrom: '',
  restrictUntil: '',
  restrictDays: [],
});

const space = (
  number: number,
  buildingId: string,
  floor: number,
  officeNo: string,
  capacity: number,
  leasedArea: number,
  floorId: string,
  more: Partial<AdminSpace> = {},
): AdminSpace => ({
  id: `sp-${number}`,
  number,
  buildingId,
  floor,
  officeNo,
  capacity,
  leasedArea,
  floorId,
  floorMap: null,
  status: 'active',
  ...more,
  booking: { ...defaultSpaceBooking(), ...more.booking },
});

/** The company's spaces. The first is the floor members book from, with its seats, zones and shifts. */
export const adminSpaces: AdminSpace[] = [
  space(21, 'loc-vaishnavi', 2, '120 - 140', 64, 2500, '8bff5190-6c13-46b7-a594-f45d2ae9fb13', {
    seatMapId: 'floor-2',
    floorMap: { name: 'Vaishnavi-2nd-floor.png', size: 2_418_000, url: '/floorplan.png' },
    booking: {
      ...defaultSpaceBooking(),
      multiDayLimit: 5,
      futureLimitDays: 30,
      instructions: ['Book at least 1 day before you arrive.', 'Bookings need an admin’s approval.', 'Book only on the office days assigned to you.'].join('\n'),
    },
  }),
  space(22, 'loc-vaishnavi', 6, '022 - 026', 120, 2500, '2f6c1d84-93ab-4f0e-b7d2-6a1e5c90d3f7', {
    booking: {
      ...defaultSpaceBooking(),
      instructions: 'Book at least 1 day before you arrive.\nBookings need an admin’s approval.',
      restricted: true,
      restrictFrom: shiftDate(0),
      restrictUntil: shiftDate(31),
      restrictDays: [0, 2, 4],
    },
  }),
  space(23, 'loc-prestige-central', 4, '401 - 412', 80, 3200, 'c41e7a2b-58d0-4c6f-9e13-0b7d2f8a6c55'),
  space(24, 'loc-embassy-tv', 3, '310 - 318', 160, 6400, '7d93b0e6-1f2a-4c85-a6d4-3e9f0b1c2a77', {
    booking: { ...defaultSpaceBooking(), futureLimitDays: 14 },
  }),
  space(25, 'loc-embassy-tv', 5, '', 96, 4000, 'e0b5c3a9-6d71-4b2e-8f40-5a9c1d7e3b20'),
  space(26, 'loc-enam-sambhav', 8, '801 - 806', 64, 2800, '5a2f9e1c-0b84-4d37-9c6e-71f3a8d0b4e9'),
  space(27, 'loc-dlf-forum', 5, '502 - 510', 110, 4600, '93c7d1f0-2e5b-4a68-b1d9-c4e07a6f285d'),
  space(28, 'loc-krishe-emerald', 2, '', 40, 1600, 'b6e4a0d2-7c19-4f53-8a2e-0d5b9c3f1e64', { status: 'inactive' }),
];
let spaceSeq = 29;
export const nextSpaceNumber = () => spaceSeq++;

/** Admin → Spaces → Space types. */
export const spaceTypes: SpaceType[] = [
  { id: 'st-1', number: 1, name: 'Desk & Chair', booking: 'full-day' },
  { id: 'st-2', number: 2, name: 'Desk, Chair with 1 Monitor', booking: 'full-day' },
  { id: 'st-3', number: 3, name: 'Meeting Rooms', booking: 'time-duration' },
  { id: 'st-4', number: 4, name: 'Cabins', booking: 'full-day' },
  { id: 'st-5', number: 5, name: 'Phone booth', booking: 'time-duration' },
];
let spaceTypeSeq = spaceTypes.length + 1;
export const nextSpaceTypeNumber = () => spaceTypeSeq++;

// ---------- Admin → Roles ----------
/** Every permission a role can have, by group: the services members use, then the admin areas. */
export const WORKSPACE_PERMISSIONS = [
  'meeting-rooms',
  'private-offices',
  'sit-anywhere',
  'desk-selection',
  'all-zones',
  'shared-desks',
  'shared-meeting-rooms',
  'shared-private-offices',
];
export const SYSTEM_PERMISSIONS = [
  'company-settings',
  'user-settings',
  'space-settings',
  'group-bookings',
  'help-support',
  'announcements',
  'guests',
  'print-hub',
  'analytics',
  'reports',
  'company-bookings',
];
const ALL_PERMISSIONS = [...WORKSPACE_PERMISSIONS, ...SYSTEM_PERMISSIONS];
const without = (...keys: string[]) => ALL_PERMISSIONS.filter((k) => !keys.includes(k));

/** The roles users hold (AdminUser.role is the role's name). */
export const adminRoles: AdminRole[] = [
  { id: 'RL-1', number: 1, name: 'Super Admin', description: 'Full access to every service and admin setting', status: 'active', permissions: ALL_PERMISSIONS },
  { id: 'RL-2', number: 2, name: 'Admin', description: 'Runs the workplace day to day, without company settings', status: 'active', permissions: without('company-settings') },
  {
    id: 'RL-3',
    number: 3,
    name: 'Manager',
    description: 'Books for their team and sees how the office is used',
    status: 'active',
    permissions: without('company-settings', 'user-settings', 'space-settings', 'company-bookings'),
  },
  {
    id: 'RL-4',
    number: 4,
    name: 'Employee',
    description: 'Books desks, rooms and offices for themselves',
    status: 'active',
    permissions: ['meeting-rooms', 'private-offices', 'sit-anywhere', 'desk-selection', 'shared-desks', 'help-support', 'announcements', 'guests', 'print-hub'],
  },
  {
    id: 'RL-5',
    number: 5,
    name: 'Executive',
    description: 'Leadership: books anywhere and sees the reports',
    status: 'inactive',
    permissions: without('company-settings', 'user-settings', 'space-settings', 'company-bookings'),
  },
];
let roleSeq = adminRoles.length + 1;
export const nextRoleNumber = () => roleSeq++;

// ---------- Admin → Credits ----------
/** This 30-day billing cycle: the allotment is used up, so bookings are drawing on overage. */
export const creditCycle = {
  /** Ten days ago, so twenty are left. */
  cycleStart: shiftDate(-10),
  cycleDays: 30,
  allotment: 600,
  allotmentUsed: 600,
  avgMonthlyUsage: 702,
};
/** Off to start: overage is unlimited until an admin caps it. The limits wait for it to be turned on. */
export const overageSettings: OverageSettings = { enabled: false, limit: 400 };
/** Each active team's overage this cycle; a limit carves its share out of the company pool. */
export const teamOverage: TeamOverage[] = [
  { teamId: 'tm-asset', used: 10, limit: null },
  { teamId: 'tm-platform', used: 28, limit: 60 },
  { teamId: 'tm-devops', used: 22, limit: 40 },
  { teamId: 'tm-qa', used: 6, limit: null },
  { teamId: 'tm-inside-sales', used: 31, limit: 50 },
  { teamId: 'tm-enterprise', used: 12, limit: null },
  { teamId: 'tm-brand', used: 9, limit: 30 },
  { teamId: 'tm-payroll', used: 4, limit: null },
  { teamId: 'tm-people-ops', used: 0, limit: null },
  { teamId: 'tm-product-design', used: 10, limit: 40 },
];

/** Admin → Company Settings: the company's profile, every workspace service on to start. */
export const companySettings: CompanySettings = {
  name: 'Google',
  domain: 'google.com',
  services: Object.fromEntries(WORKSPACE_PERMISSIONS.map((k) => [k, true])),
  licences: { PO: 50, ATLAS: 50 },
};

// ---------- Admin → Access Control ----------
/** Company office buildings, in the given cities or everywhere. */
const officeIds = (...cities: string[]) => workLocations.filter((l) => l.privateOffice && (!cities.length || cities.includes(l.city))).map((l) => l.id);
/** WeWork buildings to co-work from, in the given cities or everywhere. */
const coworkingIds = (...cities: string[]) => workLocations.filter((l) => !cities.length || cities.includes(l.city)).map((l) => l.id);

/** The access levels users hold (AdminUser.accessLevel is the level's name). Seniority picks the usual one. */
export const adminAccessLevels: AdminAccessLevel[] = [
  {
    id: 'AL-1',
    number: 1,
    name: 'Level 1',
    description: 'Employees: the two Shivaji Nagar offices, and co-working anywhere in Bengaluru',
    status: 'active',
    officeLocationIds: ['loc-vaishnavi', 'loc-prestige-central'],
    coworkingLocationIds: coworkingIds('Bengaluru'),
    globalAccess: false,
  },
  {
    id: 'AL-2',
    number: 2,
    name: 'Level 2',
    description: 'Managers: the Bengaluru and Mumbai offices, and co-working in both cities',
    status: 'active',
    officeLocationIds: officeIds('Bengaluru', 'Mumbai'),
    coworkingLocationIds: coworkingIds('Bengaluru', 'Mumbai'),
    globalAccess: false,
  },
  {
    id: 'AL-3',
    number: 3,
    name: 'Level 3',
    description: 'Admins: every company office, and co-working anywhere in India',
    status: 'active',
    officeLocationIds: officeIds(),
    coworkingLocationIds: coworkingIds(),
    globalAccess: false,
  },
  {
    id: 'AL-4',
    number: 4,
    name: 'Level 4',
    description: 'Super admins: every office and every WeWork centre, in India and abroad',
    status: 'active',
    officeLocationIds: officeIds(),
    coworkingLocationIds: coworkingIds(),
    globalAccess: true,
  },
  {
    id: 'AL-5',
    number: 5,
    name: 'Contractor',
    description: 'Vendors on short contracts: co-working at two Bengaluru centres, no company offices',
    status: 'inactive',
    officeLocationIds: [],
    coworkingLocationIds: ['loc-galaxy', 'loc-rmz-latitude'],
    globalAccess: false,
  },
];
let accessLevelSeq = adminAccessLevels.length + 1;
export const nextAccessLevelNumber = () => accessLevelSeq++;
