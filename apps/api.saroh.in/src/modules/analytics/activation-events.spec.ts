import { ActivationEvents } from "./activation-events";
import type { AnalyticsService } from "./analytics.service";
import {
    ACTIVATION_TYPES,
    FIRST_BOOKING_CREATED_TYPE,
    FIRST_ORDER_CREATED_TYPE,
    IMPORT_COMPLETED_TYPE,
    MODULE_ENABLED_TYPE,
    ORGANIZATION_CREATED_TYPE,
    PUBLIC_INGESTABLE_TYPES,
    validateEventProperties,
} from "./event-contract";

const ORG = "org_1";

function build(opts: { fail?: Error } = {}) {
    const record = opts.fail
        ? jest.fn().mockRejectedValue(opts.fail)
        : jest.fn().mockResolvedValue({ id: "evt_1", deduped: false });
    const analytics = { record } as unknown as AnalyticsService;
    return { events: new ActivationEvents(analytics), record };
}

describe("activation event contracts", () => {
    it("registers every activation type", () => {
        for (const type of ACTIVATION_TYPES) {
            expect(() =>
                validateEventProperties(type, 1, sampleFor(type)),
            ).not.toThrow();
        }
    });

    it("keeps every activation type OUT of the public intake", () => {
        // A visitor must not be able to forge an activation milestone.
        for (const type of ACTIVATION_TYPES) {
            expect(PUBLIC_INGESTABLE_TYPES.has(type)).toBe(false);
        }
    });

    it("rejects an unknown property shape", () => {
        expect(() =>
            validateEventProperties(MODULE_ENABLED_TYPE, 1, {}),
        ).toThrow(/moduleKey/);
        expect(() =>
            validateEventProperties(IMPORT_COMPLETED_TYPE, 1, {
                entity: "products",
                created: "lots",
                updated: 0,
                failed: 0,
            }),
        ).toThrow(/created/);
    });

    it("drops properties the contract does not declare", () => {
        // The contracts return a normalized object, so a caller cannot smuggle
        // a customer's name into the ledger by adding a field.
        const out = validateEventProperties(FIRST_ORDER_CREATED_TYPE, 1, {
            orderId: "order_1",
            customerEmail: "priya@example.com",
        });
        expect(out).toEqual({ orderId: "order_1" });
    });

    function sampleFor(type: string): Record<string, unknown> {
        switch (type) {
            case "onboarding.completed":
                return { moduleCount: 2 };
            case "module.enabled":
                return { moduleKey: "COMMERCE" };
            case "first.product.created":
                return { productId: "p_1" };
            case "first.customer.created":
                return { customerId: "c_1" };
            case "first.order.created":
                return { orderId: "o_1" };
            case "first.booking.created":
                return { bookingId: "bk_1" };
            case "import.completed":
                return {
                    entity: "products",
                    created: 1,
                    updated: 0,
                    failed: 0,
                };
            default:
                return {};
        }
    }
});

describe("ActivationEvents", () => {
    it("records organization.created once per organization", async () => {
        const { events, record } = build();
        await events.organizationCreated(ORG);
        expect(record).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: ORG,
                type: ORGANIZATION_CREATED_TYPE,
                dedupeKey: `${ORGANIZATION_CREATED_TYPE}:${ORG}`,
            }),
        );
    });

    it("makes the ledger decide what 'first' means", async () => {
        // Callers emit on every create; the deterministic dedupeKey means only
        // the first is stored, so no caller needs a "have they done this before"
        // query and two concurrent creates cannot both record a first.
        const { events, record } = build();
        await events.firstOrderCreated(ORG, "order_1");
        await events.firstOrderCreated(ORG, "order_2");
        const keys = record.mock.calls.map((c) => c[0].dedupeKey);
        expect(keys).toEqual([
            `${FIRST_ORDER_CREATED_TYPE}:${ORG}`,
            `${FIRST_ORDER_CREATED_TYPE}:${ORG}`,
        ]);
    });

    it("dedupes module.enabled per module, not per organization", async () => {
        const { events, record } = build();
        await events.moduleEnabled(ORG, "COMMERCE");
        await events.moduleEnabled(ORG, "CRM");
        const keys = record.mock.calls.map((c) => c[0].dedupeKey);
        expect(new Set(keys).size).toBe(2);
    });

    it("does not dedupe import.completed — every import counts", async () => {
        const { events, record } = build();
        await events.importCompleted(ORG, {
            entity: "products",
            created: 3,
            updated: 1,
            failed: 0,
        });
        expect(record.mock.calls[0][0].dedupeKey).toBeNull();
    });

    it("never carries a visitor hash", async () => {
        const { events, record } = build();
        await events.organizationCreated(ORG);
        expect(record.mock.calls[0][0].visitorHash).toBeNull();
    });

    it("never fails the operation that triggered it", async () => {
        // A merchant's order must not fail because an analytics row could not
        // be written. This is the one place discarding an error is correct.
        const { events } = build({ fail: new Error("ledger unavailable") });
        await expect(
            events.firstOrderCreated(ORG, "order_1"),
        ).resolves.toBeUndefined();
    });
});

describe("first.booking.created (#176)", () => {
    it("records once per organization, like the other first-value events", async () => {
        const { events, record } = build();
        await events.firstBookingCreated(ORG, "bk_1");
        expect(record).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: ORG,
                type: FIRST_BOOKING_CREATED_TYPE,
                properties: { bookingId: "bk_1" },
                dedupeKey: `${FIRST_BOOKING_CREATED_TYPE}:${ORG}`,
                // Server-produced and about the merchant, so there is no
                // visitor to hash even though a member of the public booked it.
                visitorHash: null,
            }),
        );
    });

    it("carries an id and nothing about the booker", () => {
        // The booking form collects a name, an email and a phone number. The
        // contract must make it impossible to walk any of them into the ledger
        // by adding a field at the call site.
        const out = validateEventProperties(FIRST_BOOKING_CREATED_TYPE, 1, {
            bookingId: "bk_1",
            bookerEmail: "meera@example.com",
            bookerPhone: "+919000000000",
        });
        expect(out).toEqual({ bookingId: "bk_1" });
    });

    it("is not ingestable from the public endpoint", () => {
        // A booking is created through a PUBLIC form, so this matters more
        // here than for the merchant-side events: anyone could otherwise post
        // a fake first booking for someone else's organization.
        expect(PUBLIC_INGESTABLE_TYPES.has(FIRST_BOOKING_CREATED_TYPE)).toBe(
            false,
        );
    });
});
