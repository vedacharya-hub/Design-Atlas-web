import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Booking, Member, RecurrenceRule } from '../../api/types';

export interface Filters {
  building: string;
  floorId: string;
  officeNo: string;
  shift: string;
}

export type BookingMode = 'self' | 'others';
export type SeatSelectionType = 'random' | 'specific';

export interface BookingState {
  mode: BookingMode;
  step: 1 | 2;
  date: Date;
  recurring: boolean;
  recurrence: RecurrenceRule;
  seatSelectionType: SeatSelectionType;
  currentUser: Member | null;
  selectedMembers: Member[]; // current user is always index 0
  assignments: Record<string, string | null>; // memberId -> seatId
  activeMemberId: string | null; // seat clicks on the map target this member
  filters: Filters;
  status: 'idle' | 'submitting' | 'confirmed' | 'error';
  error?: string;
  confirmation?: Booking;
}

function defaultRecurrence(): RecurrenceRule {
  const end = new Date();
  end.setMonth(end.getMonth() + 1);
  return {
    frequency: 'weekly',
    daysOfWeek: [(new Date().getDay() + 6) % 7],
    endDate: end.toISOString().slice(0, 10),
  };
}

export const initialState: BookingState = {
  mode: 'self',
  step: 1,
  date: new Date(),
  recurring: false,
  recurrence: defaultRecurrence(),
  seatSelectionType: 'specific',
  currentUser: null,
  selectedMembers: [],
  assignments: {},
  activeMemberId: null,
  filters: { building: '', floorId: '', officeNo: '', shift: '' },
  status: 'idle',
};

export type Action =
  | { type: 'INIT'; currentUser: Member; filters: Filters }
  | { type: 'SET_FILTER'; key: keyof Filters; value: string }
  | { type: 'SET_MODE'; mode: BookingMode }
  | { type: 'SET_DATE'; date: Date }
  | { type: 'TOGGLE_RECURRING'; value: boolean }
  | { type: 'SET_RECURRENCE'; rule: RecurrenceRule }
  | { type: 'SET_SEAT_TYPE'; value: SeatSelectionType }
  | { type: 'ADD_MEMBER'; member: Member }
  | { type: 'REMOVE_MEMBER'; memberId: string }
  | { type: 'SET_ACTIVE_MEMBER'; memberId: string | null }
  | { type: 'ASSIGN_SEAT'; seatId: string }
  | { type: 'CLEAR_SEAT'; memberId: string }
  | { type: 'GOTO_STEP'; step: 1 | 2 }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; booking: Booking }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'RESET' };

export function reducer(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        currentUser: action.currentUser,
        selectedMembers: [action.currentUser],
        assignments: { [action.currentUser.id]: null },
        activeMemberId: action.currentUser.id,
        filters: action.filters,
      };

    case 'SET_FILTER':
      return { ...state, filters: { ...state.filters, [action.key]: action.value } };

    case 'SET_MODE': {
      // Others is disabled while recurring is on (recurring = single person).
      if (action.mode === 'others' && state.recurring) return state;
      return { ...state, mode: action.mode, step: 1 };
    }

    case 'SET_DATE':
      return { ...state, date: action.date };

    case 'TOGGLE_RECURRING': {
      if (!action.value) return { ...state, recurring: false };
      // Turning recurring ON forces single-occupant → self mode, only current user.
      const cu = state.currentUser;
      return {
        ...state,
        recurring: true,
        mode: 'self',
        selectedMembers: cu ? [cu] : [],
        assignments: cu ? { [cu.id]: state.assignments[cu.id] ?? null } : {},
        activeMemberId: cu?.id ?? null,
      };
    }

    case 'SET_RECURRENCE':
      return { ...state, recurrence: action.rule };

    case 'SET_SEAT_TYPE':
      return { ...state, seatSelectionType: action.value };

    case 'ADD_MEMBER': {
      if (state.selectedMembers.some((m) => m.id === action.member.id)) return state;
      return {
        ...state,
        selectedMembers: [...state.selectedMembers, action.member],
        assignments: { ...state.assignments, [action.member.id]: null },
        activeMemberId: action.member.id,
      };
    }

    case 'REMOVE_MEMBER': {
      if (state.currentUser && action.memberId === state.currentUser.id) return state; // can't remove self
      const selectedMembers = state.selectedMembers.filter((m) => m.id !== action.memberId);
      const assignments = { ...state.assignments };
      delete assignments[action.memberId];
      return {
        ...state,
        selectedMembers,
        assignments,
        activeMemberId: state.activeMemberId === action.memberId ? selectedMembers[0]?.id ?? null : state.activeMemberId,
      };
    }

    case 'SET_ACTIVE_MEMBER':
      return { ...state, activeMemberId: action.memberId };

    case 'ASSIGN_SEAT': {
      // In self mode the target is the current user; in others it's the active member.
      const target = state.mode === 'self' ? state.currentUser?.id : state.activeMemberId;
      if (!target) return state;
      // Prevent assigning the same seat to two people.
      const assignments = { ...state.assignments };
      for (const [mid, sid] of Object.entries(assignments)) {
        if (sid === action.seatId && mid !== target) assignments[mid] = null;
      }
      assignments[target] = action.seatId;
      // Auto-advance active member to the next unassigned one (others mode).
      let activeMemberId = state.activeMemberId;
      if (state.mode === 'others') {
        const next = state.selectedMembers.find((m) => !assignments[m.id]);
        activeMemberId = next?.id ?? target;
      }
      return { ...state, assignments, activeMemberId };
    }

    case 'CLEAR_SEAT':
      return { ...state, assignments: { ...state.assignments, [action.memberId]: null } };

    case 'GOTO_STEP':
      return { ...state, step: action.step };

    case 'SUBMIT_START':
      return { ...state, status: 'submitting', error: undefined };

    case 'SUBMIT_SUCCESS':
      return { ...state, status: 'confirmed', confirmation: action.booking };

    case 'SUBMIT_ERROR':
      return { ...state, status: 'error', error: action.error };

    case 'RESET':
      return {
        ...initialState,
        currentUser: state.currentUser,
        filters: state.filters,
        selectedMembers: state.currentUser ? [state.currentUser] : [],
        assignments: state.currentUser ? { [state.currentUser.id]: null } : {},
        activeMemberId: state.currentUser?.id ?? null,
        date: state.date,
      };

    default:
      return state;
  }
}

const Ctx = createContext<{ state: BookingState; dispatch: Dispatch<Action> } | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useBooking() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBooking must be used within BookingProvider');
  return ctx;
}

/** Derived helpers. */
export function assignedSeatIds(state: BookingState): string[] {
  return Object.values(state.assignments).filter((s): s is string => !!s);
}

export function allMembersSeated(state: BookingState): boolean {
  return state.selectedMembers.length > 0 && state.selectedMembers.every((m) => !!state.assignments[m.id]);
}
