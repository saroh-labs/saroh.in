/**
 * The Business Calendar's read route (DEC-259): the page's prefetch and the
 * route answer the same JSON, without what the calendar doesn't draw; it
 * goes to anyone whose role reads a layer (a calendar-only role included,
 * the API sending only what its permissions allow) and to nobody else, as
 * the page's own gate (`lib/calendar/access.ts`) decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(
    (): {
        active: string | null;
        business: { id: string; actions?: string[] } | null;
        calendar: ReturnType<
            typeof vi.fn<(from: string, to: string) => Promise<unknown>>
        >;
    } => ({ active: "org_a", business: null, calendar: vi.fn() }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/calendar/service", () => ({
    readCalendar: (from: string, to: string) => h.calendar(from, to),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));

import { ApiError } from "@/lib/api/errors";
import { calendarServer } from "@/lib/calendar/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = { id: "org_a", actions: ["order:read", "payment:read"] };
const MEMBER = { id: "org_a", actions: ["order:read"] };
const CALENDAR_ONLY = { id: "org_a", actions: ["booking:read"] };
const REVIEWER = { id: "org_a", actions: ["site:review"] };

const OCT = { from: "2026-10-01", to: "2026-10-31" };

const MONTH = {
    month: "2026-10",
    timezone: "Asia/Kolkata",
    timezoneSource: "business",
    from: "2026-09-30T18:30:00.000Z",
    to: "2026-10-31T18:29:59.999Z",
    layers: ["orders"],
    totals: { orders: 1 },
    days: [
        {
            date: "2026-10-01",
            toActOn: 0,
            layers: {
                orders: {
                    count: 1,
                    kinds: { paid: 1 },
                    items: [
                        {
                            id: "o1",
                            kind: "paid",
                            title: "ORD-1",
                            subtitle: null,
                            at: "2026-10-01T05:00:00.000Z",
                            link: { type: "order", id: "o1" },
                            out: 100,
                            outWhy: ["refund"],
                        },
                    ],
                },
            },
        },
    ],
    toActOn: [
        {
            kind: "invoice_overdue",
            date: "2026-10-01",
            title: "INV-1",
            subtitle: null,
            link: { type: "invoice", id: "i1" },
        },
    ],
    unavailable: [],
    joinedAt: "2026-03-10",
};

const as =
    (
        who: typeof OWNER | null,
        read: () => unknown = () => ({ kind: "month", data: MONTH }),
    ) =>
    () => {
        h.active = "org_a";
        h.business = who;
        h.calendar.mockReset();
        h.calendar.mockImplementation(() => Promise.resolve(read()));
    };

const get = (params: Record<string, string> = OCT) =>
    GET(readRequest("/api/calendar", { orgId: "org_a", params }));

beforeEach(as(OWNER));

describe("/api/calendar", () => {
    it("answers what the page's prefetch holds, without what the calendar doesn't draw", async () => {
        await expectReadContract(calendarServer, GET, "org_a", OCT, OCT);
        expect(h.calendar).toHaveBeenLastCalledWith(OCT.from, OCT.to);
        const body = (await (await get()).json()) as {
            data: Record<string, unknown> & {
                days: { layers: { orders: { items: object[] } } }[];
            };
        };
        for (const gone of ["toActOn", "from", "to", "timezoneSource"]) {
            expect(body.data).not.toHaveProperty(gone);
        }
        expect(body.data.days[0]?.layers.orders.items[0]).not.toHaveProperty(
            "outWhy",
        );
        expect(body.data.days[0]?.layers.orders.items[0]).toHaveProperty(
            "out",
            100,
        );
    });

    it("passes on what the page acts on: a month out of reach, a locked role", async () => {
        as(OWNER, () => ({ kind: "open", month: "2026-03" }))();
        expect(await (await get()).json()).toEqual({
            kind: "open",
            month: "2026-03",
        });
        as(OWNER, () => ({ kind: "locked" }))();
        expect(await (await get()).json()).toEqual({ kind: "locked" });
    });

    it("is the page's gate: a role that reads a layer, the API shaping it", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
                // Bookings only: the API sends them their layers alone.
                "calendar-only": { as: as(CALENDAR_ONLY), status: 200 },
                // Reads no layer: the page's locked state.
                reviewer: { as: as(REVIEWER), status: 403 },
                "signed out": {
                    as: () => {
                        as(null)();
                        h.active = null;
                    },
                    status: 401,
                },
                "no business found": { as: as(OWNER, () => null), status: 404 },
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

    it("takes only two days; anything else is a 400 and reads nothing", async () => {
        const bad: Record<string, string>[] = [
            {},
            { from: "2026-10-01" },
            { from: "2026-10", to: "2026-10-31" },
            { ...OCT, team: "st_1" },
        ];
        for (const params of bad) {
            expect((await get(params)).status).toBe(400);
        }
        expect(h.calendar).not.toHaveBeenCalled();
    });

    it("an API failure is the route's, generic; only GET answers", async () => {
        as(OWNER, () => {
            throw new ApiError(500, "GET calendar", "boom");
        })();
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await POST()).status).toBe(405);
    });
});
