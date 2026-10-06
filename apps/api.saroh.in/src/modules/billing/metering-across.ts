/**
 * The plans catalogue's counts for many businesses at once (the admin's
 * `ImpactService`): the same rules as `countUsage` (`metering.ts`, which
 * says what each key counts), one query per zone for the monthly keys.
 */
import { IANAZone } from "luxon";

import { FALLBACK_TIMEZONE } from "../bookings/staff-availability";
import type { MeterDb, MeteredLimitKey } from "./metering";
import {
    bytesToGb,
    countedRole,
    countedSarohEmails,
    monthFirstDay,
    monthWindow,
    reviewerRole,
    SHOP_KIND,
    siteViewTotals,
    standingBookings,
    standingOrders,
    STORED,
} from "./metering";

/** What the cross-business counts read (the admin's, outside any business). */
export type MeterAcrossDb = MeterDb;

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
        case "bookingsPerMonth":
        case "sarohEmailsPerMonth": {
            const zones = await zonesOf(db, ids);
            const byZone = new Map<string, string[]>();
            for (const [org, zone] of zones) {
                byZone.set(zone, [...(byZone.get(zone) ?? []), org]);
            }
            const out = new Map<string, number>();
            for (const [zone, orgs] of byZone) {
                const { start } = monthWindow(now, zone);
                if (key === "sarohEmailsPerMonth") {
                    tally(
                        await db.delivery.groupBy({
                            by: ["organizationId"],
                            where: {
                                organizationId: { in: orgs },
                                ...countedSarohEmails(start),
                            },
                            _count: { _all: true },
                        }),
                        "organizationId",
                        out,
                    );
                    continue;
                }
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
        case "teamMembers":
        case "reviewers": {
            const roleFilter = key === "reviewers" ? reviewerRole : countedRole;
            const [members, invites] = await Promise.all([
                db.membership.groupBy({
                    by: ["organizationId"],
                    where: { organizationId: { in: ids }, ...roleFilter },
                    _count: { _all: true },
                }),
                db.organizationInvitation.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        status: "PENDING",
                        expiresAt: { gt: now },
                        ...roleFilter,
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
        case "shopLocations":
            return tally(
                await db.store.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: ids },
                        deletedAt: null,
                        settings: { kind: SHOP_KIND },
                    },
                    _count: { _all: true },
                }),
                "organizationId",
            );
        case "sites":
            return tally(
                await db.site.groupBy({
                    by: ["organizationId"],
                    where: { organizationId: { in: ids }, deletedAt: null },
                    _count: { _all: true },
                }),
                "organizationId",
            );
        case "storageGb": {
            const rows = await db.media.groupBy({
                by: ["organizationId"],
                where: { organizationId: { in: ids }, status: STORED },
                _sum: { sizeBytes: true },
            });
            const out = new Map<string, number>();
            for (const r of rows) {
                const gb = bytesToGb(Number(r._sum.sizeBytes ?? 0));
                if (gb > 0) out.set(r.organizationId, gb);
            }
            return out;
        }
        case "visitsPerMonth": {
            const zones = await zonesOf(db, ids);
            const byDay = new Map<number, string[]>();
            for (const [org, zone] of zones) {
                const day = monthFirstDay(now, zone).getTime();
                byDay.set(day, [...(byDay.get(day) ?? []), org]);
            }
            const out = new Map<string, number>();
            for (const [day, orgs] of byDay) {
                const rows = await db.analyticsDailyAggregate.groupBy({
                    by: ["organizationId"],
                    where: {
                        organizationId: { in: orgs },
                        ...siteViewTotals(new Date(day)),
                    },
                    _sum: { count: true },
                });
                for (const r of rows) {
                    const n = r._sum.count ?? 0;
                    if (n > 0) out.set(r.organizationId, n);
                }
            }
            return out;
        }
    }
}
