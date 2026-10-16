import type { Db } from "../helpers";
import { dsId } from "./diary-shop-plan";
import type { DsBusiness } from "./diary-shop-types";

/**
 * What a diary-and-counter business must show to be demoed and filmed:
 * enough of a business (paid visits and counter sales month after month,
 * paying regulars, members past and present), and each state a screen or a
 * Home card is about — a no-show, a late cancel, visits nobody has marked,
 * a booking-page note waiting, sensitive notes, a bill due and one overdue,
 * a pack about to run out of time, a sold-out and a low shelf, something
 * held for collection, reviews, the journal's three categories with a
 * picture in every post, Insights' rollups. Fails the run with what is
 * missing; returns the counts LOCAL_DEV describes.
 */
export async function checkDiaryShop(
    prisma: Db,
    biz: DsBusiness,
    now: Date,
): Promise<Record<string, string | number>> {
    const orgId = dsId(biz.key, "org");
    const at = now.toISOString();
    const one = async (sql: Promise<{ n: bigint | number }[]>) =>
        Number((await sql).at(0)?.n ?? 0);
    const q = {
        bookings: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId}`),
        upcoming: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId}
              AND status = 'CONFIRMED' AND "startAt" > ${at}::timestamp`),
        attended: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId} AND outcome = 'ATTENDED'`),
        noShows: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId} AND outcome = 'NO_SHOW'`),
        lateCancels: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId} AND "cancelledLate"`),
        unmarked: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId}
              AND status = 'CONFIRMED' AND outcome IS NULL AND "endAt" <= ${at}::timestamp`),
        deposits: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Booking" WHERE "organizationId" = ${orgId}
              AND snapshot ? 'deposit'`),
        suggestions: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "ContactAttention" WHERE "organizationId" = ${orgId}
              AND status = 'SUGGESTED' AND source = 'BOOKING_PAGE'`),
        sensitive: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "ContactAttention" WHERE "organizationId" = ${orgId}
              AND sensitive AND status = 'ACTIVE'`),
        due: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Invoice" WHERE "organizationId" = ${orgId}
              AND status = 'ISSUED' AND "dueAt" > ${at}::timestamp`),
        overdue: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Invoice" WHERE "organizationId" = ${orgId}
              AND status = 'ISSUED' AND "dueAt" <= ${at}::timestamp`),
        invoices: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Invoice" WHERE "organizationId" = ${orgId}`),
        packsEnding: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "PackPurchase" p WHERE p."organizationId" = ${orgId}
              AND p."expiresAt" > ${at}::timestamp
              AND p."expiresAt" <= ${at}::timestamp + interval '14 days'
              AND p.credits > (SELECT COUNT(*) FROM "PackRedemption" r
                  WHERE r."purchaseId" = p.id AND r."reversedAt" IS NULL)`),
        packs: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "PackPurchase" WHERE "organizationId" = ${orgId}`),
        members: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" WHERE "organizationId" = ${orgId} AND status = 'ACTIVE'`),
        leavers: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" WHERE "organizationId" = ${orgId} AND status = 'CANCELLED'`),
        orders: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Order" WHERE "organizationId" = ${orgId}`),
        held: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Order" WHERE "organizationId" = ${orgId} AND status = 'PROCESSING'`),
        soldOut: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "StockLevel" WHERE "organizationId" = ${orgId} AND "onHand" - promised <= 0`),
        low: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "StockLevel" WHERE "organizationId" = ${orgId}
              AND "onHand" - promised > 0 AND "onHand" - promised <= "lowStockAlert"`),
        reviews: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "ProductReview" WHERE "organizationId" = ${orgId}`),
        payers: one(prisma.$queryRaw`
            SELECT COUNT(DISTINCT "contactId") AS n FROM "Invoice"
            WHERE "organizationId" = ${orgId} AND status = 'PAID'
              AND "paidAt" > ${at}::timestamp - interval '92 days'`),
        regulars: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM (SELECT "contactId" FROM "Invoice"
                WHERE "organizationId" = ${orgId} AND status = 'PAID'
                  AND "paidAt" > ${at}::timestamp - interval '92 days'
                GROUP BY "contactId" HAVING COUNT(*) >= 3) x`),
        timeOff: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "StaffTimeOff" WHERE "organizationId" = ${orgId}
              AND "endAt" > ${at}::timestamp`),
        entries: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "Submission" WHERE "organizationId" = ${orgId}`),
        analytics: one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM "AnalyticsDailyAggregate" WHERE "organizationId" = ${orgId}
              AND type = 'site.view' AND dimension = ''`),
    };
    const c: Record<string, number> = {};
    for (const [k, p] of Object.entries(q)) c[k] = await p;

    // Paid visits and counter sales, a month at a time, over three months.
    const monthly = await prisma.$queryRaw<{ m: number; n: bigint }[]>`
        SELECT floor(extract(epoch FROM (${at}::timestamp - "paidAt")) / 86400 / 30)::int AS m,
               COUNT(*) AS n
        FROM "Invoice" WHERE "organizationId" = ${orgId} AND status = 'PAID'
          AND source IN ('BOOKING', 'MANUAL', 'ORDER', 'PACK')
          AND "paidAt" > ${at}::timestamp - interval '90 days'
        GROUP BY 1 ORDER BY 1`;
    const perMonth = monthly.map((r) => Number(r.n));

    const posts = await prisma.post.findMany({
        where: { site: { organizationId: orgId }, status: "PUBLISHED" },
        select: {
            content: true,
            currentPublicationId: true,
            category: { select: { slug: true } },
        },
    });
    const byCategory = new Map<string, number>();
    for (const p of posts) {
        const k = p.category?.slug ?? "";
        byCategory.set(k, (byCategory.get(k) ?? 0) + 1);
    }

    const failures: string[] = [];
    const need = (ok: boolean, what: string) => {
        if (!ok) failures.push(what);
    };
    need(c.noShows > 0, "a no-show");
    need(c.lateCancels > 0, "a late cancel");
    need(c.unmarked > 0, "a past visit nobody has marked");
    need(c.upcoming >= 30, `30 upcoming bookings (${c.upcoming})`);
    need(c.suggestions > 0, "a booking-page note waiting as a suggestion");
    need(c.sensitive > 0, "a sensitive Needs attention");
    need(c.due > 0, "a bill due, not yet late");
    need(c.overdue > 0, "an overdue bill");
    need(c.packsEnding > 0, "a pack about to run out of time with visits left");
    need(
        c.members >= 40 && c.leavers >= 30,
        `members now and past (${c.members}/${c.leavers})`,
    );
    need(c.held > 0, "an order held for collection");
    need(c.soldOut > 0 && c.low > 0, "a sold-out and a low shelf");
    need(c.reviews >= 10, `reviews behind delivered orders (${c.reviews})`);
    need(c.timeOff > 0, "someone off this week");
    need(c.entries >= 10, `enquiries through the site (${c.entries})`);
    need(c.analytics >= 80, `Insights' daily rollups (${c.analytics})`);
    need(c.payers >= 80, `paying clients over three months (${c.payers})`);
    need(
        c.regulars >= 20,
        `regulars who paid three times or more (${c.regulars})`,
    );
    need(
        perMonth.length >= 3 && perMonth.slice(0, 3).every((n) => n >= 100),
        `paid visits and sales every month (${perMonth.join(", ")})`,
    );
    need(
        posts.length >= 24 &&
            ["help", "news", "articles"].every(
                (k) => (byCategory.get(k) ?? 0) >= 8,
            ),
        `24+ posts, 8+ in each category (${JSON.stringify(Object.fromEntries(byCategory))})`,
    );
    need(
        posts.every((p) => /<img\s/.test(p.content) && p.currentPublicationId),
        "every post live, with a picture in its body",
    );
    if (biz.services.some((s) => s.depositMode !== "NONE")) {
        need(c.deposits > 0, "a booking with its deposit paid online");
    }
    if (biz.treatments) {
        const stopped = await one(prisma.$queryRaw`
            SELECT COUNT(*) AS n FROM (
                SELECT b."orderId" FROM "Booking" b
                WHERE b."organizationId" = ${orgId} AND b."orderId" IS NOT NULL
                GROUP BY b."orderId"
                HAVING MAX(b."visitNumber") = 3 AND MAX(b."endAt") < ${at}::timestamp - interval '14 days'
            ) x`);
        c.stoppedAtThree = stopped;
        need(stopped > 0, "a treatment stopped after its third visit");
    }
    if (failures.length > 0) {
        throw new Error(
            `${biz.name} is missing what its demos need:\n- ${failures.join("\n- ")}`,
        );
    }
    return {
        ...c,
        perMonth: perMonth.join(" / "),
        posts: `${posts.length} (${Array.from(byCategory.entries())
            .map(([k, n]) => `${k} ${n}`)
            .join(", ")})`,
    };
}
