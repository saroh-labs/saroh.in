import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { COLLECTIONS, P, PRODUCTS, ryeId } from "./bakery-catalogue";
import { DISCOUNTS, PHOTOS, REVIEWS } from "./bakery-product-page";
import { istAt } from "./people";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Rye & Co.'s photos (#522, #525): rewritten whole, in order, the first the
 * cover (mirrored to Product.image, as the photo set does), and a variant
 * pointed at the photo that is its picture. Products with none keep none.
 */
export async function writeRyePhotos(
    prisma: Db,
    a: {
        orgId: string;
        productIds: readonly string[];
        variantIds: readonly (readonly string[])[];
        createdAt: Date;
    },
) {
    for (let i = 0; i < PRODUCTS.length; i++) {
        const p = PRODUCTS[i];
        const productId = a.productIds[i];
        const photos = PHOTOS[p.slug] ?? [];
        // Nothing may point at a photo about to go.
        await prisma.productVariant.updateMany({
            where: { productId },
            data: { imageId: null },
        });
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.product.update({
            where: { id: productId },
            data: { image: photos[0]?.url ?? null, seoImageId: null },
        });
        if (photos.length === 0) continue;
        const ids = photos.map((_, k) => ryeId("image", i, k));
        await prisma.productImage.createMany({
            data: photos.map((ph, k) => ({
                id: ids[k],
                productId,
                organizationId: a.orgId,
                url: ph.url,
                alt: ph.alt,
                width: ph.width,
                height: ph.height,
                position: k,
                creditName: ph.creditName,
                creditUrl: ph.creditUrl,
                createdAt: a.createdAt,
            })),
        });
        for (let k = 0; k < photos.length; k++) {
            const value = photos[k].variant;
            if (!value) continue;
            const v = (p.variants ?? []).findIndex((x) => x.value === value);
            const variantId = a.variantIds[i]?.[v];
            if (!variantId) throw new Error(`${p.name} has no ${value}`);
            await prisma.productVariant.update({
                where: { id: variantId },
                data: { imageId: ids[k] },
            });
        }
    }
}

interface Bought {
    itemId: string;
    orderId: string;
    productId: string;
    variantId: string | null;
    storeId: string;
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    doneAt: Date;
}

/**
 * Reviews (#522), only from people who bought the product: each on a line
 * of a paid order that was collected, shipped or delivered at least a day
 * ago, behind that order's invitation — the rule the API's eligibility
 * keeps. A reviewer is the design's person when they bought it, else the
 * next buyer who hasn't reviewed it. The loaf has more reviews than
 * people who could review it, so a regular may review a second order of
 * it; nobody reviews one order line twice.
 * Written after the orders; the orders' clear takes them away again.
 */
export async function writeRyeReviews(
    prisma: Db,
    a: {
        orgId: string;
        now: Date;
        productIds: readonly string[];
        variantIds: readonly (readonly string[])[];
        demoUserId: string;
        shopperKey: (email: string) => string | undefined;
    },
) {
    const slugs = Object.keys(REVIEWS);
    const bought = await prisma.$queryRaw<Bought[]>`
        SELECT i.id AS "itemId", i."orderId", i."productId", i."variantId",
               o."storeId", o."customerId", c.email, c."firstName", c."lastName",
               o."updatedAt" AS "doneAt"
        FROM "OrderItem" i
        JOIN "Order" o ON o.id = i."orderId"
        JOIN "Customer" c ON c.id = o."customerId"
        WHERE o."organizationId" = ${a.orgId}
          AND o."paymentStatus" = 'PAID'
          AND o.status IN ('SHIPPED', 'DELIVERED')
          AND o."updatedAt" < ${new Date(a.now.getTime() - DAY).toISOString()}::timestamptz AT TIME ZONE 'UTC'
          AND i."productId" = ANY(${slugs.map((s) => a.productIds[P[s]])})
        ORDER BY o."updatedAt" DESC, i.id`;

    const invitations = new Map<
        string,
        Prisma.ReviewInvitationCreateManyInput
    >();
    const reviews: Prisma.ProductReviewCreateManyInput[] = [];
    const usedItems = new Set<string>();
    for (const slug of slugs) {
        const i = P[slug];
        const p = PRODUCTS[i];
        const productId = a.productIds[i];
        const variantOf = (value: string | undefined) => {
            if (!value) return undefined;
            const v = (p.variants ?? []).findIndex((x) => x.value === value);
            return a.variantIds[i]?.[v];
        };
        const lines = bought.filter(
            (b) => b.productId === productId && !usedItems.has(b.itemId),
        );
        const reviewed = new Set<string>();
        const specs = REVIEWS[slug];
        // The design's people first, then anyone else who bought it.
        // A variant a review names is kept for it: others take another line.
        const named = new Set(specs.map((r) => variantOf(r.variant)));
        const pick = specs.map((r) => {
            const variantId = variantOf(r.variant);
            const mine = (b: Bought) =>
                a.shopperKey(b.email) === r.who &&
                (!variantId || b.variantId === variantId);
            return (
                lines.find(
                    (b) =>
                        mine(b) &&
                        (!!variantId || !named.has(b.variantId ?? undefined)),
                ) ?? null
            );
        });
        pick.forEach((b) => {
            if (b) reviewed.add(b.email);
        });
        specs.forEach((r, k) => {
            let b = pick[k];
            if (b && pick.indexOf(b) !== k) b = null;
            const free = (x: Bought) =>
                !pick.includes(x) && !usedItems.has(x.itemId);
            // Someone new first; a regular reviews another of their orders
            // only when the loaf has more reviews than buyers.
            const variantId = variantOf(r.variant);
            const fits = (x: Bought) =>
                free(x) &&
                (variantId
                    ? x.variantId === variantId
                    : !named.has(x.variantId ?? undefined));
            b ??=
                lines.find((x) => fits(x) && !reviewed.has(x.email)) ??
                lines.find(fits) ??
                lines.find((x) => free(x) && !reviewed.has(x.email)) ??
                lines.find(free) ??
                null;
            if (!b) {
                throw new Error(
                    `Rye has no one left who bought ${p.name} to write review ${k + 1}`,
                );
            }
            reviewed.add(b.email);
            usedItems.add(b.itemId);

            const invitationId = ryeId("invitation", b.orderId);
            const sentAt = new Date(b.doneAt.getTime() + HOUR / 2);
            if (!invitations.has(b.orderId)) {
                invitations.set(b.orderId, {
                    id: invitationId,
                    organizationId: a.orgId,
                    orderId: b.orderId,
                    tokenHash: createHash("sha256")
                        .update(invitationId)
                        .digest("hex"),
                    toAddress: b.email,
                    expiresAt: new Date(sentAt.getTime() + 30 * DAY),
                    completedAt: null,
                    lastSentAt: sentAt,
                    createdByUserId: a.demoUserId,
                    createdAt: sentAt,
                });
            }
            const reviewedAt = new Date(
                Math.min(
                    sentAt.getTime() + (5 + ((k * 7) % 40)) * HOUR,
                    a.now.getTime() - 3 * HOUR,
                ),
            );
            reviews.push({
                id: ryeId("review", i, k),
                organizationId: a.orgId,
                storeId: b.storeId,
                invitationId,
                orderItemId: b.itemId,
                productId,
                customerId: b.customerId,
                productName: p.name,
                invitedTo: b.email,
                rating: r.rating,
                body: r.body,
                displayName: `${b.firstName} ${b.lastName.charAt(0)}.`,
                status: "PUBLISHED",
                reply: r.reply ?? null,
                repliedAt: r.reply
                    ? new Date(reviewedAt.getTime() + 2 * HOUR)
                    : null,
                createdAt: reviewedAt,
                updatedAt: reviewedAt,
            });
        });
    }

    // An invitation is done once every line on its order is reviewed.
    const orderIds = Array.from(invitations.keys());
    const lineCounts = await prisma.orderItem.groupBy({
        by: ["orderId"],
        where: { orderId: { in: orderIds } },
        _count: true,
    });
    for (const inv of Array.from(invitations.values())) {
        const mine = reviews.filter((r) => r.invitationId === inv.id);
        const lines = lineCounts.find((c) => c.orderId === inv.orderId);
        if (mine.length === lines?._count) {
            inv.completedAt = mine
                .map((r) => r.createdAt as Date)
                .reduce((x, y) => (y > x ? y : x));
        }
    }
    await prisma.reviewInvitation.createMany({
        data: Array.from(invitations.values()),
    });
    await prisma.productReview.createMany({ data: reviews });
}

/** The last minute of the month three days from now, in Kolkata. */
function monthEnd(now: Date): Date {
    const soon = istAt(now, 3, 0);
    const local = new Date(soon.getTime() + 5.5 * HOUR);
    const last = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0);
    const today = istAt(now, 0, 0).getTime() + 5.5 * HOUR;
    return istAt(now, Math.round((last - today) / DAY), 23 * 60 + 59);
}

/**
 * WEEKEND10 and FIRSTLOAF (#522), both applying now: rewritten whole, their
 * reach rows with them.
 */
export async function writeRyeDiscounts(
    prisma: Db,
    a: { orgId: string; now: Date; productIds: readonly string[] },
) {
    await prisma.discount.deleteMany({
        where: {
            organizationId: a.orgId,
            OR: [
                { id: { startsWith: ryeId("discount", "") } },
                {
                    code: {
                        in: [DISCOUNTS.weekend.code, DISCOUNTS.firstLoaf.code],
                    },
                },
            ],
        },
    });
    const weekend = COLLECTIONS.find(
        (c) => c.key === DISCOUNTS.weekend.collection,
    );
    if (!weekend?.picked) throw new Error("Rye has no Weekend bakes");
    await prisma.discount.create({
        data: {
            id: ryeId("discount", "weekend10"),
            organizationId: a.orgId,
            code: DISCOUNTS.weekend.code,
            description: DISCOUNTS.weekend.description,
            kind: "PERCENTAGE",
            percentBps: DISCOUNTS.weekend.percentBps,
            appliesTo: "PRODUCT",
            startsAt: istAt(a.now, -12, 6 * 60),
            endsAt: monthEnd(a.now),
            createdAt: istAt(a.now, -13, 18 * 60),
            products: {
                create: weekend.picked.map((slug) => ({
                    id: ryeId("discount", "weekend10", slug),
                    productId: a.productIds[P[slug]],
                })),
            },
        },
    });
    await prisma.discount.create({
        data: {
            id: ryeId("discount", "firstloaf"),
            organizationId: a.orgId,
            code: DISCOUNTS.firstLoaf.code,
            description: DISCOUNTS.firstLoaf.description,
            kind: "FIXED_AMOUNT",
            amount: DISCOUNTS.firstLoaf.amount,
            currency: "INR",
            appliesTo: "BUSINESS",
            startsAt: istAt(a.now, -90, 9 * 60),
            createdAt: istAt(a.now, -90, 9 * 60),
        },
    });
}
