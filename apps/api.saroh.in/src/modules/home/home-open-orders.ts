import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    LATE_THRESHOLD_SELECT,
    lateThresholdsOf,
} from "../orders/late-thresholds";
import { openOrderSql } from "../orders/open-orders";
import { lateSettingsJoin, lateSql } from "../orders/order-list-filters";
import { orderPartyName } from "../orders/walk-in";
import type { HomeEvidence, HomeTone } from "./home-model";
import { EVIDENCE_LIMIT, personName } from "./home-model";
import { openOrderWords } from "./home-order-rows";
import { storeSql } from "./home-staff";

type Db = typeof prisma;

/** What Home's open-orders source reads. */
export interface OpenOrders {
    /**
     * The open orders that need attention soon (DEC-163): late, or due today
     * or tomorrow.
     */
    count: number;
    /** The rest of the Orders list's Open tab: in progress, due later. */
    later: number;
    evidence: HomeEvidence[];
    /** The worst of what `count` holds past `evidence`, when anything. */
    moreTone?: HomeTone;
}

/**
 * The moment that splits "soon" from "later" (DEC-163): the start of the day
 * after tomorrow in the business's zone. An order that would turn late
 * before it is late now, or due today or tomorrow — the "Due today" and "Due
 * tomorrow" its row's tag says (`home-order-rows.ts`).
 */
export function soonCutoff(now: Date, zone: string): Date {
    return DateTime.fromJSDate(now, { zone })
        .startOf("day")
        .plus({ days: 2 })
        .toJSDate();
}

/**
 * Open orders (the Orders list's own predicate, `open-orders.ts`) that need
 * attention soon (DEC-163): late, or due today or tomorrow. "Due" is the
 * moment it turns late, so "late by the day after tomorrow" is `lateSql`
 * read at {@link soonCutoff} — the rule the list's Late filter runs, against
 * each storefront's thresholds; the row's words (`openOrderWords`) run the
 * same rule. An order due further out, or one that never turns late (on its
 * way), stays in Orders and is counted in `later`, so Home can say how many
 * more are in progress without listing a busy kitchen's every order.
 *
 * The late ones first and then oldest first, so a late order is never folded
 * into "N more" behind five that are merely due (H-1). One read picks the
 * rows and counts them — every open order, the soon ones, and how many are
 * late — so "N more" can say whether any it stands for is late. Its money
 * only to someone who reads orders. A staff member's Home reads only their
 * storefronts' (F11, `storeIds`); absent or null, every storefront's.
 */
export async function readOpenOrders(
    db: Db,
    organizationId: string,
    view: {
        now: Date;
        zone: string;
        money: boolean;
        storeIds?: readonly string[] | null;
    },
): Promise<OpenOrders> {
    const read = await db.$queryRaw<
        {
            id: string;
            late: boolean;
            soon: boolean;
            open: number;
            total: number;
            lates: number;
        }[]
    >(Prisma.sql`WITH candidates AS (
        SELECT o.id, o."createdAt", ${lateSql(view.now)} AS late,
            ${lateSql(soonCutoff(view.now, view.zone))} AS soon
        FROM "Order" o
        ${lateSettingsJoin()}
        WHERE ${openOrderSql(organizationId)}${storeSql(view.storeIds, "o")}
    )
    SELECT id, late, soon,
        (COUNT(*) OVER ())::int AS open,
        (COUNT(*) FILTER (WHERE soon) OVER ())::int AS total,
        (COUNT(*) FILTER (WHERE late) OVER ())::int AS lates
    FROM candidates
    ORDER BY soon DESC, late DESC, "createdAt" ASC, id ASC
    LIMIT ${EVIDENCE_LIMIT}`);
    if (read.length === 0) return { count: 0, later: 0, evidence: [] };

    const count = read[0].total;
    const later = read[0].open - count;
    const lates = read[0].lates;
    // Soon ones sort first, so a later one picked only fills the limit.
    const picked = read.filter((p) => p.soon);
    if (picked.length === 0) return { count: 0, later, evidence: [] };
    const shownLate = picked.filter((p) => p.late).length;

    const rows = await db.order.findMany({
        where: { id: { in: picked.map((p) => p.id) }, organizationId },
        include: {
            customer: true,
            // Its storefront's late thresholds (B17), so a Late tag here is
            // the one Orders shows.
            store: { select: { settings: { select: LATE_THRESHOLD_SELECT } } },
        },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const evidence: HomeEvidence[] = [];
    for (const { id } of picked) {
        const row = byId.get(id);
        if (!row) continue;
        // A walk-in (B13) has no customer, only the name they gave.
        const who = row.customer
            ? personName(row.customer)
            : orderPartyName(row);
        evidence.push({
            id: row.id,
            title: row.orderId,
            subtitle: who,
            at: row.createdAt.toISOString(),
            // Decimal in MAJOR units on the row; the wire contract is minor
            // units, so it is converted once here rather than in each client.
            amountMinor: view.money
                ? Math.round(Number(row.total) * 100)
                : null,
            currency: view.money ? row.currency : null,
            href: `/commerce/orders/${row.id}?storefront=${row.storeId}`,
            ...openOrderWords(
                row,
                who,
                view.now,
                view.zone,
                lateThresholdsOf(row.store.settings),
            ),
        });
    }

    const hidden = count - evidence.length;
    return {
        count,
        later,
        evidence,
        ...(hidden > 0 ? { moreTone: lates > shownLate ? "bad" : "due" } : {}),
    };
}
