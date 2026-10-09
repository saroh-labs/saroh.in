import { Prisma } from "@saroh/database";

import { quietLastDay } from "../../../test/home-quiet-db";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { OrgAction } from "../organizations/organization-actions";
import { HomeService } from "./home.service";

/**
 * Home's "refund a payment taken on a settled invoice" (ADR-007, U13): money
 * that came in through a pay link after the invoice was already paid or
 * voided is owed back, and Home is where a merchant is told what is wrong.
 */
type Owed = {
    id: string;
    amountCents: number;
    currency: string;
    updatedAt: Date;
    invoice: { id: string; number: string; billToName: string };
    attempts: { rawResponse: unknown }[];
};

const OWED: Owed = {
    id: "pi_1",
    amountCents: 120000,
    currency: "INR",
    updatedAt: new Date("2026-09-10T08:00:00Z"),
    invoice: {
        id: "inv_1",
        number: "INV-0004",
        billToName: "Asha Rao",
    },
    // What the webhook recorded when the money came (webhooks.service).
    attempts: [{ rawResponse: { invoiceStatus: "VOID" } }],
};

/** OWED, with the reason the webhook recorded. */
function owedFor(invoiceStatus: unknown): Owed {
    return { ...OWED, attempts: [{ rawResponse: { invoiceStatus } }] };
}

function build(rows: Owed[], count = rows.length, attempts: unknown[] = []) {
    const availability = {
        listViews: jest.fn().mockResolvedValue([
            {
                key: "PAYMENTS",
                label: "Payments",
                readiness: "ACTIVE",
                blockers: [],
            },
        ]),
    } as unknown as ModuleAvailabilityService;
    const db = {
        paymentIntent: {
            count: jest.fn().mockResolvedValue(count),
            findMany: jest.fn().mockResolvedValue(rows),
        },
        // Captures taken at the wrong amount (PAY-06): none, unless given.
        paymentAttempt: { findMany: jest.fn().mockResolvedValue(attempts) },
        paymentRefund: { findMany: jest.fn().mockResolvedValue([]) },
        // Failed renewals and overdue invoices (F1) read here too: none.
        invoice: {
            count: jest.fn().mockResolvedValue(0),
            findMany: jest.fn().mockResolvedValue([]),
        },
    };
    return {
        service: new HomeService(availability, quietLastDay(db) as never),
        db,
    };
}

const OWNER = { organizationId: "org_1", organizationRole: "OWNER" as const };

describe("HomeService refunds owed on invoices", () => {
    it("raises an ATTENTION action with the invoice behind it", async () => {
        const { service, db } = build([OWED]);
        const home = await service.build(OWNER);

        expect(home.actions[0]).toEqual({
            code: "PAYMENTS_REFUNDS_OWED",
            title: "Refund a payment taken on a settled invoice",
            href: "/billing/invoices/inv_1",
            severity: "ATTENTION",
            moduleKey: "PAYMENTS",
            count: 1,
            evidence: [
                {
                    id: "pi_1",
                    title: "INV-0004",
                    subtitle: "Asha Rao · Paid online after it was voided",
                    at: "2026-09-10T08:00:00.000Z",
                    amountMinor: 120000,
                    currency: "INR",
                    href: "/billing/invoices/inv_1",
                },
            ],
        });
        // Captured-not-applied, and not already refunded or being refunded.
        expect(db.paymentIntent.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                invoiceId: { not: null },
                status: "SUCCEEDED",
                // A mismatch is listed by its own capture (PAY-06).
                attempts: {
                    some: {
                        status: "CAPTURED_NEEDS_REFUND",
                        OR: [
                            { rawResponse: { equals: Prisma.AnyNull } },
                            {
                                rawResponse: {
                                    path: ["invoiceStatus"],
                                    equals: Prisma.AnyNull,
                                },
                            },
                            {
                                NOT: {
                                    rawResponse: {
                                        path: ["invoiceStatus"],
                                        equals: "AMOUNT_MISMATCH",
                                    },
                                },
                            },
                        ],
                    },
                },
                refunds: {
                    none: { status: { in: ["PENDING", "SUCCEEDED"] } },
                },
            },
        });
    });

    it("lists a capture taken at the wrong amount on its own row, at what it took, whatever its intent (PAY-06)", async () => {
        const mismatch = {
            id: "att_1",
            createdAt: new Date("2026-09-09T08:00:00Z"),
            rawResponse: {
                invoiceStatus: "AMOUNT_MISMATCH",
                capturedAmountCents: 45000,
                capturedCurrency: "INR",
            },
            paymentIntent: {
                currency: "INR",
                amountCents: 48000,
                invoice: null,
                order: {
                    id: "ord_1",
                    orderId: "ORD-007",
                    walkInName: null,
                    customer: {
                        firstName: "Farah",
                        lastName: "Khan",
                        email: null,
                    },
                },
            },
        };
        const { service } = build([OWED], 1, [mismatch]);
        const home = await service.build(OWNER);
        const action = home.actions[0];
        expect(action?.count).toBe(2);
        expect(action?.title).toBe("Refund 2 payments customers are owed");
        // Oldest first: the mismatch came a day before.
        expect(action?.evidence?.map((e) => e.id)).toEqual(["att_1", "pi_1"]);
        expect(action?.evidence?.[0]).toEqual({
            id: "att_1",
            title: "#ORD-007",
            subtitle:
                "Farah Khan · Paid online at a different amount than asked",
            at: "2026-09-09T08:00:00.000Z",
            amountMinor: 45000,
            currency: "INR",
            href: "/commerce/orders/ord_1",
        });
    });

    it("reads the reason the webhook recorded, not the invoice's status now (K-1)", async () => {
        const { service, db } = build([owedFor("CANCELLED_BOOKING")]);
        const home = await service.build(OWNER);
        expect(home.actions[0]?.title).toBe(
            "Refund a payment taken after its booking was cancelled",
        );
        expect(home.actions[0]?.evidence?.[0]?.subtitle).toBe(
            "Asha Rao · Paid online after its booking was cancelled",
        );
        // The newest CAPTURED_NEEDS_REFUND attempt is where it was recorded.
        expect(db.paymentIntent.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({
                    attempts: {
                        where: { status: "CAPTURED_NEEDS_REFUND" },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { rawResponse: true },
                    },
                }) as unknown,
            }),
        );
    });

    it.each([
        [
            "RELEASED_HOLD",
            "Refund a payment taken after its booking's hold ran out",
            "Paid online after its booking's hold ran out",
        ],
        [
            "PAID",
            "Refund a payment taken on a settled invoice",
            "Paid online after it was already paid",
        ],
        [
            "MISSING",
            "Refund a payment a customer is owed",
            "Paid online when it couldn't take the payment",
        ],
        [
            undefined,
            "Refund a payment a customer is owed",
            "Paid online when it couldn't take the payment",
        ],
    ])(
        "words a payment recorded as %s truthfully",
        async (recorded, title, why) => {
            const { service } = build([owedFor(recorded)]);
            const home = await service.build(OWNER);
            expect(home.actions[0]?.title).toBe(title);
            expect(home.actions[0]?.evidence?.[0]?.subtitle).toBe(
                `Asha Rao · ${why}`,
            );
        },
    );

    it("points at the invoice list when there are several", async () => {
        const { service } = build([OWED], 3);
        const home = await service.build(OWNER);
        expect(home.actions[0]?.title).toBe(
            "Refund 3 payments customers are owed",
        );
        expect(home.actions[0]?.href).toBe("/billing/invoices");
    });

    it("says nothing when nothing is owed", async () => {
        const { service } = build([]);
        const home = await service.build(OWNER);
        expect(home.actions).toEqual([]);
    });

    it("is not shown to someone who cannot read invoices", async () => {
        const { service, db } = build([OWED]);
        const home = await service.build({
            organizationId: "org_1",
            organizationRole: "MEMBER",
            organizationActions: new Set<OrgAction>(["booking:read"]),
        });
        expect(home.actions).toEqual([]);
        expect(db.paymentIntent.count).not.toHaveBeenCalled();
    });
});
