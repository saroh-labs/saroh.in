/**
 * The site's order confirmation against a real Postgres (round-2 P4): only
 * the account that placed the order reads it, only once it is placed, and
 * only on its own site. The HTTP guard (the signed relay and the session)
 * is the one every checkout route uses, pinned in public-checkout.db.spec.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { CheckoutConfirmationService } from "./checkout-confirmation";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const service = new CheckoutConfirmationService();

interface Shop {
    organizationId: string;
    storeId: string;
    siteId: string;
    productId: string;
}

async function shop(): Promise<Shop> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `p4-${next()}` },
    });
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: `p4-store-${next()}`,
            organizationId: org.id,
        },
    });
    await prisma.storeSettings.create({
        data: {
            storeId: store.id,
            currency: "INR",
            address: "12 Hill Road, Bandra",
        },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Sourdough",
            slug: `sourdough-${next()}`,
            price: "250.00",
            currency: "INR",
            status: "PUBLISHED",
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Rye & Co.",
            slug: `p4-site-${next()}`,
            storefrontId: store.id,
        },
    });
    return {
        organizationId: org.id,
        storeId: store.id,
        siteId: site.id,
        productId: product.id,
    };
}

/** A signed-in customer of the shop's business, on its site. */
async function customer(s: Shop, siteId = s.siteId): Promise<CustomerContext> {
    const email = `buyer-${next()}@example.in`;
    const contact = await prisma.contact.create({
        data: { organizationId: s.organizationId, email },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: s.organizationId,
            contactId: contact.id,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return {
        organizationId: s.organizationId,
        siteId,
        accountId: account.id,
        contactId: contact.id,
        sessionId: `sess-${next()}`,
    };
}

async function order(
    s: Shop,
    over: {
        accountId?: string | null;
        paymentStatus?: string;
        placedOnline?: boolean;
    } = {},
) {
    return prisma.order.create({
        data: {
            storeId: s.storeId,
            organizationId: s.organizationId,
            orderId: `ORD-${next()}`,
            subtotal: "500.00",
            total: "500.00",
            currency: "INR",
            paymentStatus: over.paymentStatus ?? "PAID",
            status: "PROCESSING",
            placedOnline: over.placedOnline ?? true,
            paidAt: new Date("2026-09-29T08:02:00Z"),
            fulfilment: "PICKUP",
            customerAccountId: over.accountId ?? null,
            items: {
                create: [
                    { productId: s.productId, quantity: 2, price: "250.00" },
                ],
            },
        },
    });
}

async function missing(promise: Promise<unknown>) {
    await expect(promise).rejects.toBeInstanceOf(NotFoundException);
}

describe("CheckoutConfirmationService (P4)", () => {
    it("shows the customer who placed it what they ordered and where to collect it", async () => {
        const s = await shop();
        const me = await customer(s);
        const placed = await order(s, { accountId: me.accountId });

        const view = await service.confirmation(s.siteId, me, placed.id);
        expect(view).toMatchObject({
            orderNumber: placed.orderId,
            currency: "INR",
            total: "500.00",
            lines: [
                {
                    name: "Sourdough",
                    variant: null,
                    quantity: 2,
                    amount: "500.00",
                },
            ],
            fulfilment: {
                type: "PICKUP",
                label: "Pick-up",
                pickup: { name: "Hill Road", address: "12 Hill Road, Bandra" },
            },
            refunded: false,
        });
    });

    it("is a 404 for another customer's order, even in the same business", async () => {
        const s = await shop();
        const me = await customer(s);
        const someoneElse = await customer(s);
        const theirs = await order(s, { accountId: someoneElse.accountId });
        await missing(service.confirmation(s.siteId, me, theirs.id));
    });

    it("is a 404 until it is placed, and for a desk order", async () => {
        const s = await shop();
        const me = await customer(s);
        const paying = await order(s, {
            accountId: me.accountId,
            paymentStatus: "UNPAID",
        });
        await missing(service.confirmation(s.siteId, me, paying.id));
        const desk = await order(s, {
            accountId: me.accountId,
            placedOnline: false,
        });
        await missing(service.confirmation(s.siteId, me, desk.id));
    });

    it("still reads once refunded, and says so", async () => {
        const s = await shop();
        const me = await customer(s);
        const refunded = await order(s, {
            accountId: me.accountId,
            paymentStatus: "REFUNDED",
        });
        expect(
            (await service.confirmation(s.siteId, me, refunded.id)).refunded,
        ).toBe(true);
    });

    it("is a 404 on another site, or another business's", async () => {
        const s = await shop();
        const me = await customer(s);
        const mine = await order(s, { accountId: me.accountId });
        // A session for another site of the business reads nothing here.
        await missing(service.confirmation(`other-${next()}`, me, mine.id));

        const other = await shop();
        const there = await customer(other);
        await missing(service.confirmation(other.siteId, there, mine.id));
    });
});
