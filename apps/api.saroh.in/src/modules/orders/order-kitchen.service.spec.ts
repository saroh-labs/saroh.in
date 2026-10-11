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
    entries: [] as { id: string; kind: string }[],
    locks: 0,
    // The customer's notices queued (A14), and those already told.
    jobs: [] as {
        type: string;
        status: string;
        runAt?: Date;
        payload: { eventKey: string; [k: string]: unknown };
    }[],
    told: new Map<
        string,
        { threadMessageId: string | null; messageId: string | null }
    >(),
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

// Whether a difference can be asked for online (plan, Payments, a
// provider): yes, unless a test says the plan takes no online payments.
jest.mock("./order-online", () => ({
    orderTakesOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock("@saroh/database", () => {
    const pick = <T extends Record<string, unknown>>(row: T) => ({ ...row });
    const orderWith = () => {
        const o = mockDb.order;
        return {
            ...o,
            items: mockDb.items.map((i) => ({
                ...i,
                product: {
                    name: i.name,
                    // How it may leave (B12); none of its own by default.
                    fulfilmentTypes: i.fulfilmentTypes ?? [],
                },
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
            // Paid online: one payment for `paidCents`. Paid at the counter
            // (`paidCents` 0): none, the money recorded on the order.
            paymentIntents:
                o.paymentStatus === "PAID" && (o.paidCents as number) > 0
                    ? [{ amountCents: o.paidCents as number, refunds: [] }]
                    : [],
            discountRedemption: null,
            // Its paper: none of it paid at booking (E9).
            invoices: [],
        };
    };
    const client = {
        // A hold growing (#511): only when the shelf can sell it.
        $executeRaw: jest.fn((_sql: TemplateStringsArray, units: number) => {
            if (mockDb.inventory.quantity - mockDb.inventory.reserved < units) {
                return Promise.resolve(0);
            }
            mockDb.inventory.reserved += units;
            return Promise.resolve(1);
        }),
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
        job: {
            create: jest.fn(
                ({ data }: { data: (typeof mockDb.jobs)[number] }) => {
                    mockDb.jobs.push({ status: "PENDING", ...data });
                    return Promise.resolve({ id: `job_${mockDb.jobs.length}` });
                },
            ),
            deleteMany: jest.fn(
                ({
                    where,
                }: {
                    where: {
                        type: string;
                        status: string;
                        payload: { equals: string };
                    };
                }) => {
                    const before = mockDb.jobs.length;
                    mockDb.jobs = mockDb.jobs.filter(
                        (j) =>
                            !(
                                j.type === where.type &&
                                j.status === where.status &&
                                j.payload.eventKey === where.payload.equals
                            ),
                    );
                    return Promise.resolve({
                        count: before - mockDb.jobs.length,
                    });
                },
            ),
        },
        customerNotice: {
            findUnique: jest.fn(
                ({
                    where,
                }: {
                    where: { organizationId_eventKey: { eventKey: string } };
                }) =>
                    Promise.resolve(
                        mockDb.told.get(
                            where.organizationId_eventKey.eventKey,
                        ) ?? null,
                    ),
            ),
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
            aggregate: jest.fn(
                ({ where }: { where: { stockLevelId?: string } }) =>
                    Promise.resolve({
                        _sum: {
                            soldQuantity: mockDb.items
                                .filter(
                                    (i) =>
                                        i.stockLevelId === where.stockLevelId,
                                )
                                .reduce(
                                    (n, i) =>
                                        n + ((i.soldQuantity as number) ?? 0),
                                    0,
                                ),
                        },
                    }),
            ),
            // What each line records about its stock, and its order's
            // storefront (#510).
            // (#511: with what it holds and sold, by id or by order).
            findMany: jest.fn(
                ({
                    where,
                }: {
                    where: { id?: string | { in: string[] }; orderId?: string };
                }) =>
                    Promise.resolve(
                        mockDb.items
                            .filter((x) =>
                                typeof where.id === "string"
                                    ? x.id === where.id
                                    : where.id
                                      ? where.id.in.includes(x.id as string)
                                      : x.orderId === where.orderId,
                            )
                            .map((i) => ({
                                id: i.id,
                                orderId: mockDb.order.id,
                                productId: i.productId,
                                variantId: null,
                                quantity: i.quantity,
                                stockRow: i.stockRow ?? null,
                                stockLevelId: i.stockLevelId ?? null,
                                heldQuantity: i.heldQuantity ?? 0,
                                soldQuantity: i.soldQuantity ?? 0,
                                product: { name: i.name },
                                order: { storeId: "store_1" },
                                refundLines: [],
                            })),
                    ),
            ),
            update: jest.fn(
                ({
                    where,
                    data,
                }: {
                    where: { id: string };
                    data: Record<string, unknown>;
                }) => {
                    const i = mockDb.items.find((x) => x.id === where.id);
                    for (const [k, v] of Object.entries(data)) {
                        if (!i) break;
                        const by = v as {
                            increment?: number;
                            decrement?: number;
                        };
                        if (
                            typeof v === "object" &&
                            v !== null &&
                            "increment" in by
                        ) {
                            i[k] = (i[k] as number) + (by.increment ?? 0);
                        } else if (
                            typeof v === "object" &&
                            v !== null &&
                            "decrement" in by
                        ) {
                            i[k] = (i[k] as number) - (by.decrement ?? 0);
                        } else {
                            i[k] = v;
                        }
                    }
                    return Promise.resolve(i);
                },
            ),
            delete: jest.fn(({ where }: { where: { id: string } }) => {
                mockDb.items = mockDb.items.filter((x) => x.id !== where.id);
                return Promise.resolve({});
            }),
            count: jest.fn(() => Promise.resolve(mockDb.items.length)),
        },
        // Every product tracks stock, and so does the business (#515).
        product: {
            findMany: jest.fn(
                ({ where }: { where: { id: { in: string[] } } }) =>
                    Promise.resolve(
                        where.id.in.map((id) => ({
                            id,
                            stockTracked: true,
                            organizationId: "org_1",
                        })),
                    ),
            ),
        },
        businessProfile: {
            findUnique: jest.fn(() => Promise.resolve(null)),
        },
        // One shelf: the product's own row at the storefront ("sl_1"), its
        // on hand and promised kept in mockDb.inventory.
        stockLevel: {
            findFirst: jest.fn(
                ({ where }: { where: { variantId?: string | null } }) =>
                    Promise.resolve(
                        where.variantId === null ? { id: "sl_1" } : null,
                    ),
            ),
            findUnique: jest.fn(() =>
                Promise.resolve({
                    onHand: mockDb.inventory.quantity,
                    promised: mockDb.inventory.reserved,
                }),
            ),
            findUniqueOrThrow: jest.fn(() =>
                Promise.resolve({
                    id: "sl_1",
                    organizationId: "org_1",
                    storeId: "store_1",
                    productId: "prod_1",
                    variantId: null,
                    onHand: mockDb.inventory.quantity,
                    promised: mockDb.inventory.reserved,
                    lowStockAlert: 10,
                }),
            ),
            // A shelf change sets on hand and may move the promise with it
            // (#513); a promise alone sets only promised.
            update: jest.fn(
                ({
                    data,
                }: {
                    data: {
                        onHand?: number;
                        promised?:
                            number | { increment?: number; decrement?: number };
                    };
                }) => {
                    const promised =
                        typeof data.promised === "object"
                            ? mockDb.inventory.reserved +
                              (data.promised.increment ?? 0) -
                              (data.promised.decrement ?? 0)
                            : (data.promised ?? mockDb.inventory.reserved);
                    mockDb.inventory = {
                        quantity: data.onHand ?? mockDb.inventory.quantity,
                        reserved: promised,
                    };
                    return Promise.resolve({});
                },
            ),
        },
        // A refund confirmed on a line (#511): none here, and none putting
        // anything back.
        paymentRefundLine: {
            count: jest.fn(() => Promise.resolve(0)),
            aggregate: jest.fn(() =>
                Promise.resolve({ _sum: { putBackQuantity: 0 } }),
            ),
        },
        // The stock log (#513): what the order flows wrote to it.
        stockEntry: {
            aggregate: jest.fn(() =>
                Promise.resolve({
                    _sum: {
                        quantity: mockDb.entries
                            .filter((e) => e.kind === "RETURNED")
                            .reduce((n, e) => n + (e.quantity as number), 0),
                    },
                }),
            ),
            count: jest.fn(() =>
                Promise.resolve(
                    mockDb.entries.filter((e) => e.kind === "RETURNED").length,
                ),
            ),
            findFirst: jest.fn(() =>
                Promise.resolve(
                    [...mockDb.entries]
                        .reverse()
                        .find((e) => e.kind === "SOLD") ?? null,
                ),
            ),
            create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
                const entry = { id: `se_${mockDb.entries.length}`, ...data };
                mockDb.entries.push(entry as { id: string; kind: string });
                return Promise.resolve(entry);
            }),
        },
        paymentIntent: {
            findMany: jest.fn(({ where }: { where: { status?: string } }) =>
                Promise.resolve(
                    // Nothing was paid on a superseded charge here.
                    where.status !== "SUPERSEDED" &&
                        mockDb.order.paymentStatus === "PAID" &&
                        (mockDb.order.paidCents as number) > 0
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
            // Nothing is going through online right now (#622).
            findFirst: jest.fn(() => Promise.resolve(null)),
        },
        // No visit held for the customer's own payment (#622).
        booking: {
            findFirst: jest.fn(() => Promise.resolve(null)),
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

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    correctOrderInvoiceForEdit,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
import type { PaymentsService } from "../payments/payments.service";
import { EditOrderDto, MoveStageDto, RecordDifferenceDto } from "./dto";
import { OrderKitchenService } from "./order-kitchen.service";
import { orderTakesOnline } from "./order-online";
import { UNDO_WINDOW_MS } from "./order-stage";

/** The fields the global ValidationPipe would refuse in `body`. */
async function refused<T extends object>(
    cls: new () => T,
    body: unknown,
): Promise<string[]> {
    return (await validate(plainToInstance(cls, body))).map((e) => e.property);
}

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
    mockDb.jobs = [];
    mockDb.told = new Map();
    mockDb.inventory = { quantity: 10, reserved: 3 };
    mockDb.entries = [];
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
        fulfilment: "PICKUP",
        currency: "INR",
        subtotal: "360.00",
        tax: "0.00",
        shipping: "0.00",
        discount: "0.00",
        total: "360.00",
        paidCents: 36000,
        // Nothing recorded by hand: it was paid online.
        paidByHand: "0.00",
        notes: "No sesame",
        trackingUrl: null,
        courierName: null,
        trackingNumber: null,
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
            stockLevelId: "sl_1",
            heldQuantity: 3,
            soldQuantity: 0,
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
        // ...and the stock log says so, once (#513).
        expect(mockDb.entries.map((e) => e.kind)).toEqual(["SOLD"]);
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

describe("telling the customer (A14)", () => {
    it("Ready queues the customer's notice 10 seconds ahead, keyed to its step; other steps queue none", async () => {
        const before = Date.now();
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        const ready = await kitchen.moveStage(MEMBER, "order_1", {
            to: "READY",
        });
        await kitchen.moveStage(MEMBER, "order_1", { to: "COLLECTED" });

        expect(mockDb.jobs).toHaveLength(1);
        const [job] = mockDb.jobs;
        expect(job).toMatchObject({
            organizationId: "org_1",
            type: "customer.notify",
            payload: {
                kind: "ORDER_READY",
                eventKey: `order:${ready.eventId}`,
                orderId: "order_1",
                orderEventId: ready.eventId,
            },
        });
        const wait = (job.runAt as Date).getTime() - before;
        expect(wait).toBeGreaterThanOrEqual(10_000);
        expect(wait).toBeLessThan(15_000);
    });

    it("a shipment's handover queues its own notice", async () => {
        reset({ fulfilment: "SHIPPING" });
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        await kitchen.moveStage(MEMBER, "order_1", { to: "READY" });
        const out = await kitchen.moveStage(MEMBER, "order_1", {
            to: "HANDED_TO_COURIER",
            courierName: "Delhivery",
            trackingNumber: "AWB4411",
        });
        expect(mockDb.jobs.map((j) => j.payload.kind)).toEqual([
            "ORDER_READY",
            "ORDER_HANDED_OVER",
        ]);
        expect(mockDb.jobs[1].payload.eventKey).toBe(`order:${out.eventId}`);
    });

    it("Undo inside the wait takes the notice back unsent: nobody was told", async () => {
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        const ready = await kitchen.moveStage(MEMBER, "order_1", {
            to: "READY",
        });
        const back = await kitchen.undoStage(MEMBER, "order_1", ready.eventId);
        expect(back.told).toBe(false);
        expect(mockDb.jobs).toHaveLength(0);
    });

    it("Undo after the notice went says they've already been told", async () => {
        await kitchen.moveStage(MEMBER, "order_1", { to: "PREPARING" });
        const ready = await kitchen.moveStage(MEMBER, "order_1", {
            to: "READY",
        });
        // The worker ran it: the job is no longer waiting, and the
        // customer's thread has the message.
        mockDb.jobs[0].status = "DONE";
        mockDb.told.set(`order:${ready.eventId}`, {
            threadMessageId: "ctm_1",
            messageId: null,
        });
        const back = await kitchen.undoStage(MEMBER, "order_1", ready.eventId);
        expect(back.told).toBe(true);
        expect(mockDb.jobs).toHaveLength(1);
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

describe("the difference after an edit, wherever the order was paid", () => {
    const takesOnline = orderTakesOnline as jest.Mock;
    const supersede = prisma.paymentIntent.updateMany as jest.Mock;

    it("an order paid at the counter, edited up, asks only for the difference", async () => {
        // Paid in cash at the counter: no provider payment behind it, the
        // amount recorded on the order.
        reset({ paidCents: 0, paidByHand: "360.00" });
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        expect(result.settleCents).toBe(12000);
        expect(result.dueCents).toBe(12000);
        expect(payments.createDifferenceIntent).toHaveBeenCalledWith(
            OWNER,
            "order_1",
            12000,
            `order-edit:${result.eventId}`,
        );
        // Not paid yet: its supplementary invoice waits on the money.
        expect(correctOrderInvoiceForEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ settled: false }),
        );
        expect(mockDb.order.paidByHand).toBe("360.00");
    });

    it("one paid at the counter before the amount was kept counts its total, and keeps it", async () => {
        reset({ paidCents: 0, paidByHand: "0.00" });
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        expect(result.settleCents).toBe(12000);
        // Written on its first edit: the next one starts from it.
        expect(mockDb.order.paidByHand).toBe("360.00");
    });

    it("paid online, then edited up: the difference is charged online", async () => {
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        expect(result).toMatchObject({
            settleCents: 12000,
            dueCents: 12000,
            online: true,
            handBackCents: 0,
            moneyError: null,
        });
        expect(result.charge?.paymentIntentId).toBe("pi_diff");
    });

    it("edited down after a counter payment: a credit note, and the till gives it back", async () => {
        reset({ paidCents: 0, paidByHand: "360.00" });
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 2 }],
        });
        expect(result.settleCents).toBe(-12000);
        expect(result.handBackCents).toBe(12000);
        // Nothing was paid online, so nothing is refunded online.
        expect(payments.refundOrderDifference).not.toHaveBeenCalled();
        expect(result.moneyError).toBeNull();
        expect(mockDb.order.paidByHand).toBe("240.00");
        expect(correctOrderInvoiceForEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                changes: [expect.objectContaining({ deltaQuantity: -1 })],
                settled: true,
            }),
        );
    });

    it("edited down after an online payment: refunded online, with a credit note", async () => {
        const result = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 2 }],
        });
        expect(result.handBackCents).toBe(0);
        expect(payments.refundOrderDifference).toHaveBeenCalledWith(
            OWNER,
            "order_1",
            12000,
            `order-edit:${result.eventId}`,
        );
        expect(correctOrderInvoiceForEdit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                changes: [expect.objectContaining({ deltaQuantity: -1 })],
            }),
        );
        expect(mockDb.order.paidByHand).toBe("0.00");
    });

    it("on a plan without online payments nothing is tried online; recording it settles it", async () => {
        reset({ paidCents: 0, paidByHand: "360.00" });
        takesOnline.mockResolvedValueOnce(false);
        const edited = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        expect(edited).toMatchObject({
            dueCents: 12000,
            online: false,
            charge: null,
            // Not paid yet is not a failure to settle.
            moneyError: null,
        });
        expect(payments.createDifferenceIntent).not.toHaveBeenCalled();

        const recorded = await kitchen.recordDifference(OWNER, "order_1", {
            kind: "CASH",
        });
        expect(recorded.amountCents).toBe(12000);
        expect(mockDb.order.paidByHand).toBe("480.00");
        // Its pay link stops working: nobody pays twice.
        expect(mockDb.order.payTokenHash).toBeNull();
        // The supplementary invoice is paid as the counter paid it.
        expect(settleSupplementaryInvoices).toHaveBeenCalledWith(
            expect.anything(),
            "order_1",
            expect.any(Date),
            "CASH",
        );
        expect(mockDb.events[mockDb.events.length - 1]).toMatchObject({
            kind: "STATUS",
            note: "Difference paid in cash",
            amountCents: 12000,
            actorUserId: OWNER.userId,
        });
        // Nothing more is owed.
        await expect(
            kitchen.recordDifference(OWNER, "order_1", { kind: "CASH" }),
        ).rejects.toThrow(/Nothing more is owed/);
    });

    it("on a plan with online payments both ways stay open: recording it stops the charge", async () => {
        const edited = await kitchen.edit(OWNER, "order_1", {
            lines: [{ itemId: "li_1", quantity: 4 }],
        });
        expect(edited.online).toBe(true);
        expect(payments.createDifferenceIntent).toHaveBeenCalledTimes(1);
        supersede.mockClear();

        const recorded = await kitchen.recordDifference(OWNER, "order_1", {
            kind: "UPI",
        });
        expect(recorded.amountCents).toBe(12000);
        // The open charge is superseded first: paid by UPI at the counter,
        // it isn't asked for online too.
        expect(supersede).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: "SUPERSEDED" } }),
        );
        // Paid online before, by hand now: only the difference by hand.
        expect(mockDb.order.paidByHand).toBe("120.00");
        expect(settleSupplementaryInvoices).toHaveBeenCalledWith(
            expect.anything(),
            "order_1",
            expect.any(Date),
            "UPI",
        );
    });

    it("recording asks order:edit, and a paid order that owes nothing has nothing to record", async () => {
        await expect(
            kitchen.recordDifference(MEMBER, "order_1", { kind: "CASH" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            kitchen.recordDifference(OWNER, "order_1", { kind: "CASH" }),
        ).rejects.toThrow(/Nothing more is owed/);
    });

    it("an unpaid order is recorded as paid, not as a difference", async () => {
        reset({ paymentStatus: "UNPAID", paidCents: 0 });
        await expect(
            kitchen.recordDifference(OWNER, "order_1", { kind: "CASH" }),
        ).rejects.toThrow(/Record it as paid instead/);
    });

    it("only cash, UPI or card can be recorded", async () => {
        expect(await refused(RecordDifferenceDto, { kind: "LINK" })).toEqual([
            "kind",
        ]);
        expect(await refused(RecordDifferenceDto, { kind: "CARD" })).toEqual(
            [],
        );
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
            kitchen.edit(OWNER, "order_1", { fulfilment: "LOCAL_DELIVERY" }),
        ).rejects.toThrow(/needs an address/);
    });

    it("refuses a way a line's product doesn't allow, naming it (B12)", async () => {
        mockDb.items[0]!.fulfilmentTypes = ["PICKUP"];
        const refused = await kitchen
            .edit(OWNER, "order_1", {
                fulfilment: "SHIPPING",
                address: {
                    line1: "12 MG Road",
                    city: "Pune",
                    state: "Maharashtra",
                    postalCode: "411001",
                },
            })
            .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(ConflictException);
        expect((refused as ConflictException).getResponse()).toEqual({
            message:
                "Croissant isn't sold for Shipping. It allows Pick-up only.",
            field: "fulfilment",
        });
        expect(mockDb.order.fulfilment).not.toBe("SHIPPING");
    });

    it("a line with no list of its own leaves any way open (B12)", async () => {
        await kitchen.edit(OWNER, "order_1", {
            fulfilment: "SHIPPING",
            address: {
                line1: "12 MG Road",
                city: "Pune",
                state: "Maharashtra",
                postalCode: "411001",
            },
        });
        expect(mockDb.order.fulfilment).toBe("SHIPPING");
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

describe("the courier and tracking number (B2b, DEC-045)", () => {
    const withCourier = () =>
        reset({
            fulfilment: "LOCAL_DELIVERY",
            stage: "HANDED_TO_COURIER",
            status: "SHIPPED",
            deliveryLine1: "12 MG Road",
            deliveryCity: "Bengaluru",
            deliveryState: "Karnataka",
            deliveryPostalCode: "560001",
        });

    it("the DTOs trim them, take up to 80 characters and refuse more", async () => {
        const body = plainToInstance(MoveStageDto, {
            to: "HANDED_TO_COURIER",
            courierName: "  Delhivery ",
            trackingNumber: "   ",
        });
        expect(await validate(body)).toEqual([]);
        expect(body.courierName).toBe("Delhivery");
        // Blank is no number, not an empty one.
        expect(body.trackingNumber).toBeNull();

        const long = "x".repeat(81);
        expect(
            await refused(MoveStageDto, {
                to: "HANDED_TO_COURIER",
                courierName: long,
                trackingNumber: long,
            }),
        ).toEqual(["courierName", "trackingNumber"]);
        expect(
            await refused(EditOrderDto, {
                courierName: "x".repeat(80),
                trackingNumber: long,
                trackingUrl: "not a link",
            }),
        ).toEqual(["trackingNumber", "trackingUrl"]);
    });

    it("go with the handover: a Member hands a shipment over with them", async () => {
        reset({
            fulfilment: "SHIPPING",
            stage: "READY",
            status: "PROCESSING",
        });
        await kitchen.moveStage(MEMBER, "order_1", {
            to: "HANDED_TO_COURIER",
            courierName: "Delhivery",
            trackingNumber: "AWB4411",
        });
        expect(mockDb.order).toMatchObject({
            stage: "HANDED_TO_COURIER",
            courierName: "Delhivery",
            trackingNumber: "AWB4411",
        });
        // The step on the timeline names them as they were at the handover.
        expect(mockDb.events.at(-1)).toMatchObject({
            kind: "STAGE",
            toStage: "HANDED_TO_COURIER",
            note: "Delhivery · AWB4411",
        });
    });

    it("a handover with neither leaves its step unnamed, and a courier alone names it", async () => {
        reset({
            fulfilment: "SHIPPING",
            stage: "READY",
            status: "PROCESSING",
        });
        await kitchen.moveStage(MEMBER, "order_1", {
            to: "HANDED_TO_COURIER",
        });
        expect(mockDb.events.at(-1)).toMatchObject({
            toStage: "HANDED_TO_COURIER",
            note: null,
        });

        reset({
            fulfilment: "SHIPPING",
            stage: "READY",
            status: "PROCESSING",
        });
        await kitchen.moveStage(MEMBER, "order_1", {
            to: "HANDED_TO_COURIER",
            courierName: "Blue Dart",
            trackingNumber: null,
        });
        expect(mockDb.events.at(-1)).toMatchObject({ note: "Blue Dart" });
    });

    it("are refused on any other step, and nothing moves", async () => {
        await expect(
            kitchen.moveStage(OWNER, "order_1", {
                to: "PREPARING",
                trackingNumber: "AWB4411",
            }),
        ).rejects.toThrow(
            "A tracking number goes with handing the order to a courier.",
        );
        expect(mockDb.order).toMatchObject({
            stage: "NEW",
            trackingNumber: null,
        });
    });

    it("a Member adds the number after handover (order:stage), as a step on the timeline", async () => {
        withCourier();
        const edit = await kitchen.edit(MEMBER, "order_1", {
            trackingNumber: "AWB4411",
        });
        expect(mockDb.order).toMatchObject({
            trackingNumber: "AWB4411",
            courierName: null,
        });
        expect(edit).toMatchObject({ differenceCents: 0, settleCents: 0 });
        const event = mockDb.events.find((e) => e.id === edit.eventId);
        expect(event).toMatchObject({
            kind: "EDIT",
            note: "tracking number AWB4411",
            fromStage: "HANDED_TO_COURIER",
            toStage: "HANDED_TO_COURIER",
        });
    });

    it("a Member still can't change anything else", async () => {
        withCourier();
        await expect(
            kitchen.edit(MEMBER, "order_1", {
                trackingNumber: "AWB4411",
                notes: "Leave at the gate",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockDb.order.trackingNumber).toBeNull();
    });

    it("after handover every other field is refused with 409", async () => {
        withCourier();
        for (const dto of [
            { notes: "Leave at the gate" },
            { lines: [{ itemId: "li_1", quantity: 4 }] },
            { fulfilment: "PICKUP" as const },
            { address: null },
        ]) {
            await expect(kitchen.edit(OWNER, "order_1", dto)).rejects.toThrow(
                "This order has been handed over, so only its courier and tracking number can change.",
            );
        }
        expect(mockDb.order.notes).toBe("No sesame");
        expect(mockDb.events).toHaveLength(0);
    });

    it("a pick-up never has a courier, and one not handed over takes them with the handover", async () => {
        await expect(
            kitchen.edit(OWNER, "order_1", { courierName: "Delhivery" }),
        ).rejects.toThrow("A pick-up order isn't handed to a courier.");
        reset({ fulfilment: "SHIPPING", stage: "READY", status: "PROCESSING" });
        await expect(
            kitchen.edit(OWNER, "order_1", { courierName: "Delhivery" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(mockDb.order.courierName).toBeNull();
    });

    it("a local delivery goes out for delivery (B2c): no courier, before or after", async () => {
        for (const stored of ["LOCAL_DELIVERY"] as const) {
            reset({
                fulfilment: stored,
                stage: "READY",
                status: "PROCESSING",
            });
            await expect(
                kitchen.moveStage(MEMBER, "order_1", {
                    to: "HANDED_TO_COURIER",
                    courierName: "Delhivery",
                }),
            ).rejects.toThrow(
                "This order is a local delivery, so it goes out for delivery, not to a courier.",
            );
            await expect(
                kitchen.moveStage(MEMBER, "order_1", {
                    to: "OUT_FOR_DELIVERY",
                    courierName: "Delhivery",
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
            expect(mockDb.order).toMatchObject({
                stage: "READY",
                courierName: null,
            });
            await kitchen.moveStage(MEMBER, "order_1", {
                to: "OUT_FOR_DELIVERY",
            });
            expect(mockDb.order).toMatchObject({
                stage: "OUT_FOR_DELIVERY",
                status: "SHIPPED",
            });
            await expect(
                kitchen.edit(OWNER, "order_1", { trackingNumber: "AWB4411" }),
            ).rejects.toThrow("A local delivery isn't handed to a courier.");
        }
    });
});

describe("the order read", () => {
    it("a Member gets the kitchen view with no money figures, and the email (contact:read)", async () => {
        const step = await kitchen.moveStage(MEMBER, "order_1", {
            to: "PREPARING",
        });
        const read = await kitchen.read(MEMBER, "order_1");

        expect(read.money).toBeNull();
        expect(read.items[0]).not.toHaveProperty("price");
        expect(read.events[0]).not.toHaveProperty("amountCents");
        expect(read.customer?.email).toBe("asha@example.in");
        expect(read.customer?.name).toBe("Asha Rao");
        expect(read.notes).toBe("No sesame");
        expect(read.next.stages).toEqual(["READY"]);
        expect(read.next.undo?.eventId).toBe(step.eventId);
        expect(read.events[0].actor?.name).toBe("Meera");
        // The fixture's total (360.00 / 36000) must not leak. Wall-clock
        // timestamps (events[].at, next.undo.until) are cut first: one whose
        // milliseconds land on .360 is not a money figure (#847).
        const body = JSON.stringify(read).replace(
            /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,
            "<time>",
        );
        expect(body).not.toContain("360");
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
