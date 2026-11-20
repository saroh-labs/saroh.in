/**
 * Google Calendar (#1047, DEC-233) as the API's
 * `organizations/:org/calendar/google` answers it
 * (`apps/api.saroh.in/src/modules/calendar-sync/dto.ts`). Shapes only: the
 * API decides who may connect, what the plan allows and what Google did.
 */

/** Who may join a Meet without knocking: Meet's `accessType`. */
export type MeetAccess = "RESTRICTED" | "TRUSTED" | "OPEN";
export const MEET_ACCESS: readonly MeetAccess[] = [
    "RESTRICTED",
    "TRUSTED",
    "OPEN",
];

/** Why a connection is kept but not syncing. */
export type PauseReason = "off" | "plan" | "permission" | "diary";

export interface GrantedParts {
    events: boolean;
    freeBusy: boolean;
    calendars: boolean;
    meet: boolean;
}

export interface ChosenCalendar {
    id: string;
    name: string;
    writeTo: boolean;
    checkBusy: boolean;
}

export interface CalendarAccount {
    id: string;
    googleEmail: string;
    state: "CONNECTED" | "LAPSED" | "PAUSED";
    calendars: ChosenCalendar[];
    granted: GrantedParts;
    busyRefreshedAt: string | null;
    /** Busy times are older than two hours. */
    behind: boolean;
}

export interface CalendarStatus {
    state: "NOT_CONNECTED" | "CONNECTED" | "LAPSED" | "PAUSED";
    pausedBecause: PauseReason | null;
    accounts: CalendarAccount[];
    bookingsGoTo: {
        accountId: string;
        googleEmail: string;
        calendarId: string;
        name: string;
    } | null;
    /** How many Google accounts this person may connect; null: no cap. */
    accountsAllowed: number | null;
    /** The business's default for who may join a Meet. */
    meetAccess: MeetAccess;
}

export interface DisconnectResult extends CalendarStatus {
    kept: { upcomingEvents: number; message: string };
}

export interface GoogleCalendarOption {
    id: string;
    name: string;
    primary: boolean;
    canWrite: boolean;
}

export interface CalendarMember {
    membershipId: string;
    staffId: string | null;
    name: string;
    accounts: {
        id: string;
        googleEmail: string;
        state: "CONNECTED" | "LAPSED";
    }[];
    bookingsGoToGoogle: boolean;
    pausedBecause: PauseReason | null;
}

export interface MoveBookingsResult {
    moving: number;
    message: string;
}

export interface BookingMeeting {
    meetingLink: "GOOGLE_MEET" | "MANUAL" | null;
    meetingUrl: string | null;
    meetAccess: {
        own: MeetAccess | null;
        chosen: MeetAccess;
        applied: MeetAccess | null;
    };
    google: "READY" | "PENDING" | "NOT_CONNECTED" | "NONE";
    googleEvent: {
        googleEmail: string | null;
        connected: boolean;
        outOfDate: boolean;
        message: string | null;
    } | null;
}

/** What a reassign answers about Google (DEC-233). */
export interface ReassignCalendarNote {
    event: "MOVES" | "REMOVED";
    newMeetLink: boolean;
    /** Its old event is on an account Saroh no longer reaches: it stays, not updated. */
    oldEventLeft: boolean;
    message: string;
}

/**
 * Google Calendar for this person here, as the settings page and every
 * Meet control read it:
 * - `off`: not rolled out to the business (the API's 404). Nothing is drawn.
 * - `denied`: their role doesn't reach it (a 403 that isn't the plan).
 * - `off-diary`: Google Calendar is on, but they aren't on the diary.
 * - `plan`: the plan leaves it out (`MODULE_LOCKED`), with the way up.
 * - `unavailable`: Google isn't set up on this server (503).
 * - `failed`: it couldn't be asked.
 * - `ready`: the person's own Google Calendar, connected or not.
 */
export type CalendarRead =
    | { kind: "off" }
    | { kind: "denied" }
    /** They take no bookings here (`NOT_ON_DIARY`): nothing of theirs to connect. */
    | { kind: "off-diary"; message: string }
    | { kind: "plan"; upgradeTo: { planId: string; name: string } | null }
    | { kind: "unavailable"; message: string }
    | { kind: "failed" }
    | { kind: "ready"; status: CalendarStatus };

/** Google Meet's part in a service's Where (DEC-233). */
export interface MeetSetup {
    /** The business's own "Who can join", for a service with none. */
    businessDefault: MeetAccess;
}
