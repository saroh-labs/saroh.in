/**
 * Home's open orders against a real Postgres (review H-1, H-3, O-1): the
 * count is the Orders list's own Open tab — shipped counts, refunded and
 * abandoned online checkouts don't — for the same orders; a late order is
 * shown before five that are merely due, and "N more" knows whether any it
 * stands for is late; the last 24 hours, "fresh" and Today's pick-ups never
 * count an abandoned checkout.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { listOrderRows } from "../orders/order-list";
import { isFresh, readSince } from "./home-last-day";
import { readOpenOrders } from "./home-open-orders";
import { readToday } from "./home-today";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
const NOW = new Date("2026-09-27T06:30:00.000Z"); // noon IST
const MIN = 60_000;
const HOUR = 60 * MIN;
const EVERY = { orders: true, bookings: false, reviews: false, money: false };

let orgId = "";
let quietOrgId = "";
let storeId = "";
let customerId = "";
let productId = "";
let seq = 0;
const ids: Record<string, string> = {};

async function order(
    name: string,
    over: {
        ago: number;
        status?: string;
        paymentStatus?: string;
        fulfilment?: "COLLECT" | "DELIVERY";
        placedOnline?: boolean;
        org?: string;
        store?: string;
        customer?: string;
    },
) {
    seq += 1;
    const o = await prisma.order.create({
        data: {
            storeId: over.store ?? storeId,
            organizationId: over.org ?? orgId,
            orderId: `H-${String(seq).padStart(4, "0")}`,
            customerId: over.customer ?? customerId,
            subtotal: "610.00",
            total: "610.00",
            currency: "INR",
            status: over.status ?? "PENDING",
            paymentStatus: over.paymentStatus ?? "PAID",
            stage: "NEW",
            fulfilment: over.fulfilment ?? "DELIVERY",
            placedOnline: over.placedOnline ?? false,
            createdAt: new Date(NOW.getTime() - over.ago),
            // The product is the first business's: another's order has none.
            ...(over.org
                ? {}
                : {
                      items: {
                          create: [{ productId, quantity: 1, price: "610.00" }],
                      },
                  }),
        },
    });
    ids[name] = o.id;
}

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `home-open-${tag}` },
        })
    ).id;
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-open-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `asha-${tag}@example.in`,
                firstName: "Asha",
            },
        })
    ).id;
    productId = (
        await prisma.product.create({
            data: {
                storeId,
                organizationId: orgId,
                name: "Sourdough",
                slug: `sourdough-${tag}`,
                price: "610.00",
            },
        })
    ).id;

    // Five local deliveries, 4 to 8 hours old: due, not late (24 hours).
    for (let h = 4; h <= 8; h += 1) {
        await order(`due${h}`, { ago: h * HOUR });
    }
    // A pick-up 150 minutes old: late (2 hours), and newer than all five.
    await order("latePickup", { ago: 150 * MIN, fulfilment: "COLLECT" });
    // Shipped: open until delivered, never late.
    await order("shipped", { ago: 10 * HOUR, status: "SHIPPED" });
    // Paid online: a real order, open.
    await order("paidOnline", {
        ago: 30 * MIN,
        fulfilment: "COLLECT",
        placedOnline: true,
    });
    // Not open: delivered, cancelled, refunded in full.
    await order("delivered", { ago: 20 * HOUR, status: "DELIVERED" });
    await order("cancelled", { ago: 20 * HOUR, status: "CANCELLED" });
    await order("refunded", { ago: 20 * HOUR, paymentStatus: "REFUNDED" });
    // An abandoned online checkout: placed online, never paid. Old enough
    // to be late, and a pick-up due today — counted nowhere.
    await order("abandoned", {
        ago: 3 * HOUR,
        fulfilment: "COLLECT",
        placedOnline: true,
        paymentStatus: "UNPAID",
    });

    // A business whose only order is an abandoned checkout.
    quietOrgId = (
        await prisma.organization.create({
            data: { name: "Quiet", slug: `home-open-quiet-${tag}` },
        })
    ).id;
    const quietStore = await prisma.store.create({
        data: {
            name: "Quiet",
            slug: `home-open-quiet-${tag}`,
            organizationId: quietOrgId,
        },
    });
    const quietCustomer = await prisma.customer.create({
        data: {
            storeId: quietStore.id,
            organizationId: quietOrgId,
            email: `quiet-${tag}@example.in`,
            firstName: "Quiet",
        },
    });
    await order("quietAbandoned", {
        ago: HOUR,
        org: quietOrgId,
        store: quietStore.id,
        customer: quietCustomer.id,
        placedOnline: true,
        paymentStatus: "UNPAID",
    });
});

const view = { now: NOW, zone: ZONE, money: true };

describe("Home's open orders (DB)", () => {
    it("counts exactly the Orders list's Open tab for the same orders (H-3, O-1)", async () => {
        const [home, list] = await Promise.all([
            readOpenOrders(prisma, orgId, view),
            listOrderRows(orgId, {}, { contact: true, money: true }, NOW),
        ]);
        expect(list.counts.open).toBe(8);
        expect(home.count).toBe(list.counts.open);
    });

    it("shows a late order before five that are merely due (H-1)", async () => {
        const home = await readOpenOrders(prisma, orgId, view);
        expect(home.evidence.map((e) => e.id)).toEqual([
            ids.latePickup,
            ids.shipped,
            ids.due8,
            ids.due7,
            ids.due6,
        ]);
        expect(home.evidence[0]).toMatchObject({ tone: "bad" });
        expect(home.evidence[0].tag).toMatch(/^Late/);
        expect(home.evidence[1].headline).toMatch(/is on its way to/);
        // None of the three past the five is late.
        expect(home.moreTone).toBe("due");
    });

    it("says 'N more' holds a late order when one is past the five (H-1)", async () => {
        // Two days on, every open order not shipped is late: five shown,
        // and two of the three left are late too.
        const later = new Date(NOW.getTime() + 48 * HOUR);
        const home = await readOpenOrders(prisma, orgId, {
            ...view,
            now: later,
        });
        expect(home.evidence.every((e) => e.tone === "bad")).toBe(true);
        expect(home.moreTone).toBe("bad");
    });

    it("never counts an abandoned checkout as new in the last 24 hours (H-3)", async () => {
        const since = new Date(NOW.getTime() - 24 * HOUR).toISOString();
        const [items, list] = await Promise.all([
            readSince(prisma, orgId, EVERY, since),
            listOrderRows(
                orgId,
                { since: new Date(since) },
                { contact: true, money: true },
                NOW,
            ),
        ]);
        const orders = items.find((i) => i.kind === "ORDERS");
        // Its link opens the list's All tab from the same instant.
        expect(orders?.count).toBe(list.counts.all);
        expect(orders?.count).toBe(11);
    });

    it("greets a business with only an abandoned checkout as fresh (H-3)", async () => {
        expect(await isFresh(prisma, quietOrgId)).toBe(true);
        expect(await isFresh(prisma, orgId)).toBe(false);
    });

    it("never lists an abandoned checkout as a pick-up today (H-3)", async () => {
        const today = await readToday(
            prisma,
            { organizationId: orgId, organizationRole: "OWNER" },
            { bookings: false, pickUps: true, canMark: false, flags: false },
            { now: NOW, zone: ZONE },
        );
        const orderIds = today.items.map((i) => i.id);
        expect(orderIds).toEqual(
            expect.arrayContaining([ids.latePickup, ids.paidOnline]),
        );
        expect(orderIds).not.toContain(ids.abandoned);
    });
});
