/**
 * What the plans catalogue's limits count, and how (plans catalogue U13,
 * KTD-9). Every count reads the tables the product already writes; nothing
 * is stored to be metered. `MeteringService` (enforcement), `GET
 * …/billing/access` (usage) and the admin's `ImpactService` (usage lines and
 * impact) all count through here, so the three can't disagree.
 *
 * The limit keys are `MODULE_MAP.limitKey` (`@saroh/pricing-catalog`):
 *
 * | Limit key          | Counts                                                                 |
 * | ------------------ | ---------------------------------------------------------------------- |
 * | `products`         | products not archived                                                  |
 * | `ordersPerMonth`   | orders placed this month that stand: not cancelled, and not an online checkout nobody paid (OQ-7); one to be paid on handover stands from the start |
 * | `bookingsPerMonth` | bookings made this month that stand (CONFIRMED), a course's sessions left out |
 * | `blogPosts`        | posts live on a site that isn't deleted                                |
 * | `teamMembers`      | people in the business, plus invitations still open; Reviewers left out (they only look at the website) |
 * | `reviewers`        | Reviewers in the business, plus Reviewer invitations still open |
 * | `integrations`     | connected payment and messaging providers                              |
 * | `shopLocations`    | locations not deleted whose settings say `SHOP` (customers visit); an online-only one, or one with no settings, never counts |
 * | `sites`            | websites not deleted                                                   |
 * | `storageGb`        | photos and videos uploaded and checked (`Media.status` READY), in GB  |
 * | `visitsPerMonth`   | this month's site views (`site.view`), from the daily rollup          |
 * | `sarohEmailsPerMonth` | emails Saroh queued for the business this month (`SAROH` deliveries), unless stopped before they went or failed with no try left (DEC-086) |
 *
 * A month is the business's own (its zone, `businessTimezone`): the 1st
 * starts at midnight there, not in UTC. Visits are the exception: the
 * rollup (`AnalyticsDailyAggregate`) buckets by UTC day, so a month of
 * visits is the UTC days dated in the business's month — off by the zone's
 * offset at each end, and behind by whatever the rollup hasn't reached yet.
 *
 * Storage is in decimal gigabytes ({@link BYTES_PER_GB}, as a disk is sold),
 * rounded UP to the hundredth so a business with anything stored never reads
 * as using 0 GB. Failed or unconfirmed uploads hold nothing.
 */
import type { Prisma } from "@saroh/database";
import type { LimitPeriod, LimitWords } from "@saroh/pricing-catalog";
import { LIMIT_WORDS, MODULE_MAP } from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import { businessTimezone } from "../bookings/staff-availability";
import { COUNTED_SAROH_DELIVERIES } from "../communications/saroh-delivery";

/** The limit keys metering counts, in `MODULE_MAP`'s words. */
export const METERED_LIMIT_KEYS = [
    "products",
    "ordersPerMonth",
    "bookingsPerMonth",
    "blogPosts",
    "teamMembers",
    "reviewers",
    "integrations",
    "shopLocations",
    "sites",
    "storageGb",
    "visitsPerMonth",
    "sarohEmailsPerMonth",
] as const;
export type MeteredLimitKey = (typeof METERED_LIMIT_KEYS)[number];

const METERED: ReadonlySet<string> = new Set(METERED_LIMIT_KEYS);

export function isMeteredLimitKey(key: unknown): key is MeteredLimitKey {
    return typeof key === "string" && METERED.has(key);
}

/** A gigabyte as storage is sold: 1,000,000,000 bytes (not 2^30). */
export const BYTES_PER_GB = 1_000_000_000;

/** Bytes as the GB a storage limit counts: up to the next hundredth. */
export function bytesToGb(bytes: number): number {
    if (!Number.isFinite(bytes) || bytes <= 0) return 0;
    return Math.ceil(bytes / (BYTES_PER_GB / 100)) / 100;
}

/** The role metering leaves out of the team count: it reviews the website, nothing else. */
export const UNMETERED_ROLE = "REVIEWER";

/** The analytics event a site visit is (`analytics/event-contract.ts`). */
const SITE_VIEW = "site.view";

/** How each limit reads to the merchant: `@saroh/pricing-catalog`'s words. */
export type MeterWords = LimitWords;

/**
 * The words for each limit key, shared with the merchant app's notices
 * (`LIMIT_WORDS`), so a refusal and the screen behind it say the same.
 */
export const METER_WORDS: Readonly<Record<MeteredLimitKey, MeterWords>> =
    Object.fromEntries(
        METERED_LIMIT_KEYS.map((k) => [k, LIMIT_WORDS[k]]),
    ) as Record<MeteredLimitKey, MeterWords>;

/** The catalogue rows whose limit metering counts, by row id. */
export function meteredModules(): Map<string, MeteredLimitKey> {
    const out = new Map<string, MeteredLimitKey>();
    for (const [moduleId, entry] of Object.entries(MODULE_MAP)) {
        if (isMeteredLimitKey(entry.limitKey))
            out.set(moduleId, entry.limitKey);
    }
    return out;
}

/** A catalogue row's metered limit key, or null for a switch. */
export function meteredKeyOf(moduleId: string): MeteredLimitKey | null {
    return meteredModules().get(moduleId) ?? null;
}

/** The month a count runs over, in the business's zone. */
export interface MeterWindow {
    /** The first instant of the month there, in UTC. */
    start: Date;
    /** "2026-10": names the month in a notice's once-only key. */
    key: string;
}

/** The calendar month `now` falls in, in `zone`. */
export function monthWindow(now: Date, zone: string): MeterWindow {
    const local = DateTime.fromJSDate(now, { zone }).startOf("month");
    return { start: local.toUTC().toJSDate(), key: local.toFormat("yyyy-MM") };
}

/**
 * The window a row's notice is once per: its month for a monthly limit,
 * else "all" — the same total limit warns once until it changes.
 */
export function windowKey(per: LimitPeriod, now: Date, zone: string): string {
    return per === "month" ? monthWindow(now, zone).key : "all";
}

/** The tables the counts read: the request's client, or a transaction. */
export type MeterDb = Pick<
    Prisma.TransactionClient,
    | "product"
    | "order"
    | "booking"
    | "post"
    | "membership"
    | "organizationInvitation"
    | "merchantPaymentProvider"
    | "communicationProvider"
    | "businessProfile"
    | "service"
    | "store"
    | "site"
    | "media"
    | "analyticsDailyAggregate"
    | "delivery"
>;

/**
 * The first UTC day bucket of the business's month: the calendar date its
 * month starts on there, as `AnalyticsDailyAggregate.date` stores a day.
 */
export function monthFirstDay(now: Date, zone: string): Date {
    const local = DateTime.fromJSDate(now, { zone }).startOf("month");
    return new Date(Date.UTC(local.year, local.month - 1, 1));
}

/** People who count: everyone but a Reviewer. */
export const countedRole = { role: { not: UNMETERED_ROLE } } as const;

/** Only Reviewers: what the `reviewers` cap counts. */
export const reviewerRole = { role: UNMETERED_ROLE } as const;

/** Media that holds space: uploaded and checked. */
export const STORED = "READY";

/** A location customers visit (`StoreSettings.kind`). */
export const SHOP_KIND = "SHOP";

/** The rollup's org-wide daily total of site views, from `firstDay`. */
export function siteViewTotals(
    firstDay: Date,
): Prisma.AnalyticsDailyAggregateWhereInput {
    return {
        siteId: "",
        type: SITE_VIEW,
        dimension: "",
        dimensionValue: "",
        date: { gte: firstDay },
    };
}

/** Orders that stand: not cancelled, and not an unpaid online checkout. */
export function standingOrders(since: Date): Prisma.OrderWhereInput {
    return {
        createdAt: { gte: since },
        status: { not: "CANCELLED" },
        // An order to be paid on handover stands from the start.
        NOT: { placedOnline: true, payOnHandover: false, paidAt: null },
    };
}

/** Bookings that stand, a course's sessions left out (COURSES' own). */
export function standingBookings(since: Date): Prisma.BookingWhereInput {
    return {
        createdAt: { gte: since },
        status: "CONFIRMED",
        courseEnrollmentId: null,
    };
}

/**
 * Saroh's emails that count (DEC-086): queued this month, unless stopped
 * before they went or failed with no try left (`COUNTED_SAROH_DELIVERIES`).
 * A business's own provider is never counted.
 */
export function countedSarohEmails(since: Date): Prisma.DeliveryWhereInput {
    return { ...COUNTED_SAROH_DELIVERIES, createdAt: { gte: since } };
}

/**
 * How much of one limit a business uses now. Monthly keys count from the
 * start of this month in the business's zone.
 */
export async function countUsage(
    db: MeterDb,
    organizationId: string,
    key: MeteredLimitKey,
    now: Date = new Date(),
): Promise<number> {
    switch (key) {
        case "products":
            return db.product.count({
                where: { organizationId, status: { not: "ARCHIVED" } },
            });
        case "ordersPerMonth": {
            const zone = await businessTimezone(db, organizationId);
            const { start } = monthWindow(now, zone);
            // Through the storefront: an order from before organizationId
            // was written on orders still names its business there.
            return db.order.count({
                where: { store: { organizationId }, ...standingOrders(start) },
            });
        }
        case "bookingsPerMonth": {
            const zone = await businessTimezone(db, organizationId);
            const { start } = monthWindow(now, zone);
            return db.booking.count({
                where: { organizationId, ...standingBookings(start) },
            });
        }
        case "blogPosts":
            return db.post.count({
                where: {
                    currentPublicationId: { not: null },
                    site: { organizationId, deletedAt: null },
                },
            });
        case "teamMembers":
        case "reviewers": {
            const roleFilter = key === "reviewers" ? reviewerRole : countedRole;
            const [members, invites] = await Promise.all([
                db.membership.count({
                    where: { organizationId, ...roleFilter },
                }),
                db.organizationInvitation.count({
                    where: {
                        organizationId,
                        status: "PENDING",
                        expiresAt: { gt: now },
                        ...roleFilter,
                    },
                }),
            ]);
            return members + invites;
        }
        case "integrations": {
            const [payments, messaging] = await Promise.all([
                db.merchantPaymentProvider.count({
                    where: { organizationId, status: "CONNECTED" },
                }),
                db.communicationProvider.count({
                    where: { organizationId, status: "CONNECTED" },
                }),
            ]);
            return payments + messaging;
        }
        case "shopLocations":
            return db.store.count({
                where: {
                    organizationId,
                    deletedAt: null,
                    settings: { kind: SHOP_KIND },
                },
            });
        case "sites":
            return db.site.count({
                where: { organizationId, deletedAt: null },
            });
        case "storageGb": {
            const sum = await db.media.aggregate({
                where: { organizationId, status: STORED },
                _sum: { sizeBytes: true },
            });
            return bytesToGb(Number(sum._sum.sizeBytes ?? 0));
        }
        case "sarohEmailsPerMonth": {
            const zone = await businessTimezone(db, organizationId);
            const { start } = monthWindow(now, zone);
            return db.delivery.count({
                where: { organizationId, ...countedSarohEmails(start) },
            });
        }
        case "visitsPerMonth": {
            const zone = await businessTimezone(db, organizationId);
            const sum = await db.analyticsDailyAggregate.aggregate({
                where: {
                    organizationId,
                    ...siteViewTotals(monthFirstDay(now, zone)),
                },
                _sum: { count: true },
            });
            return sum._sum.count ?? 0;
        }
    }
}

/**
 * Usage for the catalogue rows given (row id → count), for the rows metering
 * counts; a switch row is left out. What `GET …/billing/access` fills its
 * `usage` from.
 */
export async function usageByModule(
    db: MeterDb,
    organizationId: string,
    moduleIds: readonly string[],
    now: Date = new Date(),
): Promise<Record<string, number>> {
    const keyed = meteredModules();
    const wanted = moduleIds.flatMap((id) => {
        const key = keyed.get(id);
        return key ? [[id, key] as const] : [];
    });
    const counts = await Promise.all(
        wanted.map(([, key]) => countUsage(db, organizationId, key, now)),
    );
    return Object.fromEntries(wanted.map(([id], i) => [id, counts[i]]));
}
