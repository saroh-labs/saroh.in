import { NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { lateThresholdsByStore, thresholdsFor } from "./late-thresholds";
import type { OrderListFilter, OrderListView } from "./order-list-filters";
import {
    computedConditions,
    dayRange,
    lateSettingsJoin,
    lateSql,
    openSql,
    orderConditions,
    paymentSql,
    tabCondition,
    ts,
} from "./order-list-filters";
import type { OrderRowDto } from "./order-row";
import { serializeOrderRow } from "./order-row";

/** Rows per page (default 87). */
export const ORDER_PAGE_SIZE = 50;

export interface OrderListPage {
    rows: OrderRowDto[];
    /** Per tab, under every filter but the tab (default 87). */
    counts: { all: number; open: number; refunded: number };
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
}

export interface OrderListQuery extends OrderListFilter {
    /** The last row's id from the page before. */
    cursor?: string;
}

/**
 * The Orders list, v2 (plan B, B1): a page of rows, newest first, the tab
 * counts, and where the next page starts.
 *
 * One CTE computes each matching order's payment standing, whether it is
 * open and whether it is late; the page and the counts both read it, so a
 * count can never disagree with the rows it counts. Paging is by
 * `(createdAt desc, id desc)`, so a row placed while someone pages lands on
 * the first page, never twice.
 */
export async function listOrderRows(
    organizationId: string,
    query: OrderListQuery,
    view: OrderListView & { money: boolean },
    now: Date = new Date(),
): Promise<OrderListPage> {
    const zone =
        query.from || query.to
            ? await businessTimezone(prisma, organizationId)
            : "Asia/Kolkata";
    const range = dayRange(query.from, query.to, zone);

    let after = Prisma.sql`TRUE`;
    if (query.cursor) {
        // Read from the order itself, whether or not the filters still keep
        // it (paid since, moved on a step), and only inside this business.
        const at = await prisma.order.findFirst({
            where: { id: query.cursor, organizationId },
            select: { id: true, createdAt: true },
        });
        if (!at) throw new NotFoundException("Order not found");
        after = Prisma.sql`(m."createdAt", m.id) < (${ts(at.createdAt)}, ${at.id})`;
    }

    const matching = Prisma.sql`WITH m AS (
        SELECT o.id, o."createdAt",
            ${paymentSql()} AS payment,
            ${openSql()} AS open,
            ${lateSql(now)} AS late
        FROM "Order" o
        LEFT JOIN "Customer" c ON c.id = o."customerId"
        ${lateSettingsJoin()}
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(pi."amountCents"), 0) AS captured,
                COALESCE(SUM((
                    SELECT COALESCE(SUM(r."amountCents"), 0)
                    FROM "PaymentRefund" r
                    WHERE r."paymentIntentId" = pi.id AND r.status <> 'FAILED'
                )), 0) AS refunded
            FROM "PaymentIntent" pi
            WHERE pi."orderId" = o.id AND pi.status = 'SUCCEEDED'
        ) money ON TRUE
        WHERE ${orderConditions(organizationId, query, view, range)}
    )`;
    const kept = computedConditions(query);

    const [ids, [counts]] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`${matching}
            SELECT m.id FROM m
            WHERE ${kept} AND ${tabCondition(query.tab)} AND ${after}
            ORDER BY m."createdAt" DESC, m.id DESC
            LIMIT ${ORDER_PAGE_SIZE + 1}`,
        prisma.$queryRaw<
            { all: number; open: number; refunded: number }[]
        >`${matching}
            SELECT COUNT(*)::int AS "all",
                (COUNT(*) FILTER (WHERE m.open))::int AS open,
                (COUNT(*) FILTER (WHERE m.payment = 'REFUNDED'))::int AS refunded
            FROM m WHERE ${kept}`,
    ]);

    const more = ids.length > ORDER_PAGE_SIZE;
    const page = ids.slice(0, ORDER_PAGE_SIZE).map((r) => r.id);
    const loaded = page.length
        ? await prisma.order.findMany({
              where: { id: { in: page }, organizationId },
              select: {
                  id: true,
                  orderId: true,
                  customerId: true,
                  status: true,
                  paymentStatus: true,
                  stage: true,
                  fulfilment: true,
                  currency: true,
                  total: true,
                  createdAt: true,
                  courierName: true,
                  trackingNumber: true,
                  store: { select: { id: true, name: true } },
                  customer: {
                      select: {
                          email: true,
                          firstName: true,
                          lastName: true,
                          phone: true,
                      },
                  },
                  items: {
                      orderBy: { id: "asc" },
                      select: { product: { select: { name: true } } },
                  },
                  paymentIntents: {
                      where: { status: "SUCCEEDED" },
                      select: {
                          amountCents: true,
                          refunds: {
                              where: { status: { not: "FAILED" } },
                              select: { amountCents: true, forEdit: true },
                          },
                      },
                  },
              },
          })
        : [];
    const byId = new Map(loaded.map((o) => [o.id, o]));
    // Each storefront's late thresholds, once per storefront in the page:
    // the numbers `lateSql` read for the Late filter and the counts.
    const thresholds = await lateThresholdsByStore(
        prisma,
        loaded.map((o) => o.store.id),
    );

    return {
        rows: page.flatMap((id) => {
            const o = byId.get(id);
            return o
                ? [
                      serializeOrderRow(o, {
                          money: view.money,
                          contact: view.contact,
                          now,
                          lateThresholds: thresholdsFor(thresholds, o.store.id),
                      }),
                  ]
                : [];
        }),
        // An aggregate with no GROUP BY always answers one row.
        counts,
        nextCursor: more ? (page[page.length - 1] ?? null) : null,
    };
}
