/**
 * The bookings diary's read route (DEC-259): the page's prefetch and the
 * route answer the same JSON; it reads the days asked in the business's
 * zone; it goes to a role with `booking:read` while Bookings is on, as the
 * section's layout decides, and to nobody else; it reads no stretch the
 * diary never asks for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        calendar: ReturnType<
            typeof vi.fn<(from: string, to: string) => Promise<unknown>>
        >;
        staff: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        busy: ReturnType<
            typeof vi.fn<(from: string, to: string) => Promise<unknown>>
        >;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        calendar: vi.fn(),
        staff: vi.fn(),
        busy: vi.fn(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve(h.modules),
}));
vi.mock("@/lib/services/service", () => ({
    readBookingsCalendar: (from: string, to: string) => h.calendar(from, to),
    listServices: () => Promise.resolve([]),
    readNow: () => Date.now(),
    readBookingsRegister: vi.fn(),
    flattenCalendar: vi.fn(),
}));
vi.mock("@/lib/staff/service", () => ({ listStaff: () => h.staff() }));
vi.mock("@/lib/staff/time-off", () => ({ withClosures: (l: unknown) => l }));
vi.mock("@/lib/services/service-hours-read", () => ({
    readServiceHours: () => Promise.resolve(null),
}));
vi.mock("@/lib/google-calendar/service", () => ({
    readCalendarBusy: (from: string, to: string) => h.busy(from, to),
}));
vi.mock("@/lib/services/bookings-by-day", () => ({
    readBookingsByDay: vi.fn(),
}));
vi.mock("@/lib/invoices/payments-on", () => ({ onlinePayReady: vi.fn() }));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: vi.fn(),
}));

import { diaryServer } from "@/lib/bookings/access";
import { diaryAsk } from "@/lib/bookings/queries";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["booking:read", "booking:write", "payment:read"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["booking:read"] };
const CALENDAR_ONLY = {
    id: "org_a",
    role: "CALENDAR_ONLY",
    actions: ["booking:read"],
};
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const CALENDAR = {
    timezone: "Asia/Kolkata",
    money: true,
    diaries: [],
    note: undefined,
};
const STAFF = { timezone: "Asia/Kolkata", staff: [{ id: "p1" }] };
const BUSY = { on: true, busy: [], people: [] };
const ASK = diaryAsk("2026-11-25");
const Q: Record<string, string> = { ...ASK };

const as =
    (who: Business, calendar: () => unknown = () => CALENDAR) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.modules = { state: "available" };
        h.calendar.mockReset();
        h.calendar.mockImplementation(() => Promise.resolve(calendar()));
        h.staff.mockReset();
        h.staff.mockImplementation(() => Promise.resolve(STAFF));
        h.busy.mockReset();
        h.busy.mockImplementation(() => Promise.resolve(BUSY));
    };

const get = (params: Record<string, string> = Q) =>
    GET(readRequest("/api/bookings/diary", { orgId: "org_a", params }));

beforeEach(() => {
    as(OWNER)();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T06:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/bookings/diary", () => {
    it("answers what the page's prefetch holds: the bookings, the people, Google busy, the zone and now", async () => {
        await expectReadContract(diaryServer, GET, "org_a", ASK, Q);
        expect(await (await get()).json()).toEqual({
            calendar: { timezone: "Asia/Kolkata", money: true, diaries: [] },
            staff: STAFF.staff,
            serviceHours: null,
            googleBusy: BUSY,
            zone: "Asia/Kolkata",
            now: Date.parse("2026-11-24T06:00:00.000Z"),
        });
    });

    it("reads the week and month in the business's zone, Google for the week alone", async () => {
        await get();
        // 1 to 30 Nov, midnight to midnight in India.
        expect(h.calendar).toHaveBeenLastCalledWith(
            "2026-10-31T18:30:00.000Z",
            "2026-11-30T18:30:00.000Z",
        );
        expect(h.busy).toHaveBeenLastCalledWith(
            "2026-11-22T18:30:00.000Z",
            "2026-11-29T18:30:00.000Z",
        );
    });

    it("still draws the bookings when the people can't be read", async () => {
        h.staff.mockImplementation(() => Promise.reject(new Error("down")));
        const body = (await (await get()).json()) as { staff: unknown };
        expect(body.staff).toBeNull();
    });

    it("is the section's gate: booking:read while Bookings is on", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                "calendar-only": { as: as(CALENDAR_ONLY), status: 200 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "Bookings off": {
                    as: () => {
                        as(OWNER)();
                        h.modules = { state: "unavailable" };
                    },
                    status: 403,
                },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => get(),
        );
    });

    it("takes only the three days, and no stretch the diary never asks for", async () => {
        const bad: Record<string, string>[] = [
            {},
            { from: ASK.from, to: ASK.to },
            { ...ASK, week: "2026-11" },
            { ...ASK, person: "p1" },
        ];
        for (const params of bad) {
            expect((await get(params)).status).toBe(400);
        }
        // A year, a week outside the days, days back to front: a 404.
        for (const params of [
            { from: "2026-01-01", to: "2026-12-31", week: "2026-11-23" },
            { ...ASK, week: "2026-12-07" },
            { from: ASK.to, to: ASK.from, week: ASK.week },
        ]) {
            expect((await get(params)).status).toBe(404);
        }
        expect(h.calendar).not.toHaveBeenCalled();
    });

    it("a diary that can't be read is a generic failure, never an empty one; only GET answers", async () => {
        as(OWNER, () => null)();
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await POST()).status).toBe(405);
    });
});
