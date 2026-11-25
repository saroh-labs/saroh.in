/**
 * The bookings list's read route (DEC-259): the page's prefetch and the
 * route answer the same JSON; the first booking and the first run's share
 * come with the whole register only; amounts go only to whoever may see money or
 * take it at the desk; the list goes to a role with `booking:read` while
 * Bookings is on, as the section's layout decides, and to nobody else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        register: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        byDay: ReturnType<typeof vi.fn<(ask: object) => Promise<unknown>>>;
        moment: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
        links: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        register: vi.fn(),
        byDay: vi.fn(),
        moment: vi.fn(),
        links: vi.fn(),
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
vi.mock("@/lib/services/bookings-by-day", () => ({
    readBookingsByDay: (ask: object) => h.byDay(ask),
}));
vi.mock("@/lib/services/service", () => ({
    readBookingsRegister: () => h.register(),
    flattenCalendar: (c: { rows: unknown[] }) => c.rows,
}));
vi.mock("@/lib/moments/read", () => ({
    bookingsListMoment: () => h.moment(),
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: () => h.links(),
}));
// The page's own `bookingsCan` reads; not the route's.
vi.mock("@/lib/invoices/payments-on", () => ({ onlinePayReady: vi.fn() }));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: vi.fn(),
}));

import { bookingsServer } from "@/lib/bookings/access";
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

const ROW = {
    id: "b1",
    status: "CONFIRMED",
    createdAt: "2026-10-19T04:00:00.000Z",
    service: { id: "s1", name: "Cut", priceCents: 50000, currency: "INR" },
    take: { cents: 50000 },
    note: undefined,
};
const CALENDAR = { timezone: "Asia/Kolkata", rows: [ROW] };

const as =
    (who: Business, read: () => unknown = () => CALENDAR) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.modules = { state: "available" };
        for (const fn of [h.register, h.byDay]) {
            fn.mockReset();
            fn.mockImplementation(() => Promise.resolve(read()));
        }
        h.moment.mockReset();
        h.moment.mockResolvedValue(null);
        h.links.mockReset();
        h.links.mockResolvedValue({
            links: { book: "https://rye.saroh.app/book" },
        });
    };

const get = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/bookings", { orgId: "org_a", params }));

beforeEach(() => {
    as(OWNER)();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T06:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("/api/bookings", () => {
    it("answers what the page's prefetch holds: the rows, the zone and the read's now", async () => {
        await expectReadContract(bookingsServer, GET, "org_a", {});
        expect(h.register).toHaveBeenCalled();
        expect(await (await get()).json()).toEqual({
            bookings: [
                {
                    id: "b1",
                    status: "CONFIRMED",
                    createdAt: ROW.createdAt,
                    service: ROW.service,
                    take: ROW.take,
                },
            ],
            timezone: "Asia/Kolkata",
            now: Date.parse("2026-10-19T06:00:00.000Z"),
            moment: null,
            share: null,
        });
        // A register with a booking has nothing to share.
        expect(h.links).not.toHaveBeenCalled();
    });

    it("says the first booking and the empty register's share only on the whole register", async () => {
        const first = { key: "first-booking", title: "Your first booking" };
        h.moment.mockResolvedValue(first);
        expect(await (await get()).json()).toMatchObject({ moment: first });

        as(OWNER, () => ({ timezone: "Asia/Kolkata", rows: [] }))();
        expect(await (await get()).json()).toMatchObject({
            moment: null,
            share: { kind: "book", url: "https://rye.saroh.app/book" },
        });

        // Dated: neither is asked.
        as(OWNER, () => ({ timezone: "Asia/Kolkata", rows: [] }))();
        expect(await (await get({ date: "7d" })).json()).toMatchObject({
            moment: null,
            share: null,
        });
        expect(h.moment).not.toHaveBeenCalled();
        expect(h.links).not.toHaveBeenCalled();
    });

    it("asks the API for the days the address names, the register otherwise", async () => {
        const week = { date: "custom", from: "2026-10-19", to: "2026-10-25" };
        await expectReadContract(
            bookingsServer,
            GET,
            "org_a",
            { from: week.from, to: week.to },
            { from: week.from, to: week.to },
        );
        expect(h.byDay).toHaveBeenLastCalledWith({
            from: week.from,
            to: week.to,
        });
        await get({ date: "7d" });
        expect(h.byDay).toHaveBeenLastCalledWith({ date: "7d" });
        expect(h.register).not.toHaveBeenCalled();
    });

    it("sends no amounts to a role that may not see money (DEC-098)", async () => {
        as(MEMBER)();
        const body = (await (await get()).json()) as {
            bookings: { service: object; take?: unknown; toTake?: boolean }[];
        };
        expect(body.bookings[0]?.service).not.toHaveProperty("priceCents");
        expect(body.bookings[0]).not.toHaveProperty("take");
        expect(body.bookings[0]?.toTake).toBe(true);
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

    it("takes only a preset or two days; anything else is a 400 and reads nothing", async () => {
        const bad: Record<string, string>[] = [
            { date: "custom" },
            { date: "forever" },
            { from: "2026-10" },
            { since: "2026-10-19T00:00:00.000Z" },
            { view: "all" },
        ];
        for (const params of bad) {
            expect((await get(params)).status).toBe(400);
        }
        expect(h.register).not.toHaveBeenCalled();
        expect(h.byDay).not.toHaveBeenCalled();
    });

    it("a list that can't be read is a generic failure, never an empty list; only GET answers", async () => {
        as(OWNER, () => null)();
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await POST()).status).toBe(405);
    });
});
