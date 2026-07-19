import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { InventoryService } from "../products/inventory.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { OrdersService } from "./orders.service";

// Integration against the dev DB. Creates throwaway users + a store, cleans up.
const ownerEmail = `ord-owner-${process.pid}@example.com`;
const strangerEmail = `ord-stranger-${process.pid}@example.com`;

describe("Orders & inventory (dev DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);

    let ownerId = "";
    let strangerId = "";
    let storeId = "";
    let productId = "";
    let orgId = "";
    let customerId = "";

    async function stock() {
        const inv = await prisma.inventory.findUnique({
            where: { productId },
            select: { quantity: true, reserved: true },
        });
        return inv!;
    }

    beforeAll(async () => {
        ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
            .id;
        strangerId = (
            await prisma.user.create({ data: { email: strangerEmail } })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: {
                    name: "Orders Test Org",
                    slug: `orders-org-${process.pid}`,
                },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Orders Test",
                slug: `orders-${process.pid}`,
            })
        ).id;
        productId = (
            await products.create(storeId, ownerId, {
                name: "Widget",
                price: "20.00",
            })
        ).id;
        await inventory.upsert(storeId, productId, ownerId, { quantity: 10 });
        customerId = (
            await customers.create(storeId, ownerId, {
                email: `buyer-${process.pid}@example.com`,
                firstName: "Buy",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
        await prisma.order.deleteMany({ where: { storeId } });
        await prisma.inventory.deleteMany({ where: { storeId } });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.customer.deleteMany({ where: { storeId } });
        await prisma.storeOwner.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, strangerEmail] } },
        });
        await prisma.$disconnect();
    });

    let orderAId = "";

    it("computes totals server-side and reserves stock on create", async () => {
        const res = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId, quantity: 3 }],
            tax: "5.00",
            shipping: "10.00",
            discount: "2.00",
        });
        orderAId = res.id;
        const order = await orders.get(storeId, orderAId, ownerId);
        // subtotal 60.00 + tax 5 + ship 10 − disc 2 = 73.00
        expect(order.subtotal).toBe("60.00");
        expect(order.total).toBe("73.00");
        expect(order.orderId).toBe("ORD-001");
        expect(order.items[0].price).toBe("20.00");
        const inv = await stock();
        expect(inv).toEqual({ quantity: 10, reserved: 3 }); // available 7
    });

    it("rejects an order that would oversell, leaving stock intact", async () => {
        await expect(
            orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId, quantity: 100 }],
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await stock()).toEqual({ quantity: 10, reserved: 3 });
    });

    it("rejects an unknown product / customer", async () => {
        await expect(
            orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: "nope", quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            orders.create(storeId, ownerId, {
                customerId: "nope",
                items: [{ productId, quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("commits stock on SHIPPED (quantity down, reserved released)", async () => {
        await orders.updateStatus(storeId, orderAId, ownerId, {
            status: "SHIPPED",
        });
        expect(await stock()).toEqual({ quantity: 7, reserved: 0 });
    });

    it("is idempotent — re-setting the same status doesn't double-apply", async () => {
        await orders.updateStatus(storeId, orderAId, ownerId, {
            status: "SHIPPED",
            paymentStatus: "PAID",
        });
        expect(await stock()).toEqual({ quantity: 7, reserved: 0 });
        const order = await orders.get(storeId, orderAId, ownerId);
        expect(order.paymentStatus).toBe("PAID");
    });

    it("restocks on cancel-after-ship", async () => {
        await orders.updateStatus(storeId, orderAId, ownerId, {
            status: "CANCELLED",
        });
        expect(await stock()).toEqual({ quantity: 10, reserved: 0 });
    });

    it("releases a reservation when a pending order is cancelled", async () => {
        const res = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId, quantity: 4 }],
        });
        expect(await stock()).toEqual({ quantity: 10, reserved: 4 });
        expect((await orders.get(storeId, res.id, ownerId)).orderId).toBe(
            "ORD-002",
        );
        await orders.updateStatus(storeId, res.id, ownerId, {
            status: "CANCELLED",
        });
        expect(await stock()).toEqual({ quantity: 10, reserved: 0 });
    });

    it("denies a non-member (404, no leak)", async () => {
        await expect(orders.list(storeId, strangerId)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            orders.create(storeId, strangerId, {
                customerId,
                items: [{ productId, quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("enforces unique customer email per store", async () => {
        const email = `dup-${process.pid}@example.com`;
        await customers.create(storeId, ownerId, { email });
        await expect(
            customers.create(storeId, ownerId, { email }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
