/**
 * Product fulfilment types (B12, DEC-045; plan B default 15) against a real
 * Postgres: a product's list is saved in the new names only, and an order
 * refuses a way one of its items' lists leaves out — on create and on an
 * edit — while a product with no list behaves as before. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PatchProductDto } from "../products/dto";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { OrdersService } from "./orders.service";

const tag = `${process.pid}-${Date.now()}`;
const address = {
    name: "Asha",
    line1: "12 MG Road",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
};

describe("product fulfilment types (B12, DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const orders = new OrdersService(stores);
    const kitchen = new OrderKitchenService(
        new PaymentsService(
            new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
        ),
    );

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let customerId = "";
    let cake = "";
    let jar = "";
    let candle = "";
    let owner: OrganizationContext;

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `b12-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "B12 Bakery", slug: `b12-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "B12 Bakery",
                slug: `b12-${tag}`,
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
        });
        owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
        customerId = (
            await prisma.customer.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    email: `b12-buyer-${tag}@example.com`,
                    firstName: "Asha",
                },
            })
        ).id;
        cake = (
            await products.create(storeId, ownerId, {
                name: "Chocolate cake",
                price: "650",
                fulfilmentTypes: ["LOCAL_DELIVERY", "PICKUP"],
            })
        ).id;
        jar = (
            await products.create(storeId, ownerId, {
                name: "Honey jar",
                slug: "honey-jar",
                price: "300",
                fulfilmentTypes: ["SHIPPING"],
            })
        ).id;
        candle = (
            await products.create(storeId, ownerId, {
                name: "Candle",
                slug: "candle",
                price: "200",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.orderEvent.deleteMany({ where: { order: { storeId } } });
        await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
        await prisma.order.deleteMany({ where: { storeId } });
        await prisma.customer.deleteMany({ where: { storeId } });
        await prisma.product.deleteMany({ where: { organizationId: orgId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.membership.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    const place = (
        items: string[],
        fulfilment: "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING",
    ) =>
        orders.create(storeId, ownerId, {
            customerId,
            items: items.map((productId) => ({ productId, quantity: 1 })),
            fulfilment,
            ...(fulfilment === "PICKUP" ? {} : { address }),
        });

    describe("the product's list", () => {
        it("is stored in the new names, in table order, and read back", async () => {
            const stored = await prisma.product.findUniqueOrThrow({
                where: { id: cake },
                select: { fulfilmentTypes: true },
            });
            expect(stored.fulfilmentTypes).toEqual([
                "PICKUP",
                "LOCAL_DELIVERY",
            ]);
            const read = await products.get(storeId, cake, ownerId);
            expect(read.fulfilmentTypes).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
            // No list: every way its storefronts offer.
            const plain = await products.get(storeId, candle, ownerId);
            expect(plain.fulfilmentTypes).toEqual([]);
        });

        it("a section save replaces it, drops a repeat, and leaves the rest alone", async () => {
            const after = await products.patch(storeId, candle, ownerId, {
                fulfilmentTypes: ["SHIPPING", "DIGITAL", "SHIPPING"],
            });
            expect(after.fulfilmentTypes).toEqual(["SHIPPING", "DIGITAL"]);
            expect(after.price).toBe("200.00");
            const cleared = await products.patch(storeId, candle, ownerId, {
                fulfilmentTypes: [],
            });
            expect(cleared.fulfilmentTypes).toEqual([]);
            // A save of another field keeps the list.
            const other = await products.patch(storeId, cake, ownerId, {
                howToUse: "Keep cool",
            });
            expect(other.fulfilmentTypes).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        });

        it("refuses an appointment or a legacy word at the door", async () => {
            for (const bad of [
                ["APPOINTMENT_IN_PERSON"],
                ["COLLECT"],
                ["DELIVERY"],
                ["TELEPORT"],
            ]) {
                const dto = plainToInstance(PatchProductDto, {
                    fulfilmentTypes: bad,
                });
                const errors = await validate(dto);
                expect(errors.map((e) => e.property)).toEqual([
                    "fulfilmentTypes",
                ]);
            }
            const ok = await validate(
                plainToInstance(PatchProductDto, {
                    fulfilmentTypes: ["PICKUP", "DIGITAL"],
                }),
            );
            expect(ok).toEqual([]);
        });

        it("a copy is fulfilled the ways the original is", async () => {
            const copy = await products.duplicate(storeId, cake, ownerId);
            const read = await prisma.product.findUniqueOrThrow({
                where: { id: copy.id },
                select: { fulfilmentTypes: true },
            });
            expect(read.fulfilmentTypes).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        });
    });

    describe("placing an order", () => {
        it("refuses a Shipping order with a Pick-up and Local delivery item (409), writing nothing", async () => {
            const before = await prisma.order.count({ where: { storeId } });
            await expect(place([cake], "SHIPPING")).rejects.toThrow(
                ConflictException,
            );
            await expect(
                place([candle, cake], "SHIPPING"),
            ).rejects.toMatchObject({
                response: {
                    message:
                        "Chocolate cake isn't sold for Shipping. It allows Pick-up and Local delivery only.",
                    field: "fulfilment",
                },
            });
            expect(await prisma.order.count({ where: { storeId } })).toBe(
                before,
            );
        });

        it("takes a way every item allows", async () => {
            const order = await place([cake], "LOCAL_DELIVERY");
            const row = await prisma.order.findUniqueOrThrow({
                where: { id: order.id },
                select: { fulfilment: true },
            });
            expect(row.fulfilment).toBe("LOCAL_DELIVERY");
        });

        it("a cake and a shipped-only jar share no way", async () => {
            for (const way of [
                "PICKUP",
                "LOCAL_DELIVERY",
                "SHIPPING",
            ] as const) {
                await expect(place([cake, jar], way)).rejects.toThrow(
                    ConflictException,
                );
            }
        });

        it("an item with no list behaves as before B12, any way", async () => {
            for (const way of [
                "PICKUP",
                "LOCAL_DELIVERY",
                "SHIPPING",
            ] as const) {
                await expect(place([candle], way)).resolves.toMatchObject({
                    id: expect.any(String),
                });
            }
        });
    });

    describe("editing an order", () => {
        it("refuses a change to a way an item disallows, and keeps the order as it was", async () => {
            const order = await place([cake], "PICKUP");
            await expect(
                kitchen.edit(owner, order.id, {
                    fulfilment: "SHIPPING",
                    address,
                }),
            ).rejects.toThrow("Chocolate cake isn't sold for Shipping");
            const row = await prisma.order.findUniqueOrThrow({
                where: { id: order.id },
                select: { fulfilment: true, deliveryLine1: true },
            });
            expect(row).toEqual({ fulfilment: "PICKUP", deliveryLine1: null });
            // A way it allows still changes.
            await kitchen.edit(owner, order.id, {
                fulfilment: "LOCAL_DELIVERY",
                address,
            });
            const moved = await prisma.order.findUniqueOrThrow({
                where: { id: order.id },
                select: { fulfilment: true },
            });
            expect(moved.fulfilment).toBe("LOCAL_DELIVERY");
        });

        it("refuses adding a line whose product doesn't allow the order's way", async () => {
            const order = await place([candle], "PICKUP");
            await expect(
                kitchen.edit(owner, order.id, {
                    add: [{ productId: jar, quantity: 1 }],
                }),
            ).rejects.toThrow("Honey jar isn't sold for Pick-up");
            expect(
                await prisma.orderItem.count({ where: { orderId: order.id } }),
            ).toBe(1);
        });

        it("judges only the lines the order keeps", async () => {
            // A cake picked up, with a candle: take the cake off and ship it.
            const order = await place([cake, candle], "PICKUP");
            const cakeLine = await prisma.orderItem.findFirstOrThrow({
                where: { orderId: order.id, productId: cake },
                select: { id: true },
            });
            await kitchen.edit(owner, order.id, {
                lines: [{ itemId: cakeLine.id, quantity: 0 }],
                fulfilment: "SHIPPING",
                address,
            });
            const row = await prisma.order.findUniqueOrThrow({
                where: { id: order.id },
                select: { fulfilment: true },
            });
            expect(row.fulfilment).toBe("SHIPPING");
        });

        it("an appointment is still refused before any item is judged", async () => {
            const order = await place([candle], "PICKUP");
            await expect(
                kitchen.edit(owner, order.id, {
                    fulfilment: "APPOINTMENT_IN_PERSON",
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
