import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { allows, authorize } from "../organizations/organization-policy";
import { businessCurrency } from "../stores/currency";
import type { InsightsPeriod } from "./period";
import { daysBetween, periodWindows } from "./period";
import type {
    BookedRow,
    BusyRow,
    CustomerRow,
    SellsRead,
    SoldRow,
} from "./sells";
import { bestCustomers, bestSellers, booked, busiest, TOP } from "./sells";
import {
    bestCustomersSql,
    bestSellersSql,
    bookedSql,
    busiestSql,
    buysMostSql,
} from "./sells.sql";
import { todayIn } from "./takings";
import { firstSaleSql } from "./takings.sql";

/**
 * Insights' What sells for one period (DEC-171, `sells.ts`): best sellers,
 * booked most and how full, the busiest days and times, and the best
 * customers, for the active organization only.
 *
 * Who may read it: Insights' own `analytics:read`. Amounts only with
 * `payment:read` (DEC-098) and customers' names only with `contact:read`;
 * without them the read still answers, in counts and without names, so a
 * role given Insights but not payments sees what sells (`IBMemberD`).
 */
@Injectable()
export class SellsService {
    async read(
        ctx: OrganizationContext,
        period: InsightsPeriod,
        now: Date = new Date(),
    ): Promise<SellsRead> {
        authorize(ctx, "analytics:read");
        const money = allows(ctx, "payment:read");
        const names = allows(ctx, "contact:read");
        const organizationId = ctx.organizationId;

        const [zone, currency] = await Promise.all([
            businessTimezone(prisma, organizationId),
            businessCurrency(prisma, organizationId),
        ]);
        const w = periodWindows(period, now, zone);

        const [first, org, sold, bookedRows, busyRows, people] =
            await Promise.all([
                prisma.$queryRaw<{ day: string | null }[]>(
                    firstSaleSql(organizationId, zone),
                ),
                prisma.organization.findUnique({
                    where: { id: organizationId },
                    select: { createdAt: true },
                }),
                prisma.$queryRaw<SoldRow[]>(
                    bestSellersSql(
                        organizationId,
                        currency,
                        w.beforeFrom,
                        w.from,
                        w.to,
                    ),
                ),
                prisma.$queryRaw<BookedRow[]>(
                    bookedSql(organizationId, w.beforeFrom, w.from, w.to),
                ),
                prisma.$queryRaw<BusyRow[]>(
                    busiestSql(organizationId, zone, w.from, w.to),
                ),
                prisma.$queryRaw<CustomerRow[]>(
                    bestCustomersSql(organizationId, currency, w.from, w.to, {
                        byMoney: money,
                        limit: TOP,
                    }),
                ),
            ]);

        const ids = people.map((p) => p.contactId);
        const buys =
            ids.length > 0
                ? await prisma.$queryRaw<{ contactId: string; name: string }[]>(
                      buysMostSql(organizationId, ids, w.from, w.to),
                  )
                : [];

        // The same start and the same thin rule as Money (`takings.service.ts`),
        // so the page's tabs never disagree on "nothing earlier to compare".
        const today = todayIn(now, zone);
        const firstSaleOn = first[0]?.day ?? null;
        const createdOn = org ? todayIn(org.createdAt, zone) : today;
        const startedOn =
            firstSaleOn && firstSaleOn < createdOn ? firstSaleOn : createdOn;
        const thin = startedOn > w.beforeFromDate;
        const ageDays = Math.max(0, daysBetween(startedOn, today));

        return {
            period,
            zone,
            currency: money ? currency : null,
            window: {
                days: w.days,
                from: w.fromDate,
                to: w.toDate,
                beforeFrom: w.beforeFromDate,
                beforeTo: w.beforeToDate,
            },
            startedOn,
            ageDays,
            thin,
            money,
            names,
            bestSellers: bestSellers(sold, { thin, money }),
            booked: booked(bookedRows, { thin }),
            busiest: busiest(busyRows, { ageDays }),
            customers: bestCustomers(
                people,
                new Map(buys.map((b) => [b.contactId, b.name])),
                { money, names },
            ),
        };
    }
}
