import { DateTime } from "luxon";

import type {
    BusyEvent,
    BusyInterval,
    ConsentInput,
    EventInput,
    EventResult,
    GoogleCalendarEntry,
    GoogleCalendarPort,
    Grant,
    MeetAccess,
    MeetSpace,
} from "./google-calendar.port";
import { CONSENT_SCOPES, GoogleCalendarError } from "./google-calendar.port";

/**
 * Google over plain `fetch` (no `googleapis` package): OAuth 2.0 for web
 * server apps, Calendar v3 and Meet v2. Every call has a timeout, and an
 * error says a status and Google's reason, never a token, an email or a
 * response body.
 */

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const CALENDAR = "https://www.googleapis.com/calendar/v3";
const MEET = "https://meet.googleapis.com/v2";

/**
 * How long Saroh waits on Google before giving up and trying later. Short
 * (GC-04): Google answers in well under a second, and a job waiting on a
 * slow Google holds its worker lane for every person behind it.
 */
export const GOOGLE_CALL_TIMEOUT_MS = 5_000;

/** An events page: the most Google gives, so 60 days is one call for nearly everyone. */
const EVENTS_PAGE = 2500;
/** Only the parts of an event a busy read needs. */
const BUSY_FIELDS =
    "timeZone,nextPageToken,items(id,status,transparency,eventType,start,end,organizer(self),attendees(self,organizer,responseStatus),extendedProperties(private(sarohBookingId)))";

/** Google's free/busy reads a window this long at most per call; longer ones are split. */
const FREEBUSY_SPAN_MS = 30 * 86_400_000;
/** And at most this many calendars per call. */
const FREEBUSY_CALENDARS = 50;

type Fetch = typeof fetch;

export interface GoogleClientConfig {
    clientId: string;
    clientSecret: string;
    fetch?: Fetch;
    timeoutMs?: number;
}

interface GoogleWhen {
    dateTime?: string;
    /** An all-day event: a date in the calendar's zone. */
    date?: string;
}

interface GoogleListedEvent {
    id?: string;
    status?: string;
    transparency?: string;
    eventType?: string;
    start?: GoogleWhen;
    end?: GoogleWhen;
    organizer?: { self?: boolean };
    attendees?: {
        self?: boolean;
        organizer?: boolean;
        responseStatus?: string;
    }[];
    extendedProperties?: { private?: { sarohBookingId?: string } };
}

interface GoogleEvent {
    id?: string;
    hangoutLink?: string;
    conferenceData?: {
        conferenceId?: string;
        createRequest?: { status?: { statusCode?: string } };
        entryPoints?: { entryPointType?: string; uri?: string }[];
    };
}

export class GoogleCalendarClient implements GoogleCalendarPort {
    private readonly fetch: Fetch;
    private readonly timeoutMs: number;

    constructor(private readonly config: GoogleClientConfig) {
        this.fetch = config.fetch ?? fetch;
        this.timeoutMs = config.timeoutMs ?? GOOGLE_CALL_TIMEOUT_MS;
    }

    consentUrl(input: ConsentInput): string {
        const url = new URL(AUTH);
        const q = url.searchParams;
        q.set("client_id", this.config.clientId);
        q.set("redirect_uri", input.redirectUri);
        q.set("response_type", "code");
        q.set("scope", CONSENT_SCOPES.join(" "));
        q.set("access_type", "offline");
        q.set("prompt", "consent");
        q.set("include_granted_scopes", "true");
        q.set("state", input.state);
        if (input.loginHint) q.set("login_hint", input.loginHint);
        return url.toString();
    }

    async exchangeCode(code: string, redirectUri: string): Promise<Grant> {
        const body = await this.token({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
        });
        const refreshToken = str(body.refresh_token);
        const accessToken = str(body.access_token);
        if (!refreshToken || !accessToken) {
            throw new GoogleCalendarError(
                "refused",
                "token response had no refresh token",
            );
        }
        const email = emailOf(str(body.id_token));
        if (!email) {
            throw new GoogleCalendarError(
                "refused",
                "token response named no Google account",
            );
        }
        return {
            refreshToken,
            accessToken,
            scopes: (str(body.scope) ?? "").split(" ").filter(Boolean),
            email,
        };
    }

    async refresh(refreshToken: string): Promise<string> {
        const body = await this.token({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });
        const accessToken = str(body.access_token);
        if (!accessToken) {
            throw new GoogleCalendarError("retry", "refresh gave no token");
        }
        return accessToken;
    }

    async revoke(token: string): Promise<void> {
        const res = await this.call(REVOKE, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }).toString(),
        });
        // 400 `invalid_token`: already revoked or expired, which is the point.
        if (res.ok || res.status === 400) return;
        throw await errorOf(res, "revoke");
    }

    async listCalendars(accessToken: string): Promise<GoogleCalendarEntry[]> {
        const out: GoogleCalendarEntry[] = [];
        let pageToken: string | undefined;
        do {
            const url = new URL(`${CALENDAR}/users/me/calendarList`);
            url.searchParams.set("maxResults", "250");
            if (pageToken) url.searchParams.set("pageToken", pageToken);
            const body = await this.json<{
                items?: {
                    id?: string;
                    summary?: string;
                    summaryOverride?: string;
                    primary?: boolean;
                    accessRole?: string;
                }[];
                nextPageToken?: string;
            }>(url.toString(), accessToken, { method: "GET" }, "calendars");
            for (const item of body.items ?? []) {
                if (!item.id) continue;
                out.push({
                    id: item.id,
                    name: item.summaryOverride ?? item.summary ?? item.id,
                    primary: item.primary === true,
                    canWrite: item.accessRole === "owner",
                });
            }
            pageToken = body.nextPageToken;
        } while (pageToken);
        return out;
    }

    async busyEvents(
        accessToken: string,
        calendarId: string,
        from: Date,
        to: Date,
    ): Promise<BusyEvent[]> {
        const out: BusyEvent[] = [];
        let pageToken: string | undefined;
        do {
            const url = new URL(
                `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`,
            );
            const q = url.searchParams;
            q.set("timeMin", from.toISOString());
            q.set("timeMax", to.toISOString());
            // Repeating events as their single times, as free/busy has them.
            q.set("singleEvents", "true");
            q.set("maxResults", String(EVENTS_PAGE));
            q.set("fields", BUSY_FIELDS);
            if (pageToken) q.set("pageToken", pageToken);
            const body = await this.json<{
                timeZone?: string;
                items?: GoogleListedEvent[];
                nextPageToken?: string;
            }>(url.toString(), accessToken, { method: "GET" }, "events list");
            for (const item of body.items ?? []) {
                const busy = busyOf(item, body.timeZone ?? "UTC");
                if (busy) out.push(busy);
            }
            pageToken = body.nextPageToken;
        } while (pageToken);
        return out;
    }

    async freeBusy(
        accessToken: string,
        calendarIds: readonly string[],
        from: Date,
        to: Date,
    ): Promise<BusyInterval[]> {
        const out: BusyInterval[] = [];
        for (let i = 0; i < calendarIds.length; i += FREEBUSY_CALENDARS) {
            const ids = calendarIds.slice(i, i + FREEBUSY_CALENDARS);
            for (
                let start = from.getTime();
                start < to.getTime();
                start += FREEBUSY_SPAN_MS
            ) {
                const end = Math.min(start + FREEBUSY_SPAN_MS, to.getTime());
                const body = await this.json<{
                    calendars?: Record<
                        string,
                        {
                            busy?: { start?: string; end?: string }[];
                            errors?: { reason?: string }[];
                        }
                    >;
                }>(
                    `${CALENDAR}/freeBusy`,
                    accessToken,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            timeMin: new Date(start).toISOString(),
                            timeMax: new Date(end).toISOString(),
                            items: ids.map((id) => ({ id })),
                        }),
                    },
                    "freebusy",
                );
                for (const [, calendar] of Object.entries(
                    body.calendars ?? {},
                )) {
                    // A calendar Google can't read now (gone, unshared) can't
                    // be trusted to be free: say so rather than read it as free.
                    const reason = calendar.errors?.[0]?.reason;
                    if (reason) {
                        throw new GoogleCalendarError(
                            reason === "notFound" ? "gone" : "retry",
                            `freebusy calendar error ${reason}`,
                        );
                    }
                    for (const b of calendar.busy ?? []) {
                        if (!b.start || !b.end) continue;
                        out.push({
                            startAt: new Date(b.start),
                            endAt: new Date(b.end),
                        });
                    }
                }
            }
        }
        return out;
    }

    async putEvent(
        accessToken: string,
        calendarId: string,
        event: EventInput,
        opts: { quiet?: boolean; quietUpdate?: boolean } = {},
    ): Promise<EventResult> {
        const base = `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`;
        const send = (quiet: boolean | undefined) =>
            `?sendUpdates=${quiet ? "none" : "all"}&conferenceDataVersion=1`;
        const res = await this.call(base + send(opts.quiet), {
            method: "POST",
            headers: authJson(accessToken),
            body: JSON.stringify(eventBody(event)),
        });
        if (res.ok) return resultOf((await res.json()) as GoogleEvent);
        // Made already (a retry), or cancelled before (a booking given back
        // to this person): bring it up to date, and back if it was cancelled.
        if (res.status !== 409) throw await errorOf(res, "event insert");
        await res.body?.cancel();
        const patched = await this.json<GoogleEvent>(
            `${base}/${encodeURIComponent(event.eventId)}${send(opts.quiet === true || opts.quietUpdate === true)}`,
            accessToken,
            {
                method: "PATCH",
                body: JSON.stringify({
                    ...eventBody(event),
                    id: undefined,
                    status: "confirmed",
                }),
            },
            "event patch",
        );
        return resultOf(patched);
    }

    async findEventByBooking(
        accessToken: string,
        calendarId: string,
        bookingId: string,
    ): Promise<EventResult | null> {
        const url = new URL(
            `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`,
        );
        url.searchParams.set(
            "privateExtendedProperty",
            `sarohBookingId=${bookingId}`,
        );
        url.searchParams.set("maxResults", "5");
        url.searchParams.set(
            "fields",
            "items(id,status,hangoutLink,conferenceData)",
        );
        const body = await this.json<{
            items?: (GoogleEvent & { status?: string })[];
        }>(url.toString(), accessToken, { method: "GET" }, "events search");
        const live = body.items?.find((e) => e.id && e.status !== "cancelled");
        return live ? resultOf(live) : null;
    }

    async deleteEvent(
        accessToken: string,
        calendarId: string,
        eventId: string,
        opts: { quiet?: boolean } = {},
    ): Promise<void> {
        const send = opts.quiet ? "none" : "all";
        const res = await this.call(
            `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${send}`,
            { method: "DELETE", headers: authJson(accessToken) },
        );
        if (res.ok || res.status === 404 || res.status === 410) {
            await res.body?.cancel();
            return;
        }
        throw await errorOf(res, "event delete");
    }

    async getEvent(
        accessToken: string,
        calendarId: string,
        eventId: string,
    ): Promise<EventResult> {
        return resultOf(
            await this.json<GoogleEvent>(
                `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
                accessToken,
                { method: "GET" },
                "event get",
            ),
        );
    }

    async getMeetSpace(
        accessToken: string,
        meetCode: string,
    ): Promise<MeetSpace> {
        const body = await this.json<{
            name?: string;
            config?: { accessType?: MeetAccess };
        }>(
            `${MEET}/spaces/${encodeURIComponent(meetCode)}`,
            accessToken,
            { method: "GET" },
            "meet space get",
        );
        if (!body.name) {
            throw new GoogleCalendarError("gone", "meet space has no name");
        }
        return { name: body.name, access: body.config?.accessType ?? null };
    }

    async setMeetAccess(
        accessToken: string,
        spaceName: string,
        access: MeetAccess,
    ): Promise<void> {
        await this.json(
            `${MEET}/${spaceName}?updateMask=config.accessType`,
            accessToken,
            {
                method: "PATCH",
                body: JSON.stringify({ config: { accessType: access } }),
            },
            "meet space patch",
        );
    }

    /** POST to the token endpoint; `invalid_grant` is a lapse. */
    private async token(
        params: Record<string, string>,
    ): Promise<Record<string, unknown>> {
        const res = await this.call(TOKEN, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                ...params,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            }).toString(),
        });
        const body = (await res.json().catch(() => ({}))) as Record<
            string,
            unknown
        >;
        if (res.ok) return body;
        if (body.error === "invalid_grant") {
            throw new GoogleCalendarError("lapsed", "token invalid_grant");
        }
        throw new GoogleCalendarError(
            res.status >= 500 || res.status === 429 ? "retry" : "refused",
            `token ${res.status} ${typeof body.error === "string" ? body.error : ""}`.trim(),
        );
    }

    private async json<T>(
        url: string,
        accessToken: string,
        init: RequestInit,
        what: string,
    ): Promise<T> {
        const res = await this.call(url, {
            ...init,
            headers: authJson(accessToken),
        });
        if (!res.ok) throw await errorOf(res, what);
        return (await res.json()) as T;
    }

    /** One call with a timeout; a dropped connection or a timeout is `retry`. */
    private async call(url: string, init: RequestInit): Promise<Response> {
        try {
            return await this.fetch(url, {
                ...init,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            const name = error instanceof Error ? error.name : "error";
            throw new GoogleCalendarError("retry", `network ${name}`);
        }
    }
}

const str = (v: unknown): string | undefined =>
    typeof v === "string" && v !== "" ? v : undefined;

const authJson = (accessToken: string) => ({
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
});

/**
 * The account's email from the ID token Google's token endpoint just gave
 * this server over TLS: read, not verified, as Google allows for a token
 * received directly from it.
 */
export function emailOf(idToken: string | undefined): string | undefined {
    const payload = idToken?.split(".")[1];
    if (!payload) return undefined;
    try {
        const claims = JSON.parse(
            Buffer.from(payload, "base64url").toString("utf8"),
        ) as { email?: unknown };
        return str(claims.email);
    } catch {
        return undefined;
    }
}

function eventBody(e: EventInput): Record<string, unknown> {
    return {
        id: e.eventId,
        summary: e.title,
        description: e.description,
        ...(e.location ? { location: e.location } : {}),
        start: { dateTime: e.startAt.toISOString(), timeZone: e.timeZone },
        end: { dateTime: e.endAt.toISOString(), timeZone: e.timeZone },
        attendees: e.guest
            ? [
                  {
                      email: e.guest.email,
                      ...(e.guest.name ? { displayName: e.guest.name } : {}),
                  },
              ]
            : [],
        extendedProperties: { private: { sarohBookingId: e.bookingId } },
        // Only the customer is invited (R5, GC-12): they can't add someone
        // who would then join the Meet without knocking.
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false,
        ...(e.meetRequestId
            ? {
                  conferenceData: {
                      createRequest: {
                          requestId: e.meetRequestId,
                          conferenceSolutionKey: { type: "hangoutsMeet" },
                      },
                  },
              }
            : {}),
    };
}

/**
 * Whether a listed event makes the person busy, as an interval (GC-10):
 * - not cancelled, not "show as free" (`transparent`, which every all-day
 *   event is unless the person chose busy), not a working location;
 * - made by them (no guest list, or they organise it) or accepted. An
 *   invitation they haven't answered, declined or only said maybe to
 *   doesn't block: anyone who knows their address can send one.
 */
export function busyOf(e: GoogleListedEvent, zone: string): BusyEvent | null {
    if (!e.id || e.status === "cancelled") return null;
    if (e.transparency === "transparent") return null;
    if (e.eventType === "workingLocation") return null;
    const me = e.attendees?.find((a) => a.self);
    const theirs =
        e.organizer?.self === true ||
        !me ||
        me.organizer === true ||
        me.responseStatus === "accepted";
    if (!theirs) return null;
    const startAt = instantOf(e.start, zone);
    const endAt = instantOf(e.end, zone);
    if (!startAt || !endAt || endAt <= startAt) return null;
    return {
        eventId: e.id,
        startAt,
        endAt,
        bookingId: str(e.extendedProperties?.private?.sarohBookingId) ?? null,
    };
}

function instantOf(when: GoogleWhen | undefined, zone: string): Date | null {
    if (when?.dateTime) {
        const at = new Date(when.dateTime);
        return Number.isNaN(at.getTime()) ? null : at;
    }
    if (when?.date) {
        const day = DateTime.fromISO(when.date, { zone });
        return day.isValid ? day.toJSDate() : null;
    }
    return null;
}

function resultOf(e: GoogleEvent): EventResult {
    const video = e.conferenceData?.entryPoints?.find(
        (p) => p.entryPointType === "video",
    )?.uri;
    const meetUrl = video ?? e.hangoutLink ?? null;
    const status = e.conferenceData?.createRequest?.status?.statusCode;
    return {
        eventId: e.id ?? "",
        meetUrl,
        meetCode: e.conferenceData?.conferenceId ?? null,
        meetPending: !meetUrl && status === "pending",
    };
}

/** Google's error as a kind, with its status and first reason only. */
async function errorOf(
    res: Response,
    what: string,
): Promise<GoogleCalendarError> {
    const body = (await res.json().catch(() => ({}))) as {
        error?: { errors?: { reason?: string }[]; status?: string };
    };
    const reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "";
    const detail = `${what} ${res.status} ${reason}`.trim();
    if (res.status === 404 || res.status === 410) {
        return new GoogleCalendarError("gone", detail);
    }
    if (
        res.status === 429 ||
        res.status >= 500 ||
        res.status === 401 ||
        (res.status === 403 && /rate|quota/i.test(reason))
    ) {
        return new GoogleCalendarError("retry", detail);
    }
    return new GoogleCalendarError("refused", detail);
}
