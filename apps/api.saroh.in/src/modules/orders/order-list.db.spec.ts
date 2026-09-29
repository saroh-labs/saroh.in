/**
 * The Orders list, v2 (plan B, B1), against a real Postgres: paging and tab
 * counts, every filter, what a caller without money or contact rights gets,
 * days in the business's zone and late. The only shape since B2d.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrderListQuery } from "./order-list";
import { listOrderRows } from "./order-list";

const NOW = new Date("2026-09-27T06:30:00.000Z"); // noon IST
const MIN = 60_000;
const full = { money: true, contact: true };

let orgId: string;
let otherOrgId: string;
const stores: string[] = [];
let otherStore: string;
let asha: string;
let ravi: string;
let bread: string;
let cake: string;
let seq = 0;

async function order(
    over: {
        store?: string;
        customer?: string;
        minutesAgo?: number;
        at?: Date;
        status?: string;
        paymentStatus?: string;
        stage?: "NEW" | "PREPARING" | "READY" | "COLLECTED" | "DELIVERED";
        fulfilment?: "PICKUP" | "LOCAL_DELIVERY";
        placedOnline?: boolean;
        product?: string;
        org?: string;
    } = {},
): Promise<string> {
    seq += 1;
    const store = over.store ?? stores[0]!;
    const o = await prisma.order.create({
        data: {
            storeId: store,
            organizationId: over.org ?? orgId,
            orderId: `ORD-${String(seq).padStart(4, "0")}`,
            customerId: over.customer ?? asha,
            subtotal: "610.00",
            total: "610.00",
            currency: "INR",
            status: over.status ?? "PENDING",
            paymentStatus: over.paymentStatus ?? "PAID",
            stage: over.stage ?? "NEW",
            fulfilment: over.fulfilment ?? "PICKUP",
            placedOnline: over.placedOnline ?? false,
            createdAt:
                over.at ??
                new Date(NOW.getTime() - (over.minutesAgo ?? seq) * MIN),
            items: {
                create: [
                    {
                        productId: over.product ?? bread,
                        quantity: 1,
                        price: "250.00",
                    },
                ],
            },
        },
    });
    return o.id;
}

async function pay(orderId: string, cents: number, refunded = 0) {
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId,
            provider: "RAZORPAY",
            amountCents: cents,
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    if (refunded > 0) {
        await prisma.paymentRefund.create({
            data: {
                organizationId: orgId,
                paymentIntentId: intent.id,
                amountCents: refunded,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
    }
}

const list = (query: OrderListQuery = {}, view = full) =>
    listOrderRows(orgId, query, view, NOW);

/** Every row the list pages through, following the cursor. */
async function everyRow(query: OrderListQuery = {}, view = full) {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i += 1) {
        const page = await list({ ...query, cursor }, view);
        ids.push(...page.rows.map((r) => r.id));
        if (!page.nextCursor) return ids;
        cursor = page.nextCursor;
    }
    throw new Error("paged forever");
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `order-list-${process.pid}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "Asia/Kolkata" },
    });
    for (const name of ["Hill Road", "Bandra", "Colaba"]) {
        stores.push(
            (
                await prisma.store.create({
                    data: {
                        name,
                        slug: `${name.toLowerCase().replace(" ", "-")}-${process.pid}`,
                        organizationId: orgId,
                    },
                })
            ).id,
        );
    }
    const customer = (email: string, firstName: string, phone: string) =>
        prisma.customer.create({
            data: {
                storeId: stores[0]!,
                organizationId: orgId,
                email,
                firstName,
                lastName: "Rao",
                phone,
            },
        });
    asha = (await customer("asha@example.in", "Asha", "+91 98765 43210")).id;
    ravi = (await customer("ravi@example.in", "Ravi", "+91 91234 56789")).id;
    const product = async (name: string) =>
        (
            await prisma.product.create({
                data: {
                    storeId: stores[0]!,
                    organizationId: orgId,
                    name,
                    slug: `${name.toLowerCase()}-${process.pid}`,
                    price: "250.00",
                },
            })
        ).id;
    bread = await product("Sourdough");
    cake = await product("Cake");

    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `order-list-other-${process.pid}` },
    });
    otherOrgId = other.id;
    otherStore = (
        await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `elsewhere-${process.pid}`,
                organizationId: otherOrgId,
            },
        })
    ).id;
});

describe("paging and counts", () => {
    beforeAll(async () => {
        // 60 orders over three storefronts, an hour apart and all collected
        // (so none is late and none is open): 20 each.
        for (let i = 0; i < 60; i += 1) {
            await order({
                store: stores[i % 3],
                minutesAgo: 600 + i * 60,
                status: "DELIVERED",
                stage: "COLLECTED",
            });
        }
    });

    it("pages 50 then 10, newest first, never twice", async () => {
        const first = await list();
        expect(first.rows).toHaveLength(50);
        expect(first.nextCursor).toBe(first.rows[49]!.id);
        const times = first.rows.map((r) => r.placedAt.getTime());
        expect([...times].sort((a, b) => b - a)).toEqual(times);

        const second = await list({ cursor: first.nextCursor! });
        expect(second.rows).toHaveLength(10);
        expect(second.nextCursor).toBeNull();
        const seen = new Set([...first.rows, ...second.rows].map((r) => r.id));
        expect(seen.size).toBe(60);
        expect(first.counts).toEqual({ all: 60, open: 0, refunded: 0 });
        expect(second.counts).toEqual(first.counts);
    });

    it("answers every order of the business, across its pages", async () => {
        const all = await prisma.order.findMany({
            where: {
                organizationId: orgId,
                NOT: { placedOnline: true, paymentStatus: "UNPAID" },
            },
            select: { id: true },
        });
        expect((await everyRow()).sort()).toEqual(all.map((o) => o.id).sort());
    });

    it("narrows to one storefront, and a storefront from another business finds nothing", async () => {
        const hill = await list({ storeId: stores[0] });
        expect(hill.counts.all).toBe(20);
        expect(hill.rows.every((r) => r.store.id === stores[0])).toBe(true);
        const theirs = await list({ storeId: otherStore });
        expect(theirs.rows).toEqual([]);
        expect(theirs.counts).toEqual({ all: 0, open: 0, refunded: 0 });
    });

    it("refuses a cursor that is not an order of this business", async () => {
        const elsewhere = await order({ org: otherOrgId, store: otherStore });
        await expect(list({ cursor: elsewhere })).rejects.toThrow(
            NotFoundException,
        );
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});
    });
});

describe("filters, tabs and rows", () => {
    let unpaidDelivery: string;
    let partly: string;
    let refunded: string;
    let cancelled: string;
    let cakeOrder: string;
    let raviOrder: string;
    let abandoned: string;
    let paidOnline: string;

    beforeAll(async () => {
        unpaidDelivery = await order({
            fulfilment: "LOCAL_DELIVERY",
            paymentStatus: "UNPAID",
            minutesAgo: 10,
        });
        await order({
            fulfilment: "PICKUP",
            paymentStatus: "UNPAID",
            minutesAgo: 11,
        });
        partly = await order({
            minutesAgo: 12,
            stage: "PREPARING",
            status: "PROCESSING",
        });
        await pay(partly, 61000, 12000);
        refunded = await order({
            minutesAgo: 13,
            paymentStatus: "REFUNDED",
            status: "CANCELLED",
        });
        cancelled = await order({
            minutesAgo: 14,
            paymentStatus: "UNPAID",
            status: "CANCELLED",
        });
        cakeOrder = await order({ minutesAgo: 15, product: cake });
        raviOrder = await order({ minutesAgo: 16, customer: ravi });
        abandoned = await order({
            minutesAgo: 17,
            placedOnline: true,
            paymentStatus: "UNPAID",
        });
        paidOnline = await order({
            minutesAgo: 18,
            placedOnline: true,
            paymentStatus: "PAID",
        });
    });

    afterAll(async () => {
        await prisma.paymentRefund.deleteMany({});
        await prisma.paymentIntent.deleteMany({});
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});
    });

    it("never shows an abandoned checkout, in rows or counts", async () => {
        const ids = await everyRow();
        expect(ids).not.toContain(abandoned);
        expect(ids).toContain(paidOnline);
        expect((await list()).counts.all).toBe(ids.length);
    });

    it("counts each tab under every other filter", async () => {
        const all = await list();
        // Open: not delivered, not cancelled, not refunded in full.
        expect(all.counts).toEqual({ all: 8, open: 6, refunded: 1 });
        const open = await list({ tab: "open" });
        expect(open.rows).toHaveLength(6);
        expect(open.rows.map((r) => r.id)).not.toContain(cancelled);
        expect(open.counts).toEqual(all.counts);
        const refundedTab = await list({ tab: "refunded" });
        expect(refundedTab.rows.map((r) => r.id)).toEqual([refunded]);
        const unpaid = await list({ payment: "UNPAID", tab: "open" });
        expect(unpaid.counts).toEqual({ all: 3, open: 2, refunded: 0 });
    });

    it("narrows rows and every tab count to orders placed since an instant", async () => {
        // The order placed exactly at `since` is in; the one a minute
        // before is not (F6: Home's "Last 24 hours" link).
        const since = new Date(NOW.getTime() - 12 * MIN);
        const page = await list({ since });
        expect(page.rows).toHaveLength(3);
        expect(page.rows.map((r) => r.id)).toContain(unpaidDelivery);
        expect(page.rows.map((r) => r.id)).toContain(partly);
        expect(page.rows.map((r) => r.id)).not.toContain(refunded);
        expect(page.counts).toEqual({ all: 3, open: 3, refunded: 0 });
        const open = await list({ since, tab: "open" });
        expect(open.rows).toHaveLength(3);
        expect(open.counts).toEqual(page.counts);
    });

    it("finds unpaid local deliveries by the new type name and the old word", async () => {
        const byType = await list({
            payment: "UNPAID",
            fulfilment: ["LOCAL_DELIVERY"],
        });
        expect(byType.rows.map((r) => r.id)).toEqual([unpaidDelivery]);
        expect(byType.rows[0]).toMatchObject({
            fulfilmentType: "LOCAL_DELIVERY",
            payment: "UNPAID",
            unpaidAmount: "610.00",
        });
        // No legacy word beside the type since the contract release (B2d).
        expect(byType.rows[0]).not.toHaveProperty("fulfilment");
    });

    it("matches nothing for a type no order has yet, without failing", async () => {
        const shipping = await list({ fulfilment: ["SHIPPING"] });
        expect(shipping.rows).toEqual([]);
        const sent = await list({ stage: ["SENT"] });
        expect(sent.counts.all).toBe(0);
    });

    it("reads a part refund from the refund sums", async () => {
        const part = await list({ payment: "PARTLY_REFUNDED" });
        expect(part.rows.map((r) => r.id)).toEqual([partly]);
        expect(part.rows[0]!.payment).toBe("PARTLY_REFUNDED");
    });

    it("filters by step, product and customer", async () => {
        expect(
            (await list({ stage: ["PREPARING"] })).rows.map((r) => r.id),
        ).toEqual([partly]);
        expect((await list({ productId: cake })).rows.map((r) => r.id)).toEqual(
            [cakeOrder],
        );
        expect(
            (await list({ customerId: ravi })).rows.map((r) => r.id),
        ).toEqual([raviOrder]);
    });

    it("says when a row's pay link was made, never the link (B5)", async () => {
        const made = new Date("2026-09-27T09:30:00.000Z");
        await prisma.order.update({
            where: { id: unpaidDelivery },
            data: { payTokenHash: "a".repeat(64), payLinkCreatedAt: made },
        });
        const rows = (await list({ payment: "UNPAID" })).rows;
        const row = rows.find((r) => r.id === unpaidDelivery);
        expect(row?.payLinkCreatedAt).toEqual(made);
        expect(JSON.stringify(row)).not.toContain("a".repeat(64));
        const kitchen = await list(
            { payment: "UNPAID" },
            { money: false, contact: true },
        );
        expect(kitchen.rows[0]).not.toHaveProperty("payLinkCreatedAt");
        await prisma.order.update({
            where: { id: unpaidDelivery },
            data: { payTokenHash: null, payLinkCreatedAt: null },
        });
    });

    it("gives the kitchen rows without money, and still the counts", async () => {
        const kitchen = await list({}, { money: false, contact: true });
        expect(kitchen.rows.length).toBeGreaterThan(0);
        for (const row of kitchen.rows) {
            expect(row).not.toHaveProperty("total");
            expect(row).not.toHaveProperty("unpaidAmount");
            expect(row).not.toHaveProperty("payLinkCreatedAt");
        }
        expect(kitchen.counts).toEqual((await list()).counts);
    });

    it("keeps phone and email, and searching by them, to contact:read", async () => {
        const without = { money: true, contact: false };
        const rows = (await list({}, without)).rows;
        expect(rows[0]!.customer).not.toHaveProperty("phone");
        expect(rows[0]!.customer).not.toHaveProperty("email");
        // Ravi's number: nothing, not even that it exists.
        const byPhone = await list({ q: "91234 56789" }, without);
        expect(byPhone.rows).toEqual([]);
        expect(byPhone.counts.all).toBe(0);
        expect((await list({ q: "ravi@example.in" }, without)).rows).toEqual(
            [],
        );

        const withIt = await list({ q: "91234 56789" });
        expect(withIt.rows.map((r) => r.id)).toEqual([raviOrder]);
        expect(withIt.rows[0]!.customer).toMatchObject({
            email: "ravi@example.in",
            phone: "+91 91234 56789",
        });
    });

    it("searches by order number (with #) and by name", async () => {
        const one = (await list()).rows.find((r) => r.id === cakeOrder)!;
        const hit = await list({ q: `#${one.orderId}` });
        expect(hit.rows.map((r) => r.id)).toEqual([cakeOrder]);
        const ravis = await list(
            { q: "ravi rao" },
            { money: true, contact: false },
        );
        expect(ravis.rows.map((r) => r.id)).toEqual([raviOrder]);
    });
});

describe("days in the business's zone", () => {
    let onTheFirst: string;
    let lateOnThe31st: string;

    beforeAll(async () => {
        // 00:30 IST on 1 September, and 23:30 IST on 31 August.
        onTheFirst = await order({ at: new Date("2026-08-31T19:00:00.000Z") });
        lateOnThe31st = await order({
            at: new Date("2026-08-31T18:00:00.000Z"),
        });
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});
    });

    it("puts an order at 00:30 IST on the 1st on the 1st", async () => {
        const first = await list({ from: "2026-09-01", to: "2026-09-01" });
        expect(first.rows.map((r) => r.id)).toEqual([onTheFirst]);
        const last = await list({ from: "2026-08-31", to: "2026-08-31" });
        expect(last.rows.map((r) => r.id)).toEqual([lateOnThe31st]);
    });
});

describe("late", () => {
    const late: string[] = [];
    const notLate: string[] = [];

    beforeAll(async () => {
        // Pick-up is late after 2 hours, local delivery after 24 (default 16).
        for (let i = 0; i < 30; i += 1) {
            late.push(
                await order({ store: stores[i % 2], minutesAgo: 130 + i }),
            );
        }
        for (let i = 0; i < 25; i += 1) {
            late.push(
                await order({
                    store: stores[1 + (i % 2)],
                    fulfilment: "LOCAL_DELIVERY",
                    minutesAgo: 25 * 60 + i,
                }),
            );
        }
        // Unpaid still counts: the clock starts at placed.
        late.push(await order({ paymentStatus: "UNPAID", minutesAgo: 180 }));
        notLate.push(
            await order({ minutesAgo: 60 }),
            await order({ fulfilment: "LOCAL_DELIVERY", minutesAgo: 180 }),
            await order({
                minutesAgo: 300,
                status: "DELIVERED",
                stage: "COLLECTED",
            }),
            await order({ minutesAgo: 300, status: "CANCELLED" }),
        );
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({});
        await prisma.order.deleteMany({});
    });

    it("pages and counts late orders exactly, across storefronts and types", async () => {
        const first = await list({ late: true });
        expect(first.counts.all).toBe(56);
        expect(first.rows).toHaveLength(50);
        const ids = await everyRow({ late: true });
        expect(ids.sort()).toEqual([...late].sort());
        for (const id of notLate) expect(ids).not.toContain(id);
    });

    it("lists the rest as not late", async () => {
        const ids = await everyRow({ late: false });
        expect(ids.sort()).toEqual([...notLate].sort());
    });
});
