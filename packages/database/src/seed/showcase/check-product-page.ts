import type { Db } from "../helpers";
import { COLLECTIONS, P, PRODUCTS, ryeId } from "./bakery-catalogue";
import { DISCOUNTS, PHOTOS, REVIEWS } from "./bakery-product-page";

/**
 * What Rye & Co.'s Product Detail and Editor films need (#522, #525),
 * checked in the database after the seed: the loaf's description, key
 * points, ingredients and ready line; photos in order with the cover
 * mirrored; reviews only from people who bought the product — on a paid,
 * shipped or delivered order's line of it, behind that order's invitation,
 * after it left, and never later than now — with the loaf's twelve at 4.6
 * and three waiting for a reply; and WEEKEND10 and FIRSTLOAF applying now.
 */

export interface RyeProductPageCounts {
    loaf: string;
    photos: string;
    reviews: string;
    discounts: string;
}

type Row = Record<string, unknown>;

export async function checkRyeProductPage(
    prisma: Db,
    orgId: string,
): Promise<{ counts: RyeProductPageCounts; failures: string[] }> {
    const failures: string[] = [];
    const fail = (what: string, rows: Row[]) => {
        if (rows.length > 0) {
            failures.push(
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3), (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v))}`,
            );
        }
    };
    const expect = (what: string, ok: boolean) => {
        if (!ok) failures.push(what);
    };
    const now = new Date().toISOString();
    const productId = (slug: string) => ryeId("product", P[slug]);

    // The loaf, as the design has it.
    const loafSpec = PRODUCTS[P["sourdough-loaf"]];
    const loaf = await prisma.product.findUnique({
        where: { id: productId("sourdough-loaf") },
        select: {
            description: true,
            keyPoints: true,
            materials: true,
            howToUse: true,
            image: true,
        },
    });
    expect(
        `the Sourdough loaf's description, key points, ingredients and ready line (found ${JSON.stringify(loaf)})`,
        !!loaf &&
            loaf.description === `<p>${loafSpec.description}</p>` &&
            JSON.stringify(loaf.keyPoints) ===
                JSON.stringify(loafSpec.keyPoints) &&
            loaf.materials === loafSpec.ingredients &&
            loaf.howToUse === loafSpec.ready,
    );

    // Photos: each product's, in order, the first its cover.
    const images = await prisma.productImage.findMany({
        where: { organizationId: orgId },
        orderBy: [{ productId: "asc" }, { position: "asc" }],
        select: {
            productId: true,
            url: true,
            position: true,
            creditName: true,
            product: { select: { image: true } },
        },
    });
    for (const [slug, photos] of Object.entries(PHOTOS)) {
        const mine = images.filter((m) => m.productId === productId(slug));
        expect(
            `${slug}'s ${photos.length} photos in order, the first its cover (found ${mine.length})`,
            mine.length === photos.length &&
                mine.every(
                    (m, k) =>
                        m.position === k &&
                        m.url === photos[k].url &&
                        !!m.creditName,
                ) &&
                mine[0]?.product.image === photos[0].url,
        );
    }
    fail(
        "photos on a product that has none in the design",
        images
            .filter(
                (m) =>
                    !Object.keys(PHOTOS).some(
                        (s) => productId(s) === m.productId,
                    ),
            )
            .map((m) => ({ productId: m.productId })),
    );

    // Reviews: only from buyers, behind their order's invitation.
    fail(
        "reviews not on a paid, shipped or delivered order's line of that product, by its customer",
        await prisma.$queryRaw<Row[]>`
            SELECT r.id FROM "ProductReview" r
            LEFT JOIN "OrderItem" i ON i.id = r."orderItemId"
            LEFT JOIN "Order" o ON o.id = i."orderId"
            LEFT JOIN "ReviewInvitation" v ON v.id = r."invitationId"
            WHERE r."organizationId" = ${orgId} AND (
                i.id IS NULL OR i."productId" IS DISTINCT FROM r."productId"
                OR o."customerId" IS DISTINCT FROM r."customerId"
                OR o."storeId" <> r."storeId"
                OR o."paymentStatus" <> 'PAID'
                OR o.status NOT IN ('SHIPPED', 'DELIVERED')
                OR v."orderId" IS DISTINCT FROM o.id
                OR r."createdAt" <= o."updatedAt"
                OR r."createdAt" < v."createdAt"
                OR r."createdAt" > ${now}::timestamptz AT TIME ZONE 'UTC'
                OR r."repliedAt" > ${now}::timestamptz AT TIME ZONE 'UTC'
                OR r.rating NOT BETWEEN 1 AND 5)`,
    );
    fail(
        "people who reviewed one product twice on one order",
        await prisma.$queryRaw<Row[]>`
            SELECT r."productId", r."invitationId", COUNT(*) AS n
            FROM "ProductReview" r WHERE r."organizationId" = ${orgId}
            GROUP BY 1, 2 HAVING COUNT(*) > 1`,
    );
    const byProduct = await prisma.$queryRaw<Row[]>`
        SELECT r."productName" AS name, COUNT(*) AS n,
               ROUND(AVG(r.rating)::numeric, 1)::text AS avg,
               COUNT(*) FILTER (WHERE r.reply IS NULL) AS waiting
        FROM "ProductReview" r
        WHERE r."organizationId" = ${orgId} AND r.status = 'PUBLISHED'
        GROUP BY 1 ORDER BY 2 DESC, 1`;
    const loafReviews = byProduct.find((r) => r.name === loafSpec.name);
    expect(
        `twelve reviews on the Sourdough loaf at 4.6, three waiting for a reply (found ${JSON.stringify(loafReviews, (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v))})`,
        Number(loafReviews?.n) === REVIEWS["sourdough-loaf"].length &&
            loafReviews?.avg === "4.6" &&
            Number(loafReviews.waiting) === 3,
    );
    const total = byProduct.reduce((s, r) => s + Number(r.n), 0);
    const expected = Object.values(REVIEWS).reduce((s, r) => s + r.length, 0);
    expect(`${expected} reviews in all (found ${total})`, total === expected);

    // The codes: applying now, reaching what the design says.
    const codes = await prisma.discount.findMany({
        where: {
            organizationId: orgId,
            code: { in: [DISCOUNTS.weekend.code, DISCOUNTS.firstLoaf.code] },
        },
        select: {
            code: true,
            kind: true,
            percentBps: true,
            amount: true,
            currency: true,
            appliesTo: true,
            startsAt: true,
            endsAt: true,
            usageLimit: true,
            products: { select: { productId: true } },
        },
    });
    const at = new Date(now);
    const live = (d: (typeof codes)[number]) =>
        (!d.startsAt || d.startsAt <= at) &&
        (!d.endsAt || d.endsAt >= at) &&
        d.usageLimit === null;
    const weekend = codes.find((d) => d.code === DISCOUNTS.weekend.code);
    const picked = (
        COLLECTIONS.find((c) => c.key === DISCOUNTS.weekend.collection)
            ?.picked ?? []
    )
        .map(productId)
        .sort();
    expect(
        `WEEKEND10: 10% off the Weekend bakes products, applying now (found ${JSON.stringify(weekend)})`,
        !!weekend &&
            live(weekend) &&
            weekend.kind === "PERCENTAGE" &&
            weekend.percentBps === DISCOUNTS.weekend.percentBps &&
            weekend.appliesTo === "PRODUCT" &&
            JSON.stringify(weekend.products.map((p) => p.productId).sort()) ===
                JSON.stringify(picked),
    );
    const first = codes.find((d) => d.code === DISCOUNTS.firstLoaf.code);
    expect(
        `FIRSTLOAF: ₹50 off anything in the shop, applying now (found ${JSON.stringify(first)})`,
        !!first &&
            live(first) &&
            first.kind === "FIXED_AMOUNT" &&
            first.amount?.toString() === DISCOUNTS.firstLoaf.amount &&
            first.currency === "INR" &&
            first.appliesTo === "BUSINESS",
    );

    return {
        failures,
        counts: {
            loaf: `${loaf?.keyPoints.length ?? 0} key points, ${images.filter((m) => m.productId === productId("sourdough-loaf")).length} photos`,
            photos: `${images.length} on ${new Set(images.map((m) => m.productId)).size} products`,
            reviews: byProduct
                .map(
                    (r) =>
                        `${String(r.name)} ${Number(r.n)} (${String(r.avg)}, ${Number(r.waiting)} waiting)`,
                )
                .join(", "),
            discounts: codes
                .map((d) => `${d.code}${live(d) ? " applies now" : ""}`)
                .join(", "),
        },
    };
}
