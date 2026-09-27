import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import {
    LATE_THRESHOLD_SELECT,
    lateThresholdsOf,
} from "../orders/late-thresholds";
import { openOrderSql } from "../orders/open-orders";
import { lateSettingsJoin, lateSql } from "../orders/order-list-filters";
import type { HomeEvidence, HomeTone } from "./home-model";
import { EVIDENCE_LIMIT, personName } from "./home-model";
import { openOrderWords } from "./home-order-rows";

type Db = typeof prisma;

/** What Home's open-orders source reads. */
export interface OpenOrders {
    /** Every open order: the Orders list's Open tab count. */
    count: number;
    evidence: HomeEvidence[];
    /** The worst of what `count` holds past `evidence`, when anything. */
    moreTone?: HomeTone;
}

/**
 * Open orders (the Orders list's own predicate, `open-orders.ts`), the late
 * ones first and then oldest first, so a late order is never folded into
 * "N more" behind five that are merely due (H-1). Late is `lateSql`, the
 * rule the list's Late filter runs, read against each storefront's
 * thresholds; the row's words (`openOrderWords`) run the same rule.
 *
 * One read picks the rows and counts them — every open order, and how many
 * are late — so "N more" can say whether any it stands for is late. Its money
 * only to someone who reads orders.
 */
export async function readOpenOrders(
    db: Db,
    organizationId: string,
    view: { now: Date; zone: string; money: boolean },
): Promise<OpenOrders> {
    const picked = await db.$queryRaw<
        { id: string; late: boolean; total: number; lates: number }[]
    >(Prisma.sql`WITH candidates AS (
        SELECT o.id, o."createdAt", ${lateSql(view.now)} AS late
        FROM "Order" o
        ${lateSettingsJoin()}
        WHERE ${openOrderSql(organizationId)}
    )
    SELECT id, late,
        (COUNT(*) OVER ())::int AS total,
        (COUNT(*) FILTER (WHERE late) OVER ())::int AS lates
    FROM candidates
    ORDER BY late DESC, "createdAt" ASC, id ASC
    LIMIT ${EVIDENCE_LIMIT}`);
    if (picked.length === 0) return { count: 0, evidence: [] };

    const count = picked[0].total;
    const lates = picked[0].lates;
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
        const who = personName(row.customer);
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
        evidence,
        ...(hidden > 0 ? { moreTone: lates > shownLate ? "bad" : "due" } : {}),
    };
}
