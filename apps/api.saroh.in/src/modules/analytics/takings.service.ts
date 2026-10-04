import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { authorize } from "../organizations/organization-policy";
import { businessCurrency } from "../stores/currency";
import type { TakingsDayRow, TakingsPlace, TakingsRead } from "./takings";
import {
    foldTakings,
    pickCurrency,
    placeKind,
    placeStoreId,
    takingsWeeks,
    weekInProgress,
} from "./takings";
import { firstSaleSql, takingsByDaySql } from "./takings.sql";

/**
 * Insights' takings read (DEC-075): twelve whole weeks of money taken, for
 * the active organization only. The rule is in `takings.ts`; the words the
 * page says are the app's (`lib/analytics/takings-words.ts`), written from
 * these numbers alone.
 *
 * Who may read it: Insights' own `analytics:read`, and `payment:read`,
 * since these are the business's takings — the same read Home's "Takings
 * so far" needs (F7). Owner and Admin hold both; a role given Insights but
 * not payments is refused here, and the page says so.
 */
@Injectable()
export class TakingsService {
    async read(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<TakingsRead> {
        authorize(ctx, "analytics:read");
        authorize(ctx, "payment:read");
        const organizationId = ctx.organizationId;

        const zone = await businessTimezone(prisma, organizationId);
        const windows = takingsWeeks(now, zone);
        const from = windows[0].start;
        const to = windows[windows.length - 1].end;

        const [rows, first, businessMoney, stores] = await Promise.all([
            prisma.$queryRaw<TakingsDayRow[]>(
                takingsByDaySql(organizationId, zone, from, to),
            ),
            prisma.$queryRaw<{ day: string | null }[]>(
                firstSaleSql(organizationId, zone),
            ),
            businessCurrency(prisma, organizationId),
            prisma.store.findMany({
                where: { organizationId },
                select: { id: true, name: true, deletedAt: true },
            }),
        ]);

        const { currency, others } = pickCurrency(businessMoney, rows);
        const weeks = foldTakings(windows, rows, currency);

        const names = new Map(stores.map((s) => [s.id, s.name]));
        const keys = new Set(
            weeks.flatMap((week) => week.places.map((p) => p.key)),
        );
        const places: TakingsPlace[] = [...keys].sort().map((key) => {
            const storeId = placeStoreId(key);
            return {
                key,
                kind: placeKind(key),
                name: storeId ? (names.get(storeId) ?? null) : null,
            };
        });

        return {
            zone,
            currency,
            otherCurrencies: others,
            firstSaleOn: first[0]?.day ?? null,
            thisWeekStart: weekInProgress(now, zone),
            locations: stores.filter((s) => s.deletedAt === null).length,
            places,
            weeks,
        };
    }
}
