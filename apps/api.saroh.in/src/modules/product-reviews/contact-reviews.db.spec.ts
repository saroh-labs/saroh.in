/**
 * One customer's reviews (C6, Customer Detail's Reviews tab) against a real
 * Postgres: the reviews of every store customer linked to the contact, never
 * an unlinked one with the same email or another business's, nothing for a
 * customer removed for a privacy request, and a reply or hide made from the
 * tab is the same review the product's Reviews tab lists. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { ProductReviewsService } from "./product-reviews.service";

const tag = `${process.pid}-${Date.now()}`;
const reviews = new ProductReviewsService(
    new CommunicationsService(),
    undefined,
    new FixedWindowRateLimiter(100, 60_000),
);

let seq = 0;

async function store(organizationId: string, name: string) {
    seq += 1;
    return (
        await prisma.store.create({
            data: { name, slug: `c6-${seq}-${tag}`, organizationId },
        })
    ).id;
}

async function storeCustomer(
    organizationId: string,
    storeId: string,
    email: string,
) {
    return (
        await prisma.customer.create({
            data: { organizationId, storeId, email, firstName: "Asha" },
        })
    ).id;
}

/** A paid order, its invitation and one review of `productName`. */
async function review(
    organizationId: string,
    storeId: string,
    customerId: string,
    productName: string,
    opts: { reviewCustomerId?: string | null } = {},
) {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId,
            orderId: `C6-${tag}-${seq}`,
            customerId,
            subtotal: "450",
            total: "450",
            currency: "INR",
            paymentStatus: "PAID",
        },
    });
    const invitation = await prisma.reviewInvitation.create({
        data: {
            organizationId,
            orderId: order.id,
            tokenHash: randomBytes(16).toString("hex"),
            toAddress: "asha@example.in",
            expiresAt: new Date(Date.now() + 86_400_000),
        },
    });
    return (
        await prisma.productReview.create({
            data: {
                organizationId,
                storeId,
                invitationId: invitation.id,
                customerId:
                    opts.reviewCustomerId === undefined
                        ? customerId
                        : opts.reviewCustomerId,
                productName,
                invitedTo: "asha@example.in",
                rating: 5,
                body: `${productName} was lovely`,
                displayName: "Asha R.",
            },
        })
    ).id;
}

describe("A customer's reviews (C6, DB)", () => {
    let ctx: OrganizationContext;
    let contactId = "";
    let removedId = "";
    let hillRoadReview = "";
    let marketReview = "";
    let olderReview = "";

    beforeAll(async () => {
        const ownerId = (
            await prisma.user.create({
                data: { email: `c6-owner-${tag}@example.com` },
            })
        ).id;
        const org = await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `c6-org-${tag}` },
        });
        ctx = { organizationId: org.id, userId: ownerId, role: "OWNER" };
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `c6-other-${tag}` },
        });

        const hillRoad = await store(org.id, "Hill Road");
        const market = await store(org.id, "Market Stall");
        contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: org.id,
                    email: "asha@example.in",
                    firstName: "Asha",
                },
            })
        ).id;

        // Two store customers, one per storefront, both linked to her.
        const atHillRoad = await storeCustomer(
            org.id,
            hillRoad,
            "asha@example.in",
        );
        const atMarket = await storeCustomer(
            org.id,
            market,
            "asha.rao@example.in",
        );
        await prisma.customerIdentityLink.createMany({
            data: [
                { organizationId: org.id, contactId, customerId: atHillRoad },
                { organizationId: org.id, contactId, customerId: atMarket },
            ],
        });
        hillRoadReview = await review(
            org.id,
            hillRoad,
            atHillRoad,
            "Sourdough",
        );
        marketReview = await review(org.id, market, atMarket, "Croissant");
        // A review that never had its customer written on it: the order
        // it was invited from says whose it is.
        olderReview = await review(org.id, hillRoad, atHillRoad, "Rye loaf", {
            reviewCustomerId: null,
        });

        // Same email, never linked: not her.
        const thirdStore = await store(org.id, "Pop-up");
        const lookalike = await storeCustomer(
            org.id,
            thirdStore,
            "ASHA@example.in",
        );
        await review(org.id, thirdStore, lookalike, "Baguette");

        // Another business's customer with the same email.
        const elsewhere = await store(other.id, "Elsewhere");
        const theirs = await storeCustomer(
            other.id,
            elsewhere,
            "asha@example.in",
        );
        await review(other.id, elsewhere, theirs, "Focaccia");

        // Removed for a privacy request, a link left behind all the same.
        removedId = (
            await prisma.contact.create({
                data: {
                    organizationId: org.id,
                    email: "removed+x@removed.invalid",
                    removedAt: new Date(),
                },
            })
        ).id;
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: org.id,
                contactId: removedId,
                customerId: atMarket,
            },
        });
    });

    it("shows the reviews of both linked store customers, and only theirs", async () => {
        const list = await reviews.list(ctx.organizationId, { contactId });
        expect(list.map((r) => r.id).sort()).toEqual(
            [hillRoadReview, marketReview, olderReview].sort(),
        );
        expect(list.map((r) => r.productName)).not.toContain("Baguette");
        expect(list.map((r) => r.productName)).not.toContain("Focaccia");
    });

    it("shows nothing for a customer removed for a privacy request", async () => {
        expect(
            await reviews.list(ctx.organizationId, { contactId: removedId }),
        ).toEqual([]);
    });

    it("404s a contact from another business", async () => {
        const stranger = await prisma.contact.create({
            data: {
                organizationId: (
                    await prisma.organization.create({
                        data: { name: "Third", slug: `c6-third-${tag}` },
                    })
                ).id,
                email: "asha@example.in",
            },
        });
        await expect(
            reviews.list(ctx.organizationId, { contactId: stranger.id }),
        ).rejects.toThrow("Customer not found");
    });

    it("a reply and a hide from the tab show on the product's reviews", async () => {
        await reviews.reply(ctx, hillRoadReview, "Thank you, Asha!");
        await reviews.setHidden(ctx, marketReview, true);

        const all = await reviews.list(ctx.organizationId);
        expect(all.find((r) => r.id === hillRoadReview)).toMatchObject({
            reply: "Thank you, Asha!",
            status: "PUBLISHED",
        });
        expect(all.find((r) => r.id === marketReview)).toMatchObject({
            status: "HIDDEN",
        });

        const hers = await reviews.list(ctx.organizationId, { contactId });
        expect(hers.find((r) => r.id === marketReview)?.status).toBe("HIDDEN");
    });
});
