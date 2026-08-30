// DB-free unit tests for the Order lifecycle guard (S5-001). The database
// package is mocked so nothing touches a real Postgres. `$transaction` runs its
// callback against a tx stub whose delegates are the same jest mocks, so we can
// assert whether the order write happened — or, for an illegal transition, that
// it never did.
jest.mock("@saroh/database", () => {
    const order = {
        findFirst: jest.fn(),
        update: jest.fn(),
    };
    const inventory = {
        findUnique: jest.fn(),
        update: jest.fn(),
    };
    return {
        prisma: {
            order,
            inventory,
            $transaction: jest.fn((cb) => cb({ order, inventory })),
        },
    };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

const orderFindFirst = prisma.order.findFirst as jest.Mock;
const orderUpdate = prisma.order.update as jest.Mock;
const inventoryFindUnique = prisma.inventory.findUnique as jest.Mock;
const txMock = prisma.$transaction as jest.Mock;

const STORE = "store_1";
const USER = "user_1";
const ORDER = "order_1";
const ORG = "org_1";

function makeService(canWrite = true) {
    const stores = {
        // The write guard resolves access AND the owning org in one pass
        // (#173): null means "not writable", an object means writable.
        writableOrganization: jest
            .fn()
            .mockResolvedValue(canWrite ? { organizationId: ORG } : null),
    } as unknown as StoresService;
    return new OrdersService(stores);
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

        expect(txMock).not.toHaveBeenCalled();
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

        expect(txMock).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("allows a legal status transition and persists it", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue({
            id: ORDER,
            status: "PROCESSING",
            paymentStatus: "UNPAID",
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

        expect(txMock).not.toHaveBeenCalled();
        expect(orderUpdate).not.toHaveBeenCalled();
    });

    it("still 404s a missing order before any lifecycle check", async () => {
        const service = makeService();
        orderFindFirst.mockResolvedValue(null);

        await expect(
            service.updateStatus(STORE, ORDER, USER, { status: "SHIPPED" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
