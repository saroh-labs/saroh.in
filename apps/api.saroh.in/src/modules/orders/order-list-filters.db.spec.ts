/**
 * The Orders list's filter bar (plan B, B4), against a real Postgres: the
 * Step filter by what the pill says, the date presets in the business's
 * zone, a long filtered list paged to the end (what Export walks), and what
 * the bar offers — the ways and steps the business's orders show, and the
 * product picker's search.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrderListQuery } from "./order-list";
import { listOrderRows } from "./order-list";
import { orderFilterOptions, searchOrderProducts } from "./order-list-options";

const NOW = new Date("2026-09-27T06:30:00.000Z"); // noon IST
const MIN = 60_000;
const full = { money: true, contact: true };

let orgId: string;
let otherOrgId: string;
let store: string;
let otherStore: string;
let asha: string;
let theirCustomer: string;
let bread: string;
let cake: string;
let rye: string;
let theirCake: string;
let seq = 0;

async function order(
    over: {
        minutesAgo?: number;
        status?: string;
        paymentStatus?: string;
        stage?: string;
        fulfilment?: string;
        placedOnline?: boolean;
        product?: string;
        org?: string;
    } = {},
): Promise<string> {
    seq += 1;
    const o = await prisma.order.create({
        data: {
            storeId: over.org ? otherStore : store,
            organizationId: over.org ?? orgId,
            orderId: `B4-${String(seq).padStart(4, "0")}`,
            customerId: over.org ? theirCustomer : asha,
            subtotal: "610.00",
            total: "610.00",
            currency: "INR",
            status: (over.status ?? "PENDING") as never,
            paymentStatus: (over.paymentStatus ?? "PAID") as never,
            stage: (over.stage ?? "NEW") as never,
            fulfilment: (over.fulfilment ?? "PICKUP") as never,
            placedOnline: over.placedOnline ?? false,
            createdAt: new Date(NOW.getTime() - (over.minutesAgo ?? seq) * MIN),
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

const list = (query: OrderListQuery = {}) =>
    listOrderRows(orgId, query, full, NOW);
const ids = async (query: OrderListQuery = {}) =>
    (await list(query)).rows.map((r) => r.id).sort();

/** Every row the list pages through, following the cursor. */
async function everyRow(query: OrderListQuery = {}) {
    const out: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i += 1) {
        const page = await list({ ...query, cursor });
        out.push(...page.rows.map((r) => r.id));
        if (!page.nextCursor) return out;
        cursor = page.nextCursor;
    }
    throw new Error("paged forever");
}

async function clearOrders() {
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `order-filters-${process.pid}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "Asia/Kolkata" },
    });
    store = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `b4-hill-${process.pid}`,
                organizationId: orgId,
            },
        })
    ).id;
    asha = (
        await prisma.customer.create({
            data: {
                storeId: store,
                organizationId: orgId,
                email: "asha@example.in",
                firstName: "Asha",
            },
        })
    ).id;
    const product = async (name: string, organizationId = orgId) =>
        (
            await prisma.product.create({
                data: {
                    organizationId,
                    name,
                    slug: `b4-${name.toLowerCase().replace(/\W+/g, "-")}-${process.pid}`,
                    price: "250.00",
                },
            })
        ).id;
    bread = await product("Sourdough");
    cake = await product("Cake");
    rye = await product("Rye 100%");

    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `order-filters-other-${process.pid}` },
    });
    otherOrgId = other.id;
    otherStore = (
        await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `b4-elsewhere-${process.pid}`,
                organizationId: otherOrgId,
            },
        })
    ).id;
    theirCake = await product("Cake, theirs", otherOrgId);
    theirCustomer = (
        await prisma.customer.create({
            data: {
                storeId: otherStore,
                organizationId: otherOrgId,
                email: "someone@elsewhere.in",
                firstName: "Someone",
            },
        })
    ).id;
});

describe("the Step filter: what the pill says", () => {
    const o: Record<string, string> = {};

    beforeAll(async () => {
        o.pickupNew = await order({});
        o.pickupReady = await order({
            stage: "READY",
            status: "PROCESSING",
        });
        o.refundedReady = await order({
            stage: "READY",
            status: "PROCESSING",
            paymentStatus: "REFUNDED",
        });
        o.cancelledNew = await order({
            fulfilment: "SHIPPING",
            status: "CANCELLED",
            paymentStatus: "UNPAID",
        });
        o.shipped = await order({
            fulfilment: "SHIPPING",
            stage: "HANDED_TO_COURIER",
            status: "SHIPPED",
        });
        // A local delivery handed to a courier before the switch release.
        o.legacyLocal = await order({
            fulfilment: "DELIVERY",
            stage: "HANDED_TO_COURIER",
            status: "SHIPPED",
        });
        o.digitalPaid = await order({ fulfilment: "DIGITAL" });
        // An abandoned checkout: never in rows, counts or the options.
        o.abandoned = await order({
            fulfilment: "LOCAL_DELIVERY",
            stage: "OUT_FOR_DELIVERY",
            status: "SHIPPED",
            placedOnline: true,
            paymentStatus: "UNPAID",
            product: cake,
        });
        // Another business's local delivery: never offered here.
        await order({
            org: otherOrgId,
            fulfilment: "LOCAL_DELIVERY",
            product: theirCake,
        });
    });

    afterAll(clearOrders);

    it("finds New without Digital's Paid or a cancelled order", async () => {
        expect(await ids({ step: "new" })).toEqual([o.pickupNew]);
        expect(await ids({ step: "paid" })).toEqual([o.digitalPaid]);
    });

    it("keeps a refunded order off its step", async () => {
        expect(await ids({ step: "ready" })).toEqual([o.pickupReady]);
        expect(await ids({ step: "refunded" })).toEqual([o.refundedReady]);
        expect(await ids({ step: "cancelled" })).toEqual([o.cancelledNew]);
    });

    it("finds Handed to courier on shipping and a legacy local delivery", async () => {
        expect(await ids({ step: "handed-to-courier" })).toEqual(
            [o.shipped, o.legacyLocal].sort(),
        );
        expect(
            await ids({
                step: "handed-to-courier",
                fulfilment: ["SHIPPING"],
            }),
        ).toEqual([o.shipped]);
    });

    it("counts every tab under the step, and finds nothing for an unknown one", async () => {
        const page = await list({ step: "ready" });
        expect(page.counts).toEqual({ all: 1, open: 1, refunded: 0 });
        const none = await list({ step: "teleported" });
        expect(none.rows).toEqual([]);
        expect(none.counts.all).toBe(0);
    });

    it("offers the ways and steps the business's real orders show", async () => {
        const options = await orderFilterOptions(orgId);
        // The legacy DELIVERY order reads as Local delivery.
        expect(options.types.map((t) => t.type)).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
            "DIGITAL",
        ]);
        // Out for delivery: only the abandoned checkout is there.
        expect(options.steps.map((s) => s.key)).not.toContain(
            "out-for-delivery",
        );
        expect(options.types[0]).toEqual({ type: "PICKUP", label: "Pick-up" });
        expect(options.steps.map((s) => s.key)).toEqual(
            expect.arrayContaining([
                "new",
                "paid",
                "ready",
                "handed-to-courier",
                "refunded",
                "cancelled",
            ]),
        );
        expect(options.steps.map((s) => s.key)).not.toContain("collected");
        const handed = options.steps.find((s) => s.key === "handed-to-courier");
        expect(handed?.types).toEqual(["LOCAL_DELIVERY", "SHIPPING"]);
        expect(options.product).toBeNull();
    });

    it("names the product a link filters on, only if it is this business's", async () => {
        expect((await orderFilterOptions(orgId, cake)).product).toEqual({
            id: cake,
            name: "Cake",
        });
        expect((await orderFilterOptions(orgId, theirCake)).product).toBeNull();
        // Each business is offered its own orders' ways, and no one else's.
        expect(
            (await orderFilterOptions(otherOrgId)).types.map((t) => t.type),
        ).toEqual(["LOCAL_DELIVERY"]);
    });
});

describe("the product picker's search", () => {
    beforeAll(async () => {
        await order({});
        await order({ product: cake });
        await order({ org: otherOrgId, product: theirCake });
    });

    afterAll(clearOrders);

    it("lists this business's products that are on an order, by name", async () => {
        const { products } = await searchOrderProducts(orgId);
        // Rye has never been ordered; their cake is another business's.
        expect(products).toEqual([
            { id: cake, name: "Cake" },
            { id: bread, name: "Sourdough" },
        ]);
    });

    it("searches by name, taking % and _ literally", async () => {
        expect((await searchOrderProducts(orgId, "sour")).products).toEqual([
            { id: bread, name: "Sourdough" },
        ]);
        expect((await searchOrderProducts(orgId, "%")).products).toEqual([]);
        expect((await searchOrderProducts(orgId, "cake")).products).toEqual([
            { id: cake, name: "Cake" },
        ]);
    });

    it("never lists a product only an abandoned checkout holds", async () => {
        await order({
            product: rye,
            placedOnline: true,
            paymentStatus: "UNPAID",
        });
        const { products } = await searchOrderProducts(orgId, "rye");
        expect(products).toEqual([]);
    });
});

describe("the date presets, in the business's zone", () => {
    let justNow: string;
    let yesterday: string;
    let fiveDaysAgo: string;
    let lastMonth: string;

    beforeAll(async () => {
        justNow = await order({ minutesAgo: 10 });
        yesterday = await order({ minutesAgo: 24 * 60 });
        fiveDaysAgo = await order({ minutesAgo: 5 * 24 * 60 });
        lastMonth = await order({ minutesAgo: 40 * 24 * 60 });
    });

    afterAll(clearOrders);

    it("reads today, yesterday, the last 7 days and this month", async () => {
        expect(await ids({ date: "today" })).toEqual([justNow]);
        expect(await ids({ date: "yesterday" })).toEqual([yesterday]);
        expect(await ids({ date: "7d" })).toEqual(
            [justNow, yesterday, fiveDaysAgo].sort(),
        );
        expect(await ids({ date: "month" })).toEqual(
            [justNow, yesterday, fiveDaysAgo].sort(),
        );
        expect(await ids()).toContain(lastMonth);
    });

    it("refuses a preset and a range together", async () => {
        await expect(
            list({ date: "today", from: "2026-09-01" }),
        ).rejects.toThrow(BadRequestException);
    });
});

describe("a long filtered list, paged to the end (what Export walks)", () => {
    const shipping: string[] = [];

    beforeAll(async () => {
        for (let i = 0; i < 120; i += 1) {
            shipping.push(
                await order({ fulfilment: "SHIPPING", minutesAgo: 10 + i }),
            );
        }
        for (let i = 0; i < 30; i += 1) {
            await order({ minutesAgo: 10 + i });
        }
    });

    afterAll(clearOrders);

    it("gives all 120 shipping orders, each once, over three pages", async () => {
        const first = await list({ fulfilment: ["SHIPPING"] });
        expect(first.counts.all).toBe(120);
        const every = await everyRow({ fulfilment: ["SHIPPING"] });
        expect(every).toHaveLength(120);
        expect([...every].sort()).toEqual([...shipping].sort());
    });
});
