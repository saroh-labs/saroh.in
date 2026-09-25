// The kitchen flow on one order (ADR-008, U6) against an in-memory stand-in
// for Prisma: enough of an order, its lines, its events and its stock rows to
// walk New → Preparing → Ready → Collected, undo, edit, and read — and to see
// what each role gets. No database; `$transaction` hands the callback the
// same fake. The DB-backed twin (order-kitchen.db.spec.ts) runs the same
// flows against Postgres in the integration project.

interface MockEvent {
    id: string;
    organizationId: string;
    orderId: string;
    kind: string;
    actorUserId: string | null;
    fromStage: string | null;
    toStage: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    amountCents: number | null;
    undoneAt: Date | null;
    undoesEventId: string | null;
    createdAt: Date;
}

const mockDb = {
    seq: 0,
    order: {} as Record<string, unknown>,
    items: [] as Record<string, unknown>[],
    events: [] as MockEvent[],
    inventory: { quantity: 10, reserved: 0 },
    locks: 0,
};

// The order's invoice (ADR-008, U5) has its own specs; here the business
// is unregistered and the invoice writes are recorded, not run.
jest.mock("../invoices/order-invoicing", () => ({
    loadTaxProfile: jest.fn().mockResolvedValue({
        registered: false,
        gstin: null,
        state: null,
        prefix: null,
        timezone: null,
        deliveryRateBps: 1800,
        deliverySac: null,
    }),
    ensureOrderInvoice: jest.fn().mockResolvedValue(null),
    creditRestOfOrder: jest.fn().mockResolvedValue(undefined),
    correctOrderInvoiceForEdit: jest
        .fn()
        .mockResolvedValue({ supplementary: null, creditNote: null }),
    settleSupplementaryInvoices: jest.fn().mockResolvedValue(0),
}));

jest.mock("@saroh/database", () => {
    const pick = <T extends Record<string, unknown>>(row: T) => ({ ...row });
    const orderWith = () => {
        const o = mockDb.order;
        return {
            ...o,
            items: mockDb.items.map((i) => ({
                ...i,
                product: { name: i.name },
                variant: null,
                refundLines: [],
            })),
            events: [...mockDb.events],
            store: { id: "store_1", name: "Rye & Co." },
            customer: {
                id: "cus_1",
                email: "asha@example.in",
                firstName: "Asha",
                lastName: "Rao",
                phone: "+91 90000 00000",
            },
            paymentIntents:
                o.paymentStatus === "PAID"
                    ? [{ amountCents: o.paidCents as number, refunds: [] }]
                    : [],
            discountRedemption: null,
        };
    };
    const client = {
        $queryRaw: jest.fn((sql: TemplateStringsArray) => {
            // Count the order's row lock, not the stock rows' locks.
            if (sql[0].includes('FROM "Order"')) mockDb.locks += 1;
            return Promise.resolve([]);
        }),
        order: {
            findFirst: jest.fn(
                ({
                    where,
                }: {
                    where: { id: string; organizationId: string };
                }) =>
                    Promise.resolve(
                        where.id === mockDb.order.id &&
                            where.organizationId === mockDb.order.organizationId
                            ? orderWith()
                            : null,
                    ),
            ),
            update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
                Object.assign(mockDb.order, data);
                return Promise.resolve(pick(mockDb.order));
            }),
        },
        orderEvent: {
            create: jest.fn(({ data }: { data: Partial<MockEvent> }) => {
                mockDb.seq += 1;
                const row: MockEvent = {
                    id: `ev_${mockDb.seq}`,
                    organizationId: "org_1",
                    orderId: "order_1",
                    kind: "STAGE",
                    actorUserId: null,
                    fromStage: null,
                    toStage: null,
                    fromStatus: null,
                    toStatus: null,
                    note: null,
                    amountCents: null,
                    undoneAt: null,
                    undoesEventId: null,
                    // Real time, ordered: the undo window is measured from it.
                    createdAt: new Date(Date.now() + mockDb.seq),
                    ...data,
                };
                mockDb.events.push(row);
                return Promise.resolve(row);
            }),
            findFirst: jest.fn(
                ({ where }: { where: { id?: string; orderId: string } }) => {
                    if (where.id) {
                        return Promise.resolve(
                            mockDb.events.find((e) => e.id === where.id) ??
                                null,
                        );
                    }
                    return Promise.resolve(
                        mockDb.events[mockDb.events.length - 1] ?? null,
                    );
                },
            ),
            update: jest.fn(
                ({ where, data }: { where: { id: string }; data: object }) => {
                    const e = mockDb.events.find((x) => x.id === where.id);
                    Object.assign(e ?? {}, data);
                    return Promise.resolve(e);
                },
            ),
        },
        orderItem: {
            findUnique: jest.fn(({ where }: { where: { id: string } }) => {
                const i = mockDb.items.find((x) => x.id === where.id);
                return Promise.resolve(
                    i ? { stockRow: i.stockRow, variantId: null } : null,
                );
            }),
            update: jest.fn(
                ({ where, data }: { where: { id: string }; data: object }) => {
                    const i = mockDb.items.find((x) => x.id === where.id);
                    Object.assign(i ?? {}, data);
                    return Promise.resolve(i);
                },
            ),
            delete: jest.fn(({ where }: { where: { id: string } }) => {
                mockDb.items = mockDb.items.filter((x) => x.id !== where.id);
                return Promise.resolve({});
            }),
            count: jest.fn(() => Promise.resolve(mockDb.items.length)),
        },
        inventory: {
            count: jest.fn(() => Promise.resolve(1)),
            findUnique: jest.fn(() => Promise.resolve({ ...mockDb.inventory })),
            update: jest.fn(({ data }: { data: object }) => {
                Object.assign(mockDb.inventory, data);
                return Promise.resolve({ ...mockDb.inventory });
            }),
        },
        variantInventory: { count: jest.fn(() => Promise.resolve(0)) },
        paymentIntent: {
            findMany: jest.fn(({ where }: { where: { status?: string } }) =>
                Promise.resolve(
                    // Nothing was paid on a superseded charge here.
                    where.status !== "SUPERSEDED" &&
                        mockDb.order.paymentStatus === "PAID"
                        ? [
                              {
                                  amountCents: mockDb.order.paidCents,
                                  refunds: [],
                              },
                          ]
                        : [],
                ),
            ),
            updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
        },
        user: {
            findMany: jest.fn(() =>
                Promise.resolve([{ id: "user_member", name: "Meera" }]),
            ),
        },
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    correctOrderInvoiceForEdit,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
import type { PaymentsService } from "../payments/payments.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { UNDO_WINDOW_MS } from "./order-stage";

const as = (
    role: OrganizationContext["role"],
    userId = `user_${role.toLowerCase()}`,
): OrganizationContext => ({
    organizationId: "org_1",
    userId,
    role,
});
const OWNER = as("OWNER");
const MEMBER = as("MEMBER");

function reset(over: Record<string, unknown> = {}) {
    mockDb.seq = 0;
    mockDb.locks = 0;
    mockDb.events = [];
    mockDb.inventory = { quantity: 10, reserved: 3 };
    mockDb.order = {
        id: "order_1",
        organizationId: "org_1",
        orderId: "ORD-042",
        storeId: "store_1",
        createdAt: new Date("2026-09-27T09:50:00Z"),
        updatedAt: new Date("2026-09-27T09:50:00Z"),
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        fulfilment: "COLLECT",
        currency: "INR",
        subtotal: "360.00",
        tax: "0.00",
        shipping: "0.00",
        discount: "0.00",
        total: "360.00",
        paidCents: 36000,
        notes: "No sesame",
        trackingUrl: null,
        deliveryName: null,
        deliveryPhone: null,
        deliveryLine1: null,
        deliveryLine2: null,
        deliveryCity: null,
        deliveryState: null,
        deliveryPostalCode: null,
        ...over,
    };
    // Three croissants at 120, held on the product's row.
    mockDb.items = [
        {
            id: "li_1",
            orderId: "order_1",
            productId: "p_croissant",
            variantId: null,
            quantity: 3,
            price: "120.00",
            stockRow: "PRODUCT",
            name: "Croissant",
        },
    ];
}

const payments = {
    createDifferenceIntent: jest.fn().mockResolvedValue({
        paymentIntentId: "pi_diff",
        provider: "RAZORPAY",
        providerIntentId: "prov_diff",
        amountCents: 12000,
        currency: "INR",
        publicKey: null,
        clientParams: {},
    }),
    refundOrderDifference: jest.fn().mockResolvedValue({
        refundId: "rf_edit",
        amountCents: 12000,
        status: "PENDING",
    }),
};
const kitchen = new OrderKitchenService(payments as unknown as PaymentsService);

beforeEach(() => {
    jest.clearAllMocks();
    reset();
});

describe("moving through the kitchen", () => {
    it("New → Preparing → Ready → Collected logs three steps and ends DELIVERED", async () => {
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        await kitchen.moveStage(MEMBER, "order_1", { to: "READY" });
        const done = await kitchen.moveStage(MEMBER, "order_1", {
            to: "COLLECTED",
        });

        expect(done).toMatchObject({ stage: "COLLECTED", status: "DELIVERED" });
        expect(mockDb.events.map((e) => [e.kind, e.toStage])).toEqual([
            ["STAGE", "PREPARING"],
            ["STAGE", "READY"],
            ["STAGE", "COLLECTED"],
        ]);
        expect(
            mockDb.events.every((e) => e.actorUserId === MEMBER.userId),
        ).toBe(true);
        // Collected commits the held stock: 3 leave the shelf.
        expect(mockDb.inventory).toEqual({ quantity: 7, reserved: 0 });
        // Every move took the order's row lock first.
        expect(mockDb.locks).toBe(3);
    });

    it("an unpaid order cannot start preparing, and nothing is written", async () => {
        reset({ paymentStatus: "UNPAID" });
        await expect(
            kitchen.moveStage(OWNER, "order_1", { to: "PREPARING" }),
        ).rejects.toThrow(/not paid yet/);
        expect(mockDb.events).toHaveLength(0);
        expect(mockDb.order.stage).toBe("NEW");
    });

    it("a tracking link goes only with the courier handover", async () => {
        await expect(
            kitchen.moveStage(OWNER, "order_1", {
                to: "PREPARING",
                trackingUrl: "https://track.example/1",
            }),
        ).rejects.toThrow(/tracking link/);
    });

    it("a Reviewer cannot move an order", async () => {
        await expect(
            kitchen.moveStage(as("REVIEWER"), "order_1", { to: "PREPARING" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("another business's order is not found", async () => {
        await expect(
            kitchen.moveStage(
                { ...OWNER, organizationId: "org_other" },
                "order_1",
                { to: "PREPARING" },
            ),
        ).rejects.toThrow(/not found/);
    });
});

describe("undo", () => {
    it("undoing Ready returns to Preparing and logs the undo; a second undo is refused", async () => {
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        const ready = await kitchen.moveStage(MEMBER, "order_1", {
            to: "READY",
        });

        const back = await kitchen.undoStage(MEMBER, "order_1", ready.eventId);
        expect(back).toMatchObject({
            stage: "PREPARING",
            status: "PROCESSING",
        });
        expect(mockDb.events[mockDb.events.length - 1]).toMatchObject({
            kind: "UNDO",
            undoesEventId: ready.eventId,
            fromStage: "READY",
            toStage: "PREPARING",
        });

        // The same step again, and the step before it: both refused.
        await expect(
            kitchen.undoStage(MEMBER, "order_1", ready.eventId),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            kitchen.undoStage(MEMBER, "order_1", mockDb.events[0].id),
        ).rejects.toThrow(/Only the last step/);
    });

    it("undoing Collected restores PROCESSING and puts the stock back on hold once", async () => {
        await kitchen.moveStage(OWNER, "order_1", { to: "PREPARING" });
        await kitchen.moveStage(OWNER, "order_1", { to: "READY" });
        const collected = await kitchen.moveStage(OWNER, "order_1", {
            to: "COLLECTED",
        });
        expect(mockDb.inventory).toEqual({ quantity: 7, reserved: 0 });

        await kitchen.undoStage(OWNER, "order_1", collected.eventId);
        expect(mockDb.order).toMatchObject({
            stage: "READY",
            status: "PROCESSING",
        });
        expect(mockDb.inventory).toEqual({ quantity: 10, reserved: 3 });
        await expect(
            kitchen.undoStage(OWNER, "order_1", collected.eventId),
        ).rejects.toThrow();
        // Not applied twice.
        expect(mockDb.inventory).toEqual({ quantity: 10, reserved: 3 });
    });

    it("an undo past the server's limit is refused", async () => {
        const step = await kitchen.moveStage(OWNER, "order_1", {
            to: "PREPARING",
        });
        const event = mockDb.events.find((e) => e.id === step.eventId);
        if (event) {
            event.createdAt = new Date(Date.now() - UNDO_WINDOW_MS - 1000);
        }
        await expect(
            kitchen.undoStage(OWNER, "order_1", step.eventId),
        ).rejects.toThrow(/too late/);
        expect(mockDb.order.stage).toBe("PREPARING");
    });
});

describe("editing before preparing", () => {
    it("a Member cannot edit", async () => {
        await expect(
            kitchen.edit(MEMBER, "order_1", { notes: "Extra napkins" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("items cannot change once the order is preparing", async () => {
        await kitchen.moveStage(OWNER, "order_1", { to: "PREPARING" });
        await expect(
            kitchen.edit(OWNER, "order_1", {
                lines: [{ itemId: "li_1", quantity: 4 }],
            }),
        ).rejects.toThrow(/before the order starts preparing/);
    });

    it("a quantity up takes the difference on the order and reserves the stock", async () => {
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });

        expect(result.differenceCents).toBe(12000);
        expect(mockDb.order.total).toBe("480.00");
        expect(mockDb.inventory.reserved).toBe(4);
        expect(payments.createDifferenceIntent).toHaveBeenCalledWith(
            OWNER,
            "order_1",
            12000,
            `order-edit:${result.eventId}`,
        );
        expect(result.charge?.paymentIntentId).toBe("pi_diff");
        expect(mockDb.events[mockDb.events.length - 1]).toMatchObject({
            kind: "EDIT",
            amountCents: 12000,
        });
        // The issued invoice is never edited: the added units go on a
        // supplementary invoice, settled once the difference is paid.
        expect(correctOrderInvoiceForEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                orderId: "order_1",
                changes: [
                    expect.objectContaining({
                        orderItemId: "li_1",
                        deltaQuantity: 1,
                        unitCents: 12000,
                    }),
                ],
                settled: false,
            }),
        );
    });

    it("a quantity down refunds the difference and releases the stock", async () => {
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 2 }],
        });

        expect(result.differenceCents).toBe(-12000);
        expect(mockDb.inventory.reserved).toBe(2);
        expect(payments.refundOrderDifference).toHaveBeenCalledWith(
            OWNER,
            "order_1",
            12000,
            `order-edit:${result.eventId}`,
        );
        expect(result.refund?.refundId).toBe("rf_edit");
        // Down: a credit note for the removed units.
        expect(correctOrderInvoiceForEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                changes: [
                    expect.objectContaining({
                        orderItemId: "li_1",
                        deltaQuantity: -1,
                    }),
                ],
            }),
        );
    });

    it("an unpaid order just costs the new total — no money moves", async () => {
        reset({ paymentStatus: "UNPAID", paidCents: 0 });
        await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 1 }],
        });
        expect(mockDb.order.total).toBe("120.00");
        expect(payments.createDifferenceIntent).not.toHaveBeenCalled();
        expect(payments.refundOrderDifference).not.toHaveBeenCalled();
        expect(supersede).not.toHaveBeenCalled();
    });

    const supersede = prisma.paymentIntent.updateMany as jest.Mock;
    const SUPERSEDES = {
        where: {
            organizationId: "org_1",
            orderId: "order_1",
            status: { in: ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"] },
            idempotencyKey: { startsWith: "order-edit:" },
        },
        data: { status: "SUPERSEDED" },
    };

    it("a second edit up supersedes the first's unpaid charge, then asks for the whole difference", async () => {
        await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        const second = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 5 }],
        });
        expect(supersede).toHaveBeenCalledTimes(2);
        expect(supersede).toHaveBeenLastCalledWith(SUPERSEDES);
        // Superseded inside the edit, before the new charge is made.
        expect(supersede.mock.invocationCallOrder[1]).toBeLessThan(
            payments.createDifferenceIntent.mock.invocationCallOrder[1]!,
        );
        // The first +120 was never paid: the new charge is for both.
        expect(second.settleCents).toBe(24000);
        expect(payments.createDifferenceIntent).toHaveBeenLastCalledWith(
            OWNER,
            "order_1",
            24000,
            `order-edit:${second.eventId}`,
        );
    });

    it("an edit back to what was paid supersedes the open charge and makes none", async () => {
        await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        const back = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 3 }],
        });
        expect(back.settleCents).toBe(0);
        expect(supersede).toHaveBeenCalledTimes(2);
        expect(supersede).toHaveBeenLastCalledWith(SUPERSEDES);
        expect(payments.createDifferenceIntent).toHaveBeenCalledTimes(1);
        expect(payments.refundOrderDifference).not.toHaveBeenCalled();
        expect(back.charge).toBeNull();
        // The first edit's supplementary invoice is settled by what was paid.
        expect(settleSupplementaryInvoices).toHaveBeenCalledWith(
            expect.anything(),
            "order_1",
        );
    });

    it("a delivery needs an address", async () => {
        await expect(
            kitchen.edit(OWNER, "order_1", { fulfilment: "DELIVERY" }),
        ).rejects.toThrow(/needs an address/);
    });

    it("a repeated itemId in lines is refused, not double-counted", async () => {
        const refused = await kitchen
            .edit(OWNER, "order_1", {
                lines: [
                    { itemId: "li_1", quantity: 4 },
                    { itemId: "li_1", quantity: 0 },
                ],
            })
            .catch((e: unknown) => e);

        expect(refused).toBeInstanceOf(BadRequestException);
        expect((refused as BadRequestException).getResponse()).toMatchObject({
            message: "Each item can be changed once per edit.",
            field: "lines",
        });
        // Refused before anything is read or written.
        expect(mockDb.order.total).toBe("360.00");
        expect(mockDb.inventory.reserved).toBe(3);
    });
});

describe("the order read", () => {
    it("a Member gets the kitchen view with no money figures and no email", async () => {
        const step = await kitchen.moveStage(MEMBER, "order_1", {
            to: "PREPARING",
        });
        const read = await kitchen.read(MEMBER, "order_1");

        expect(read.money).toBeNull();
        expect(read.items[0]).not.toHaveProperty("price");
        expect(read.events[0]).not.toHaveProperty("amountCents");
        expect(read.customer).not.toHaveProperty("email");
        expect(read.customer?.name).toBe("Asha Rao");
        expect(read.notes).toBe("No sesame");
        expect(read.next.stages).toEqual(["READY"]);
        expect(read.next.undo?.eventId).toBe(step.eventId);
        expect(read.events[0].actor?.name).toBe("Meera");
        expect(JSON.stringify(read)).not.toContain("360");
    });

    it("an Owner gets the money", async () => {
        const read = await kitchen.read(OWNER, "order_1");
        expect(read.money).toMatchObject({
            total: "360.00",
            paid: "360.00",
            refunded: "0.00",
            due: "0.00",
        });
        expect(read.items[0].price).toBe("120.00");
        expect(read.customer?.email).toBe("asha@example.in");
        expect(read.refundStanding).toBe("NONE");
    });

    it("a Reviewer cannot read an order", async () => {
        await expect(
            kitchen.read(as("REVIEWER"), "order_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
