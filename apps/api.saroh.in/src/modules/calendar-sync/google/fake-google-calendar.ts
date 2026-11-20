import type {
    BusyEvent,
    BusyInterval,
    ConsentInput,
    EventInput,
    EventResult,
    GoogleCalendarEntry,
    GoogleCalendarPort,
    GoogleErrorKind,
    Grant,
    MeetAccess,
    MeetSpace,
} from "./google-calendar.port";
import { GoogleCalendarError, SCOPES } from "./google-calendar.port";

type Op = keyof GoogleCalendarPort;

export interface FakeEvent {
    calendarId: string;
    input: EventInput;
    status: "confirmed" | "cancelled";
    meetCode: string | null;
    /** Its last write (made, updated or deleted) emailed nobody. */
    quiet?: boolean;
}

/**
 * Google in memory, for the jobs' tests and the test-only
 * `GOOGLE_CALENDAR_FAKE` (never a deployed API). It keeps events, busy
 * times and Meet spaces, and can be told to fail an operation, to answer
 * a Meet link as pending for a while, or to refuse to tighten a Meet (a
 * personal Gmail host). Several Google accounts: each grant's tokens name
 * the account (`grantEmail` at the exchange), and `accountCalendars` gives
 * an account calendars of its own.
 */
export class FakeGoogleCalendar implements GoogleCalendarPort {
    /** Calendar id → events by id. */
    readonly events = new Map<string, Map<string, FakeEvent>>();
    /** Other events on a calendar that count as busy (made by the person, or accepted). */
    readonly busy = new Map<string, BusyInterval[]>();
    /** Calendars the person doesn't own: the events read is refused there. */
    readonly notOwned = new Set<string>();
    readonly spaces = new Map<string, MeetAccess>();
    readonly revoked: string[] = [];
    readonly calls: Op[] = [];
    calendars: GoogleCalendarEntry[] = [
        { id: "primary-cal", name: "Meera", primary: true, canWrite: true },
        { id: "family-cal", name: "Family", primary: false, canWrite: true },
    ];
    /** What the next exchange grants. */
    grantScopes: string[] = Object.values(SCOPES);
    grantEmail = "meera@example.com";
    /** How many reads of a new event still answer the Meet link as pending. */
    meetPendingReads = 0;
    /** Refuse RESTRICTED, as a personal Gmail host's Meet does. */
    personalAccount = false;
    /** An account's own calendars, by its email; else `calendars`. */
    readonly accountCalendars = new Map<string, GoogleCalendarEntry[]>();

    private readonly failures = new Map<Op, GoogleErrorKind[]>();
    private readonly pending = new Map<string, number>();

    /** Fail the next call of `op` with `kind` (queue several to fail several). */
    failNext(op: Op, kind: GoogleErrorKind, times = 1): this {
        const queue = this.failures.get(op) ?? [];
        for (let i = 0; i < times; i++) queue.push(kind);
        this.failures.set(op, queue);
        return this;
    }

    /** Every live event, across calendars. */
    liveEvents(): FakeEvent[] {
        return [...this.events.values()]
            .flatMap((m) => [...m.values()])
            .filter((e) => e.status === "confirmed");
    }

    consentUrl(input: ConsentInput): string {
        const url = new URL("https://accounts.example.com/consent");
        url.searchParams.set("redirect_uri", input.redirectUri);
        url.searchParams.set("state", input.state);
        return url.toString();
    }

    exchangeCode(code: string): Promise<Grant> {
        return this.answer("exchangeCode", () => {
            return {
                refreshToken: `refresh-${code}|${this.grantEmail}`,
                accessToken: `access|${this.grantEmail}`,
                scopes: [...this.grantScopes],
                email: this.grantEmail,
            };
        });
    }

    refresh(refreshToken: string): Promise<string> {
        return this.answer("refresh", () => {
            return `access|${refreshToken.split("|")[1] ?? ""}`;
        });
    }

    revoke(token: string): Promise<void> {
        return this.answer("revoke", () => {
            this.revoked.push(token);
        });
    }

    listCalendars(accessToken: string): Promise<GoogleCalendarEntry[]> {
        return this.answer("listCalendars", () => {
            const email = accessToken.split("|")[1] ?? "";
            const list = this.accountCalendars.get(email) ?? this.calendars;
            return list.map((c) => ({ ...c }));
        });
    }

    busyEvents(
        _accessToken: string,
        calendarId: string,
        from: Date,
        to: Date,
    ): Promise<BusyEvent[]> {
        return this.answer("busyEvents", () => {
            if (this.notOwned.has(calendarId)) {
                throw new GoogleCalendarError(
                    "refused",
                    "events list 403 forbidden",
                );
            }
            return this.eventsOn(calendarId).filter(
                (b) => b.startAt < to && b.endAt > from,
            );
        });
    }

    /** As Google's free/busy: every busy time, Saroh's own events included. */
    freeBusy(
        _accessToken: string,
        calendarIds: readonly string[],
        from: Date,
        to: Date,
    ): Promise<BusyInterval[]> {
        return this.answer("freeBusy", () => {
            return calendarIds
                .flatMap((id) => this.eventsOn(id))
                .filter((b) => b.startAt < to && b.endAt > from)
                .map(({ startAt, endAt }) => ({ startAt, endAt }));
        });
    }

    private eventsOn(calendarId: string): BusyEvent[] {
        const own = [...(this.events.get(calendarId)?.values() ?? [])]
            .filter((e) => e.status === "confirmed")
            .map((e) => ({
                eventId: e.input.eventId,
                startAt: e.input.startAt,
                endAt: e.input.endAt,
                bookingId: e.input.bookingId,
            }));
        const other = (this.busy.get(calendarId) ?? []).map((b, i) => ({
            eventId: `other${i}`,
            startAt: b.startAt,
            endAt: b.endAt,
            bookingId: null,
        }));
        return [...own, ...other];
    }

    putEvent(
        _accessToken: string,
        calendarId: string,
        input: EventInput,
        opts: { quiet?: boolean; quietUpdate?: boolean } = {},
    ): Promise<EventResult> {
        return this.answer("putEvent", () => {
            const calendar =
                this.events.get(calendarId) ?? new Map<string, FakeEvent>();
            this.events.set(calendarId, calendar);
            const before = calendar.get(input.eventId);
            const meetCode = input.meetRequestId
                ? (before?.meetCode ?? `mtg-${calendar.size + 1}`)
                : null;
            if (meetCode && !this.spaces.has(meetCode)) {
                this.spaces.set(meetCode, "TRUSTED");
                this.pending.set(input.eventId, this.meetPendingReads);
            }
            calendar.set(input.eventId, {
                calendarId,
                input,
                status: "confirmed",
                meetCode,
                quiet: before
                    ? opts.quiet === true || opts.quietUpdate === true
                    : opts.quiet === true,
            });
            return this.resultOf(input.eventId, meetCode);
        });
    }

    findEventByBooking(
        _accessToken: string,
        calendarId: string,
        bookingId: string,
    ): Promise<EventResult | null> {
        return this.answer("findEventByBooking", () => {
            const live = [
                ...(this.events.get(calendarId)?.values() ?? []),
            ].find(
                (e) =>
                    e.status === "confirmed" && e.input.bookingId === bookingId,
            );
            return live
                ? this.resultOf(live.input.eventId, live.meetCode)
                : null;
        });
    }

    deleteEvent(
        _accessToken: string,
        calendarId: string,
        eventId: string,
        opts: { quiet?: boolean } = {},
    ): Promise<void> {
        return this.answer("deleteEvent", () => {
            const event = this.events.get(calendarId)?.get(eventId);
            if (event) {
                event.status = "cancelled";
                event.quiet = opts.quiet === true;
            }
        });
    }

    getEvent(
        _accessToken: string,
        calendarId: string,
        eventId: string,
    ): Promise<EventResult> {
        return this.answer("getEvent", () => {
            const event = this.events.get(calendarId)?.get(eventId);
            if (!event) throw new GoogleCalendarError("gone", "event get 404");
            return this.resultOf(eventId, event.meetCode);
        });
    }

    getMeetSpace(_t: string, meetCode: string): Promise<MeetSpace> {
        return this.answer("getMeetSpace", () => {
            const access = this.spaces.get(meetCode);
            if (!access)
                throw new GoogleCalendarError("gone", "meet space 404");
            return { name: `spaces/${meetCode}`, access };
        });
    }

    setMeetAccess(
        _t: string,
        spaceName: string,
        access: MeetAccess,
    ): Promise<void> {
        return this.answer("setMeetAccess", () => {
            if (access === "RESTRICTED" && this.personalAccount) {
                throw new GoogleCalendarError(
                    "refused",
                    "meet space patch 400 FAILED_PRECONDITION",
                );
            }
            this.spaces.set(spaceName.replace(/^spaces\//, ""), access);
        });
    }

    private resultOf(eventId: string, meetCode: string | null): EventResult {
        if (!meetCode) {
            return {
                eventId,
                meetUrl: null,
                meetCode: null,
                meetPending: false,
            };
        }
        const left = this.pending.get(eventId) ?? 0;
        if (left > 0) {
            this.pending.set(eventId, left - 1);
            return {
                eventId,
                meetUrl: null,
                meetCode: null,
                meetPending: true,
            };
        }
        return {
            eventId,
            meetUrl: `https://meet.example.com/${meetCode}`,
            meetCode,
            meetPending: false,
        };
    }

    /** One call: counted, failed when told to, else `work`'s answer. */
    private async answer<T>(op: Op, work: () => T): Promise<T> {
        await Promise.resolve();
        this.check(op);
        return work();
    }

    private check(op: Op): void {
        this.calls.push(op);
        const kind = this.failures.get(op)?.shift();
        if (kind) throw new GoogleCalendarError(kind, `fake ${op} ${kind}`);
    }
}
