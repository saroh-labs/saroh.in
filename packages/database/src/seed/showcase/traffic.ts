import { ANALYTICS_DAYS } from "../data";
import type { Db } from "../helpers";
import { buildAnalyticsRows, utcDay } from "../helpers";

/**
 * Site traffic for the showcase's Insights (what `apps/app.saroh.in/lib/
 * analytics/summary.ts` reads: daily `site.view` totals and visitors, views
 * by path, enquiries and paid orders, all from `AnalyticsDailyAggregate`).
 *
 * Paid orders and enquiries are counted from the business's own rows, so
 * the dashboard agrees with the lists it links to; views follow a slow
 * trend, a weekday shape and the festival calendar below, so a boutique's
 * Navratri week and a clinic's monsoon both show. The aggregates carry no
 * traffic source (Instagram, Google, WhatsApp, QR): the product does not
 * record one, so neither does the seed.
 */

export type TrafficKind = "boutique" | "bakery" | "gym" | "clinic";

/**
 * Busy and quiet stretches, by local date (inclusive), and how much
 * busier (or quieter) than an ordinary day each kind of business is then.
 * 2025–2027, so a seed run on any day in that span finds its season.
 */
const SEASONS: readonly {
    from: string;
    to: string;
    what: string;
    factor: Partial<Record<TrafficKind, number>>;
}[] = [
    // 2025
    {
        from: "2025-08-04",
        to: "2025-08-09",
        what: "Raksha Bandhan",
        factor: { boutique: 1.35, bakery: 1.3 },
    },
    {
        from: "2025-08-13",
        to: "2025-08-17",
        what: "Independence Day sales",
        factor: { boutique: 1.25 },
    },
    {
        from: "2025-07-01",
        to: "2025-09-15",
        what: "monsoon fevers",
        factor: { clinic: 1.25 },
    },
    {
        from: "2025-09-22",
        to: "2025-10-02",
        what: "Navratri and Dussehra",
        factor: { boutique: 1.45, bakery: 1.2, gym: 0.9 },
    },
    {
        from: "2025-10-12",
        to: "2025-10-22",
        what: "Diwali",
        factor: { boutique: 1.7, bakery: 1.6, gym: 0.8, clinic: 0.85 },
    },
    {
        from: "2025-12-18",
        to: "2025-12-31",
        what: "Christmas and New Year",
        factor: { bakery: 1.7, boutique: 1.25 },
    },
    // 2026
    {
        from: "2026-01-01",
        to: "2026-01-20",
        what: "New Year resolutions",
        factor: { gym: 1.45 },
    },
    {
        from: "2026-02-10",
        to: "2026-02-14",
        what: "Valentine's week",
        factor: { bakery: 1.35, boutique: 1.25 },
    },
    {
        from: "2026-03-01",
        to: "2026-03-04",
        what: "Holi",
        factor: { boutique: 1.2, bakery: 1.15 },
    },
    {
        from: "2026-07-01",
        to: "2026-09-15",
        what: "monsoon fevers",
        factor: { clinic: 1.25 },
    },
    {
        from: "2026-08-13",
        to: "2026-08-17",
        what: "Independence Day sales",
        factor: { boutique: 1.25 },
    },
    {
        from: "2026-08-22",
        to: "2026-08-28",
        what: "Onam and Raksha Bandhan",
        factor: { boutique: 1.4, bakery: 1.35 },
    },
    {
        from: "2026-09-12",
        to: "2026-09-15",
        what: "Ganesh Chaturthi",
        factor: { bakery: 1.3, boutique: 1.15, gym: 0.9 },
    },
    {
        from: "2026-10-09",
        to: "2026-10-20",
        what: "Navratri and Dussehra",
        factor: { boutique: 1.5, bakery: 1.25, gym: 0.9 },
    },
    {
        from: "2026-10-30",
        to: "2026-11-09",
        what: "Diwali",
        factor: { boutique: 1.75, bakery: 1.65, gym: 0.8, clinic: 0.85 },
    },
    {
        from: "2026-12-18",
        to: "2026-12-31",
        what: "Christmas and New Year",
        factor: { bakery: 1.7, boutique: 1.25 },
    },
    // 2027
    {
        from: "2027-01-01",
        to: "2027-01-20",
        what: "New Year resolutions",
        factor: { gym: 1.45 },
    },
    {
        from: "2027-07-01",
        to: "2027-09-15",
        what: "monsoon fevers",
        factor: { clinic: 1.25 },
    },
    {
        from: "2027-08-13",
        to: "2027-08-17",
        what: "Raksha Bandhan and Independence Day",
        factor: { boutique: 1.35, bakery: 1.3 },
    },
    {
        from: "2027-09-29",
        to: "2027-10-09",
        what: "Navratri and Dussehra",
        factor: { boutique: 1.45, bakery: 1.2, gym: 0.9 },
    },
    {
        from: "2027-10-20",
        to: "2027-10-30",
        what: "Diwali",
        factor: { boutique: 1.7, bakery: 1.6, gym: 0.8, clinic: 0.85 },
    },
];

/** How busy a kind of business is on a day (UTC ISO date), against an ordinary one. */
export function seasonFactor(kind: TrafficKind): (iso: string) => number {
    return (iso) => {
        let f = 1;
        for (const s of SEASONS) {
            if (iso >= s.from && iso <= s.to) f *= s.factor[kind] ?? 1;
        }
        return f;
    };
}

/** The same, for a planner that has an instant rather than a date. */
export function seasonAt(kind: TrafficKind, at: Date): number {
    // Kolkata's calendar day.
    const local = new Date(at.getTime() + 330 * 60_000);
    return seasonFactor(kind)(local.toISOString().slice(0, 10));
}

/**
 * Rewrite a business's daily rollups (ANALYTICS_DAYS of them) from its
 * paid orders and form entries, with views shaped as above. Rows are
 * keyed by the given id function, so a re-run rewrites the same ones.
 */
export async function writeTraffic(
    prisma: Db,
    a: {
        orgId: string;
        now: Date;
        kind: TrafficKind;
        paths: readonly { path: string; weight: number }[];
        /** Weekday views on the oldest day. */
        trendBase: number;
        /** Views added per day. */
        trendSlope: number;
        weekendFactor: number;
        idFor: (iso: string, key: string) => string;
        /** The prefix every one of those ids starts with. */
        idPrefix: string;
        noiseOffset: number;
    },
): Promise<number> {
    const since = new Date(
        utcDay(a.now).getTime() - ANALYTICS_DAYS * 86_400_000,
    );
    const [paid, entries] = await Promise.all([
        prisma.order.findMany({
            where: {
                organizationId: a.orgId,
                paymentStatus: { in: ["PAID", "REFUNDED"] },
                createdAt: { gte: since },
            },
            select: { createdAt: true },
        }),
        prisma.submission.findMany({
            where: { organizationId: a.orgId, createdAt: { gte: since } },
            select: { createdAt: true },
        }),
    ]);
    const byDay = (rows: { createdAt: Date }[]) => {
        const map = new Map<string, number>();
        for (const r of rows) {
            const iso = r.createdAt.toISOString().slice(0, 10);
            map.set(iso, (map.get(iso) ?? 0) + 1);
        }
        return map;
    };
    const rows = buildAnalyticsRows({
        now: a.now,
        days: ANALYTICS_DAYS,
        paths: a.paths,
        idFor: a.idFor,
        trendBase: a.trendBase,
        trendSlope: a.trendSlope,
        weekendFactor: a.weekendFactor,
        enquiryRate: 0,
        orderRate: 0,
        paidOrders: byDay(paid),
        enquiries: byDay(entries),
        noiseOffset: a.noiseOffset,
        dayFactor: seasonFactor(a.kind),
    });
    await prisma.analyticsDailyAggregate.deleteMany({
        where: { organizationId: a.orgId, id: { startsWith: a.idPrefix } },
    });
    await prisma.analyticsDailyAggregate.createMany({
        data: rows.map((r) => ({
            ...r,
            organizationId: a.orgId,
            siteId: "",
            createdAt: r.date,
            updatedAt: r.date,
        })),
    });
    return rows.length;
}
