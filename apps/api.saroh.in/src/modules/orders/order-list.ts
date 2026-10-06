import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { businessTimezone } from "../bookings/staff-availability";
import { canSeeSensitive } from "../customer-workspace/attention-read";
import { FULFILMENT_RULES } from "./fulfilment";
import { lateThresholdsByStore, thresholdsFor } from "./late-thresholds";
import type { OrderAttention } from "./order-attention";
import { attentionByCustomer } from "./order-attention";
import type { OrderListFilter, OrderListView } from "./order-list-filters";
import {
    computedConditions,
    dayRange,
    lateSettingsJoin,
    lateSql,
    openSql,
    orderConditions,
    paymentSql,
    presetRange,
    tabCondition,
    ts,
} from "./order-list-filters";
import { orderLocationSql, orderLocationWhere } from "./order-location";
import type { OrderRowDto } from "./order-row";
import { serializeOrderRow } from "./order-row";
import type { NextVisitDto } from "./order-visits";
import { nextVisitsFor } from "./order-visits";
import { withBookingPayments } from "./treatment-ledger";

const logger = new Logger("OrderList");

/** Rows per page (default 87). */
export const ORDER_PAGE_SIZE = 50;

/** A walk-in's Needs attention (B13): none, since there is nobody to note. */
const NO_ATTENTION: OrderAttention = { entries: [], hiddenSensitiveCount: 0 };

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

/** Who is looking, and so what each row may say. */
export interface OrderListCaller extends OrderListView {
    /** `order:read`: the order's money. */
    money: boolean;
    /**
     * The caller (B15): with it, each row carries the customer's Needs
     * attention as they may see it, and the Needs attention filter counts
     * sensitive entries only if they may read them. Without it, rows carry
     * no `attention` and the filter counts non-sensitive entries only.
     */
    viewer?: OrganizationContext;
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
    caller: OrderListCaller,
    now: Date = new Date(),
): Promise<OrderListPage> {
    const view: OrderListView = {
        contact: caller.contact,
        sensitive: caller.viewer ? canSeeSensitive(caller.viewer) : false,
    };
    if (query.date && (query.from || query.to)) {
        throw new BadRequestException({
            message: "Pick a date range or a preset, not both.",
            details: { field: "date" },
        });
    }
    const zone =
        query.from || query.to || query.date
            ? await businessTimezone(prisma, organizationId)
            : "Asia/Kolkata";
    const range = query.date
        ? presetRange(query.date, zone, now)
        : dayRange(query.from, query.to, zone);

    let after = Prisma.sql`TRUE`;
    if (query.cursor) {
        // Read from the order itself, whether or not the filters still keep
        // it (paid since, moved on a step), and only inside this business.
        const at = await prisma.order.findFirst({
            where: {
                id: query.cursor,
                organizationId,
                ...(caller.viewer ? orderLocationWhere(caller.viewer) : {}),
            },
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
        WHERE ${orderConditions(organizationId, query, view, range)}${
            // A location's team lists its own storefronts' (DEC-074).
            orderLocationSql(caller.viewer, "o")
        }
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
                  // A walk-in's name and phone (B13), when there is no customer.
                  walkInName: true,
                  walkInPhone: true,
                  status: true,
                  paymentStatus: true,
                  payOnHandover: true,
                  stage: true,
                  fulfilment: true,
                  currency: true,
                  total: true,
                  createdAt: true,
                  courierName: true,
                  trackingNumber: true,
                  // Whether a pay link is out (B11), for the row menu (B5).
                  payLinkCreatedAt: true,
                  store: { select: { id: true, name: true } },
                  customer: {
                      select: {
                          email: true,
                          firstName: true,
                          lastName: true,
                          phone: true,
                          // A returning customer's ring on the row.
                          _count: { select: { orders: true } },
                      },
                  },
                  items: {
                      orderBy: { id: "asc" },
                      select: {
                          product: { select: { name: true } },
                          // A treatment's line names its service (E9).
                          service: { select: { name: true } },
                      },
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
                  // A treatment's payment at booking (E9).
                  invoices: {
                      where: { source: "BOOKING", kind: "INVOICE" },
                      select: {
                          paymentIntents: {
                              where: { status: "SUCCEEDED" },
                              select: {
                                  amountCents: true,
                                  refunds: {
                                      where: { status: { not: "FAILED" } },
                                      select: {
                                          amountCents: true,
                                          forEdit: true,
                                      },
                                  },
                              },
                          },
                      },
                  },
              },
          })
        : [];
    const byId = new Map(
        loaded.map(({ invoices, ...o }) => [
            o.id,
            withBookingPayments(o, invoices),
        ]),
    );
    // Each storefront's late thresholds, once per storefront in the page:
    // the numbers `lateSql` read for the Late filter and the counts.
    const [thresholds, attention, visits] = await Promise.all([
        lateThresholdsByStore(
            prisma,
            loaded.map((o) => o.store.id),
        ),
        caller.viewer
            ? rowAttention(
                  caller.viewer,
                  loaded.flatMap((o) => (o.customerId ? [o.customerId] : [])),
              )
            : Promise.resolve(undefined),
        // A treatment's next visit (B14): "Next 19 Sep, 10:00" on its row.
        rowNextVisits(
            organizationId,
            loaded.flatMap((o) => (goesByVisits(o.fulfilment) ? [o.id] : [])),
        ),
    ]);

    return {
        rows: page.flatMap((id) => {
            const o = byId.get(id);
            return o
                ? [
                      serializeOrderRow(o, {
                          money: caller.money,
                          contact: caller.contact,
                          attention:
                              attention === undefined
                                  ? undefined
                                  : attention === null
                                    ? null
                                    : o.customerId
                                      ? (attention.get(o.customerId) ?? null)
                                      : // A walk-in has no Needs attention (B13).
                                        NO_ATTENTION,
                          now,
                          lateThresholds: thresholdsFor(thresholds, o.store.id),
                          ...(visits?.has(o.id)
                              ? { nextVisit: visits.get(o.id) ?? null }
                              : {}),
                      }),
                  ]
                : [];
        }),
        // An aggregate with no GROUP BY always answers one row.
        counts,
        nextCursor: more ? (page[page.length - 1] ?? null) : null,
    };
}

/** Whether an order is fulfilled by its visits (E9): a treatment. */
function goesByVisits(stored: string): boolean {
    return (
        (FULFILMENT_RULES as Record<string, { visits: boolean } | undefined>)[
            stored
        ]?.visits === true
    );
}

/**
 * The page's treatments' next visits (B14). A failed read leaves them out,
 * so the rows say nothing of a next visit rather than "not booked", which
 * would be wrong; the list itself still answers.
 */
async function rowNextVisits(
    organizationId: string,
    orderIds: string[],
): Promise<Map<string, NextVisitDto | null> | null> {
    if (orderIds.length === 0) return null;
    try {
        return await nextVisitsFor(prisma, organizationId, orderIds);
    } catch (error) {
        logger.warn(
            `Next visits couldn't be read for the Orders list: ${String(error)}`,
        );
        return null;
    }
}

/**
 * The page's Needs attention, per customer (B15). A failed read is null for
 * every row, never an empty list: the rows then say "Not available", since
 * silence reads as "nothing to know". The list itself still answers.
 */
async function rowAttention(
    viewer: OrganizationContext,
    customerIds: string[],
): Promise<Map<string, OrderAttention> | null> {
    try {
        return await attentionByCustomer(viewer, customerIds);
    } catch (error) {
        logger.warn(
            `Needs attention couldn't be read for the Orders list: ${String(error)}`,
        );
        return null;
    }
}
