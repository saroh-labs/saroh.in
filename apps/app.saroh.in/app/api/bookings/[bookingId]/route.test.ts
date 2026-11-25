/**
 * One booking's read route (DEC-259, U26): the service and the route
 * answer the same JSON; it has the Bookings gate (`booking:read` while
 * Bookings is on); another business's booking (or none) is a 404, never a
 * 403. The person, who is on the diary and the class's line are read only
 * for the roles and the bookings that show them, and no token leaves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role?: string; actions?: string[] } | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        modules: { state: string };
        booking: Fn;
        person: Fn;
        staff: Fn;
        waitlist: Fn;
        meeting: Fn;
        purchases: Fn;
    } => ({
        active: "org_a",
        business: null,
        modules: { state: "available" },
        booking: vi.fn(),
        person: vi.fn(),
        staff: vi.fn(),
        waitlist: vi.fn(),
        meeting: vi.fn(),
        purchases: vi.fn(),
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
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/services/booking-page-read", () => ({
    readBookingPage: (id: string) => h.booking(id),
}));
vi.mock("@/lib/services/peek-person", () => ({
    readPeekPerson: (id: string) => h.person(id),
}));
vi.mock("@/lib/staff/service", () => ({ listStaff: () => h.staff() }));
vi.mock("@/lib/services/class-waitlist", () => ({
    readClassWaitlist: (...a: unknown[]) => h.waitlist(...a),
}));
vi.mock("@/lib/google-calendar/service", () => ({
    googleMeetOffered: () => Promise.resolve(false),
    readBookingMeeting: (id: string) => h.meeting(id),
    readCalendarBusy: vi.fn(),
}));
vi.mock("@/lib/class-packs/service", () => ({
    readPurchasesFor: (...a: unknown[]) => h.purchases(...a),
}));
vi.mock("@/lib/services/service", () => ({
    readNow: () => Date.parse("2026-11-25T06:00:00.000Z"),
    listServices: vi.fn(),
    readBookingsCalendar: vi.fn(),
    readBookingsRegister: vi.fn(),
    flattenCalendar: vi.fn(),
}));
vi.mock("@/lib/invoices/payments-on", () => ({ onlinePayReady: vi.fn() }));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: vi.fn(),
}));

import { bookingServer } from "@/lib/bookings/access";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: [
        "booking:read",
        "booking:write",
        "contact:read",
        "payment:read",
        "pack:read",
    ],
};
const MEMBER = {
    id: "org_a",
    role: "MEMBER",
    actions: ["booking:read", "booking:write"],
};
const CALENDAR_ONLY = {
    id: "org_a",
    role: "CALENDAR_ONLY",
    actions: ["booking:read"],
};
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const BOOKING = {
    id: "bk_1",
    status: "CONFIRMED",
    serviceId: "svc_1",
    startAt: "2026-11-30T05:30:00.000Z",
    endAt: "2026-11-30T06:15:00.000Z",
    timezone: "Asia/Kolkata",
    service: {
        id: "svc_1",
        name: "Cut",
        capacity: 1,
        timezone: "Asia/Kolkata",
    },
    contact: { id: "c_1", name: "Kabir" },
    packRedemption: null,
    events: [],
};
const PERSON = { phone: "+91 90000 00000", attention: null };
const STAFF = [{ id: "p_1", name: "Meera", status: "ACTIVE" }];

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
    h.booking.mockReset();
    // The API's read: another business's booking is not found.
    h.booking.mockImplementation((id) =>
        Promise.resolve(id === "bk_1" ? BOOKING : null),
    );
    h.person.mockReset();
    h.person.mockResolvedValue(PERSON);
    h.staff.mockReset();
    h.staff.mockResolvedValue({ staff: STAFF, timezone: "Asia/Kolkata" });
    h.waitlist.mockReset();
    h.waitlist.mockResolvedValue([]);
    h.meeting.mockReset();
    h.purchases.mockReset();
    h.purchases.mockResolvedValue([]);
};

const get = (bookingId: string, params: Record<string, string> = {}) =>
    GET(readRequest(`/api/bookings/${bookingId}`, { orgId: "org_a", params }), {
        params: Promise.resolve({ bookingId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/bookings/[bookingId]", () => {
    it("answers what the service reads: the booking and what its page shows beside it", async () => {
        // The contract: the service, as a query would hold it, is the wire.
        const client = makeTestClient();
        const ask = { bookingId: "bk_1" };
        await prefetchRead(client, bookingServer, "org_a", ask);
        const res = await get("bk_1");
        expect(res.status).toBe(200);
        expect(await res.clone().json()).toStrictEqual(
            client.getQueryData(bookingServer.read.key("org_a", ask)),
        );
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toMatchObject({
            booking: { id: "bk_1" },
            now: Date.parse("2026-11-25T06:00:00.000Z"),
            person: PERSON,
            staff: STAFF,
            meeting: null,
            packs: { paidWith: null, usable: [] },
        });
        // A one-to-one has no line; no Meet asked while Google is off.
        expect(body).not.toHaveProperty("waitlist");
        expect(h.waitlist).not.toHaveBeenCalled();
        expect(h.meeting).not.toHaveBeenCalled();
    });

    it("reads the person, the diary and packs only for the roles that see them", async () => {
        as(CALENDAR_ONLY)();
        const body = (await (await get("bk_1")).json()) as Record<
            string,
            unknown
        >;
        expect(body).toMatchObject({ person: null, staff: null });
        expect(body).not.toHaveProperty("packs");
        // New booking's Meet offer goes only to someone who may book.
        expect(body).not.toHaveProperty("meet");
        expect(h.person).not.toHaveBeenCalled();
        expect(h.staff).not.toHaveBeenCalled();
        expect(h.purchases).not.toHaveBeenCalled();
    });

    it("a class still to come brings its line; a failed line is null, not empty", async () => {
        h.booking.mockResolvedValue({
            ...BOOKING,
            service: { ...BOOKING.service, capacity: 8 },
        });
        h.waitlist.mockResolvedValue(null);
        const body = (await (await get("bk_1")).json()) as Record<
            string,
            unknown
        >;
        expect(h.waitlist).toHaveBeenCalledWith("svc_1", BOOKING.startAt);
        expect(body.waitlist).toBeNull();
    });

    it("answers only what the page draws, nothing beside it", async () => {
        h.booking.mockResolvedValue({ ...BOOKING, idempotencyKey: "idem_1" });
        const body = (await (await get("bk_1")).json()) as object;
        expect(Object.keys(body).sort()).toEqual([
            "booking",
            "meet",
            "meeting",
            "now",
            "packs",
            "person",
            "staff",
        ]);
        expect((body as { booking: object }).booking).not.toHaveProperty(
            "idempotencyKey",
        );
    });

    it("another business's booking, or none, is a 404 with nothing in it", async () => {
        const res = await get("bk_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
        expect(h.person).not.toHaveBeenCalled();
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
                "another business open in this tab": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            () => get("bk_1"),
        );
    });

    it("takes the id from the path only; anything else is a 400 and reads nothing", async () => {
        expect((await get("bk_1", { bookingId: "bk_2" })).status).toBe(400);
        expect((await get("bk_1", { view: "peek" })).status).toBe(400);
        expect((await get("../x")).status).toBe(400);
        expect(h.booking).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});
