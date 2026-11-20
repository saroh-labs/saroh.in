import { FakeGoogleCalendar } from "./fake-google-calendar";
import {
    busyOf,
    emailOf,
    GOOGLE_CALL_TIMEOUT_MS,
    GoogleCalendarClient,
} from "./google-calendar.client";
import type { EventInput } from "./google-calendar.port";
import { grantedParts, isPartial, SCOPES } from "./google-calendar.port";
import { googleFakeAllowed } from "./google-calendar.provider";

type Call = { url: string; init: RequestInit };

/** A fetch that answers from a list, recording each call. */
function fetchOf(...answers: (Response | Error)[]) {
    const calls: Call[] = [];
    const fn = jest.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        const next = answers.shift();
        if (!next) throw new Error("no answer left");
        if (next instanceof Error) throw next;
        return next;
    });
    return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

const client = (f: typeof fetch, timeoutMs?: number) =>
    new GoogleCalendarClient({
        clientId: "client-id",
        clientSecret: "client-secret",
        fetch: f,
        ...(timeoutMs ? { timeoutMs } : {}),
    });

const idToken = (claims: object) =>
    `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

const event: EventInput = {
    eventId: "saroh0abc",
    title: "Consultation with Asha",
    description: "Booked on Saroh.",
    startAt: new Date("2027-01-04T05:00:00Z"),
    endAt: new Date("2027-01-04T05:30:00Z"),
    timeZone: "Asia/Kolkata",
    guest: { email: "asha@example.com", name: "Asha" },
    bookingId: "bk_1",
    meetRequestId: "req-1",
};

describe("GoogleCalendarClient", () => {
    it("asks for the calendar scopes, offline access and consent, with the state", () => {
        const url = new URL(
            client(fetchOf().fetch).consentUrl({
                redirectUri:
                    "https://api.example.com/integrations/google-calendar/callback",
                state: "signed.state",
            }),
        );
        const q = url.searchParams;
        const scopes = q.get("scope")?.split(" ") ?? [];
        for (const scope of Object.values(SCOPES)) {
            expect(scopes).toContain(scope);
        }
        expect(q.get("access_type")).toBe("offline");
        expect(q.get("prompt")).toBe("consent");
        expect(q.get("include_granted_scopes")).toBe("true");
        expect(q.get("state")).toBe("signed.state");
        expect(q.get("response_type")).toBe("code");
        expect(q.get("client_id")).toBe("client-id");
    });

    it("exchanges a code for the refresh token, the scopes and the account", async () => {
        const { fetch, calls } = fetchOf(
            json(200, {
                access_token: "at",
                refresh_token: "rt",
                scope: `openid ${SCOPES.freeBusy}`,
                id_token: idToken({ email: "meera@example.com" }),
            }),
        );
        const grant = await client(fetch).exchangeCode("code-1", "https://r");
        expect(grant).toEqual({
            refreshToken: "rt",
            accessToken: "at",
            scopes: ["openid", SCOPES.freeBusy],
            email: "meera@example.com",
        });
        const body = new URLSearchParams(String(calls[0].init.body));
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("redirect_uri")).toBe("https://r");
        // A grant missing a calendar scope is partial, and says which.
        expect(isPartial(grant.scopes)).toBe(true);
        expect(grantedParts(grant.scopes)).toEqual({
            events: false,
            freeBusy: true,
            calendars: false,
            meet: false,
        });
        expect(isPartial(Object.values(SCOPES))).toBe(false);
    });

    it("reads invalid_grant on refresh as lapsed", async () => {
        const { fetch } = fetchOf(json(400, { error: "invalid_grant" }));
        await expect(client(fetch).refresh("rt")).rejects.toMatchObject({
            kind: "lapsed",
        });
    });

    it("reads a 429, a rate-limit 403 and a 5xx as retry, and other 403s as refused", async () => {
        const rate = json(403, {
            error: { errors: [{ reason: "rateLimitExceeded" }] },
        });
        const denied = json(403, {
            error: { errors: [{ reason: "forbidden" }] },
        });
        const { fetch } = fetchOf(json(429, {}), rate, json(503, {}), denied);
        const c = client(fetch);
        for (const kind of ["retry", "retry", "retry", "refused"] as const) {
            await expect(c.listCalendars("at")).rejects.toMatchObject({
                kind: kind,
            });
        }
    });

    it("counts deleting an event that is already gone as done", async () => {
        const { fetch, calls } = fetchOf(
            new Response(null, { status: 404 }),
            new Response(null, { status: 410 }),
        );
        const c = client(fetch);
        await expect(c.deleteEvent("at", "cal", "ev")).resolves.toBeUndefined();
        await expect(c.deleteEvent("at", "cal", "ev")).resolves.toBeUndefined();
        expect(calls[0].url).toContain("sendUpdates=all");
    });

    it("times out instead of hanging, as retry", async () => {
        const hang = jest.fn(
            (_url: string, init?: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(init.signal?.reason as Error),
                    );
                }),
        ) as unknown as typeof fetch;
        await expect(
            client(hang, 20).listCalendars("at"),
        ).rejects.toMatchObject({ kind: "retry" });
    });

    it("puts an event with the guest, Meet and sendUpdates, and patches it back on a 409", async () => {
        const { fetch, calls } = fetchOf(
            json(409, { error: { errors: [{ reason: "duplicate" }] } }),
            json(200, {
                id: "saroh0abc",
                conferenceData: {
                    conferenceId: "abc-defg-hij",
                    createRequest: { status: { statusCode: "success" } },
                    entryPoints: [
                        {
                            entryPointType: "video",
                            uri: "https://meet.google.com/abc-defg-hij",
                        },
                    ],
                },
            }),
        );
        const result = await client(fetch).putEvent("at", "primary", event);
        expect(result).toEqual({
            eventId: "saroh0abc",
            meetUrl: "https://meet.google.com/abc-defg-hij",
            meetCode: "abc-defg-hij",
            meetPending: false,
        });
        expect(calls[0].url).toContain("sendUpdates=all");
        expect(calls[0].url).toContain("conferenceDataVersion=1");
        const sent = JSON.parse(String(calls[0].init.body)) as {
            attendees: { email: string }[];
            conferenceData: { createRequest: { requestId: string } };
        };
        expect(sent.attendees).toEqual([
            { email: "asha@example.com", displayName: "Asha" },
        ]);
        expect(sent.conferenceData.createRequest.requestId).toBe("req-1");
        expect(calls[1].init.method).toBe("PATCH");
        expect(JSON.parse(String(calls[1].init.body))).toMatchObject({
            status: "confirmed",
        });
    });

    it("says a Meet link still being made is pending", async () => {
        const { fetch } = fetchOf(
            json(200, {
                id: "e",
                conferenceData: {
                    createRequest: { status: { statusCode: "pending" } },
                },
            }),
        );
        await expect(client(fetch).getEvent("at", "c", "e")).resolves.toEqual({
            eventId: "e",
            meetUrl: null,
            meetCode: null,
            meetPending: true,
        });
    });

    it("splits a long free/busy window and keeps the busy times", async () => {
        const answer = (start: string) =>
            json(200, {
                calendars: {
                    c: {
                        busy: [{ start, end: "2027-01-01T10:00:00Z" }],
                    },
                },
            });
        const { fetch, calls } = fetchOf(
            answer("2027-01-01T09:00:00Z"),
            answer("2027-01-01T09:30:00Z"),
        );
        const from = new Date("2027-01-01T00:00:00Z");
        const to = new Date(from.getTime() + 60 * 86_400_000);
        const busy = await client(fetch).freeBusy("at", ["c"], from, to);
        expect(calls).toHaveLength(2);
        expect(busy).toHaveLength(2);
    });

    it("never puts a token in an error", async () => {
        const { fetch } = fetchOf(json(400, { error: "invalid_request" }));
        try {
            await client(fetch).refresh("secret-refresh-token");
            throw new Error("expected a refusal");
        } catch (error) {
            expect(String((error as Error).message)).not.toContain(
                "secret-refresh-token",
            );
        }
    });

    it("reads the account's email from the ID token", () => {
        expect(emailOf(idToken({ email: "a@example.com" }))).toBe(
            "a@example.com",
        );
        expect(emailOf("not-a-token")).toBeUndefined();
        expect(emailOf(undefined)).toBeUndefined();
    });
});

describe("busy reads and guest limits (GC-01, GC-04, GC-09, GC-10, GC-12)", () => {
    const at = (iso: string) => ({ dateTime: iso });

    it("counts what the person made or accepted, and nothing else", () => {
        const base = {
            start: at("2027-01-04T05:00:00Z"),
            end: at("2027-01-04T06:00:00Z"),
        };
        // Their own: no guest list, or they organise it.
        expect(busyOf({ id: "a", ...base }, "UTC")).not.toBeNull();
        expect(
            busyOf({ id: "b", ...base, organizer: { self: true } }, "UTC"),
        ).not.toBeNull();
        expect(
            busyOf(
                {
                    id: "c",
                    ...base,
                    attendees: [{ self: true, responseStatus: "accepted" }],
                },
                "UTC",
            ),
        ).not.toBeNull();
        // An invitation nobody answered, or declined, or a maybe: free.
        for (const responseStatus of ["needsAction", "declined", "tentative"]) {
            expect(
                busyOf(
                    {
                        id: "d",
                        ...base,
                        attendees: [{ self: true, responseStatus }],
                    },
                    "UTC",
                ),
            ).toBeNull();
        }
        // Shown as free, cancelled, a working location: free.
        expect(
            busyOf({ id: "e", ...base, transparency: "transparent" }, "UTC"),
        ).toBeNull();
        expect(
            busyOf({ id: "f", ...base, status: "cancelled" }, "UTC"),
        ).toBeNull();
        expect(
            busyOf({ id: "g", ...base, eventType: "workingLocation" }, "UTC"),
        ).toBeNull();
    });

    it("reads an all-day busy event in the calendar's zone, and Saroh's own booking id", () => {
        const allDay = busyOf(
            {
                id: "h",
                start: { date: "2027-01-04" },
                end: { date: "2027-01-05" },
                extendedProperties: { private: { sarohBookingId: "bk_9" } },
            },
            "Asia/Kolkata",
        );
        expect(allDay).toEqual({
            eventId: "h",
            startAt: new Date("2027-01-03T18:30:00Z"),
            endAt: new Date("2027-01-04T18:30:00Z"),
            bookingId: "bk_9",
        });
    });

    it("lists a calendar's events over the window, page by page", async () => {
        const { fetch, calls } = fetchOf(
            json(200, {
                timeZone: "UTC",
                items: [
                    {
                        id: "one",
                        start: at("2027-01-04T05:00:00Z"),
                        end: at("2027-01-04T06:00:00Z"),
                    },
                ],
                nextPageToken: "p2",
            }),
            json(200, {
                items: [
                    {
                        id: "two",
                        start: at("2027-01-05T05:00:00Z"),
                        end: at("2027-01-05T06:00:00Z"),
                        attendees: [
                            { self: true, responseStatus: "needsAction" },
                        ],
                    },
                ],
            }),
        );
        const busy = await client(fetch).busyEvents(
            "at",
            "primary",
            new Date("2027-01-01T00:00:00Z"),
            new Date("2027-03-01T00:00:00Z"),
        );
        expect(busy.map((b) => b.eventId)).toEqual(["one"]);
        const first = new URL(calls[0].url);
        expect(first.searchParams.get("singleEvents")).toBe("true");
        expect(first.searchParams.get("fields")).toContain("attendees");
        expect(new URL(calls[1].url).searchParams.get("pageToken")).toBe("p2");
    });

    it("waits on Google for seconds, not a quarter of a minute", () => {
        expect(GOOGLE_CALL_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    });

    it("lets the customer neither invite others nor see other guests", async () => {
        const { fetch, calls } = fetchOf(json(200, { id: "saroh0abc" }));
        await client(fetch).putEvent("at", "primary", event);
        expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
            guestsCanInviteOthers: false,
            guestsCanSeeOtherGuests: false,
        });
    });

    it("emails nobody when told to be quiet", async () => {
        const { fetch, calls } = fetchOf(
            json(200, { id: "saroh0abc" }),
            new Response(null, { status: 204 }),
        );
        const c = client(fetch);
        await c.putEvent("at", "primary", event, { quiet: true });
        await c.deleteEvent("at", "primary", "saroh0abc", { quiet: true });
        expect(calls[0].url).toContain("sendUpdates=none");
        expect(calls[1].url).toContain("sendUpdates=none");
    });

    it("invites on a new event but patches one already there quietly (DEC-233)", async () => {
        const { fetch, calls } = fetchOf(
            json(409, { error: { errors: [{ reason: "duplicate" }] } }),
            json(200, { id: "saroh0abc" }),
        );
        await client(fetch).putEvent("at", "primary", event, {
            quietUpdate: true,
        });
        expect(calls[0].url).toContain("sendUpdates=all");
        expect(calls[1].url).toContain("sendUpdates=none");
    });

    it("finds Saroh's event for a booking by its private property (DEC-233)", async () => {
        const { fetch, calls } = fetchOf(
            json(200, {
                items: [
                    { id: "gone1", status: "cancelled" },
                    { id: "live1", status: "confirmed" },
                ],
            }),
            json(200, { items: [] }),
        );
        const c = client(fetch);
        await expect(
            c.findEventByBooking("at", "primary", "bk1"),
        ).resolves.toMatchObject({ eventId: "live1" });
        expect(
            new URL(calls[0].url).searchParams.get("privateExtendedProperty"),
        ).toBe("sarohBookingId=bk1");
        await expect(
            c.findEventByBooking("at", "primary", "bk2"),
        ).resolves.toBeNull();
    });
});

describe("FakeGoogleCalendar", () => {
    it("keeps events in memory, and fails when told to", async () => {
        const fake = new FakeGoogleCalendar();
        await fake.putEvent("at", "cal", {
            ...event,
            meetRequestId: undefined,
        });
        expect(fake.liveEvents()).toHaveLength(1);
        fake.failNext("deleteEvent", "retry");
        await expect(
            fake.deleteEvent("at", "cal", event.eventId),
        ).rejects.toMatchObject({ kind: "retry" });
        await fake.deleteEvent("at", "cal", event.eventId);
        expect(fake.liveEvents()).toHaveLength(0);
    });

    it("answers a Meet link as pending for as many reads as told", async () => {
        const fake = new FakeGoogleCalendar();
        fake.meetPendingReads = 1;
        const first = await fake.putEvent("at", "cal", event);
        expect(first.meetPending).toBe(true);
        const later = await fake.getEvent("at", "cal", event.eventId);
        expect(later.meetUrl).toMatch(/^https:\/\/meet\./);
    });
});

describe("the test-only switch", () => {
    it("runs the fake only in a test run", () => {
        expect(googleFakeAllowed("1", { nodeEnvs: ["test", "test"] })).toBe(
            true,
        );
        expect(
            googleFakeAllowed("1", {
                nodeEnvs: ["production", "production"],
                ci: "1",
            }),
        ).toBe(false);
        expect(
            googleFakeAllowed(undefined, { nodeEnvs: ["test", "test"] }),
        ).toBe(false);
    });
});
