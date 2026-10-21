import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { OWED_VIEW_WHERE } from "../invoices/invoice-state";
import { allows, authorize } from "../organizations/organization-policy";
import { businessCurrency } from "../stores/currency";
import type { InsightsPeriod } from "./period";
import { periodWindows } from "./period";
import type { BookedRow, SoldRow } from "./sells";
import { bestSellersSql, bookedSql } from "./sells.sql";
import type { SuggestionsRead, UnpaidBill } from "./suggestions";
import {
    CLASS_FULL_PERIOD,
    classesFull,
    firstSale,
    isSuggestionKey,
    lateBills,
    notNowUntil,
    rankSuggestions,
    sellingLess,
} from "./suggestions";
import { todayIn } from "./takings";
import { firstSaleSql } from "./takings.sql";

/** What Not now answers: the key, and when it comes back. */
export interface NotNowResult {
    key: string;
    hiddenUntil: string;
}

/**
 * Insights' suggestions for the person asking (DEC-171, `suggestions.ts`
 * has the rules): read through What sells' and owed's own reads, less what
 * this person put off with Not now in this business.
 *
 * Who may read it: Insights' own `analytics:read`. The money rules need
 * `payment:read` (A12), and the late bill `invoice:read` too; without them
 * they are never read, so nothing about money leaves for that role.
 */
@Injectable()
export class SuggestionsService {
    async read(
        ctx: OrganizationContext,
        period: InsightsPeriod,
        now: Date = new Date(),
    ): Promise<SuggestionsRead> {
        authorize(ctx, "analytics:read");
        const money = allows(ctx, "payment:read");
        const bills = money && allows(ctx, "invoice:read");
        const organizationId = ctx.organizationId;

        const [zone, currency] = await Promise.all([
            businessTimezone(prisma, organizationId),
            businessCurrency(prisma, organizationId),
        ]);
        const w = periodWindows(period, now, zone);
        const classWeeks = periodWindows(CLASS_FULL_PERIOD, now, zone);

        const [first, org, booked, sold, unpaid, hidden] = await Promise.all([
            prisma.$queryRaw<{ day: string | null }[]>(
                firstSaleSql(organizationId, zone),
            ),
            prisma.organization.findUnique({
                where: { id: organizationId },
                select: { createdAt: true },
            }),
            // The last 4 weeks alone: nothing before them is read.
            prisma.$queryRaw<BookedRow[]>(
                bookedSql(
                    organizationId,
                    classWeeks.from,
                    classWeeks.from,
                    classWeeks.to,
                ),
            ),
            money
                ? prisma.$queryRaw<SoldRow[]>(
                      bestSellersSql(
                          organizationId,
                          currency,
                          w.beforeFrom,
                          w.from,
                          w.to,
                      ),
                  )
                : Promise.resolve([] as SoldRow[]),
            bills
                ? prisma.invoice.findMany({
                      where: {
                          organizationId,
                          ...OWED_VIEW_WHERE,
                          dueAt: { lt: now },
                      },
                      select: {
                          id: true,
                          number: true,
                          currency: true,
                          dueAt: true,
                          total: true,
                          paidCents: true,
                          billToName: true,
                          contact: {
                              select: {
                                  firstName: true,
                                  lastName: true,
                                  email: true,
                              },
                          },
                      },
                  })
                : Promise.resolve([] as UnpaidBill[]),
            prisma.insightSuggestionNotNow.findMany({
                where: {
                    organizationId,
                    userId: ctx.userId,
                    hiddenUntil: { gt: now },
                },
                select: { key: true },
            }),
        ]);

        const [archivedServices, archivedProducts] = await Promise.all([
            this.archivedServices(
                organizationId,
                booked.map((r) => r.serviceId),
            ),
            this.archivedProducts(
                organizationId,
                sold.map((r) => r.productId),
            ),
        ]);

        // The same start and thin rule as Money and What sells, so the
        // page never compares a period before the business began.
        const today = todayIn(now, zone);
        const firstSaleOn = first[0]?.day ?? null;
        const createdOn = org ? todayIn(org.createdAt, zone) : today;
        const startedOn =
            firstSaleOn && firstSaleOn < createdOn ? firstSaleOn : createdOn;
        const thin = startedOn > w.beforeFromDate;
        const hasSales = firstSaleOn !== null;

        return {
            period,
            zone,
            window: {
                days: w.days,
                from: w.fromDate,
                to: w.toDate,
                beforeFrom: w.beforeFromDate,
                beforeTo: w.beforeToDate,
            },
            money,
            hasSales,
            suggestions: rankSuggestions(
                {
                    firstSale: firstSale(hasSales),
                    classFull: classesFull(booked, {
                        days: classWeeks.days,
                        archived: archivedServices,
                    }),
                    lateBill: lateBills(
                        unpaid,
                        { now, zone },
                        allows(ctx, "invoice:write"),
                    ),
                    sellingLess: sellingLess(sold, {
                        thin,
                        archived: archivedProducts,
                    }),
                },
                new Set(hidden.map((h) => h.key)),
            ),
        };
    }

    /**
     * Not now: hide `key` from this person, in this business, for 7 days.
     * Saying it again starts the 7 days again. Their own put-offs that have
     * already come back are cleared on the way.
     */
    async notNow(
        ctx: OrganizationContext,
        key: string,
        now: Date = new Date(),
    ): Promise<NotNowResult> {
        authorize(ctx, "analytics:read");
        if (!isSuggestionKey(key)) {
            throw new BadRequestException("That isn't a suggestion");
        }
        const organizationId = ctx.organizationId;
        const userId = ctx.userId;
        const hiddenUntil = notNowUntil(now);
        await prisma.insightSuggestionNotNow.deleteMany({
            where: { organizationId, userId, hiddenUntil: { lte: now } },
        });
        await prisma.insightSuggestionNotNow.upsert({
            where: {
                organizationId_userId_key: { organizationId, userId, key },
            },
            create: { organizationId, userId, key, hiddenUntil },
            update: { hiddenUntil },
        });
        return { key, hiddenUntil: hiddenUntil.toISOString() };
    }

    /** Undo Not now: the suggestion shows again for this person at once. */
    async undoNotNow(ctx: OrganizationContext, key: string): Promise<void> {
        authorize(ctx, "analytics:read");
        if (!isSuggestionKey(key)) {
            throw new BadRequestException("That isn't a suggestion");
        }
        await prisma.insightSuggestionNotNow.deleteMany({
            where: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                key,
            },
        });
    }

    private async archivedServices(
        organizationId: string,
        ids: string[],
    ): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const rows = await prisma.service.findMany({
            where: { organizationId, id: { in: ids }, status: "ARCHIVED" },
            select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
    }

    private async archivedProducts(
        organizationId: string,
        ids: string[],
    ): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const rows = await prisma.product.findMany({
            where: {
                organizationId,
                id: { in: [...new Set(ids)] },
                status: "ARCHIVED",
            },
            select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
    }
}
