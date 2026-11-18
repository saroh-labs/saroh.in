/**
 * Everything Saroh asks of Google for Calendar sync and Meet links (#1047,
 * #1048): the consent, tokens, calendars, free/busy, events and a Meet
 * space's access. One port, so the jobs and the connect flow run on the
 * real client (`google-calendar.client.ts`) or, in tests, the fake
 * (`fake-google-calendar.ts`).
 *
 * Calls take an access token, never a refresh token: the caller refreshes
 * once per job and keeps the access token in memory.
 */

/** The DI token for the port, or null when Google isn't set up here. */
export const GOOGLE_CALENDAR = Symbol("GOOGLE_CALENDAR");

/**
 * The scopes the calendar connection asks for. `openid email` names the
 * Google account the connection reaches; the four calendar and Meet scopes
 * are the narrowest that do the job (no restricted scope, so no security
 * assessment).
 */
export const SCOPES = {
    events: "https://www.googleapis.com/auth/calendar.events.owned",
    calendars: "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    freeBusy: "https://www.googleapis.com/auth/calendar.freebusy",
    meet: "https://www.googleapis.com/auth/meetings.space.settings",
} as const;

export const CONSENT_SCOPES: readonly string[] = [
    "openid",
    "email",
    SCOPES.events,
    SCOPES.calendars,
    SCOPES.freeBusy,
    SCOPES.meet,
];

/** What a grant lets Saroh do, scope by scope. */
export interface GrantedParts {
    /** Put bookings on their calendar. */
    events: boolean;
    /** Read busy times. */
    freeBusy: boolean;
    /** List their calendars to choose from. */
    calendars: boolean;
    /** Tighten who may join a Meet without knocking. */
    meet: boolean;
}

export function grantedParts(scopes: readonly string[]): GrantedParts {
    const has = new Set(scopes);
    return {
        events: has.has(SCOPES.events),
        freeBusy: has.has(SCOPES.freeBusy),
        calendars: has.has(SCOPES.calendars),
        meet: has.has(SCOPES.meet),
    };
}

/** Whether a grant left out any part Saroh asked for. */
export const isPartial = (scopes: readonly string[]): boolean =>
    Object.values(grantedParts(scopes)).some((granted) => !granted);

/**
 * What went wrong, as the jobs act on it:
 * - `lapsed`: Google refused the refresh token (`invalid_grant`): revoked,
 *   unused for six months, testing mode's 7 days, or a Workspace limit.
 *   Reconnect.
 * - `retry`: a rate limit (429, or 403 for a rate), Google's own error
 *   (5xx), a dropped connection or a timeout. Try again later.
 * - `gone`: the event (or space) isn't there (404, 410).
 * - `refused`: anything else Google answered no to (403 for access, 400).
 */
export type GoogleErrorKind = "lapsed" | "retry" | "gone" | "refused";

export class GoogleCalendarError extends Error {
    constructor(
        readonly kind: GoogleErrorKind,
        /** Words for logs and `lastError`: a status and Google's reason, never a token or an email. */
        readonly detail: string,
    ) {
        super(`Google ${kind}: ${detail}`);
        this.name = "GoogleCalendarError";
    }
}

export const isGoogleError = (
    error: unknown,
    kind?: GoogleErrorKind,
): error is GoogleCalendarError =>
    error instanceof GoogleCalendarError && (!kind || error.kind === kind);

export interface ConsentInput {
    redirectUri: string;
    state: string;
    /** The person's email, to preselect their Google account. */
    loginHint?: string;
}

export interface Grant {
    refreshToken: string;
    accessToken: string;
    /** What Google granted; a person may untick scopes at consent. */
    scopes: string[];
    /** The Google account, from the ID token. */
    email: string;
}

export interface GoogleCalendarEntry {
    id: string;
    name: string;
    primary: boolean;
    /** Whether Saroh may put events on it: the person owns it. */
    canWrite: boolean;
}

export interface BusyInterval {
    startAt: Date;
    endAt: Date;
}

/** An event as Saroh writes it: a plain default (R7). */
export interface EventInput {
    /** Google's own id for it, chosen by Saroh so a retry can't make two. */
    eventId: string;
    title: string;
    description: string;
    location?: string;
    startAt: Date;
    endAt: Date;
    timeZone: string;
    /** The customer, invited when they have an email (R6). */
    guest?: { email: string; name?: string };
    /** Saroh's booking id, kept privately on the event. */
    bookingId: string;
    /** Ask Google for a Meet link, with this request id (unique per event). */
    meetRequestId?: string;
}

export interface EventResult {
    eventId: string;
    /** The Meet link, once Google has made it. */
    meetUrl: string | null;
    /** The Meet code (`abc-defg-hij`), for the Meet API. */
    meetCode: string | null;
    /** A Meet link was asked for and Google is still making it. */
    meetPending: boolean;
}

/** Who may join a Meet without knocking (Meet API `accessType`). */
export type MeetAccess = "OPEN" | "TRUSTED" | "RESTRICTED";

export interface MeetSpace {
    /** `spaces/<id>`: the name the Meet API changes it by. */
    name: string;
    access: MeetAccess | null;
}

export interface GoogleCalendarPort {
    consentUrl(input: ConsentInput): string;
    exchangeCode(code: string, redirectUri: string): Promise<Grant>;
    /** A fresh access token. `lapsed` when Google refuses the refresh token. */
    refresh(refreshToken: string): Promise<string>;
    /** Revoke the grant at Google. A token already gone counts as done. */
    revoke(token: string): Promise<void>;
    listCalendars(accessToken: string): Promise<GoogleCalendarEntry[]>;
    /** Busy times over `[from, to)` on these calendars, merged. */
    freeBusy(
        accessToken: string,
        calendarIds: readonly string[],
        from: Date,
        to: Date,
    ): Promise<BusyInterval[]>;
    /**
     * Make the event, or, when one with its id is there already (a retry,
     * or one cancelled earlier), bring it back up to date.
     */
    putEvent(
        accessToken: string,
        calendarId: string,
        event: EventInput,
    ): Promise<EventResult>;
    /** Delete it, emailing the guest. Already gone counts as done. */
    deleteEvent(
        accessToken: string,
        calendarId: string,
        eventId: string,
    ): Promise<void>;
    getEvent(
        accessToken: string,
        calendarId: string,
        eventId: string,
    ): Promise<EventResult>;
    getMeetSpace(accessToken: string, meetCode: string): Promise<MeetSpace>;
    setMeetAccess(
        accessToken: string,
        spaceName: string,
        access: MeetAccess,
    ): Promise<void>;
}
