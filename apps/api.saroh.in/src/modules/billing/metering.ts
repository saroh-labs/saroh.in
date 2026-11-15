/**
 * What the plans catalogue's limits count, and how (plans catalogue U13,
 * KTD-9). Every count reads the tables the product already writes; nothing
 * is stored to be metered. `MeteringService` (enforcement), `GET
 * …/billing/access` (usage), the admin's `ImpactService` (usage lines and
 * impact) and the console's business page (`admin/catalogue-usage.ts`, #875)
 * all count through here, so none can disagree.
 *
 * The limit keys are `MODULE_MAP.limitKey` (`@saroh/pricing-catalog`):
 *
 * | Limit key          | Counts                                                                 |
 * | ------------------ | ---------------------------------------------------------------------- |
 * | `products`         | products not archived                                                  |
 * | `ordersPerMonth`   | orders placed this month that stand: not cancelled, and not an online checkout nobody paid (OQ-7); one to be paid on handover stands from the start |
 * | `bookingsPerMonth` | bookings customers made on the site this month that stand (CONFIRMED), a course's sessions left out; the team's own bookings never count (DEC-095) |
 * | `blogPosts`        | posts live on a site that isn't deleted                                |
 * | `teamMembers`      | everyone in the business, whatever their role (`seats.ts`, DEC-155): team members, invitations still open, and bookable staff with no login (DEC-111) |
 * | `integrations`     | connected payment and messaging providers                              |
 * | `shopLocations`    | locations not deleted whose settings say `SHOP` (customers visit); an online-only one, or one with no settings, never counts |
 * | `sites`            | websites not deleted                                                   |
 * | `storageGb`        | photos and videos uploaded and checked (`Media.status` READY), in GB  |
 * | `visitsPerMonth`   | this month's site views (`site.view`), from the daily rollup          |
 * | `aiQuestionsPerMonth` | Ask AI turns that counted (`AiUsage.counted`, DEC-220): answered, drafted or stopped after the answer began |
 *
 * A cap inside one thing (a product's variants, `variantsPerProduct`) is
 * not counted here: it has no total across the business, so it is no meter
 * (`item-limits.ts`).
 *
 * A monthly limit counts over the business's billing period when it is on a
 * paid plan, and over its calendar month when it has none (DEC-219,
 * {@link meterWindow}): the 1st starts at midnight in its zone
 * (`businessTimezone`), not in UTC. Visits are the exception: the rollup
 * (`AnalyticsDailyAggregate`) buckets by UTC day, so a window of visits is
 * the UTC days from the date it starts on in the business's zone — off by
 * the zone's offset at each end, and behind by whatever the rollup hasn't
 * reached yet.
 *
 * Storage is in decimal gigabytes ({@link BYTES_PER_GB}, as a disk is sold),
 * rounded UP to the hundredth so a business with anything stored never reads
 * as using 0 GB. Failed or unconfirmed uploads hold nothing.
 */
import type { Prisma } from "@saroh/database";
import type { LimitPeriod, LimitWords } from "@saroh/pricing-catalog";
import {
    addMonthsUtc,
    LIMIT_WORDS,
    MODULE_MAP,
    quietAtLimit,
} from "@saroh/pricing-catalog";
import { DateTime } from "luxon";

import { businessTimezone } from "../bookings/staff-availability";
import { BOOKABLE_STAFF, countedOnDiary } from "./seats";

/** The limit keys metering counts, in `MODULE_MAP`'s words. */
export const METERED_LIMIT_KEYS = [
    "products",
    "ordersPerMonth",
    "bookingsPerMonth",
    "blogPosts",
    "teamMembers",
    "integrations",
    "shopLocations",
    "sites",
    "storageGb",
    "visitsPerMonth",
    "aiQuestionsPerMonth",
] as const;
export type MeteredLimitKey = (typeof METERED_LIMIT_KEYS)[number];

/**
 * The limit keys capped inside one thing, in `MODULE_MAP`'s words (DEC-158).
 * Never metered: no count across the business exists for them. Their rule
 * is `item-limits.ts`.
 */
export const ITEM_LIMIT_KEYS = ["variantsPerProduct"] as const;
export type ItemLimitKey = (typeof ITEM_LIMIT_KEYS)[number];

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
 * {@link quietAtLimit}, by limit key. Only going past it (a soft cap) is told.
 */
export function quietAtOne(
    key: MeteredLimitKey | undefined,
    limit: number,
): boolean {
    return key !== undefined && quietAtLimit(METER_WORDS[key], limit);
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

/** The stretch a monthly count runs over: a billing period or a month. */
export interface MeterWindow {
    /** Its first instant, in UTC. */
    start: Date;
    /** The first instant of the next one: when the count starts again. */
    end: Date;
    /**
     * Names it in a notice's once-only key: "2026-10" for a calendar month,
     * the start's date ("2026-11-14") for a billing period.
     */
    key: string;
}

/** The calendar month `now` falls in, in `zone`. */
export function monthWindow(now: Date, zone: string): MeterWindow {
    const local = DateTime.fromJSDate(now, { zone }).startOf("month");
    return {
        start: local.toUTC().toJSDate(),
        end: local.plus({ months: 1 }).toUTC().toJSDate(),
        key: local.toFormat("yyyy-MM"),
    };
}

/**
 * The month of a billing period `now` falls in: whole months on from (or
 * back to) `periodEnd`, its renewal day clamped at a short month's end.
 * Every step is counted from `periodEnd` itself, so a 31st is never lost to
 * a 28th. A late renewal (`now` past `periodEnd`) steps forward. A yearly
 * plan's monthly limits still reset monthly, on its anniversary day.
 */
export function periodWindow(now: Date, periodEnd: Date): MeterWindow {
    const at = (n: number) => addMonthsUtc(periodEnd, n);
    let n =
        (now.getUTCFullYear() - periodEnd.getUTCFullYear()) * 12 +
        now.getUTCMonth() -
        periodEnd.getUTCMonth();
    while (at(n) > now) n--;
    while (at(n + 1) <= now) n++;
    const start = at(n);
    return { start, end: at(n + 1), key: start.toISOString().slice(0, 10) };
}

/**
 * The window a business's monthly limits count over now (DEC-219): its
 * billing period's month on a paid plan with one, else the calendar month
 * in its zone (Free, no subscription, a cancelled one).
 */
export function windowFor(
    now: Date,
    zone: string,
    periodEnd: Date | null,
): MeterWindow {
    return periodEnd ? periodWindow(now, periodEnd) : monthWindow(now, zone);
}

/**
 * The billing period's end that sets a business's window, or null with no
 * paid period: a subscription that isn't cancelled, on a plan with a price
 * (`PAYING_WHERE`'s rule, trials and a payment due included), with a period
 * end.
 */
export function paidPeriodEnd(
    sub: {
        status: string;
        currentPeriodEnd: Date | null;
        plan: { priceCents: number };
    } | null,
): Date | null {
    if (!sub || sub.status === "CANCELLED" || sub.plan.priceCents <= 0)
        return null;
    return sub.currentPeriodEnd;
}

/** {@link MeterWindow} for one business, read from its subscription. */
export async function meterWindow(
    db: MeterDb,
    organizationId: string,
    now: Date,
): Promise<MeterWindow & { zone: string }> {
    const [zone, sub] = await Promise.all([
        businessTimezone(db, organizationId),
        db.subscription.findUnique({
            where: { organizationId },
            select: PERIOD_SELECT,
        }),
    ]);
    return { ...windowFor(now, zone, paidPeriodEnd(sub)), zone };
}

/** What {@link paidPeriodEnd} reads from a subscription. */
export const PERIOD_SELECT = {
    status: true,
    currentPeriodEnd: true,
    plan: { select: { priceCents: true } },
} as const;

/**
 * The window a row's notice is once per: its window for a monthly limit,
 * else "all" — the same total limit warns once until it changes.
 */
export function windowKey(per: LimitPeriod, window: MeterWindow): string {
    return per === "month" ? window.key : "all";
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
    | "merchantPaymentProvider"
    | "communicationProvider"
    | "businessProfile"
    | "organization"
    | "service"
    | "store"
    | "site"
    | "media"
    | "analyticsDailyAggregate"
    | "subscription"
    | "aiUsage"
>;

/**
 * The UTC day bucket a window starting at `start` counts visits from: the
 * date it starts on in the business's zone, as `AnalyticsDailyAggregate.date`
 * stores a day.
 */
export function firstDayOf(start: Date, zone: string): Date {
    const local = DateTime.fromJSDate(start, { zone });
    return new Date(Date.UTC(local.year, local.month - 1, local.day));
}

/**
 * Bookable staff with no login (DEC-111, UX-053): on the diary, taking
 * bookings, and no team member behind them. Each uses a seat; one who is
 * a team member is counted once, through their membership.
 */
export function loginlessStaff(): Prisma.StaffMemberWhereInput {
    return { status: BOOKABLE_STAFF, membershipId: null };
}

/** What an open invitation needs read to be counted (#868). */
export const SEAT_INVITE_SELECT = {
    staffMember: { select: { status: true, membershipId: true } },
} as const;

/** One open invitation as {@link SEAT_INVITE_SELECT} reads it. */
export interface SeatInviteRow {
    /** The diary person it gives a login to (#868), if any. */
    staffMember?: { status: string; membershipId: string | null } | null;
}

/**
 * The team seats a business uses (DEC-155): one for every team member,
 * whatever their role, one for every open invitation, and one for each of
 * its bookable staff with no login ({@link loginlessStaff}). An invite
 * that gives one of those a login is that same person (#868,
 * `countedOnDiary`), so it isn't counted again.
 */
export function countSeats(
    members: number,
    invites: readonly SeatInviteRow[],
    loginless = 0,
): number {
    const waiting = invites.filter(
        (i) => !countedOnDiary(i.staffMember),
    ).length;
    return members + waiting + loginless;
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

/** Ask AI turns that count, started from `since` (DEC-220, `ai/turn/outcome.ts`). */
export function countedQuestions(since: Date): Prisma.AiUsageWhereInput {
    return { counted: true, startedAt: { gte: since } };
}

/**
 * How much of one limit a business uses now. Monthly keys count over
 * {@link meterWindow}.
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
            const { start } = await meterWindow(db, organizationId, now);
            // Through the storefront: an order from before organizationId
            // was written on orders still names its business there.
            return db.order.count({
                where: { store: { organizationId }, ...standingOrders(start) },
            });
        }
        case "bookingsPerMonth": {
            const { start } = await meterWindow(db, organizationId, now);
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
        case "teamMembers": {
            // Everyone, whatever their role (DEC-155): no role is read.
            const [members, invites, loginless] = await Promise.all([
                db.membership.count({ where: { organizationId } }),
                db.organizationInvitation.findMany({
                    where: { organizationId, ...openInvitations(now) },
                    select: SEAT_INVITE_SELECT,
                }),
                db.staffMember.count({
                    where: { organizationId, ...loginlessStaff() },
                }),
            ]);
            return countSeats(members, invites, loginless);
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
        case "visitsPerMonth": {
            const { start, zone } = await meterWindow(db, organizationId, now);
            const sum = await db.analyticsDailyAggregate.aggregate({
                where: {
                    organizationId,
                    ...siteViewTotals(firstDayOf(start, zone)),
                },
                _sum: { count: true },
            });
            return sum._sum.count ?? 0;
        }
        case "aiQuestionsPerMonth": {
            const { start } = await meterWindow(db, organizationId, now);
            return db.aiUsage.count({
                where: { organizationId, ...countedQuestions(start) },
            });
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
