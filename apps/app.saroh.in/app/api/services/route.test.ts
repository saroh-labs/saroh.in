/**
 * Services' read routes (DEC-259): `/api/services` (the list),
 * `/api/services/editor` (New service's context) and
 * `/api/services/[serviceId]` (one service). Each answers what its service
 * gives, behind the pages' gate (`service:read` while Bookings is on, never
 * a Reviewer); a person crosses as display facts only (no login, email,
 * hours or time off); another business's service is a 404; an unknown
 * param is a 400 that reads nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    module: String("available"),
    service: vi.fn(),
    services: vi.fn(),
}));
const PERSON = vi.hoisted(() => ({
    id: "st_1",
    name: "Meera Iyer",
    title: "Physio",
    status: "ACTIVE",
    serviceIds: ["sv_1"],
    membership: {
        id: "m1",
        userId: "u1",
        name: "Meera",
        email: "meera@example.com",
    },
    hours: [{ day: 1, startMinute: 540, endMinute: 1020 }],
    weeklyMinutes: 480,
    extraHours: [],
    timeOff: [{ id: "off1", fromDate: "2026-12-01" }],
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/organizations/starting-currency", () => ({
    startingCurrency: () => Promise.resolve("INR"),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve({ state: h.module }),
    modulesOrUnknown: () => Promise.resolve([]),
}));
vi.mock("@/lib/services/service", () => ({
    readServices: () => h.services() as unknown,
    readService: (id: string) => h.service(id) as unknown,
    listRules: () => Promise.resolve([]),
}));
vi.mock("@/lib/services/editor-data", () => ({
    businessCurrencyOf: () => "INR",
    readHasBookingPage: () => Promise.resolve(true),
    readStaffOrNull: () =>
        Promise.resolve({ timezone: "Asia/Kolkata", staff: [PERSON] }),
    loadEditorContext: () =>
        Promise.resolve({
            ok: true,
            context: {
                services: [{ id: "sv_1", name: "Physio" }],
                staff: {
                    timezone: "Asia/Kolkata",
                    staff: [PERSON],
                    closures: [],
                    openingHours: null,
                },
                hasPage: true,
                hasStorefront: null,
                payment: null,
                gstRegistered: false,
                businessPriceMode: null,
                canEdit: true,
                timezone: "Asia/Kolkata",
                currency: "INR",
            },
        }),
}));
vi.mock("@/lib/services/usage-read", () => ({
    readServiceUsage: () =>
        Promise.resolve({ sv_1: { thisWeek: 1, comingUp: 2 } }),
}));
vi.mock("@/lib/services/booking-link-read", () => ({
    readBookingLink: () => Promise.resolve(null),
}));
vi.mock("@/lib/staff/service", () => ({
    readBookingPayment: () => Promise.resolve(null),
}));
vi.mock("@/lib/gst-rates/service", () => ({
    readMissingRates: () => Promise.resolve(null),
}));
vi.mock("@/lib/courses/access", () => ({ canWriteCourses: () => false }));
vi.mock("@/lib/share-item/read", () => ({
    readShareSetup: () => Promise.resolve(null),
}));
vi.mock("@/lib/sites/share-links-read", () => ({
    readWebAddressLinks: () => Promise.resolve(null),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/google-calendar/meet-setup", () => ({
    readMeetSetup: () => Promise.resolve(null),
}));
vi.mock("@/lib/price-history/service", () => ({
    readPriceHistory: () => Promise.resolve({ entries: [] }),
}));

import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import {
    serviceEditorServer,
    serviceServer,
    servicesListServer,
} from "@/lib/services/access-server";

import { GET as GET_ONE } from "./[serviceId]/route";
import { GET as GET_EDITOR } from "./editor/route";
import { GET, POST } from "./route";

const SERVICE = {
    id: "sv_1",
    name: "Physio",
    currency: "INR",
    timezone: "Asia/Kolkata",
    updatedAt: new Date("2026-11-25T10:00:00Z"),
    description: undefined,
};
const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["service:read", "service:write"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["service:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const as = (who: Business) => () => {
    active.id = "org_a";
    h.business = who;
    h.module = "available";
    h.services.mockReset();
    h.services.mockResolvedValue({ ok: true, services: [SERVICE] });
    h.service.mockReset();
    h.service.mockImplementation((id: string) =>
        Promise.resolve(
            id === "sv_1"
                ? { ok: true, service: SERVICE }
                : { ok: false, reason: "missing" },
        ),
    );
};
const matrix = {
    owner: { as: as(OWNER), status: 200 },
    member: { as: as(MEMBER), status: 200 },
    reviewer: { as: as(REVIEWER), status: 403 },
    "Bookings switched off": {
        as: () => {
            as(OWNER)();
            h.module = "hidden";
        },
        status: 403,
    },
    "signed out": {
        as: () => {
            as(null)();
            active.id = null;
        },
        status: 401,
    },
    "another business open in this tab": {
        as: () => {
            as(OWNER)();
            active.id = "org_b";
        },
        status: 409,
    },
};

const list = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/services", { orgId: "org_a", params }));
const editor = () =>
    GET_EDITOR(readRequest("/api/services/editor", { orgId: "org_a" }));
const one = (serviceId: string) =>
    GET_ONE(readRequest(`/api/services/${serviceId}`, { orgId: "org_a" }), {
        params: Promise.resolve({ serviceId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/services", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(servicesListServer, GET, "org_a", {});
    });

    it("is the page's gate: service:read while Bookings is on", async () => {
        await expectAuthzMatrix(matrix, () => list());
    });

    it("sends a person as display facts only: no email, login, hours or time off", async () => {
        const body = JSON.stringify(await (await list()).json());
        expect(body).toContain("Meera Iyer");
        for (const leak of ["meera@example.com", "userId", "timeOff", "off1"]) {
            expect(body).not.toContain(leak);
        }
    });

    it("a list that couldn't be read is a failure, never an empty list", async () => {
        h.services.mockResolvedValue({ ok: false, forbidden: false });
        expect((await list()).status).toBe(503);
        h.services.mockResolvedValue({ ok: false, forbidden: true });
        expect((await list()).status).toBe(403);
    });

    it("anything it doesn't ask is a 400 and reads nothing; no other method", async () => {
        expect((await list({ q: "x" })).status).toBe(400);
        expect(h.services).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/services/editor", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(serviceEditorServer, GET_EDITOR, "org_a", {});
    });

    it("is the page's gate", async () => {
        await expectAuthzMatrix(matrix, () => editor());
    });

    it("sends the other services' names and people's display facts only", async () => {
        const body = (await (await editor()).json()) as {
            others: unknown;
            staff: Record<string, unknown>[];
        };
        expect(body.others).toEqual([{ id: "sv_1", name: "Physio" }]);
        expect(Object.keys(body.staff[0] ?? {}).sort()).toEqual([
            "id",
            "name",
            "serviceIds",
            "status",
            "title",
        ]);
    });
});

describe("/api/services/[serviceId]", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(
            serviceServer,
            GET_ONE,
            "org_a",
            { serviceId: "sv_1" },
            { serviceId: "sv_1" },
        );
    });

    it("is the page's gate", async () => {
        await expectAuthzMatrix(matrix, () => one("sv_1"));
    });

    it("another business's or a missing service is a 404, with no data", async () => {
        const res = await one("sv_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("a malformed id is a 400 that reads nothing", async () => {
        expect((await one("../../x")).status).toBe(400);
        expect(h.service).not.toHaveBeenCalled();
    });
});
