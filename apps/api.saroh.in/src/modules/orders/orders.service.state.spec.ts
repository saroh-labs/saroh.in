// DB-free unit tests for the Order lifecycle guard (S5-001). The database
// package is mocked so nothing touches a real Postgres. `$transaction` runs its
// callback against a tx stub whose delegates are the same jest mocks, so we can
// assert whether the order write happened — or, for an illegal transition, that
// it never did.
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
}));

jest.mock("@saroh/database", () => {
    const order = {
        findFirst: jest.fn(),
        // Recording a payment by hand keeps what was taken (`paidByHand`).
        findUnique: jest.fn().mockResolvedValue({ total: "250.00" }),
        update: jest.fn(),
        // What a refund by hand hands back is read first (UX-061).
        findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ total: "450.00", paidByHand: "450.00" }),
        // Cancelling or refunding retires the order's pay link (B11).
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const inventory = {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
    };
    // Settling a held line reads the row the line recorded (#510); none
    // recorded here, and the product counts no stock.
    const orderItem = { findMany: jest.fn().mockResolvedValue([]) };
    const $queryRaw = jest.fn().mockResolvedValue([]);
    // A status change is a step on the order's timeline (ADR-008).
    const orderEvent = { create: jest.fn() };
    // Marking paid first asks whether it is being paid online (#622): here
    // no visit is held and no payment is going through.
    const booking = { findFirst: jest.fn().mockResolvedValue(null) };
    const paymentIntent = {
        findFirst: jest.fn().mockResolvedValue(null),
        // Nothing was paid online here.
        findMany: jest.fn().mockResolvedValue([]),
    };
    return {
        prisma: {
            order,
            inventory,
            orderEvent,
            booking,
            paymentIntent,
            $transaction: jest.fn((cb) =>
                cb({
                    order,
                    inventory,
                    orderItem,
                    orderEvent,
                    booking,
                    paymentIntent,
                    $queryRaw,
                }),
            ),
        },
    };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import {
    creditRestOfOrder,
    ensureOrderInvoice,
} from "../invoices/order-invoicing";
import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

const orderFindFirst = prisma.order.findFirst as jest.Mock;
const orderUpdate = prisma.order.update as jest.Mock;
const inventoryFindUnique = prisma.inventory.findUnique as jest.Mock;
const eventCreate = prisma.orderEvent.create as jest.Mock;

const STORE = "store_1";
const USER = "user_1";
const ORDER = "order_1";
const ORG = "org_1";

function makeService(canWrite = true) {
    const stores = {
        // The write guard resolves access AND the owning org in one pass
        // (#173): null means "not writable", an object means writable.
        orderWriteOrganization: jest
            .fn()
            .mockResolvedValue(canWrite ? { organizationId: ORG } : null),
    } as unknown as StoresService;
    const activation = {
        firstOrderCreated: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivationEvents;
    return new OrdersService(stores, activation);
}

beforeEach(() => {
    jest.clearAllMocks();
    // Untracked product — applyInventoryTransition finds no Inventory row and
    // skips, so legal status changes don't need stock plumbing here.
    inventoryFindUnique.mockResolvedValue(null);
    orderUpdate.mockResolvedValue({ id: ORDER });
});

describe("OrdersService.updateStatus lifecycle guard (mocked Prisma)", () => {
    it("rejects an illegal status transition (400) and writes nothing", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "DELIVERED",
            paymentStatus: "PAID",
            items: [{ productId: "p1", quantity: 1 }],
        });

        await expect(
            service.updateStatus(STORE, ORDER, USER, { status: "PROCESSING" }),
        ).rejects.toBeInstanceOf(BadRequestException);

        // The guard reads the order under its row lock (#511), inside the
        // transaction; refusing there writes nothing and rolls it back.
        expect(eventCreate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("rejects an illegal payment transition (400) and writes nothing", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PENDING",
            paymentStatus: "REFUNDED",
            items: [{ productId: "p1", quantity: 1 }],
        });

        await expect(
            service.updateStatus(STORE, ORDER, USER, { paymentStatus: "PAID" }),
        ).rejects.toBeInstanceOf(BadRequestException);

        // The guard reads the order under its row lock (#511), inside the
        // transaction; refusing there writes nothing and rolls it back.
        expect(eventCreate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("allows a legal status transition and persists it", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "UNPAID",
            stage: "READY",
            fulfilment: "LOCAL_DELIVERY",
            items: [{ productId: "p1", quantity: 1 }],
        });

        await expect(
            service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" }),
        ).resolves.toEqual({ id: ORDER });

        expect(orderUpdate).toHaveBeenCalledTimes(1);
        expect(orderUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: ORDER },
                data: expect.objectContaining({ status: "SHIPPED" }),
            }),
        );
    });

    it("allows a legal payment transition and persists it", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PENDING",
            paymentStatus: "UNPAID",
            items: [{ productId: "p1", quantity: 1 }],
        });

        await expect(
            service.updateStatus(STORE, ORDER, USER, { paymentStatus: "PAID" }),
        ).resolves.toEqual({ id: ORDER });

        expect(orderUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ paymentStatus: "PAID" }),
            }),
        );
        // Paid by hand: the order's invoice is made in the same
        // transaction, the way a payment webhook would (ADR-008).
        expect(ensureOrderInvoice).toHaveBeenCalledWith(
            expect.anything(),
            ORDER,
            { method: "RECORDED" },
        );
        // Paid at the counter: its pay link stops working, so nobody can
        // pay twice (B11, DEC-067).
        expect(
            (prisma.order as unknown as { updateMany: jest.Mock }).updateMany,
        ).toHaveBeenCalledWith({
            where: { id: ORDER, payTokenHash: { not: null } },
            data: { payTokenHash: null, payLinkCreatedAt: null },
        });
    });

    it("marked paid with a way (#834): the invoice keeps it and the timeline says it", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PENDING",
            paymentStatus: "UNPAID",
            organizationId: ORG,
            items: [{ productId: "p1", quantity: 1 }],
        });

        await service.updateStatus(STORE, ORDER, USER, {
            paymentStatus: "PAID",
            paidHow: "UPI",
        });

        expect(ensureOrderInvoice).toHaveBeenCalledWith(
            expect.anything(),
            ORDER,
            { method: "UPI" },
        );
        expect(eventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: ORG,
                orderId: ORDER,
                kind: "STATUS",
                actorUserId: USER,
                note: "Marked paid · UPI",
                // The whole total, nothing having been paid online.
                amountCents: 25000,
            }),
        });
    });

    it("re-recording an order already paid leaves its link alone", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PENDING",
            paymentStatus: "PAID",
            items: [{ productId: "p1", quantity: 1 }],
        });
        await service.updateStatus(STORE, ORDER, USER, {
            paymentStatus: "PAID",
        });
        expect(
            (prisma.order as unknown as { updateMany: jest.Mock }).updateMany,
        ).not.toHaveBeenCalled();
    });

    it("a refund recorded by hand credits what is left of the invoice", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            organizationId: "org1",
            status: "DELIVERED",
            paymentStatus: "PAID",
            items: [{ productId: "p1", quantity: 1 }],
        });
        await service.updateStatus(STORE, ORDER, USER, {
            paymentStatus: "REFUNDED",
            refundedHow: "CASH",
        });
        // On the timeline: how much went back, and how (UX-061).
        expect(eventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                kind: "REFUND",
                note: "Handed back in cash",
                amountCents: 45_000,
            }),
        });
        expect(creditRestOfOrder).toHaveBeenCalledWith(
            expect.anything(),
            ORDER,
            "Refunded",
            USER,
        );
        expect(ensureOrderInvoice).not.toHaveBeenCalled();
        // Refunded: its pay link stops working (B11).
        expect(
            (prisma.order as unknown as { updateMany: jest.Mock }).updateMany,
        ).toHaveBeenCalledWith({
            where: { id: ORDER, payTokenHash: { not: null } },
            data: { payTokenHash: null, payLinkCreatedAt: null },
        });
    });

    it("is idempotent: re-setting the SAME status is a no-op change, not rejected", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "SHIPPED",
            paymentStatus: "PAID",
            items: [{ productId: "p1", quantity: 1 }],
        });

        // SHIPPED→SHIPPED is not in the transition map, but the service treats
        // same→same as "not changing" so it is never asserted — the write still
        // succeeds (no inventory re-apply, no rejection).
        await expect(
            service.updateStatus(STORE, ORDER, USER, {
                status: "SHIPPED",
                paymentStatus: "PAID",
            }),
        ).resolves.toEqual({ id: ORDER });

        expect(orderUpdate).toHaveBeenCalledTimes(1);
    });

    it("rejects the illegal move even when a legal one is bundled with it", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "UNPAID",
            items: [{ productId: "p1", quantity: 1 }],
        });

        // status PROCESSING→SHIPPED is legal, but payment UNPAID→REFUNDED is not.
        await expect(
            service.updateStatus(STORE, ORDER, USER, {
                status: "SHIPPED",
                paymentStatus: "REFUNDED",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);

        // The guard reads the order under its row lock (#511), inside the
        // transaction; refusing there writes nothing and rolls it back.
        expect(eventCreate).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("keeps the kitchen stage in step and logs the change on the timeline", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "PAID",
            stage: "READY",
            fulfilment: "LOCAL_DELIVERY",
            organizationId: ORG,
            items: [{ productId: "p1", quantity: 1 }],
        });

        await service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" });

        // A local delivery that is shipped is out for delivery (B2c); its
        // type stays.
        expect(orderUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "SHIPPED",
                    stage: "OUT_FOR_DELIVERY",
                }),
            }),
        );
        expect(orderUpdate.mock.calls[0][0].data).not.toHaveProperty(
            "fulfilment",
        );
        expect(eventCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                kind: "STATUS",
                actorUserId: USER,
                fromStatus: "PROCESSING",
                toStatus: "SHIPPED",
                fromStage: "READY",
                toStage: "OUT_FOR_DELIVERY",
            }),
        });
    });

    it("collects a PROCESSING order straight to DELIVERED (ADR-008)", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "PAID",
            stage: "READY",
            fulfilment: "PICKUP",
            organizationId: ORG,
            items: [{ productId: "p1", quantity: 1 }],
        });

        await service.updateStatus(STORE, ORDER, USER, { status: "DELIVERED" });

        expect(orderUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "DELIVERED",
                    stage: "COLLECTED",
                }),
            }),
        );
    });

    it.each([
        ["PICKUP", "READY", "SHIPPED", /A pick-up order isn't shipped/],
        ["PICKUP", "READY", "SHIPPED", /A pick-up order isn't shipped/],
        ["DIGITAL", "NEW", "SHIPPED", /A digital order isn't shipped/],
        ["APPOINTMENT_IN_PERSON", "NEW", "DELIVERED", /finished by its visits/],
    ])(
        "refuses to mark a %s order (at %s) %s: 409, a sentence, and nothing written",
        async (fulfilment, stage, status, sentence) => {
            const service = makeService();
            orderFindFirst.mockResolvedValue({
                id: ORDER,
                status: "PROCESSING",
                paymentStatus: "PAID",
                stage,
                fulfilment,
                organizationId: ORG,
                items: [{ productId: "p1", quantity: 1 }],
            });

            const err = await service
                .updateStatus(STORE, ORDER, USER, {
                    status: status as "SHIPPED" | "DELIVERED",
                })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(ConflictException);
            expect((err as ConflictException).message).toMatch(sentence);
            expect(orderUpdate).not.toHaveBeenCalled();
            expect(eventCreate).not.toHaveBeenCalled();
        },
    );

    it("a local delivery in the new name ships out for delivery; a shipment goes to its courier", async () => {
        const service = makeService();
        const ready = (fulfilment: string) => ({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "PAID",
            stage: "READY",
            fulfilment,
            organizationId: ORG,
            items: [{ productId: "p1", quantity: 1 }],
        });
        orderFindFirst.mockResolvedValue(ready("LOCAL_DELIVERY"));
        await service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" });
        expect(orderUpdate.mock.calls[0][0].data).toMatchObject({
            status: "SHIPPED",
            stage: "OUT_FOR_DELIVERY",
        });
        orderFindFirst.mockResolvedValue(ready("SHIPPING"));
        await service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" });
        expect(orderUpdate.mock.calls[1][0].data).toMatchObject({
            status: "SHIPPED",
            stage: "HANDED_TO_COURIER",
        });
    });

    it("a local delivery already with a courier (before the switch) is delivered from there", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "SHIPPED",
            paymentStatus: "PAID",
            stage: "HANDED_TO_COURIER",
            fulfilment: "LOCAL_DELIVERY",
            organizationId: ORG,
            items: [{ productId: "p1", quantity: 1 }],
        });
        await service.updateStatus(STORE, ORDER, USER, { status: "DELIVERED" });
        expect(orderUpdate.mock.calls[0][0].data).toMatchObject({
            status: "DELIVERED",
            stage: "DELIVERED",
        });
        expect(orderUpdate.mock.calls[0][0].data).not.toHaveProperty(
            "fulfilment",
        );
    });

    it("still 404s a missing order before any lifecycle check", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue(null);

        await expect(
            service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

/**
 * The store-scoped status write asks the order power it uses (B16):
 * recording a status or a payment by hand is `order:edit`, cancelling or
 * recording money handed back is `order:refund`. A role that can see the
 * storefront without it gets a 403 in words, and nothing is written.
 */
describe("OrdersService.updateStatus — the order power each change asks (B16)", () => {
    function withPowers(held: string[]) {
        const stores = {
            orderWriteOrganization: jest.fn(
                (_s: string, _u: string, action: string) =>
                    Promise.resolve(
                        held.includes(action) ? { organizationId: ORG } : null,
                    ),
            ),
            getForUser: jest.fn().mockResolvedValue({ id: STORE }),
        };
        return {
            stores,
            service: new OrdersService(stores as unknown as StoresService),
        };
    }

    beforeEach(() => {
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PENDING",
            paymentStatus: "UNPAID",
            stage: "NEW",
            fulfilment: "PICKUP",
            organizationId: ORG,
            items: [],
        });
    });

    it("records a payment by hand with order:edit", async () => {
        const { service, stores } = withPowers(["order:edit"]);
        await service.updateStatus(STORE, ORDER, USER, {
            paymentStatus: "PAID",
        });
        expect(stores.orderWriteOrganization).toHaveBeenCalledWith(
            STORE,
            USER,
            "order:edit",
        );
        expect(orderUpdate).toHaveBeenCalled();
    });

    it("refuses a cancel to order:edit alone, and writes nothing", async () => {
        const { service } = withPowers(["order:edit"]);
        const cancel = service.updateStatus(STORE, ORDER, USER, {
            status: "CANCELLED",
        });
        await expect(cancel).rejects.toBeInstanceOf(ForbiddenException);
        await expect(cancel).rejects.toThrow(
            "Your role can't refund or cancel orders.",
        );
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("cancels with order:refund", async () => {
        const { service } = withPowers(["order:refund"]);
        await service.updateStatus(STORE, ORDER, USER, {
            status: "CANCELLED",
        });
        expect(orderUpdate).toHaveBeenCalled();
    });

    it("refuses a payment recorded by hand to order:refund alone", async () => {
        const { service } = withPowers(["order:refund"]);
        await expect(
            service.updateStatus(STORE, ORDER, USER, { paymentStatus: "PAID" }),
        ).rejects.toThrow("Your role can't change orders.");
        expect(orderUpdate).not.toHaveBeenCalled();
    });
});
