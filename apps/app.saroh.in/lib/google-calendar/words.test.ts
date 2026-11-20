import { describe, expect, it } from "vitest";

import { refusalOf } from "./refusal";
import type { BookingMeeting, CalendarAccount, CalendarStatus } from "./types";
import {
    accountLine,
    accountPill,
    ago,
    appliedNote,
    bookingsCalendarLine,
    bookingsGoToWords,
    calendarProviderRow,
    meetingSyncLine,
    outcomeMessage,
    roomForAnother,
} from "./words";

const now = new Date("2026-11-20T10:00:00Z");

const account = (over: Partial<CalendarAccount> = {}): CalendarAccount => ({
    id: "a1",
    googleEmail: "meera@example.com",
    state: "CONNECTED",
    calendars: [
        { id: "c1", name: "Meera", writeTo: true, checkBusy: true },
        { id: "c2", name: "Family", writeTo: false, checkBusy: false },
    ],
    granted: { events: true, freeBusy: true, calendars: true, meet: true },
    busyRefreshedAt: "2026-11-20T09:54:00Z",
    behind: false,
    ...over,
});

const status = (over: Partial<CalendarStatus> = {}): CalendarStatus => ({
    state: "CONNECTED",
    pausedBecause: null,
    accounts: [account()],
    bookingsGoTo: {
        accountId: "a1",
        googleEmail: "meera@example.com",
        calendarId: "c1",
        name: "Meera",
    },
    accountsAllowed: 1,
    meetAccess: "RESTRICTED",
    ...over,
});

describe("refusalOf", () => {
    it("reads the switch off, the plan, the role and Google not set up apart", () => {
        expect(refusalOf(404, { message: "isn't available yet" })).toEqual({
            kind: "off",
        });
        expect(
            refusalOf(403, {
                error: {
                    message: "locked",
                    details: {
                        code: "MODULE_LOCKED",
                        upgradeTo: { planId: "grow", name: "Grow" },
                    },
                },
            }),
        ).toEqual({
            kind: "plan",
            upgradeTo: { planId: "grow", name: "Grow" },
        });
        expect(
            refusalOf(403, {
                error: {
                    message: "Add yourself to the diary first.",
                    details: { code: "NOT_ON_DIARY" },
                },
            }),
        ).toEqual({
            kind: "off-diary",
            message: "Add yourself to the diary first.",
        });
        expect(refusalOf(403, { message: "Your role can't" })).toEqual({
            kind: "denied",
        });
        expect(
            refusalOf(503, { error: { message: "Google isn't set up." } }),
        ).toEqual({ kind: "unavailable", message: "Google isn't set up." });
        expect(refusalOf(500, null)).toEqual({ kind: "failed" });
    });
});

describe("words", () => {
    it("says how long ago, roughly", () => {
        expect(ago("2026-11-20T09:54:00Z", now)).toBe("6 min ago");
        expect(ago("2026-11-20T07:00:00Z", now)).toBe("3 h ago");
        expect(ago(null, now)).toBe("not yet");
    });

    it("draws each account by its state, behind included", () => {
        expect(accountPill(account()).label).toBe("Connected");
        expect(accountPill(account({ state: "LAPSED" })).label).toBe(
            "Needs reconnecting",
        );
        expect(accountPill(account({ behind: true })).tone).toBe("warning");
        expect(accountLine(account(), now)).toBe(
            "Busy times from Meera · checked 6 min ago",
        );
        expect(
            accountLine(account({ calendars: [], busyRefreshedAt: null }), now),
        ).toMatch(/No calendars block/);
    });

    it("names where bookings go, or asks for a calendar", () => {
        expect(bookingsGoToWords(status()).title).toBe(
            "New bookings go on Meera",
        );
        expect(bookingsGoToWords(status({ bookingsGoTo: null })).title).toMatch(
            /don't go to Google/,
        );
    });

    it("never says the allowance as a number", () => {
        expect(roomForAnother(status())).toBe(false);
        expect(roomForAnother(status({ accountsAllowed: null }))).toBe(true);
        const limit = outcomeMessage("limit", status(), "Plan B");
        expect(limit?.body).toBe(
            "Busy times from more Google accounts come with Plan B.",
        );
        expect(limit?.body).not.toMatch(/\d/);
    });

    it("has a message for every callback outcome, none for anything else", () => {
        for (const o of [
            "connected",
            "partial",
            "denied",
            "invalid",
            "expired",
            "someone-else",
            "refused",
            "limit",
            "failed",
        ]) {
            expect(outcomeMessage(o, status())).not.toBeNull();
        }
        expect(outcomeMessage("nonsense", status())).toBeNull();
        expect(outcomeMessage(null, status())).toBeNull();
    });

    it("says the booking's Google line, the API's own words first", () => {
        const m = (over: Partial<BookingMeeting>): BookingMeeting => ({
            meetingLink: null,
            meetingUrl: "https://meet.google.com/abc-defg-hij",
            meetAccess: { own: null, chosen: "RESTRICTED", applied: null },
            google: "READY",
            googleEvent: null,
            ...over,
        });
        expect(meetingSyncLine(m({}), "Ritika Sharma")).toBe(
            "On Ritika's Google Calendar · up to date",
        );
        expect(
            meetingSyncLine(
                m({
                    googleEvent: {
                        googleEmail: "r@example.com",
                        connected: false,
                        outOfDate: true,
                        message:
                            "This booking's old Google event isn't updated any more.",
                    },
                }),
                "Ritika Sharma",
            ),
        ).toMatch(/isn't updated any more/);
        expect(meetingSyncLine(m({ google: "NONE" }), "Ritika")).toBeNull();
        expect(
            appliedNote(
                m({
                    meetAccess: {
                        own: "RESTRICTED",
                        chosen: "RESTRICTED",
                        applied: "TRUSTED",
                    },
                }),
            ),
        ).toMatch(/personal Gmail/);
    });
});

describe("calendarProviderRow (Settings › Integrations)", () => {
    const ready = (over: Partial<CalendarStatus> = {}) =>
        ({ kind: "ready", status: status(over) }) as const;

    it("is not there while the switch is off or the role refused", () => {
        expect(calendarProviderRow({ kind: "off" })).toBeNull();
        expect(calendarProviderRow({ kind: "denied" })).toBeNull();
    });

    it("offers Connect when nothing is connected, Manage otherwise", () => {
        expect(
            calendarProviderRow(
                ready({ state: "NOT_CONNECTED", accounts: [] }),
            ),
        ).toMatchObject({
            pill: { label: "Not connected" },
            action: "connect",
        });
        expect(calendarProviderRow(ready())).toEqual({
            pill: { label: "Connected", tone: "success" },
            note: "Connected as meera@example.com",
            action: "manage",
        });
    });

    it("says a lapsed account before a late one", () => {
        expect(
            calendarProviderRow(
                ready({
                    state: "LAPSED",
                    accounts: [account({ state: "LAPSED", behind: true })],
                }),
            ),
        ).toMatchObject({
            pill: { label: "Needs attention", tone: "warning" },
            action: "manage",
        });
        expect(
            calendarProviderRow(
                ready({ accounts: [account({ behind: true })] }),
            ),
        ).toMatchObject({ pill: { label: "Checking late", tone: "warning" } });
    });

    it("sends the plan, the diary and a failed read to its page", () => {
        expect(
            calendarProviderRow({
                kind: "plan",
                upgradeTo: { planId: "p", name: "Grow" },
            }),
        ).toEqual({ pill: null, note: "Comes with Grow.", action: "manage" });
        expect(calendarProviderRow({ kind: "failed" })?.action).toBe("manage");
    });
});

describe("bookingsCalendarLine (Bookings)", () => {
    it("offers Connect only to someone who could and hasn't", () => {
        expect(
            bookingsCalendarLine({
                kind: "ready",
                status: status({ state: "NOT_CONNECTED", accounts: [] }),
            }),
        ).toEqual({ kind: "connect" });
        for (const kind of ["off", "denied", "failed"] as const) {
            expect(bookingsCalendarLine({ kind })).toBeNull();
        }
        // The plan's lock is never advertised on Bookings.
        expect(
            bookingsCalendarLine({ kind: "plan", upgradeTo: null }),
        ).toBeNull();
    });

    it("says nothing when all is well or paused, and names a lapsed account", () => {
        expect(
            bookingsCalendarLine({ kind: "ready", status: status() }),
        ).toBeNull();
        expect(
            bookingsCalendarLine({
                kind: "ready",
                status: status({ state: "PAUSED", pausedBecause: "plan" }),
            }),
        ).toBeNull();
        expect(
            bookingsCalendarLine({
                kind: "ready",
                status: status({
                    state: "LAPSED",
                    accounts: [account({ state: "LAPSED" })],
                }),
            }),
        ).toEqual({ kind: "lapsed", email: "meera@example.com" });
    });
});
