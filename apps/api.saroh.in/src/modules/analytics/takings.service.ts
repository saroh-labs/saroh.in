import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { moneyTodayWindows } from "../home/home-money-today";
import { allows, authorize } from "../organizations/organization-policy";
import { businessCurrency } from "../stores/currency";
import type { MoneyRead, UsualOrderRow } from "./money";
import {
    bestWeek,
    foldBuckets,
    foldPeriod,
    moneyDays,
    moneyIn,
    moneyPlaces,
    moneyToday,
    usualOrder,
} from "./money";
import { readOwedByAge } from "./owed-by-age";
import type { InsightsPeriod } from "./period";
import { daysBetween, moneyBuckets, periodWindows } from "./period";
import type { TakingsDayRow } from "./takings";
import {
    foldSoFar,
    pickCurrency,
    placeKind,
    placeStoreId,
    todayIn,
    weekInProgress,
} from "./takings";
import { firstSaleSql, takingsByDaySql, usualOrderSql } from "./takings.sql";

/** Every place's kind and name, from the business's stores. */
function namer(stores: readonly { id: string; name: string }[]) {
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return (key: string) => {
        const storeId = placeStoreId(key);
        return {
            kind: placeKind(key),
            name: storeId ? (names.get(storeId) ?? null) : null,
        };
    };
}

/**
 * Insights' Money read (DEC-171): money taken, by the takings rule in
 * `takings.ts` (DEC-075), for one period against the one before. The words
 * the page says are the app's (`lib/insights/*-words.ts`), written from
 * these numbers alone. The old twelve-week `GET analytics/takings` is
 * retired: Money (U12, #1093) reads this.
 *
 * Who may read it: Insights' own `analytics:read`, and `payment:read`,
 * since these are the business's takings — the same read Home's "Takings
 * so far" needs (F7). Owner and Admin hold both; a role given Insights but
 * not payments is refused here, and the page says so.
 */
@Injectable()
export class TakingsService {
    /**
     * Insights' Money for one period (DEC-171, `money.ts`): money in against
     * the same number of days before, the usual order, the rolling weekly
     * bars ending today (`moneyBuckets`), this week and today so far, where the money
     * came from, and who owes by how late. It needs
     * `analytics:read` and `payment:read`. Owed needs `invoice:read` too,
     * as Home's does; without it `owed` is null.
     */
    async money(
        ctx: OrganizationContext,
        period: InsightsPeriod,
        now: Date = new Date(),
    ): Promise<MoneyRead> {
        authorize(ctx, "analytics:read");
        authorize(ctx, "payment:read");
        const organizationId = ctx.organizationId;

        const zone = await businessTimezone(prisma, organizationId);
        const w = periodWindows(period, now, zone);
        const buckets = moneyBuckets(w);
        // The oldest bar's first day, or the period before's, if earlier.
        const oldest = DateTime.fromISO(buckets[0].startDate, {
            zone,
        }).toJSDate();
        const from = oldest < w.beforeFrom ? oldest : w.beforeFrom;
        const day = moneyTodayWindows(now, zone);
        const clock = { now, zone };

        const [
            rows,
            lastWeekToday,
            usual,
            first,
            org,
            businessMoney,
            stores,
            owed,
        ] = await Promise.all([
            prisma.$queryRaw<TakingsDayRow[]>(
                takingsByDaySql(organizationId, zone, from, now),
            ),
            prisma.$queryRaw<TakingsDayRow[]>(
                takingsByDaySql(
                    organizationId,
                    zone,
                    day.lastStart,
                    day.lastSoFar,
                ),
            ),
            prisma.$queryRaw<UsualOrderRow[]>(
                usualOrderSql(organizationId, w.beforeFrom, w.from, now),
            ),
            prisma.$queryRaw<{ day: string | null }[]>(
                firstSaleSql(organizationId, zone),
            ),
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { createdAt: true },
            }),
            businessCurrency(prisma, organizationId),
            prisma.store.findMany({
                where: { organizationId },
                select: { id: true, name: true, deletedAt: true },
            }),
            allows(ctx, "invoice:read")
                ? readOwedByAge(prisma, organizationId, clock, true)
                : null,
        ]);

        const { currency, others } = pickCurrency(businessMoney, rows);
        const today = todayIn(now, zone);
        const firstSaleOn = first[0]?.day ?? null;
        const createdOn = org ? todayIn(org.createdAt, zone) : today;
        const startedOn =
            firstSaleOn && firstSaleOn < createdOn ? firstSaleOn : createdOn;
        // Younger than both periods together: the one before is not whole.
        const thin = startedOn > w.beforeFromDate;

        const fold = foldPeriod(rows, currency, w);
        const weeks = foldBuckets(buckets, rows, currency, zone);
        return {
            period,
            zone,
            currency,
            otherCurrencies: others,
            window: {
                days: w.days,
                from: w.fromDate,
                to: w.toDate,
                beforeFrom: w.beforeFromDate,
                beforeTo: w.beforeToDate,
            },
            startedOn,
            ageDays: Math.max(0, daysBetween(startedOn, today)),
            thin,
            hasSales: firstSaleOn !== null,
            firstSaleOn,
            moneyIn: moneyIn(fold, thin),
            usualOrder: usualOrder(usual, currency),
            bestWeek: bestWeek(weeks),
            weeks,
            days: moneyDays(rows, currency, w),
            thisWeek: foldSoFar(
                rows,
                currency,
                weekInProgress(now, zone),
                today,
            ),
            today: moneyToday(rows, lastWeekToday, currency, today),
            locations: stores.filter((s) => s.deletedAt === null).length,
            places: moneyPlaces(fold, namer(stores), thin),
            owed,
        };
    }
}
