import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    ENQUIRY_SUBMITTED_TYPE,
    SITE_PAID_TYPE,
    SITE_STARTED_TYPE,
    SITE_VIEW_TYPE,
    sitePathOnly,
} from "../analytics/event-contract";
import { periodWindows } from "../analytics/period";
import { businessTimezone } from "../bookings/staff-availability";
import { allows, authorize } from "../organizations/organization-policy";
import { modulePageState } from "./module-pages";
import { reviewerScope } from "./site-access";

/**
 * One page's results, "This page · last 7 days" (website editor plan U47a,
 * KTD-E8): read from the daily rollups' `path` breakdown (DEC-075) over the
 * business's last 7 days, the window the site's Overview uses.
 *
 * Only what is measured is said. A part is null when its module is off
 * (A3), or when nothing of its kind has ever been counted by page; a part
 * whose counting by page began inside the window carries `since`, the
 * first day it counted, so the inspector says "since <date>", never a 0
 * that means "not measured".
 */

/** One measured figure, and the day it began counting when that's in the window. */
export interface ResultPart {
    count: number;
    /** ISO date; null when it counted for the whole window. */
    since: string | null;
}

export interface PageResults {
    path: string;
    /** The 7 days, in the business's own zone. */
    from: string;
    to: string;
    /** Views of the page. */
    visits: ResultPart | null;
    /** Enquiries sent from the page. */
    questions: ResultPart | null;
    /** A checkout opened from the page; null when neither bookings nor the shop is on. */
    started: ResultPart | null;
    /** Paid online from the page; null as `started`. */
    paid: ResultPart | null;
    /** What the site takes, for the words ("bookings started", "orders"). */
    sells: { bookings: boolean; shop: boolean };
}

const PART_TYPES = [
    SITE_VIEW_TYPE,
    ENQUIRY_SUBMITTED_TYPE,
    SITE_STARTED_TYPE,
    SITE_PAID_TYPE,
];

/** Fold the page's rollup rows into its results. Pure. */
export function foldPageResults(
    path: string,
    rows: readonly { type: string; count: number }[],
    /** The first day each type has any `path` row, business-wide. */
    firstDays: ReadonlyMap<string, Date>,
    window: { fromDate: string; toDate: string },
    sells: { bookings: boolean; shop: boolean },
): PageResults {
    const sum = new Map<string, number>();
    for (const row of rows) {
        sum.set(row.type, (sum.get(row.type) ?? 0) + row.count);
    }
    const part = (type: string, on = true): ResultPart | null => {
        const first = firstDays.get(type)?.toISOString().slice(0, 10);
        if (!on || first === undefined || first > window.toDate) return null;
        return {
            count: sum.get(type) ?? 0,
            since: first > window.fromDate ? first : null,
        };
    };
    const sellsAny = sells.bookings || sells.shop;
    return {
        path,
        from: window.fromDate,
        to: window.toDate,
        visits: part(SITE_VIEW_TYPE),
        questions: part(ENQUIRY_SUBMITTED_TYPE),
        started: part(SITE_STARTED_TYPE, sellsAny),
        paid: part(SITE_PAID_TYPE, sellsAny),
        sells,
    };
}

@Injectable()
export class PageResultsService {
    /**
     * `site:read`, a reviewer only of their own sites (404 otherwise).
     * `results` is null for someone who may not read Insights
     * (`analytics:read`), as the Overview's are.
     */
    async read(
        ctx: OrganizationContext,
        siteId: string,
        rawPath: string,
        now: Date = new Date(),
    ): Promise<{ results: PageResults | null }> {
        authorize(ctx, "site:read");
        const organizationId = ctx.organizationId;
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId,
                deletedAt: null,
                ...reviewerScope(ctx),
            },
            select: { id: true },
        });
        if (!site) throw new NotFoundException(`Site "${siteId}" not found`);
        if (!allows(ctx, "analytics:read")) return { results: null };

        const path = sitePathOnly(rawPath);
        const zone = await businessTimezone(prisma, organizationId);
        const w = periodWindows("7d", now, zone);
        // The rollups are kept by UTC day: the window's first and last days.
        const date = {
            gte: new Date(`${w.fromDate}T00:00:00Z`),
            lte: new Date(`${w.toDate}T00:00:00Z`),
        };
        const [rows, firsts, book, shop] = await Promise.all([
            prisma.analyticsDailyAggregate.findMany({
                where: {
                    organizationId,
                    siteId,
                    type: { in: PART_TYPES },
                    dimension: "path",
                    dimensionValue: path,
                    date,
                },
                select: { type: true, count: true },
            }),
            // When each kind began counting by page, business-wide: the
            // business-wide row (siteId "") is written for every one. One
            // index probe per kind (04 W6), never a scan of every path row.
            Promise.all(
                PART_TYPES.map((type) =>
                    prisma.analyticsDailyAggregate.findFirst({
                        where: {
                            organizationId,
                            siteId: "",
                            type,
                            dimension: "path",
                        },
                        orderBy: { date: "asc" },
                        select: { type: true, date: true },
                    }),
                ),
            ),
            modulePageState("BOOK", organizationId),
            modulePageState("SHOP", organizationId),
        ]);
        const firstDays = new Map<string, Date>();
        for (const f of firsts) if (f) firstDays.set(f.type, f.date);
        return {
            results: foldPageResults(path, rows, firstDays, w, {
                bookings: book.state === "on",
                shop: shop.state === "on",
            }),
        };
    }
}
