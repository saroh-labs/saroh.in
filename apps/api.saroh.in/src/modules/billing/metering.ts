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
 * | `ordersPerMonth`   | orders placed this month that stand: not cancelled, and not an online checkout nobody paid (OQ-7) |
 * | `bookingsPerMonth` | bookings made this month that stand (CONFIRMED), a course's sessions left out |
 * | `blogPosts`        | posts live on a site that isn't deleted                                |
 * | `teamMembers`      | people in the business, plus invitations still open                   |
 * | `integrations`     | connected payment and messaging providers                              |
 *
 * A month is the business's own (its zone, `businessTimezone`): the 1st
 * starts at midnight there, not in UTC.
 */
import type { Prisma } from "@saroh/database";
import type { LimitPeriod } from "@saroh/pricing-catalog";
import { MODULE_MAP } from "@saroh/pricing-catalog";
import { DateTime, IANAZone } from "luxon";

import {
    businessTimezone,
    FALLBACK_TIMEZONE,
} from "../bookings/staff-availability";

/** The limit keys metering counts, in `MODULE_MAP`'s words. */
export const METERED_LIMIT_KEYS = [
    "products",
    "ordersPerMonth",
    "bookingsPerMonth",
    "blogPosts",
    "teamMembers",
    "integrations",
] as const;
export type MeteredLimitKey = (typeof METERED_LIMIT_KEYS)[number];

const METERED: ReadonlySet<string> = new Set(METERED_LIMIT_KEYS);

export function isMeteredLimitKey(key: unknown): key is MeteredLimitKey {
    return typeof key === "string" && METERED.has(key);
}

/** How each limit reads to the merchant, for `limitNotice`'s sentences. */
export interface MeterWords {
    /** The counted thing, after a number: "5 products". */
    what: string;
    /** What stops at the limit, the notice's first sentence. */
    paused: string;
    /** Counted per calendar month in the business's zone, not in total. */
    monthly: boolean;
}

export const METER_WORDS: Readonly<Record<MeteredLimitKey, MeterWords>> = {
    products: {
        what: "products",
        paused: "You can't add more products.",
        monthly: false,
    },
    ordersPerMonth: {
        what: "orders a month",
        paused: "New orders at the counter are paused until next month; your site keeps taking them.",
        monthly: true,
    },
    bookingsPerMonth: {
        what: "bookings a month",
        paused: "New bookings are paused until next month.",
        monthly: true,
    },
    blogPosts: {
        what: "blog posts",
        paused: "You can't put more posts live.",
        monthly: false,
    },
    teamMembers: {
        what: "team members",
        paused: "You can't invite more people.",
        monthly: false,
    },
    integrations: {
        what: "connections",
        paused: "You can't connect more tools.",
        monthly: false,
    },
};

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
>;

/** Orders that stand: not cancelled, and not an unpaid online checkout. */
function standingOrders(since: Date): Prisma.OrderWhereInput {
    return {
        createdAt: { gte: since },
        status: { not: "CANCELLED" },
        NOT: { placedOnline: true, paidAt: null },
    };
}

/** Bookings that stand, a course's sessions left out (COURSES' own). */
function standingBookings(since: Date): Prisma.BookingWhereInput {
    return {
        createdAt: { gte: since },
        status: "CONFIRMED",
        courseEnrollmentId: null,
    };
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
        case "teamMembers": {
            const [members, invites] = await Promise.all([
                db.membership.count({ where: { organizationId } }),
                db.organizationInvitation.count({
                    where: {
                        organizationId,
                        status: "PENDING",
                        expiresAt: { gt: now },
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

/** What the cross-business counts read (the admin's, outside any business). */
export type MeterAcrossDb = MeterDb &
    Pick<Prisma.TransactionClient, "site" | "store">;

interface Counted {
    _count: { _all: number };
}

function tally<K extends string>(
    rows: readonly (Counted & Record<K, string | null>)[],
    by: K,
    into = new Map<string, number>(),
    owner: (id: string) => string | undefined = (id) => id,
): Map<string, number> {
    for (const r of rows) {
        const id = r[by];
        const org = id ? owner(id) : undefined;
        if (!org) continue;
        into.set(org, (into.get(org) ?? 0) + r._count._all);
    }
    return into;
}

/**
 * Each business's zone, as `businessTimezone` reads one: its own setting,
 * else its first active service's, else India — for every business at once.
 */
async function zonesOf(
    db: MeterAcrossDb,
    organizationIds: readonly string[],
): Promise<Map<string, string>> {
    const ids = [...organizationIds];
    const [profiles, services] = await Promise.all([
        db.businessProfile.findMany({
            where: { organizationId: { in: ids } },
            select: { organizationId: true, timezone: true },
        }),
        db.service.findMany({
            where: {
                organizationId: { in: ids },
                deletedAt: null,
                status: "ACTIVE",
            },
            orderBy: { createdAt: "asc" },
            distinct: ["organizationId"],
            select: { organizationId: true, timezone: true },
        }),
    ]);
    const valid = (z: string | null | undefined): z is string =>
        !!z && IANAZone.isValidZone(z);
    const own = new Map<string, string>();
    for (const p of profiles) {
        if (valid(p.timezone)) own.set(p.organizationId, p.timezone);
    }
    const first = new Map(
        services
            .filter((s) => valid(s.timezone))
            .map((s) => [s.organizationId, s.timezone]),
    );
    return new Map(
        ids.map((id) => [
            id,
            own.get(id) ?? first.get(id) ?? FALLBACK_TIMEZONE,
        ]),
    );
}

/**
 * One limit's usage for many businesses at once: business id → count (a
 * business with none is absent). The same rules as {@link countUsage}, one
 * query per zone for the monthly keys.
 *
 * CROSS-TENANT READ: only the admin's `ImpactService` calls it, behind the
 * admin guards. It returns counts, never what was counted.
 */
export async function countUsageAcross(
    db: MeterAcrossDb,
    key: MeteredLimitKey,
    organizationIds: readonly string[],
    now: Date = new Date(),
): Promise<Map<string, number>> {
    const ids = [...organizationIds];
    if (ids.length === 0) return new Map();
    switch (key) {
        case "products":
            return tally(
                await db.product.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        status: { not: "ARCHIVED" },
                    },
                    _count: { _all: true },
                }),
                "organizationId",
            );
        case "ordersPerMonth":
        case "bookingsPerMonth": {
            const zones = await zonesOf(db, ids);
            const byZone = new Map<string, string[]>();
            for (const [org, zone] of zones) {
                byZone.set(zone, [...(byZone.get(zone) ?? []), org]);
            }
            const out = new Map<string, number>();
            for (const [zone, orgs] of byZone) {
                const { start } = monthWindow(now, zone);
                if (key === "bookingsPerMonth") {
                    tally(
                        await db.booking.groupBy({
                            by: ["organizationId"],
                            where: {
                                organizationId: { in: orgs },
                                ...standingBookings(start),
                            },
                            _count: { _all: true },
                        }),
                        "organizationId",
                        out,
                    );
                    continue;
                }
                const stores = await db.store.findMany({
                    where: { organizationId: { in: orgs } },
                    select: { id: true, organizationId: true },
                });
                const ownerOf = new Map(
                    stores.map((s) => [s.id, s.organizationId]),
                );
                tally(
                    await db.order.groupBy({
                        by: ["storeId"],
                        where: {
                            storeId: { in: [...ownerOf.keys()] },
                            ...standingOrders(start),
                        },
                        _count: { _all: true },
                    }),
                    "storeId",
                    out,
                    (id) => ownerOf.get(id),
                );
            }
            return out;
        }
        case "blogPosts": {
            const sites = await db.site.findMany({
                where: { organizationId: { in: ids }, deletedAt: null },
                select: {
                    organizationId: true,
                    _count: {
                        select: {
                            posts: {
                                where: { currentPublicationId: { not: null } },
                            },
                        },
                    },
                },
            });
            const out = new Map<string, number>();
            for (const s of sites) {
                if (s._count.posts === 0) continue;
                out.set(
                    s.organizationId,
                    (out.get(s.organizationId) ?? 0) + s._count.posts,
                );
            }
            return out;
        }
        case "teamMembers": {
            const [members, invites] = await Promise.all([
                db.membership.groupBy({
                    by: ["organizationId"],
                    where: { organizationId: { in: ids } },
                    _count: { _all: true },
                }),
                db.organizationInvitation.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        status: "PENDING",
                        expiresAt: { gt: now },
                    },
                    _count: { _all: true },
                }),
            ]);
            return tally(
                invites,
                "organizationId",
                tally(members, "organizationId"),
            );
        }
        case "integrations": {
            const [payments, messaging] = await Promise.all([
                db.merchantPaymentProvider.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        status: "CONNECTED",
                    },
                    _count: { _all: true },
                }),
                db.communicationProvider.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        status: "CONNECTED",
                    },
                    _count: { _all: true },
                }),
            ]);
            return tally(
                messaging,
                "organizationId",
                tally(payments, "organizationId"),
            );
        }
    }
}
