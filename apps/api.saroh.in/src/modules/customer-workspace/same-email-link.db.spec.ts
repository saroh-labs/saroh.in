/**
 * Customers who share an email (DEC-055, C15), against a real Postgres. A
 * business with two storefronts: Rye Market's customer paid first, so a
 * contact made from them holds the email; then Rye Online's customer with
 * the same email pays. Each storefront's own setting decides whether that
 * second customer is linked to the contact on their own or left for staff,
 * and the rules around it hold: only a contact made from a store customer,
 * never one staff entered or a lead's; never a removed contact; through
 * `resolveContact`; never widening a site account's view past a verified
 * email (DEC-049); and turning it on re-links no pair that already
 * existed. Runs in the integration project (TEST_DATABASE_URL).
 */
import { backfillPayingCustomerContacts, prisma } from "@saroh/database";

import { reservedRemovedEmail } from "../contacts/contact-email";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
import { StorefrontsService } from "../stores/storefronts.service";
import { normaliseEmail } from "./duplicates";
import { linkSameEmailCustomer } from "./same-email-link";

const tag = `${process.pid}-${Date.now()}`;
const storefronts = new StorefrontsService();

describe("Customers who share an email (DB, C15)", () => {
    let orgId = "";
    let market = "";
    let online = "";
    let productId = "";
    let n = 0;

    const customer = (
        storeId: string,
        email: string,
        over: Record<string, unknown> = {},
    ) =>
        prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email,
                firstName: "Asha",
                lastName: "Rao",
                ...over,
            },
        });

    /** An order at the customer's storefront, paid as the orders service pays one. */
    const payFor = async (cust: { id: string; storeId: string }) => {
        const order = await prisma.order.create({
            data: {
                storeId: cust.storeId,
                organizationId: orgId,
                orderId: `ORD-${tag}-${++n}`,
                customerId: cust.id,
                subtotal: "450",
                total: "450",
                currency: "INR",
                paymentStatus: "UNPAID",
                items: {
                    create: { productId, quantity: 1, price: "450" },
                },
            },
        });
        await prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: order.id },
                data: { paymentStatus: "PAID" },
            });
            await ensureOrderInvoice(tx, order.id, { method: "RECORDED" });
        });
    };

    const linksOf = (customerId: string) =>
        prisma.customerIdentityLink.findMany({
            where: { customerId },
            select: { contactId: true, reason: true, linkedByUserId: true },
        });

    /** A market customer who paid, and the contact their payment made. */
    const holderFromMarket = async (email: string) => {
        const first = await customer(market, email);
        await payFor(first);
        const [link] = await linksOf(first.id);
        expect(link).toBeDefined();
        return prisma.contact.findUniqueOrThrow({
            where: { id: link!.contactId },
        });
    };

    const setOnline = (on: boolean) =>
        storefronts.update(orgId, online, { linkSameEmailCustomers: on });

    beforeAll(async () => {
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `c15-org-${tag}` },
            })
        ).id;
        market = (
            await prisma.store.create({
                data: {
                    name: "Rye Market",
                    slug: `c15-market-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        online = (
            await prisma.store.create({
                data: {
                    name: "Rye Online",
                    slug: `c15-online-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        productId = (
            await prisma.product.create({
                data: {
                    storeId: market,
                    organizationId: orgId,
                    name: "Sourdough",
                    slug: `c15-sourdough-${tag}`,
                    price: "450",
                },
            })
        ).id;
    });

    afterEach(() => setOnline(false));

    it("leaves a same-email customer for staff by default, as every existing storefront does", async () => {
        await expect(storefronts.get(orgId, online)).resolves.toMatchObject({
            linkSameEmailCustomers: false,
        });
        await holderFromMarket("default@example.com");
        const second = await customer(online, "default@example.com");
        await payFor(second);
        expect(await linksOf(second.id)).toEqual([]);
    });

    it("links them to the contact another storefront's customer made, when their storefront says so", async () => {
        const holder = await holderFromMarket("both@example.com");
        await setOnline(true);
        const second = await customer(online, " Both@Example.com ");
        await payFor(second);

        expect(await linksOf(second.id)).toEqual([
            {
                contactId: holder.id,
                reason: "PAYMENT",
                linkedByUserId: null,
            },
        ]);
        // One contact still holds the email; no second one was made.
        expect(
            await prisma.contact.count({
                where: {
                    organizationId: orgId,
                    email: { equals: "both@example.com", mode: "insensitive" },
                },
            }),
        ).toBe(1);
    });

    it("follows the incoming customer's storefront, not the holding contact's", async () => {
        // Market links, Online doesn't: Online's customer waits for staff.
        await storefronts.update(orgId, market, {
            linkSameEmailCustomers: true,
        });
        try {
            await holderFromMarket("whose@example.com");
            const second = await customer(online, "whose@example.com");
            await payFor(second);
            expect(await linksOf(second.id)).toEqual([]);
        } finally {
            await storefronts.update(orgId, market, {
                linkSameEmailCustomers: false,
            });
        }
    });

    it("never links to a contact staff entered, or a lead's", async () => {
        await setOnline(true);
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: "staff@example.com",
                source: "manual",
            },
        });
        await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: "lead@example.com",
                source: "enquiry:form:f_1",
            },
        });
        await prisma.contact.create({
            data: { organizationId: orgId, email: "nosource@example.com" },
        });
        for (const email of [
            "staff@example.com",
            "lead@example.com",
            "nosource@example.com",
        ]) {
            const cust = await customer(online, email);
            await payFor(cust);
            expect(await linksOf(cust.id)).toEqual([]);
        }
    });

    it("never links to a removed contact", async () => {
        await setOnline(true);
        const holder = await holderFromMarket("gone@example.com");
        // As privacy removal leaves it (C11): the placeholder, and removedAt.
        await prisma.contact.update({
            where: { id: holder.id },
            data: {
                removedAt: new Date(),
                email: reservedRemovedEmail(holder.id),
            },
        });
        const cust = await customer(online, "gone@example.com");
        await payFor(cust);
        const [link] = await linksOf(cust.id);
        // C2's rule gives them a contact of their own instead.
        expect(link?.contactId).toBeDefined();
        expect(link!.contactId).not.toBe(holder.id);

        // Removed but still holding the email (a removal part-way): refused.
        const halfway = await holderFromMarket("halfway@example.com");
        await prisma.contact.update({
            where: { id: halfway.id },
            data: { removedAt: new Date() },
        });
        const late = await customer(online, "halfway@example.com");
        await expect(
            prisma.$transaction((tx) =>
                linkSameEmailCustomer(tx, {
                    organizationId: orgId,
                    customerId: late.id,
                }),
            ),
        ).resolves.toBe("removed");
        expect(await linksOf(late.id)).toEqual([]);
    });

    it("links through resolveContact: a tombstone's survivor, never the tombstone", async () => {
        await setOnline(true);
        const survivor = await holderFromMarket("survivor@example.com");
        // A tombstone that still holds an email (defensive: a merge gives
        // it a placeholder) resolves to its survivor.
        const tomb = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: "tomb@example.com",
                source: "store-customer:old",
                mergedIntoId: survivor.id,
                mergedAt: new Date(),
            },
        });
        const cust = await customer(online, "tomb@example.com");
        await payFor(cust);
        expect(await linksOf(cust.id)).toEqual([
            expect.objectContaining({ contactId: survivor.id }),
        ]);
        expect(
            await prisma.customerIdentityLink.count({
                where: { contactId: tomb.id },
            }),
        ).toBe(0);
    });

    it("only suggests when the contact signs in and its email isn't verified (DEC-049)", async () => {
        await setOnline(true);
        const holder = await holderFromMarket("unproven@example.com");
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: holder.id,
                email: "unproven@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        const cust = await customer(online, "unproven@example.com");
        await payFor(cust);
        expect(await linksOf(cust.id)).toEqual([]);
    });

    it("links when the contact signs in with an email it proved", async () => {
        await setOnline(true);
        const holder = await holderFromMarket("proven@example.com");
        await prisma.contact.update({
            where: { id: holder.id },
            data: {
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "SIGN_IN_CODE",
            },
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: holder.id,
                email: "proven@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        const cust = await customer(online, "proven@example.com");
        await payFor(cust);
        expect(await linksOf(cust.id)).toEqual([
            expect.objectContaining({ contactId: holder.id }),
        ]);
    });

    it("leaves it for staff when someone else signs in with that email", async () => {
        await setOnline(true);
        await holderFromMarket("twice@example.com");
        // A4's separate contact: the account's email is proven, but on a
        // contact of its own.
        const separate = await prisma.contact.create({
            data: { organizationId: orgId, email: `sep-${tag}@example.com` },
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: separate.id,
                email: "twice@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        const cust = await customer(online, "twice@example.com");
        await payFor(cust);
        expect(await linksOf(cust.id)).toEqual([]);
    });

    it("turning it on re-links no pair that already existed, by a payment or the backfill", async () => {
        await holderFromMarket("before@example.com");
        const earlier = await customer(online, "before@example.com", {
            createdAt: new Date(Date.now() - 60_000),
        });
        await payFor(earlier);
        expect(await linksOf(earlier.id)).toEqual([]);

        await setOnline(true);
        // Their next payment: still for staff.
        await payFor(earlier);
        expect(await linksOf(earlier.id)).toEqual([]);
        // The backfill never links a same-email pair either.
        await backfillPayingCustomerContacts(prisma, normaliseEmail);
        expect(await linksOf(earlier.id)).toEqual([]);

        // Turned on again later keeps the first time, so they stay out.
        await setOnline(true);
        await payFor(earlier);
        expect(await linksOf(earlier.id)).toEqual([]);
    });

    it("links a customer made after it was turned on even if the pair's contact is older", async () => {
        const holder = await holderFromMarket("after@example.com");
        await setOnline(true);
        const later = await customer(online, "after@example.com");
        await payFor(later);
        expect(await linksOf(later.id)).toEqual([
            expect.objectContaining({ contactId: holder.id }),
        ]);
    });

    it("says why, without writing, when the storefront leaves it for staff", async () => {
        await holderFromMarket("why@example.com");
        const cust = await customer(online, "why@example.com");
        await expect(
            prisma.$transaction((tx) =>
                linkSameEmailCustomer(tx, {
                    organizationId: orgId,
                    customerId: cust.id,
                }),
            ),
        ).resolves.toBe("off");
        expect(await linksOf(cust.id)).toEqual([]);
    });
});
