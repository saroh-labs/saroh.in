/**
 * Home's "This week" (round 2, F7) against a real Postgres: takings count
 * each rupee once — an order's money is its invoice, never a credit note as
 * money in — less the refunds made this week; last week is read to the same
 * moment; bookings are confirmed ones starting this week; orders are real
 * ones placed since Monday; and owed leaves out an order's own invoice.
 * Only this business's rows count. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { readWeek } from "./home-week";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Friday 18 Sep 2026, 09:30 in Mumbai; the week began Monday 14 Sep.
const NOW = new Date("2026-09-18T04:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
// Wednesday 16 Sep, and last Wednesday 9 Sep.
const THIS_WEEK = ago(48);
const LAST_WEEK = ago(48 + 7 * 24);
// Last Friday afternoon: last week, but after this moment of it.
const LAST_WEEK_LATER = new Date(NOW.getTime() - 7 * DAY + 6 * HOUR);
const EVERY = { takings: true, bookings: true, orders: true, owed: true };
const clock = { now: NOW, zone: ZONE };

describe("Home F7 This week (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let shopOrgId = "";

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `home-f7-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function orderAt(
        organizationId: string,
        storeId: string,
        n: number,
        createdAt: Date,
        extra: Record<string, unknown> = {},
    ) {
        const customer = await prisma.customer.create({
            data: {
                storeId,
                organizationId,
                email: `buyer-${n}-${tag}@example.com`,
            },
        });
        return prisma.order.create({
            data: {
                storeId,
                organizationId,
                customerId: customer.id,
                orderId: `F7-${n}-${tag}`,
                subtotal: "1000",
                total: "1000",
                currency: "INR",
                createdAt,
                ...extra,
            },
        });
    }

    async function invoice(
        organizationId: string,
        data: Record<string, unknown>,
    ) {
        return prisma.invoice.create({
            data: {
                organizationId,
                status: "PAID",
                currency: "INR",
                subtotal: "1000",
                total: "1000",
                issuedAt: ago(10 * 24),
                ...data,
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Rye");
        otherOrgId = await business("Elsewhere");
        shopOrgId = await business("Kettle");

        const store = await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-f7-hill-${tag}`,
                organizationId: orgId,
            },
        });
        const theirStore = await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `home-f7-else-${tag}`,
                organizationId: otherOrgId,
            },
        });
        const shopStore = await prisma.store.create({
            data: {
                name: "Kettle",
                slug: `home-f7-kettle-${tag}`,
                organizationId: shopOrgId,
            },
        });

        // Orders: two this week (one refunded ₹200), one an abandoned
        // online checkout, one last week, one another business's.
        const sold = await orderAt(orgId, store.id, 1, THIS_WEEK);
        await orderAt(orgId, store.id, 2, ago(3));
        await orderAt(orgId, store.id, 3, ago(5), {
            placedOnline: true,
            paymentStatus: "UNPAID",
        });
        const old = await orderAt(orgId, store.id, 4, LAST_WEEK);
        await orderAt(otherOrgId, theirStore.id, 5, ago(2));

        // This week's money: an order's invoice (₹1,000, counted once),
        // a hand-written invoice (₹450.50), and the order's ₹200 refund.
        await invoice(orgId, {
            orderId: sold.id,
            source: "ORDER",
            paidAt: THIS_WEEK,
        });
        await invoice(orgId, { total: "450.50", paidAt: ago(6) });
        await invoice(orgId, {
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            orderId: sold.id,
            total: "200",
            issuedAt: ago(4),
        });
        // A credit note that corrected an unpaid bill gave nobody money.
        await invoice(orgId, {
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            total: "300",
            issuedAt: ago(4),
        });
        // A booking's unpaid pay-now hold is not paper.
        await invoice(orgId, {
            source: "BOOKING",
            status: "DRAFT",
            number: null,
            paidAt: ago(1),
        });

        // A booking's payment refunded this week: its credit note came
        // from the refund, so it is money back.
        const bookingPaid = await invoice(orgId, {
            source: "BOOKING",
            total: "500",
            paidAt: LAST_WEEK,
            number: `F7-B-${tag}`,
        });
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                provider: "RAZORPAY",
                amountCents: 50_000,
                currency: "INR",
                status: "SUCCEEDED",
                invoiceId: bookingPaid.id,
            },
        });
        const refund = await prisma.paymentRefund.create({
            data: {
                organizationId: orgId,
                paymentIntentId: intent.id,
                amountCents: 10_000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        await invoice(orgId, {
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            relatedInvoiceId: bookingPaid.id,
            paymentRefundId: refund.id,
            total: "100",
            issuedAt: ago(2),
        });

        // Last week to this moment: three payments of ₹500 (with the
        // booking's ₹500 above, four); one after this moment of last
        // week doesn't count.
        await invoice(orgId, {
            orderId: old.id,
            source: "ORDER",
            total: "500",
            paidAt: LAST_WEEK,
        });
        await invoice(orgId, { total: "500", paidAt: LAST_WEEK });
        await invoice(orgId, { total: "500", paidAt: LAST_WEEK });
        await invoice(orgId, { total: "9000", paidAt: LAST_WEEK_LATER });
        await invoice(otherOrgId, { paidAt: ago(1) });

        // Owed: two unpaid bills, one overdue; an order's own unpaid
        // invoice is owed on the order, not here.
        await invoice(orgId, {
            status: "ISSUED",
            total: "700",
            dueAt: ago(24),
        });
        await invoice(orgId, {
            status: "ISSUED",
            total: "300",
            dueAt: new Date(NOW.getTime() + 3 * DAY),
        });
        const unpaidOrder = await orderAt(orgId, store.id, 6, ago(30 * 24));
        await invoice(orgId, {
            orderId: unpaidOrder.id,
            source: "ORDER",
            status: "ISSUED",
            dueAt: ago(24),
        });

        // Bookings: two confirmed this week (one still to come on
        // Saturday), one cancelled, one last week, one next week.
        const service = await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Cleaning",
                durationMinutes: 30,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: ZONE,
            },
        });
        const book = (startAt: Date, status: string) =>
            prisma.booking.create({
                data: {
                    organizationId: orgId,
                    serviceId: service.id,
                    startAt,
                    endAt: new Date(startAt.getTime() + HOUR / 2),
                    timezone: ZONE,
                    status,
                    bookerName: "Farah Khan",
                    snapshot: {},
                },
            });
        await book(THIS_WEEK, "CONFIRMED");
        await book(new Date(NOW.getTime() + DAY), "CONFIRMED");
        await book(THIS_WEEK, "CANCELLED");
        await book(LAST_WEEK, "CONFIRMED");
        await book(new Date(NOW.getTime() + 5 * DAY), "CONFIRMED");

        // A shop that has only ever sold through orders.
        const shopOrder = await orderAt(shopOrgId, shopStore.id, 7, ago(3));
        await invoice(shopOrgId, {
            orderId: shopOrder.id,
            source: "ORDER",
            paidAt: ago(3),
        });
    });

    it("counts each figure once, from this business's week", async () => {
        const week = await readWeek(prisma, orgId, EVERY, clock);

        expect(week.startDate).toBe("2026-09-14");
        // ₹1,000 (the order, once) + ₹450.50, less the order's ₹200 and
        // the booking's ₹100 refunds. Not the ₹300 correction.
        expect(week.takings).toHaveLength(1);
        expect(week.takings?.[0]).toMatchObject({
            currency: "INR",
            amountMinor: 115_050,
            // Four payments of ₹500 to this moment of last week.
            lastWeekMinor: 200_000,
            change: { kind: "DOWN", percent: 42 },
        });
        expect(week.bookings).toMatchObject({ count: 2, lastWeek: 1 });
        // Two real orders; not the abandoned checkout, not last week's.
        expect(week.orders?.count).toBe(2);
        expect(week.owed).toEqual({
            totals: [{ currency: "INR", amountMinor: 100_000 }],
            bills: 2,
            overdue: 1,
            href: "/billing/invoices?view=overdue",
        });
    });

    it("sends no owed figure to a business that has only sold through orders", async () => {
        const week = await readWeek(prisma, shopOrgId, EVERY, clock);
        expect(week).not.toHaveProperty("owed");
        expect(week.takings?.[0]).toMatchObject({
            amountMinor: 100_000,
            lastWeekMinor: 0,
            change: { kind: "THIN" },
        });
    });

    it("reads only the figures the scope allows", async () => {
        const week = await readWeek(
            prisma,
            orgId,
            { takings: false, bookings: true, orders: false, owed: false },
            clock,
        );
        expect(Object.keys(week).sort()).toEqual([
            "bookings",
            "startDate",
            "zone",
        ]);
    });
});
