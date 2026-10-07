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
 * | `bookingsPerMonth` | bookings customers made on the site this month that stand (CONFIRMED), a course's sessions left out; the team's own bookings never count (DEC-095) |
 * | `blogPosts`        | posts live on a site that isn't deleted                                |
 * | `teamMembers`      | people who use a seat (`seats.ts`: a role that can change something, or taking bookings), plus such invitations still open, plus bookable staff with no login (DEC-105) |
 * | `reviewers`        | view-only people (a role that only looks, approves or comments), plus such invitations still open: the catalogue's "View-only people" |
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
import type { SeatKind } from "./seats";
import { BOOKABLE_STAFF, roleActionsOf, seatOf } from "./seats";

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

/**
 * A total limit of one says nothing at 80% or at the cap (UX-041): the one
 * thing a plan comes with (its website, its owner) is filled by setting the
 * business up, so "you've reached your 1 website" on day one is noise. Only
 * going past it (a soft cap) is told. A monthly one still warns: reaching
 * this month's one booking is news.
 */
export function quietAtOne(
    key: MeteredLimitKey | undefined,
    limit: number,
): boolean {
    if (limit > 1) return false;
    return key !== undefined && !METER_WORDS[key].monthly;
}

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
    | "staffMember"
    | "organizationInvitation"
    | "organizationRole"
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

/** The seat kind each people limit counts (DEC-105). */
export function seatKindCounted(key: "teamMembers" | "reviewers"): SeatKind {
    return key === "reviewers" ? "viewOnly" : "seat";
}

/** What a membership row needs read to be classified (`seats.ts`). */
export const SEAT_MEMBER_SELECT = {
    role: true,
    extraActions: true,
    staffMember: { select: { status: true } },
} as const;

/** One membership as {@link SEAT_MEMBER_SELECT} reads it. */
export interface SeatMemberRow {
    role: string;
    extraActions: string[];
    staffMember: { status: string } | null;
}

/**
 * Bookable staff with no login (DEC-105, UX-053): on the diary, taking
 * bookings, and no team member behind them. Each uses a seat; one who is
 * a team member is counted once, through their membership.
 */
export function loginlessStaff(): Prisma.StaffMemberWhereInput {
    return { status: BOOKABLE_STAFF, membershipId: null };
}

/**
 * How many of these people and open invitations are of `kind`: a seat
 * (they can change something, or take bookings) or view-only. `loginless`
 * is the business's bookable staff with no login ({@link loginlessStaff}):
 * seats too.
 */
export function countSeatKind(
    kind: SeatKind,
    roles: readonly { key: string; actions: string[] }[],
    members: readonly SeatMemberRow[],
    invites: readonly { role: string }[],
    loginless = 0,
): number {
    const lookup = roleActionsOf(roles);
    const people = members.filter(
        (m) =>
            seatOf(
                lookup,
                m.role,
                m.extraActions,
                m.staffMember?.status === BOOKABLE_STAFF,
            ) === kind,
    ).length;
    const waiting = invites.filter(
        (i) => seatOf(lookup, i.role) === kind,
    ).length;
    return people + waiting + (kind === "seat" ? loginless : 0);
}

/** Invitations still open at `now`: they hold a place until answered. */
export function openInvitations(now: Date) {
    return { status: "PENDING", expiresAt: { gt: now } } as const;
}

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

/**
 * Bookings customers made online that stand, a course's sessions left out
 * (COURSES' own). A booking the team made in the workspace never counts
 * (DEC-095).
 */
export function standingBookings(since: Date): Prisma.BookingWhereInput {
    return {
        createdAt: { gte: since },
        status: "CONFIRMED",
        courseEnrollmentId: null,
        bookedOnline: true,
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
            // Classified by permissions, never role names (DEC-105): the
            // business's own roles are read with the people who hold them.
            const kind = seatKindCounted(key);
            const [members, invites, roles, loginless] = await Promise.all([
                db.membership.findMany({
                    where: { organizationId },
                    select: SEAT_MEMBER_SELECT,
                }),
                db.organizationInvitation.findMany({
                    where: { organizationId, ...openInvitations(now) },
                    select: { role: true },
                }),
                db.organizationRole.findMany({
                    where: { organizationId },
                    select: { key: true, actions: true },
                }),
                kind === "seat"
                    ? db.staffMember.count({
                          where: { organizationId, ...loginlessStaff() },
                      })
                    : 0,
            ]);
            return countSeatKind(kind, roles, members, invites, loginless);
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
