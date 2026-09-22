// The business-wide Orders list: what it is scoped BY, and what it cannot be
// widened to.
jest.mock("@saroh/database", () => {
    const order = { findMany: jest.fn() };
    return { prisma: { order } };
});

import { prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

const findMany = prisma.order.findMany as jest.Mock;

function service() {
    return new OrdersService(
        {} as unknown as StoresService,
        undefined as unknown as ActivationEvents,
    );
}

const ROW = {
    id: "ord_1",
    orderId: "1042",
    customerId: "cus_1",
    status: "PENDING",
    paymentStatus: "UNPAID",
    total: "2280.00",
    currency: "INR",
    createdAt: new Date("2026-09-20T10:00:00Z"),
    customer: {
        email: "priya@example.in",
        firstName: "Priya",
        lastName: "Raman",
    },
    store: { id: "store_1", name: "Hill Road" },
    _count: { items: 2 },
};

beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([ROW]);
});

describe("OrdersService.listForOrganization", () => {
    it("scopes every query to the organization it was given", async () => {
        await service().listForOrganization("org_1");

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ organizationId: "org_1" }),
            }),
        );
    });

    it("lets a storeId NARROW the set but never replace the scope", async () => {
        await service().listForOrganization("org_1", { storeId: "store_9" });

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    organizationId: "org_1",
                    storeId: "store_9",
                }),
            }),
        );
    });

    it("ignores an empty storeId rather than filtering on nothing", async () => {
        await service().listForOrganization("org_1", { storeId: "" });

        const where = findMany.mock.calls[0][0].where;
        expect(where).not.toHaveProperty("storeId");
    });

    it("returns the storefront and item count each row needs", async () => {
        const orders = await service().listForOrganization("org_1");

        expect(orders[0]).toEqual(
            expect.objectContaining({
                orderId: "1042",
                standing: "UNFULFILLED",
                itemCount: 2,
                store: { id: "store_1", name: "Hill Road" },
                total: "2280.00",
            }),
        );
        expect(orders[0]!.customer).toEqual({
            id: "cus_1",
            name: "Priya Raman",
            email: "priya@example.in",
        });
    });

    it("falls back to null rather than an empty name", async () => {
        findMany.mockResolvedValue([
            {
                ...ROW,
                customer: { ...ROW.customer, firstName: null, lastName: null },
            },
        ]);

        const orders = await service().listForOrganization("org_1");

        expect(orders[0]!.customer).toEqual({
            id: "cus_1",
            name: null,
            email: "priya@example.in",
        });
    });

    it("puts the newest order first", async () => {
        await service().listForOrganization("org_1");

        expect(findMany.mock.calls[0][0].orderBy).toEqual({
            createdAt: "desc",
        });
    });
});
