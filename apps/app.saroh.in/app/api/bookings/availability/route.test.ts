/**
 * Hours and time off's read route (U25, DEC-259): the service and the
 * route answer the same JSON; the staff failing is a generic failure (the
 * screen says it couldn't load everyone's hours), the bookings failing
 * leaves `kept` unread; an owner reads the requests waiting and a Member
 * their own diary's rules; no teammate's email leaves the server; the
 * section's gate decides who reads it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = {
    id: string;
    name?: string;
    role?: string;
    actions?: string[];
} | null;
const h = vi.hoisted(() => ({
    active: null as string | null,
    business: null as Business,
    modules: { state: "available" },
    listStaff: vi.fn(),
    getBookingRules: vi.fn(),
    readBookingPayment: vi.fn(),
    readPersonRules: vi.fn(),
    readRuleRequests: vi.fn(),
    listServices: vi.fn(),
    readBookingsCalendar: vi.fn(),
    readServiceHours: vi.fn(),
    requireSession: vi.fn(),
}));
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
vi.mock("@/lib/session", () => ({ requireSession: h.requireSession }));
vi.mock("@/lib/staff/service", () => ({
    listStaff: h.listStaff,
    getBookingRules: h.getBookingRules,
    readBookingPayment: h.readBookingPayment,
    readPersonRules: h.readPersonRules,
    readRuleRequests: h.readRuleRequests,
}));
vi.mock("@/lib/services/service", () => ({
    listServices: h.listServices,
    readBookingsCalendar: h.readBookingsCalendar,
    readNow: () => Date.parse("2026-10-19T04:30:00.000Z"),
}));
vi.mock("@/lib/services/service-hours-read", () => ({
    readServiceHours: h.readServiceHours,
}));
vi.mock("@/lib/invoices/payments-on", () => ({ onlinePayReady: vi.fn() }));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: vi.fn(),
}));

import { MEERA } from "@/components/bookings/availability/hours.test-kit";
import { availabilityServer } from "@/lib/bookings/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    name: "Kaya Physio",
    role: "OWNER",
    actions: ["booking:read", "service:write", "hours:write"],
};
const MEMBER = {
    id: "org_a",
    role: "MEMBER",
    actions: ["booking:read", "hours:write"],
};
const CALENDAR_ONLY = {
    id: "org_a",
    role: "CALENDAR_ONLY",
    actions: ["booking:read"],
};
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const MINE = {
    ...MEERA,
    membership: {
        id: "m_1",
        userId: "u_meera",
        name: "Meera Iyer",
        email: "meera@example.com",
    },
};

// Meera's Tuesday 11 am (IST) booking, and one cancelled.
const CALENDAR = {
    timezone: "Asia/Kolkata",
    diaries: [
        {
            person: { id: "st_meera" },
            bookings: [
                {
                    id: "b1",
                    status: "CONFIRMED",
                    startAt: "2026-10-20T05:30:00.000Z",
                    contact: { name: "Asha Rao" },
                },
                {
                    id: "b2",
                    status: "CANCELLED",
                    startAt: "2026-10-20T06:30:00.000Z",
                },
            ],
            classes: [],
        },
    ],
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.modules = { state: "available" };
};

beforeEach(() => {
    for (const fn of Object.values(h)) {
        if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
    }
    as(OWNER)();
    h.listStaff.mockResolvedValue({
        timezone: "Asia/Kolkata",
        staff: [MINE],
        closures: [],
        openingHours: null,
    });
    h.getBookingRules.mockResolvedValue(null);
    h.readBookingPayment.mockResolvedValue({ onlineBlocker: "PLAN" });
    h.readPersonRules.mockResolvedValue(null);
    h.readRuleRequests.mockResolvedValue([]);
    h.listServices.mockResolvedValue([
        {
            id: "sv_1",
            name: "Assess",
            status: "ACTIVE",
            showOnBookingPage: true,
        },
        {
            id: "sv_2",
            name: "Hidden",
            status: "ACTIVE",
            showOnBookingPage: false,
        },
    ]);
    h.readBookingsCalendar.mockResolvedValue(CALENDAR);
    h.readServiceHours.mockResolvedValue(null);
    h.requireSession.mockResolvedValue({ user: { id: "u_meera" } });
});

const get = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/bookings/availability", { orgId: "org_a", params }));

describe("/api/bookings/availability", () => {
    it("answers what the service reads: the week, the bookings it counts, the offered services", async () => {
        await expectReadContract(availabilityServer, GET, "org_a", {});
        const body = (await (await get()).json()) as Record<string, unknown>;
        expect(body).toMatchObject({
            timezone: "Asia/Kolkata",
            today: "2026-10-19",
            services: [{ id: "sv_1", name: "Assess" }],
            onlineBlocker: "PLAN",
            kept: [
                {
                    id: "b1",
                    staffId: "st_meera",
                    weekday: 2,
                    start: 660,
                    date: "2026-10-20",
                    href: "/bookings/b1",
                },
            ],
            bookedOn: { "st_meera|2026-10-20": 1 },
            requests: [],
            mine: null,
        });
    });

    it("never sends a teammate's sign-in email", async () => {
        const text = await (await get()).text();
        expect(text).not.toContain("meera@example.com");
        expect(text).toContain("u_meera");
    });

    it("an owner reads the requests waiting, never one diary's rules (#1038)", async () => {
        await get();
        expect(h.readRuleRequests).toHaveBeenCalled();
        expect(h.readPersonRules).not.toHaveBeenCalled();
        expect(h.requireSession).not.toHaveBeenCalled();
    });

    it("a Member reads their own diary's rules, not everyone's requests (#1038)", async () => {
        as(MEMBER)();
        const mine = { staffId: "st_meera", request: null };
        h.readPersonRules.mockResolvedValue(mine);
        const body = (await (await get()).json()) as { mine: unknown };
        expect(h.readPersonRules).toHaveBeenCalledWith("st_meera");
        expect(h.readRuleRequests).not.toHaveBeenCalled();
        expect(body.mine).toEqual(mine);
    });

    it("bookings that can't be read leave the hours, unchecked", async () => {
        h.readBookingsCalendar.mockResolvedValue(null);
        const body = (await (await get()).json()) as Record<string, unknown>;
        expect(body.kept).toBeNull();
        expect(body.bookedOn).toBeNull();
        expect(body.staff).toHaveLength(1);
    });

    it("staff that can't be read is a generic failure, never an empty team; only GET answers", async () => {
        h.listStaff.mockRejectedValue(new Error("down"));
        const res = await get();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
        expect((await POST()).status).toBe(405);
    });

    it("takes no params", async () => {
        expect((await get({ person: "st_meera" })).status).toBe(400);
        expect(h.listStaff).not.toHaveBeenCalled();
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
});
