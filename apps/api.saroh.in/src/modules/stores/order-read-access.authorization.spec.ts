/**
 * The store-scoped reads that send amounts (#868, DEC-098, DEC-106): a
 * storefront's order list and read (totals) and its customer list (what each
 * has spent). Amounts follow a money permission — `order:read` on the
 * business role — never store access: a Member (`store:read` and
 * `order:stage` by default) and a role the owner made with only "See
 * locations" get no amounts; a role carrying `order:read` does.
 *
 * Pure unit tests: the real StoresService and its policy, with Prisma and
 * the feature flags mocked, so nothing touches a database.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    prisma: {
        store: { findFirst: jest.fn() },
        membership: { findUnique: jest.fn() },
        organizationRole: { findUnique: jest.fn() },
        storeOwner: { findUnique: jest.fn() },
        storeMembers: { findUnique: jest.fn() },
        order: { findMany: jest.fn(), findFirst: jest.fn() },
        customer: { findMany: jest.fn(), findFirst: jest.fn() },
    },
}));

import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { requireOrderRead } from "./order-read-access";
import { StoresService } from "./stores.service";

const STORE = "store_1";
const ORG = "org_1";
const USER = "user_1";

const db = prisma as unknown as {
    store: { findFirst: jest.Mock };
    membership: { findUnique: jest.Mock };
    organizationRole: { findUnique: jest.Mock };
    storeOwner: { findUnique: jest.Mock };
    storeMembers: { findUnique: jest.Mock };
    order: { findMany: jest.Mock; findFirst: jest.Mock };
    customer: { findMany: jest.Mock; findFirst: jest.Mock };
};

const PAID_ORDER = {
    id: "o1",
    orderId: "ORD-001",
    customerId: "c1",
    walkInName: null,
    status: "DELIVERED",
    paymentStatus: "PAID",
    total: "1250.00",
    currency: "INR",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    customer: {
        email: "ananya@example.com",
        firstName: "Ananya",
        lastName: null,
    },
};

const CUSTOMER = {
    id: "c1",
    storeId: STORE,
    email: "ananya@example.com",
    firstName: "Ananya",
    lastName: null,
    phone: null,
    country: null,
    state: null,
    city: null,
    zipCode: null,
    createdAt: new Date("2026-09-01T10:00:00Z"),
    updatedAt: new Date("2026-09-01T10:00:00Z"),
    orders: [
        {
            total: "1250.00",
            currency: "INR",
            paymentStatus: "PAID",
            createdAt: new Date("2026-10-01T10:00:00Z"),
        },
    ],
};

/**
 * The caller's business role: a built-in one by name, or one the business
 * made with `actions`. `owner`: a StoreOwner row on this storefront.
 */
function caller(
    role: string | null,
    {
        actions = [] as string[],
        owner = false,
        orgPath = true,
    }: { actions?: string[]; owner?: boolean; orgPath?: boolean } = {},
) {
    const row = { id: STORE, organizationId: ORG, name: "Hill Road" };
    db.store.findFirst.mockImplementation((args: { where: { OR?: unknown } }) =>
        Promise.resolve(args.where.OR && !owner ? null : row),
    );
    db.membership.findUnique.mockResolvedValue(
        role ? { role, extraActions: [] } : null,
    );
    db.organizationRole.findUnique.mockResolvedValue({ actions });
    db.storeOwner.findUnique.mockResolvedValue(owner ? { id: "so" } : null);
    db.storeMembers.findUnique.mockResolvedValue(null);
    db.order.findMany.mockResolvedValue([PAID_ORDER]);
    db.customer.findMany.mockResolvedValue([CUSTOMER]);
    const stores = new StoresService({
        isEnabled: jest.fn().mockResolvedValue(orgPath),
    } as unknown as FeatureFlagService);
    return {
        stores,
        orders: new OrdersService(stores),
        customers: new CustomersService(stores),
    };
}

describe("store-scoped reads send amounts only with a money permission (#868)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("refuses a Member: store access and the kitchen, no money read", async () => {
        const { stores, orders, customers } = caller("MEMBER");
        // The Member reaches the storefront itself.
        await expect(stores.getForUser(STORE, USER)).resolves.toMatchObject({
            id: STORE,
        });
        await expect(orders.list(STORE, USER)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(orders.get(STORE, "o1", USER)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(customers.list(STORE, USER)).rejects.toThrow(
            "Your role doesn't include reading this location's customers.",
        );
        // Nothing with amounts was even read.
        expect(db.order.findMany).not.toHaveBeenCalled();
        expect(db.customer.findMany).not.toHaveBeenCalled();
    });

    it("refuses a role the owner made with only store access", async () => {
        const { orders, customers } = caller("location-viewer", {
            actions: ["store:read", "contact:read"],
        });
        await expect(orders.list(STORE, USER)).rejects.toThrow(
            "Your role doesn't include reading this location's orders.",
        );
        await expect(customers.list(STORE, USER)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(customers.get(STORE, "c1", USER)).rejects.toThrow(
            ForbiddenException,
        );
        expect(db.order.findMany).not.toHaveBeenCalled();
        expect(db.customer.findMany).not.toHaveBeenCalled();
    });

    it("sends the amounts to a role carrying order:read", async () => {
        const { orders, customers } = caller("cashier", {
            actions: ["store:read", "order:read"],
        });
        await expect(orders.list(STORE, USER)).resolves.toEqual([
            expect.objectContaining({ total: "1250.00", currency: "INR" }),
        ]);
        await expect(customers.list(STORE, USER)).resolves.toEqual([
            expect.objectContaining({ spent: "1250.00", currency: "INR" }),
        ]);
    });

    it("sends them to an Owner and an Admin by their permissions", async () => {
        for (const role of ["OWNER", "ADMIN"]) {
            const { orders } = caller(role);
            await expect(orders.list(STORE, USER)).resolves.toEqual([
                expect.objectContaining({ total: "1250.00" }),
            ]);
        }
    });

    it("an implied order read counts: a role that edits orders reads them", async () => {
        const { stores } = caller("desk", {
            actions: ["store:read", "order:edit"],
        });
        await expect(
            requireOrderRead(stores, STORE, USER, "orders"),
        ).resolves.toBeUndefined();
    });

    it("on the organization path a StoreOwner row is no shortcut", async () => {
        const { stores } = caller("location-viewer", {
            actions: ["store:read"],
            owner: true,
        });
        await expect(
            requireOrderRead(stores, STORE, USER, "orders"),
        ).rejects.toThrow(ForbiddenException);
    });

    it("with ORG_AUTHORIZATION off the storefront's owner keeps it", async () => {
        const { stores } = caller(null, { owner: true, orgPath: false });
        await expect(
            requireOrderRead(stores, STORE, USER, "orders"),
        ).resolves.toBeUndefined();
    });

    it("a stranger still gets not found, not a refusal", async () => {
        const { stores } = caller(null);
        await expect(
            requireOrderRead(stores, STORE, USER, "orders"),
        ).rejects.toThrow(NotFoundException);
    });
});
