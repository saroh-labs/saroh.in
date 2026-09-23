// DB-free regression tests for organization stamping on create (#173).
//
// `20260719184929_commerce_org_scope` added a NULLABLE `organizationId` to the
// commerce tables and backfilled once, but no write path ever set it — so every
// row created afterwards had `organizationId = NULL`. A NULL there is invisible
// to `WHERE "organizationId" = $1` AND to the `org_isolation` RLS policy built
// on the same predicate, so the row silently vanishes from its owning tenant.
//
// The bug was invisible precisely because nothing asserted the column. These
// tests exist to make its return loud.
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
    const order = { create: jest.fn(), count: jest.fn() };
    const customer = { findFirst: jest.fn() };
    const product = { findFirst: jest.fn() };
    const inventory = { findUnique: jest.fn(), update: jest.fn() };
    const storeSettings = { findUnique: jest.fn() };
    return {
        prisma: {
            order,
            storeSettings,
            customer,
            product,
            inventory,
            $transaction: jest.fn((cb) =>
                cb({ order, customer, product, inventory }),
            ),
        },
    };
});

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ActivationEvents } from "../analytics/activation-events";
import type { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

const orderCreate = prisma.order.create as jest.Mock;
const orderCount = prisma.order.count as jest.Mock;
const customerFindFirst = prisma.customer.findFirst as jest.Mock;
const productFindFirst = prisma.product.findFirst as jest.Mock;
const inventoryFindUnique = prisma.inventory.findUnique as jest.Mock;
const settingsFindUnique = prisma.storeSettings.findUnique as jest.Mock;

const STORE = "store_1";
const USER = "user_1";
const ORG = "org_1";
const PRODUCT = "product_1";
const CUSTOMER = "customer_1";

const DTO = {
    customerId: CUSTOMER,
    items: [{ productId: PRODUCT, quantity: 2 }],
};

/** `writableOrganization` returning null means "not writable" (#173). */
function makeService(writable: { organizationId: string | null } | null) {
    const stores = {
        writableOrganization: jest.fn().mockResolvedValue(writable),
    } as unknown as StoresService;
    // Activation events are fire-and-forget instrumentation (#176); a stub
    // keeps these tests about order writes rather than about analytics.
    const activation = {
        firstOrderCreated: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivationEvents;
    return new OrdersService(stores, activation);
}

beforeEach(() => {
    jest.clearAllMocks();
    customerFindFirst.mockResolvedValue({ id: CUSTOMER });
    productFindFirst.mockResolvedValue({
        name: "Widget",
        price: "20.00",
        categoryId: null,
        variants: [],
    });
    inventoryFindUnique.mockResolvedValue(null); // untracked — no stock plumbing
    orderCount.mockResolvedValue(0);
    orderCreate.mockResolvedValue({ id: "order_1", items: [] });
    settingsFindUnique.mockResolvedValue(null);
});

describe("OrdersService.create — organization stamping (#173)", () => {
    it("stamps organizationId on the created order", async () => {
        await makeService({ organizationId: ORG }).create(STORE, USER, DTO);

        expect(orderCreate).toHaveBeenCalledTimes(1);
        expect(orderCreate.mock.calls[0][0].data).toMatchObject({
            storeId: STORE,
            organizationId: ORG,
        });
    });

    it("never writes an order with organizationId absent", async () => {
        await makeService({ organizationId: ORG }).create(STORE, USER, DTO);

        // `toMatchObject` above would pass on a missing key if it were also
        // missing from the expectation, so assert presence explicitly: this is
        // the exact shape the bug had.
        expect(Object.keys(orderCreate.mock.calls[0][0].data)).toContain(
            "organizationId",
        );
    });

    it("takes the org from the write guard, not from a second lookup", async () => {
        const service = makeService({ organizationId: "org_from_guard" });
        await service.create(STORE, USER, DTO);

        expect(orderCreate.mock.calls[0][0].data.organizationId).toBe(
            "org_from_guard",
        );
    });

    it("stamps null for a legacy org-less store rather than throwing", async () => {
        // Writable, but the store predates Organization ownership. "Not
        // writable" and "writable with no org" must stay distinct answers.
        await makeService({ organizationId: null }).create(STORE, USER, DTO);

        expect(orderCreate.mock.calls[0][0].data.organizationId).toBeNull();
    });

    it("still 404s and writes nothing when the store is not writable", async () => {
        await expect(
            makeService(null).create(STORE, USER, DTO),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(orderCreate).not.toHaveBeenCalled();
    });
});

describe("OrdersService.create — the storefront's currency", () => {
    const writable = { organizationId: ORG };

    it("takes the order in the currency the storefront chose", async () => {
        settingsFindUnique.mockResolvedValue({ currency: "INR" });
        await makeService(writable).create(STORE, USER, DTO);
        expect(orderCreate.mock.calls[0][0].data.currency).toBe("INR");
    });

    it("refuses an order in a different currency", async () => {
        settingsFindUnique.mockResolvedValue({ currency: "INR" });
        await expect(
            makeService(writable).create(STORE, USER, {
                ...DTO,
                currency: "USD",
            }),
        ).rejects.toThrow(/takes orders in INR/);
        expect(orderCreate).not.toHaveBeenCalled();
    });

    it("falls back as before when the storefront never chose one", async () => {
        await makeService(writable).create(STORE, USER, DTO);
        expect(orderCreate.mock.calls[0][0].data.currency).toBe("USD");
    });
});
