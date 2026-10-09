/**
 * Insights' orders figure (#867) against a real Postgres: an order paid at
 * the counter or recorded as paid writes one `order.paid` in the payment's
 * transaction, never two; a refund recorded by hand takes it off again,
 * dated at the sale; an order paid before #867 is never taken off; and the
 * day's rollup carries both, so the figure reads net.
 *
 * The webhook, pay link and booking paths call the same writer from their
 * own transactions (`webhooks.service.spec.ts`, `booking-hold.spec.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { AnalyticsAggregateHandler } from "./analytics-aggregate.handler";
import {
    orderPaidKey,
    recordOrderPaidInTx,
    recordOrderRefundedInTx,
} from "./order-events";

const tag = `${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);

let orgId = "";
let ownerId = "";
let storeId = "";
let bread = "";

/** Two loaves at ₹180: ₹360. */
const place = (over: Partial<CreateOrderDto>) =>
    orders.create(storeId, ownerId, {
        items: [{ productId: bread, quantity: 2 }],
        fulfilment: "PICKUP",
        payment: { kind: "LATER" },
        ...over,
    } as CreateOrderDto);

const eventsOf = (orderId: string) =>
    prisma.analyticsEvent.findMany({
        where: {
            organizationId: orgId,
            properties: { path: ["orderId"], equals: orderId },
        },
        orderBy: { type: "asc" },
    });

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `o867-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye Insights", slug: `o867-org-${tag}` },
        })
    ).id;
    await giveBusinessDetails(orgId);
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `o867-hill-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: {
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
    });
    bread = (
        await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "180",
        })
    ).id;
});

describe("order.paid (#867)", () => {
    it("a counter payment writes one order.paid with the order's total", async () => {
        const made = await place({
            walkIn: { name: "Asha" },
            payment: { kind: "CASH", received: "400" },
        });
        const events = await eventsOf(made.id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            organizationId: orgId,
            type: "order.paid",
            properties: { orderId: made.id, amountCents: 36_000 },
            visitorHash: null,
            dedupeKey: orderPaidKey(made.id),
        });
    });

    it("an order left unpaid writes nothing; Record as paid writes it once", async () => {
        const made = await place({ walkIn: { name: "Ravi" } });
        expect(await eventsOf(made.id)).toHaveLength(0);

        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "PAID",
            paidHow: "UPI",
        });
        // Sent again: a same→same change, nothing more counted.
        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "PAID",
        });

        const events = await eventsOf(made.id);
        expect(events.map((e) => e.type)).toEqual(["order.paid"]);
    });

    it("a second write in the same transaction is skipped, never aborting it", async () => {
        const made = await place({
            walkIn: { name: "Meera" },
            payment: { kind: "UPI" },
        });
        const [again, after] = await prisma.$transaction(async (tx) => {
            const second = await recordOrderPaidInTx(tx, made.id);
            // The transaction is still usable after the skipped insert.
            const count = await tx.analyticsEvent.count({
                where: { dedupeKey: orderPaidKey(made.id) },
            });
            return [second, count];
        });
        expect(again).toBe(false);
        expect(after).toBe(1);
    });

    it("a refund recorded by hand takes it off again, dated at the sale", async () => {
        const made = await place({
            walkIn: { name: "Kabir" },
            payment: { kind: "CASH" },
        });
        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "REFUNDED",
            refundedHow: "CASH",
        });

        const [paid, refunded] = await eventsOf(made.id);
        expect(paid.type).toBe("order.paid");
        expect(refunded).toMatchObject({
            type: "order.refunded",
            properties: { orderId: made.id, amountCents: 36_000 },
            dedupeKey: `order.refunded:${made.id}`,
        });
        expect(refunded.occurredAt.getTime()).toBe(paid.occurredAt.getTime());
        expect(refunded.receivedAt.getTime()).toBeGreaterThanOrEqual(
            paid.receivedAt.getTime(),
        );
    });

    it("an order paid before #867 was never counted, so nothing is taken off", async () => {
        const made = await place({ walkIn: { name: "Old" } });
        // Paid the way an order was before the event existed.
        await prisma.order.update({
            where: { id: made.id },
            data: { paymentStatus: "PAID", paidAt: new Date() },
        });
        await prisma.$transaction((tx) => recordOrderRefundedInTx(tx, made.id));
        expect(await eventsOf(made.id)).toHaveLength(0);
    });

    it("the day's rollup carries paid and refunded, so the figure reads net", async () => {
        // Every day this business's events fell on (a run that crosses
        // midnight UTC spans two).
        const days = new Set(
            (
                await prisma.analyticsEvent.findMany({
                    where: { organizationId: orgId },
                    select: { occurredAt: true },
                })
            ).map((e) => e.occurredAt.toISOString().slice(0, 10)),
        );
        const handler = new AnalyticsAggregateHandler();
        for (const date of days) {
            await handler.handle({
                payload: { organizationId: orgId, date },
            } as unknown as Job);
        }

        const rows = await prisma.analyticsDailyAggregate.findMany({
            where: {
                organizationId: orgId,
                siteId: "",
                dimension: "",
                type: { in: ["order.paid", "order.refunded"] },
            },
        });
        const count = (type: string) =>
            rows
                .filter((r) => r.type === type)
                .reduce((s, r) => s + r.count, 0);
        // Asha, Ravi, Meera and Kabir were paid; Kabir's came back.
        expect(count("order.paid")).toBe(4);
        expect(count("order.refunded")).toBe(1);
        expect(count("order.paid") - count("order.refunded")).toBe(3);
    });
});
