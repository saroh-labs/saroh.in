/**
 * Home's "Last 24 hours" (round 2, F6) against a real Postgres: each figure
 * counts only what happened in the window, in this business; bookings only
 * confirmed ones; money only invoices paid in the window — an order's own
 * invoice once, never a credit note — added up per currency; and a business
 * that has sold, booked and been paid nothing is new.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { isFresh, readSince } from "./home-last-day";

const tag = `${process.pid}-${Date.now()}`;
const HOUR = 60 * 60 * 1000;
const NOW = new Date();
const SINCE = new Date(NOW.getTime() - 24 * HOUR).toISOString();
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const EVERY = { orders: true, bookings: true, reviews: true, money: true };

describe("Home F6 Last 24 hours (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let quietOrgId = "";

    async function business(name: string) {
        return (
            await prisma.organization.create({
                data: { name, slug: `home-f6-${name}-${tag}`.toLowerCase() },
            })
        ).id;
    }

    async function orderAt(
        organizationId: string,
        storeId: string,
        n: number,
        createdAt: Date,
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
                orderId: `F6-${n}-${tag}`,
                subtotal: "250",
                total: "250",
                currency: "INR",
                createdAt,
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
                issuedAt: ago(48),
                ...data,
            },
        });
    }

    beforeAll(async () => {
        orgId = await business("Rye");
        otherOrgId = await business("Elsewhere");
        quietOrgId = await business("Kettle");

        const store = await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-f6-hill-${tag}`,
                organizationId: orgId,
            },
        });
        const theirStore = await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `home-f6-else-${tag}`,
                organizationId: otherOrgId,
            },
        });

        // Orders: two in the window, one before it, one another business's.
        const fresh = await orderAt(orgId, store.id, 1, ago(2));
        await orderAt(orgId, store.id, 2, ago(23));
        await orderAt(orgId, store.id, 3, ago(30));
        await orderAt(otherOrgId, theirStore.id, 4, ago(1));

        // Bookings: one confirmed in the window, one let go, one old.
        const service = await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "Cleaning",
                durationMinutes: 30,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        });
        const book = (createdAt: Date, status: string) =>
            prisma.booking.create({
                data: {
                    organizationId: orgId,
                    serviceId: service.id,
                    startAt: new Date(NOW.getTime() + 48 * HOUR),
                    endAt: new Date(NOW.getTime() + 48.5 * HOUR),
                    timezone: "Asia/Kolkata",
                    status,
                    bookerName: "Farah Khan",
                    snapshot: {},
                    createdAt,
                },
            });
        await book(ago(3), "CONFIRMED");
        await book(ago(3), "CANCELLED");
        await book(ago(40), "CONFIRMED");

        // Reviews: one in the window, one before it.
        const invitation = await prisma.reviewInvitation.create({
            data: {
                organizationId: orgId,
                orderId: fresh.id,
                tokenHash: `f6-${tag}`,
                toAddress: "buyer@example.com",
                expiresAt: new Date(NOW.getTime() + 72 * HOUR),
            },
        });
        const review = (createdAt: Date, n: number) =>
            prisma.productReview.create({
                data: {
                    organizationId: orgId,
                    storeId: store.id,
                    invitationId: invitation.id,
                    productName: `Linen shirt ${n}`,
                    invitedTo: "buyer@example.com",
                    rating: 5,
                    displayName: "Anika",
                    createdAt,
                },
            });
        await review(ago(5), 1);
        await review(ago(50), 2);

        // Money: an order's own invoice and a hand-written one paid in the
        // window, a USD one too; one paid before it; a credit note; and
        // another business's.
        await invoice(orgId, {
            orderId: fresh.id,
            source: "ORDER",
            paidAt: ago(2),
        });
        await invoice(orgId, { total: "450.50", paidAt: ago(6) });
        await invoice(orgId, { currency: "USD", total: "20", paidAt: ago(6) });
        await invoice(orgId, { paidAt: ago(30) });
        await invoice(orgId, { kind: "CREDIT_NOTE", paidAt: ago(1) });
        await invoice(otherOrgId, { paidAt: ago(1) });
    });

    it("counts only this business's window, figure by figure", async () => {
        const items = await readSince(prisma, orgId, EVERY, SINCE);
        expect(
            items.map((i) => [i.kind, i.count, i.amountMinor, i.currency]),
        ).toEqual([
            ["ORDERS", 2, null, null],
            ["BOOKINGS", 1, null, null],
            ["REVIEWS", 1, null, null],
            // ₹1,000 (the order's invoice, once) + ₹450.50.
            ["PAYMENTS", 2, 145_050, "INR"],
            ["PAYMENTS", 1, 2_000, "USD"],
        ]);
    });

    it("sends nothing for a business with a quiet day", async () => {
        expect(await readSince(prisma, quietOrgId, EVERY, SINCE)).toEqual([]);
    });

    it("calls a business new until it has sold, booked or been paid", async () => {
        expect(await isFresh(prisma, quietOrgId)).toBe(true);
        expect(await isFresh(prisma, orgId)).toBe(false);
    });
});
