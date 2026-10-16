import type { Db } from "../helpers";

/**
 * What a service-studio showcase must hold for its films and walkthroughs,
 * checked in the database after it is written. The shared checks
 * (`check.ts`) already prove every invoice adds up, its GST is its rate's,
 * its series has no gaps and nobody is booked twice; these prove the
 * designed states exist: enough of each thing, every line at 18% under the
 * business's own SAC codes, every post with a picture in it, Insights
 * traffic for the whole range, and whatever the business adds in `extra`.
 */
export interface StudioMinimum {
    products: number;
    variantsOnOneProduct: number;
    services: number;
    staff: number;
    leads: number;
    stages: number;
    entries: number;
    ordersLast90: number;
    payingContacts: number;
    reviews: number;
    invoices: number;
    drafts: number;
    bookingsUpcoming: number;
    posts: number;
    postsPerCategory: number;
    insightDays: number;
    subscriptionsLive: number;
    subscriptionsEnded: number;
}

type Counts = Record<keyof StudioMinimum, number>;

export async function checkStudio(
    prisma: Db,
    orgId: string,
    now: Date,
    o: {
        name: string;
        gstPrefix: string;
        sac: readonly string[];
        minimum: StudioMinimum;
        extra?: (fail: (what: string) => void) => Promise<void>;
    },
): Promise<Counts> {
    const failures: string[] = [];
    const fail = (what: string) => failures.push(what);
    const at = now.toISOString();
    const n = (rows: { n: bigint | number }[]) => Number(rows[0]?.n ?? 0);
    const since90 = new Date(now.getTime() - 90 * 86_400_000);

    const posts = await prisma.post.findMany({
        where: { site: { organizationId: orgId }, status: "PUBLISHED" },
        select: { slug: true, content: true, currentPublicationId: true, category: { select: { slug: true } } },
    });
    const perCategory = new Map<string, number>();
    for (const p of posts) {
        const c = p.category?.slug ?? "none";
        perCategory.set(c, (perCategory.get(c) ?? 0) + 1);
        if (!/<img\s[^>]*src="(https:\/\/images\.unsplash\.com\/|data:image\/)/.test(p.content)) {
            fail(`post "${p.slug}" has no picture in its body`);
        }
        if (!p.currentPublicationId) fail(`post "${p.slug}" is not live`);
    }

    const counts: Counts = {
        products: await prisma.product.count({ where: { organizationId: orgId, status: "PUBLISHED" } }),
        variantsOnOneProduct: n(await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COALESCE(MAX(c), 0) AS n FROM (
                SELECT COUNT(*) AS c FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
                WHERE p."organizationId" = ${orgId} GROUP BY v."productId") x`),
        services: await prisma.service.count({ where: { organizationId: orgId, deletedAt: null } }),
        staff: await prisma.staffMember.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
        leads: await prisma.lead.count({ where: { organizationId: orgId } }),
        stages: n(await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(DISTINCT "stageId") AS n FROM "Lead" WHERE "organizationId" = ${orgId}`),
        entries: await prisma.submission.count({ where: { organizationId: orgId, leadId: { not: null } } }),
        ordersLast90: await prisma.order.count({ where: { organizationId: orgId, createdAt: { gte: since90 } } }),
        payingContacts: n(await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(DISTINCT c) AS n FROM (
                SELECT "contactId" AS c FROM "Invoice"
                WHERE "organizationId" = ${orgId} AND status = 'PAID'
                UNION
                SELECT l."contactId" FROM "Order" o
                JOIN "CustomerIdentityLink" l ON l."customerId" = o."customerId"
                WHERE o."organizationId" = ${orgId} AND o."paymentStatus" = 'PAID') x`),
        reviews: await prisma.productReview.count({ where: { organizationId: orgId } }),
        invoices: await prisma.invoice.count({ where: { organizationId: orgId, status: { not: "DRAFT" } } }),
        drafts: await prisma.invoice.count({ where: { organizationId: orgId, status: "DRAFT" } }),
        bookingsUpcoming: await prisma.booking.count({
            where: { organizationId: orgId, startAt: { gt: now }, status: { not: "CANCELLED" } },
        }),
        posts: posts.length,
        postsPerCategory: Math.min(
            ...["help", "news", "articles"].map((c) => perCategory.get(c) ?? 0),
        ),
        insightDays: n(await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(DISTINCT date) AS n FROM "AnalyticsDailyAggregate"
            WHERE "organizationId" = ${orgId} AND "siteId" = '' AND type = 'site.view' AND dimension = ''`),
        subscriptionsLive: await prisma.customerSubscription.count({
            where: { organizationId: orgId, status: { in: ["ACTIVE", "PAUSED"] } },
        }),
        subscriptionsEnded: await prisma.customerSubscription.count({
            where: { organizationId: orgId, status: "CANCELLED" },
        }),
    };
    for (const [key, min] of Object.entries(o.minimum) as [keyof StudioMinimum, number][]) {
        if (counts[key] < min) fail(`${key}: ${counts[key]}, needs at least ${min}`);
    }

    const offLines = n(await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l."invoiceId"
        WHERE i."organizationId" = ${orgId}
          AND (l."gstRate" IS DISTINCT FROM 18 OR NOT (l."hsnSac" = ANY(${[...o.sac]})))`);
    if (offLines > 0) fail(`${offLines} invoice lines not at 18% under the business's SAC codes`);
    const offNumbers = n(await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "Invoice"
        WHERE "organizationId" = ${orgId} AND number IS NOT NULL
          AND number !~ ${`^${o.gstPrefix}/[0-9]{2}-[0-9]{2}/[0-9]{4}$`}`);
    if (offNumbers > 0) fail(`${offNumbers} invoices outside the ${o.gstPrefix} series`);
    const future = n(await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "Invoice"
        WHERE "organizationId" = ${orgId} AND ("issuedAt" > ${at}::timestamp OR "paidAt" > ${at}::timestamp)`);
    if (future > 0) fail(`${future} invoices issued or paid in the future`);
    const site = await prisma.site.findFirst({
        where: { organizationId: orgId },
        select: { currentPublicationId: true },
    });
    if (!site?.currentPublicationId) fail("the site is not published");

    if (o.extra) await o.extra(fail);
    if (failures.length > 0) {
        throw new Error(`${o.name} failed its checks:\n- ${failures.join("\n- ")}`);
    }
    return counts;
}
