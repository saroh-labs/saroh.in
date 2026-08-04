import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { HomeService } from "./home.service";

type View = {
    key: string;
    label: string;
    readiness: string;
    blockers?: { code: string; message?: string; actionHref?: string }[];
};

interface Fixture {
    /** Overdue follow-up rows; `activity` count defaults to their length. */
    activities?: {
        id: string;
        dueAt: Date | null;
        lead: {
            id: string;
            title: string;
            value: number | null;
            contact: {
                firstName: string | null;
                lastName: string | null;
                email: string;
            } | null;
        };
    }[];
    activityCount?: number;
    orders?: {
        id: string;
        orderId: string;
        storeId: string;
        total: string;
        currency: string;
        createdAt: Date;
        customer: {
            firstName: string | null;
            lastName: string | null;
            email: string;
        };
    }[];
    orderCount?: number;
    bookings?: {
        id: string;
        startAt: Date;
        endAt: Date;
        timezone: string;
        status: string;
        bookerName: string | null;
        bookerEmail: string | null;
        service: { name: string };
        contact: {
            firstName: string | null;
            lastName: string | null;
            email: string;
        } | null;
    }[];
    bookingCount?: number;
    leadCount?: number;
    contactCount?: number;
}

function build(views: View[], fixture: Fixture = {}) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(views.map((v) => ({ blockers: [], ...v }))),
    } as unknown as ModuleAvailabilityService;

    const activities = fixture.activities ?? [];
    const orders = fixture.orders ?? [];
    const bookings = fixture.bookings ?? [];

    const db = {
        activity: {
            count: jest
                .fn()
                .mockResolvedValue(fixture.activityCount ?? activities.length),
            findMany: jest.fn().mockResolvedValue(activities),
        },
        order: {
            count: jest
                .fn()
                .mockResolvedValue(fixture.orderCount ?? orders.length),
            findMany: jest.fn().mockResolvedValue(orders),
        },
        booking: {
            count: jest
                .fn()
                .mockResolvedValue(fixture.bookingCount ?? bookings.length),
            findMany: jest.fn().mockResolvedValue(bookings),
        },
        lead: { count: jest.fn().mockResolvedValue(fixture.leadCount ?? 0) },
        contact: {
            count: jest.fn().mockResolvedValue(fixture.contactCount ?? 0),
        },
    };
    return new HomeService(availability, db as never);
}

const INPUT = { organizationId: "org_1", organizationRole: "OWNER" as const };

const OVERDUE_TASK = {
    id: "act_1",
    dueAt: new Date("2026-07-01T09:00:00.000Z"),
    lead: {
        id: "lead_1",
        title: "Bulk order enquiry",
        value: 4500000,
        contact: {
            firstName: "Ananya",
            lastName: "Rao",
            email: "ananya@example.com",
        },
    },
};

const OPEN_ORDER = {
    id: "ord_1",
    orderId: "ORD-004",
    storeId: "store_1",
    total: "1250.50",
    currency: "INR",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    customer: {
        firstName: "Vikram",
        lastName: "Shetty",
        email: "vikram@example.com",
    },
};

describe("HomeService ranking", () => {
    it("puts an attention action before a suggestion", async () => {
        const svc = build([
            {
                key: "PAYMENTS",
                label: "Payments",
                readiness: "ATTENTION_REQUIRED",
                blockers: [{ code: "X", message: "Provider failing" }],
            },
            { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.severity).toBe("ATTENTION");
        expect(model.primaryAction?.moduleKey).toBe("PAYMENTS");
    });

    it("puts an overdue follow-up before a generic analytics nudge", async () => {
        const svc = build(
            [
                { key: "CRM", label: "CRM", readiness: "ACTIVE" },
                { key: "INSIGHTS", label: "Insights", readiness: "ACTIVE" },
            ],
            { activities: [OVERDUE_TASK], activityCount: 3 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("CRM_OVERDUE_FOLLOWUPS");
        const codes = model.actions.map((a) => a.code);
        expect(codes.indexOf("CRM_OVERDUE_FOLLOWUPS")).toBeLessThan(
            codes.indexOf("INSIGHTS_VIEW"),
        );
    });

    it("puts an unfulfilled order before a module still awaiting setup", async () => {
        // The pair that was ranked backwards: a paying customer waiting on an
        // order outranks configuration a merchant can do whenever.
        const svc = build(
            [
                { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
                {
                    key: "COMMUNICATIONS",
                    label: "Communications",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        { code: "NO_PROVIDER", message: "Connect a provider." },
                    ],
                },
            ],
            { orders: [OPEN_ORDER] },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("COMMERCE_OPEN_ORDERS");
        const codes = model.actions.map((a) => a.code);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(codes.length);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(model.actions.findIndex((a) => a.severity === "SETUP"));
    });

    it("emits no appointment actions when Appointments is disabled", async () => {
        const svc = build([
            {
                key: "APPOINTMENTS",
                label: "Appointments",
                readiness: "DISABLED",
            },
            { key: "CRM", label: "CRM", readiness: "ACTIVE" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.actions.some((a) => a.moduleKey === "APPOINTMENTS")).toBe(
            false,
        );
    });

    it("reports no modules for a brand-new Organization", async () => {
        const svc = build([
            { key: "CRM", label: "CRM", readiness: "DISABLED" },
            { key: "COMMERCE", label: "Commerce", readiness: "DISABLED" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.hasAnyModule).toBe(false);
        expect(model.primaryAction).toBeNull();
    });

    it("surfaces open orders as overdue work when Commerce is active", async () => {
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER], orderCount: 2 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("COMMERCE_OPEN_ORDERS");
        expect(model.primaryAction?.title).toContain("2");
    });
});

describe("HomeService evidence", () => {
    it("names who and how much behind an overdue follow-up", async () => {
        const svc = build([{ key: "CRM", label: "CRM", readiness: "ACTIVE" }], {
            activities: [OVERDUE_TASK],
        });
        const model = await svc.build(INPUT);
        const row = model.primaryAction?.evidence?.[0];

        expect(row?.title).toBe("Bulk order enquiry");
        expect(row?.subtitle).toBe("Ananya Rao");
        expect(row?.at).toBe("2026-07-01T09:00:00.000Z");
        expect(row?.amountMinor).toBe(4500000);
        // A Lead records no currency, so none may be claimed.
        expect(row?.currency).toBeNull();
        expect(row?.href).toBe("/leads/lead_1");
    });

    it("converts an order's major-unit total to minor units and keeps its currency", async () => {
        // The two money sources disagree; a client that assumed one convention
        // would render ₹12.50 as ₹1250 or the reverse.
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER] },
        );
        const model = await svc.build(INPUT);
        const row = model.primaryAction?.evidence?.[0];

        expect(row?.amountMinor).toBe(125050);
        expect(row?.currency).toBe("INR");
        expect(row?.title).toBe("ORD-004");
        expect(row?.subtitle).toBe("Vikram Shetty");
        expect(row?.href).toBe("/stores/store_1/orders/ord_1");
    });

    it("reports the true total even when evidence is capped", async () => {
        // Otherwise "5 rows shown" silently reads as "5 rows exist".
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { orders: [OPEN_ORDER], orderCount: 23 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.count).toBe(23);
        expect(model.primaryAction?.evidence).toHaveLength(1);
    });
});

describe("HomeService numbers and schedule", () => {
    it("links a count to the filtered view of exactly what it counts", async () => {
        const svc = build([{ key: "CRM", label: "CRM", readiness: "ACTIVE" }], {
            leadCount: 12,
            contactCount: 24,
        });
        const model = await svc.build(INPUT);

        expect(model.numbers).toEqual([
            {
                key: "OPEN_LEADS",
                label: "Open leads",
                value: 12,
                href: "/leads?view=open",
                moduleKey: "CRM",
            },
            {
                key: "CONTACTS",
                label: "Contacts",
                value: 24,
                href: "/contacts",
                moduleKey: "CRM",
            },
        ]);
    });

    it("emits no numbers for a module the actor cannot see", async () => {
        // Numbers are as much of a leak as actions: "8 upcoming bookings" tells
        // a merchant with Appointments off that the data exists.
        const svc = build(
            [
                { key: "CRM", label: "CRM", readiness: "DISABLED" },
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "DISABLED",
                },
            ],
            { leadCount: 12, contactCount: 24, bookingCount: 8 },
        );
        const model = await svc.build(INPUT);
        expect(model.numbers).toEqual([]);
        expect(model.upcoming).toEqual([]);
    });

    it("still shows the schedule for a module that is available but not yet ACTIVE", async () => {
        // Appointments with no availability windows configured cannot take a
        // NEW booking, but the bookings already on the books are real
        // appointments someone must turn up for. Gating the schedule on ACTIVE
        // hid them from Home while the sidebar still linked to them.
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "SETUP_REQUIRED",
                    blockers: [{ code: "NO_AVAILABILITY", message: "Set it." }],
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_3",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "Walk-in",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: null,
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);

        expect(model.upcoming).toHaveLength(1);
        expect(model.numbers.some((n) => n.key === "UPCOMING_BOOKINGS")).toBe(
            true,
        );
    });

    it("does not push order work through a module that is not ready", async () => {
        // The number is reference; the action sends someone at a door. A door
        // that does not open must not be pointed at.
        const svc = build(
            [
                {
                    key: "COMMERCE",
                    label: "Commerce",
                    readiness: "SETUP_REQUIRED",
                    blockers: [{ code: "NO_STORE", message: "Add a store." }],
                },
            ],
            { orders: [OPEN_ORDER], orderCount: 3 },
        );
        const model = await svc.build(INPUT);

        expect(model.numbers.some((n) => n.key === "OPEN_ORDERS")).toBe(true);
        expect(
            model.actions.some((a) => a.code === "COMMERCE_OPEN_ORDERS"),
        ).toBe(false);
    });

    it("carries each booking's own timezone rather than folding to one", async () => {
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "ACTIVE",
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_1",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "Walk-in",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: null,
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);

        expect(model.upcoming).toHaveLength(1);
        expect(model.upcoming[0]).toMatchObject({
            timezone: "Asia/Kolkata",
            serviceName: "Consultation",
            who: "Walk-in",
            startAt: "2026-08-05T04:30:00.000Z",
        });
    });

    it("prefers the linked contact's name over the typed-in booker name", async () => {
        const svc = build(
            [
                {
                    key: "APPOINTMENTS",
                    label: "Appointments",
                    readiness: "ACTIVE",
                },
            ],
            {
                bookings: [
                    {
                        id: "bk_2",
                        startAt: new Date("2026-08-05T04:30:00.000Z"),
                        endAt: new Date("2026-08-05T05:00:00.000Z"),
                        timezone: "Asia/Kolkata",
                        status: "CONFIRMED",
                        bookerName: "a",
                        bookerEmail: null,
                        service: { name: "Consultation" },
                        contact: {
                            firstName: "Kavya",
                            lastName: "Bhat",
                            email: "kavya@example.com",
                        },
                    },
                ],
            },
        );
        const model = await svc.build(INPUT);
        expect(model.upcoming[0]?.who).toBe("Kavya Bhat");
    });
});
