import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { INVOICE_SUMMARY_STATUSES } from "@saroh/api-contract";
import {
    summariseBookingsTool,
    summariseInvoicesTool,
    summariseOrdersTool,
    summariseStockTool,
} from "@saroh/api-contract";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { moneyWords } from "../../../common/words-format";
import type { OwnDiary } from "../../bookings/own-diary";
import { ownBookingsWhere, ownDiaryOf } from "../../bookings/own-diary";
import { businessTimezone } from "../../bookings/staff-availability";
import { billedTo } from "../../home/home-money-sources";
import { NOT_A_BOOKING_HOLD } from "../../invoices/invoice-state";
import { realOrderSql, realOrderWhere } from "../../orders/open-orders";
import { ts } from "../../orders/order-list-filters";
import {
    orderLocationSql,
    orderLocationWhere,
} from "../../orders/order-location";
import { allows } from "../../organizations/organization-policy";
import { businessTracksStock } from "../../stock/tracking";
import type { McpCall, McpTool } from "../tool-registry";
import { defineTool, McpToolRegistry, READ_ONLY } from "../tool-registry";
import { quoteUntrusted, untrusted } from "../untrusted";
import type { Span } from "./period";
import { change, resolveSpan, spanData, spanLine } from "./period";
import { when } from "./v1-bridge";

/**
 * The period summaries (owner, 14 Nov): "orders from the last 3 months",
 * "invoices this year", "stock this month", "bookings last week". Saroh
 * totals them in SQL, in one call, and says the exact days; the model only
 * phrases them and never pages through a list to add it up. Each figure
 * checks its own read, as Home's do: money only with `payment:read`, and a
 * figure left out is named in `not_shown`, never 0.
 */

/** How many records a summary names (its card's rows). */
export const FIRST = 8;

/** Sums in major units by currency, as readable money. */
export function amountsOf(
    rows: readonly { currency: string; amount: string | number | null }[],
): string[] {
    const by = new Map<string, number>();
    for (const r of rows) {
        by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.amount ?? 0));
    }
    return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => moneyWords(amount.toFixed(2), currency));
}

const listOr = (a: string[] | null) => (a?.length ? a.join(", ") : "nothing");

/** A person's name, or the name typed at the desk when they have none. */
function nameOf(
    first: string | null | undefined,
    last: string | null | undefined,
    typed: string | null | undefined,
): string | null {
    const full = [first, last].filter(Boolean).join(" ");
    return full !== "" ? full : (typed ?? null);
}

/** What a summary's card holds, so the answer never claims more of it. */
const cardHolds = (rows: string, list: string) =>
    `The card under the answer holds only ${rows}, each opening its own page, and a link to ${list}; every other figure here is in this text alone.`;

const sayAmounts = (a: string[] | null) =>
    a ? ` (${a.length ? a.join(", ") : "nothing"})` : "";

const notShownLine = (nouns: readonly string[]) =>
    nouns.length
        ? [
              `Not shown: your role doesn't include ${nouns.join(", ")}. If that was asked, say so in one line and give no other figure in its place.`,
          ]
        : [];

const localDay = (at: Date, zone: string) =>
    at.toLocaleDateString("en-CA", { timeZone: zone });

/** The bucket a timestamp column falls in, in the business's calendar. */
const bucketSql = (col: Prisma.Sql, s: Span) =>
    Prisma.sql`to_char(date_trunc(${s.by}, (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${s.zone}::text), 'YYYY-MM-DD')`;

interface BucketRow {
    starts: string;
    currency: string | null;
    count: number;
    amount: string | null;
}

/** Bucket rows (one per currency) folded to one per bucket, in order. */
export function foldBuckets(rows: readonly BucketRow[], money: boolean) {
    const by = new Map<string, BucketRow[]>();
    for (const r of rows) by.set(r.starts, [...(by.get(r.starts) ?? []), r]);
    return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([starts, rs]) => ({
            starts,
            count: rs.reduce((n, r) => n + Number(r.count), 0),
            amount: money
                ? amountsOf(
                      rs.flatMap((r) =>
                          r.currency
                              ? [{ currency: r.currency, amount: r.amount }]
                              : [],
                      ),
                  )
                : null,
        }));
}

const bucketLine = (
    s: Span,
    buckets: ReturnType<typeof foldBuckets>,
    noun: string,
) =>
    buckets.length > 1
        ? `- By ${s.by}: ${buckets.map((b) => `${b.starts} ${b.count}${b.amount?.length ? ` ${b.amount.join(", ")}` : ""}`).join("; ")}. Each ${s.by} is named by its first day; ${noun}.`
        : null;

const human = (value: string) => {
    const t = value.replace(/_/g, " ").toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// ---------------------------------------------------------------- orders

async function summariseOrders(ctx: OrganizationContext, s: Span) {
    const org = ctx.organizationId;
    const money = allows(ctx, "payment:read");
    const where = (from: Date, to: Date): Prisma.OrderWhereInput => ({
        organizationId: org,
        ...orderLocationWhere(ctx),
        createdAt: { gte: from, lt: to },
        ...realOrderWhere(),
    });
    const sqlWhere = Prisma.sql`o."organizationId" = ${org}
        AND o."createdAt" >= ${ts(s.from)} AND o."createdAt" < ${ts(s.to)}
        AND ${realOrderSql()} ${orderLocationSql(ctx, "o")}`;
    const [
        byStatus,
        sums,
        before,
        beforeSums,
        buckets,
        top,
        first,
        topVariants,
        byLocation,
    ] = await Promise.all([
        prisma.order.groupBy({
            by: ["status"],
            where: where(s.from, s.to),
            _count: { _all: true },
        }),
        prisma.order.groupBy({
            by: ["currency"],
            where: { ...where(s.from, s.to), status: { not: "CANCELLED" } },
            _sum: { total: true },
        }),
        prisma.order.count({
            where: {
                ...where(s.before.from, s.before.to),
                status: { not: "CANCELLED" },
            },
        }),
        prisma.order.groupBy({
            by: ["currency"],
            where: {
                ...where(s.before.from, s.before.to),
                status: { not: "CANCELLED" },
            },
            _sum: { total: true },
        }),
        prisma.$queryRaw<BucketRow[]>`
                SELECT ${bucketSql(Prisma.sql`o."createdAt"`, s)} AS starts,
                    o.currency, COUNT(*)::int AS count, SUM(o.total)::text AS amount
                FROM "Order" o
                WHERE ${sqlWhere} AND o.status <> 'CANCELLED'
                GROUP BY 1, 2 ORDER BY 1`,
        prisma.$queryRaw<{ id: string; name: string; sold: number }[]>`
                SELECT p.id, p.name, SUM(oi.quantity)::int AS sold
                FROM "Order" o
                JOIN "OrderItem" oi ON oi."orderId" = o.id
                JOIN "Product" p ON p.id = oi."productId"
                WHERE ${sqlWhere} AND o.status <> 'CANCELLED'
                  AND p."organizationId" = ${org}
                GROUP BY p.id, p.name
                ORDER BY sold DESC, p.name
                LIMIT 5`,
        prisma.order.findMany({
            where: where(s.from, s.to),
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: FIRST,
            select: {
                id: true,
                orderId: true,
                status: true,
                total: true,
                currency: true,
                createdAt: true,
                walkInName: true,
                customer: {
                    select: { firstName: true, lastName: true },
                },
            },
        }),
        prisma.$queryRaw<
            {
                id: string;
                name: string;
                variant_id: string;
                variant: string;
                sold: number;
            }[]
        >`
                SELECT p.id, p.name, v.id AS variant_id, v.title AS variant,
                    SUM(oi.quantity)::int AS sold
                FROM "Order" o
                JOIN "OrderItem" oi ON oi."orderId" = o.id
                JOIN "Product" p ON p.id = oi."productId"
                JOIN "ProductVariant" v ON v.id = oi."variantId"
                WHERE ${sqlWhere} AND o.status <> 'CANCELLED'
                  AND p."organizationId" = ${org}
                GROUP BY p.id, p.name, v.id, v.title
                ORDER BY sold DESC, p.name, v.title
                LIMIT 5`,
        prisma.$queryRaw<
            { id: string; name: string; orders: number; standing: number }[]
        >`
                SELECT s.id, s.name, COUNT(*)::int AS orders,
                    (COUNT(*) FILTER (WHERE o.status <> 'CANCELLED'))::int AS standing
                FROM "Order" o
                JOIN "Store" s ON s.id = o."storeId"
                WHERE ${sqlWhere}
                GROUP BY s.id, s.name
                ORDER BY orders DESC, s.name`,
    ]);
    const orders = byStatus.reduce((n, g) => n + g._count._all, 0);
    const cancelled =
        byStatus.find((g) => g.status === "CANCELLED")?._count._all ?? 0;
    const amount = (rows: typeof sums) =>
        money
            ? amountsOf(
                  rows.map((r) => ({
                      currency: r.currency,
                      amount: r._sum.total?.toString() ?? null,
                  })),
              )
            : null;
    const data = {
        span: spanData(s),
        orders,
        standing: orders - cancelled,
        cancelled,
        amount: amount(sums),
        before: { orders: before, amount: amount(beforeSums) },
        by_status: byStatus
            .map((g) => ({ key: g.status, count: g._count._all }))
            .sort((a, b) => b.count - a.count),
        by: s.by,
        buckets: foldBuckets(buckets, money),
        top_products: top.map((p) => ({
            product_id: p.id,
            name: p.name,
            sold: Number(p.sold),
        })),
        top_variants: topVariants.map((v) => ({
            product_id: v.id,
            variant_id: v.variant_id,
            name: v.name,
            variant: v.variant,
            sold: Number(v.sold),
        })),
        by_location: byLocation.map((l) => ({
            location_id: l.id,
            name: l.name,
            orders: Number(l.orders),
            standing: Number(l.standing),
        })),
        first: first.map((o) => {
            const who = nameOf(
                o.customer?.firstName,
                o.customer?.lastName,
                o.walkInName,
            );
            return {
                order_id: o.id,
                number: o.orderId,
                customer: who ? untrusted(who) : null,
                total: money
                    ? moneyWords(o.total.toString(), o.currency)
                    : null,
                status: o.status,
                placed_on: localDay(o.createdAt, s.zone),
            };
        }),
        not_shown: money ? [] : ["payments"],
    };
    const text = [
        spanLine(s, "Orders placed"),
        orders === 0
            ? "No orders were placed in this period."
            : // The count before is said even when the change rounds to 0%.
              `- Orders placed: ${orders}: ${data.standing} standing${sayAmounts(data.amount)}, ${cancelled} cancelled. Period before (${s.before.firstDay} to ${s.before.lastDay}): ${before} standing${sayAmounts(data.before.amount)}; standing orders ${change(data.standing, before)}.`,
        ...(orders
            ? [
                  `- By status: ${data.by_status.map((g) => `${human(g.key)} ${g.count}`).join(", ")}.`,
              ]
            : []),
        bucketLine(s, data.buckets, "cancelled orders left out"),
        ...(data.top_products.length
            ? [
                  `- Most ordered products (units on standing orders): ${data.top_products.map((p) => `${JSON.stringify(p.name)} ${p.sold}`).join("; ")}.`,
              ]
            : []),
        ...(data.top_variants.length
            ? [
                  `- Most ordered sizes or colours (variants, units on standing orders): ${data.top_variants.map((v) => `${JSON.stringify(`${v.name} ${v.variant}`)} ${v.sold}`).join("; ")}.`,
              ]
            : []),
        // One store says nothing a total doesn't.
        ...(data.by_location.length > 1
            ? [
                  `- By store: ${data.by_location.map((l) => `${JSON.stringify(l.name)} (location_id ${l.location_id}) ${l.orders} (${l.standing} standing)`).join("; ")}.`,
              ]
            : []),
        ...(orders
            ? [
                  `- Newest ${Math.min(FIRST, orders)} of ${orders}: ${data.first.map((o) => `${o.number}${o.customer ? ` ${quoteUntrusted("Customer", o.customer.text)}` : ""}${o.total ? ` ${o.total}` : ""} ${human(o.status)} ${o.placed_on}`).join("; ")}.`,
              ]
            : []),
        ...(orders
            ? [
                  cardHolds(
                      "the newest orders",
                      "Orders filtered to these days",
                  ),
                  `Answer with: the orders placed (${orders}), standing with their money, cancelled, the standing orders in the period before (${before}), and the 3 most ordered products by name.`,
              ]
            : []),
        ...notShownLine(data.not_shown),
    ]
        .filter(Boolean)
        .join("\n");
    return { text, data };
}

// -------------------------------------------------------------- invoices

type InvoiceStatusKey = (typeof INVOICE_SUMMARY_STATUSES)[number];

/** An issued invoice's standing for the summary, first match wins. */
const standingSql = (now: Date) => Prisma.sql`CASE
    WHEN i.kind = 'CREDIT_NOTE' THEN 'credit_notes'
    WHEN i.status IN ('VOID', 'CREDITED') THEN 'cancelled'
    WHEN i.status = 'PAID' THEN 'paid'
    WHEN i."dueAt" < ${ts(now)} THEN 'overdue'
    ELSE 'unpaid' END`;

/** The same standing as a Prisma `where`, for the rows named. */
export function standingWhere(
    status: InvoiceStatusKey,
    now: Date,
): Prisma.InvoiceWhereInput {
    const notCredit = { kind: { not: "CREDIT_NOTE" } };
    switch (status) {
        case "credit_notes":
            return { kind: "CREDIT_NOTE" };
        case "cancelled":
            return { ...notCredit, status: { in: ["VOID", "CREDITED"] } };
        case "paid":
            return { ...notCredit, status: "PAID" };
        case "overdue":
            return { ...notCredit, status: "ISSUED", dueAt: { lt: now } };
        case "unpaid":
            return {
                ...notCredit,
                status: "ISSUED",
                OR: [{ dueAt: null }, { dueAt: { gte: now } }],
            };
    }
}

const INVOICE_WORDS: Record<InvoiceStatusKey, string> = {
    paid: "Paid",
    unpaid: "Unpaid, not due yet",
    overdue: "Overdue",
    cancelled: "Cancelled or void",
    credit_notes: "Credit notes",
};

interface InvoiceRow {
    standing: InvoiceStatusKey;
    starts: string;
    currency: string;
    count: number;
    amount: string | null;
    collected: string | null;
    owed: string | null;
}

async function summariseInvoices(
    ctx: OrganizationContext,
    s: Span,
    status: InvoiceStatusKey | undefined,
) {
    const empty = {
        span: spanData(s),
        invoices: null,
        by_status: [],
        collected: null,
        owed: null,
        by: s.by,
        buckets: [],
        first: [],
    };
    if (!allows(ctx, "invoice:read")) {
        const notShown = ["bills"];
        return {
            text: notShownLine(notShown).join("\n"),
            data: { ...empty, not_shown: notShown },
        };
    }
    const org = ctx.organizationId;
    const money = allows(ctx, "payment:read");
    const now = new Date();
    const standing = standingSql(now);
    const rows = await prisma.$queryRaw<InvoiceRow[]>`
        SELECT * FROM (
            SELECT ${standing} AS standing,
                ${bucketSql(Prisma.sql`i."issuedAt"`, s)} AS starts,
                i.currency, COUNT(*)::int AS count,
                SUM(i.total)::text AS amount,
                SUM(CASE WHEN i.status = 'PAID' THEN i.total
                    ELSE i."paidCents"::numeric / 100 END)::text AS collected,
                SUM(CASE WHEN i.status = 'ISSUED'
                    THEN GREATEST(i.total - i."paidCents"::numeric / 100, 0)
                    ELSE 0 END)::text AS owed
            FROM "Invoice" i
            WHERE i."organizationId" = ${org}
              AND i.status <> 'DRAFT'
              AND NOT (i.source IN ('BOOKING', 'PACK', 'SUBSCRIPTION') AND i.number IS NULL)
              AND i."issuedAt" >= ${ts(s.from)} AND i."issuedAt" < ${ts(s.to)}
            GROUP BY 1, 2, 3
        ) t
        ${status ? Prisma.sql`WHERE t.standing = ${status}` : Prisma.empty}
        ORDER BY t.starts`;
    const first = await prisma.invoice.findMany({
        where: {
            organizationId: org,
            status: { not: "DRAFT" },
            issuedAt: { gte: s.from, lt: s.to },
            ...NOT_A_BOOKING_HOLD,
            ...(status ? { AND: [standingWhere(status, now)] } : {}),
        },
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        take: FIRST,
        select: {
            id: true,
            number: true,
            kind: true,
            status: true,
            dueAt: true,
            total: true,
            currency: true,
            issuedAt: true,
            billToName: true,
            contact: {
                select: { firstName: true, lastName: true, email: true },
            },
        },
    });
    const of = (pick: (r: InvoiceRow) => string | null, rs = rows) =>
        money
            ? amountsOf(
                  rs.map((r) => ({ currency: r.currency, amount: pick(r) })),
              )
            : null;
    // Money kept is what invoices (not credit notes or cancelled ones) hold.
    const live = rows.filter(
        (r) => r.standing !== "credit_notes" && r.standing !== "cancelled",
    );
    const keys = Object.keys(INVOICE_WORDS) as InvoiceStatusKey[];
    const byStatus = keys
        .map((k) => {
            const rs = rows.filter((r) => r.standing === k);
            return {
                status: k,
                count: rs.reduce((n, r) => n + Number(r.count), 0),
                amount: of((r) => r.amount, rs),
            };
        })
        .filter((g) => g.count > 0);
    const invoices = byStatus.reduce((n, g) => n + g.count, 0);
    const countOf = (k: InvoiceStatusKey) =>
        byStatus.find((g) => g.status === k)?.count ?? 0;
    const notShown = money ? [] : ["payments"];
    const data = {
        ...empty,
        invoices,
        by_status: byStatus,
        collected: of((r) => r.collected, live),
        owed: of((r) => r.owed, live),
        buckets: foldBuckets(rows, money),
        first: first.map((i) => {
            const st: InvoiceStatusKey =
                i.kind === "CREDIT_NOTE"
                    ? "credit_notes"
                    : i.status === "VOID" || i.status === "CREDITED"
                      ? "cancelled"
                      : i.status === "PAID"
                        ? "paid"
                        : i.dueAt && i.dueAt < now
                          ? "overdue"
                          : "unpaid";
            const who = billedTo(i);
            return {
                invoice_id: i.id,
                number: i.number,
                customer: who ? untrusted(who) : null,
                amount: money
                    ? moneyWords(i.total.toString(), i.currency)
                    : null,
                status: st,
                issued_on: i.issuedAt ? localDay(i.issuedAt, s.zone) : "",
            };
        }),
        not_shown: notShown,
    };
    const what = status
        ? `Invoices issued, ${INVOICE_WORDS[status].toLowerCase()} only`
        : "Invoices issued";
    const text = [
        spanLine(s, what, false),
        invoices === 0
            ? "No invoices were issued in this period."
            : `- Invoices: ${invoices}${sayAmounts(of((r) => r.amount))}. ${byStatus.map((g) => `${INVOICE_WORDS[g.status]} ${g.count}${sayAmounts(g.amount)}`).join("; ")}.`,
        ...(invoices && !status
            ? [
                  `- Of the ${invoices} issued in these days: paid ${countOf("paid")}; not paid now ${countOf("overdue") + countOf("unpaid")} (overdue ${countOf("overdue")}, not due yet ${countOf("unpaid")}). Bills not paid from any day are list_unpaid_bills.`,
                  "Answer with: the invoices issued, how many are paid and how many not paid (overdue and not due yet), and their money.",
              ]
            : []),
        ...(invoices && money
            ? [
                  `- Of these, collected ${listOr(data.collected)}; still owed ${listOr(data.owed)}.`,
              ]
            : []),
        bucketLine(s, data.buckets, "by the day each was issued"),
        ...(invoices
            ? [
                  `- Newest ${Math.min(FIRST, invoices)} of ${invoices}: ${data.first.map((i) => `${i.number ?? "Bill"}${i.customer ? ` ${quoteUntrusted("Customer", i.customer.text)}` : ""}${i.amount ? ` ${i.amount}` : ""} ${INVOICE_WORDS[i.status]} ${i.issued_on}`).join("; ")}.`,
                  cardHolds(
                      "the newest invoices",
                      "Invoices (that screen has no issued-date filter, so it opens the whole list or one status tab)",
                  ),
              ]
            : []),
        ...notShownLine(notShown),
    ]
        .filter(Boolean)
        .join("\n");
    return { text, data };
}

// ----------------------------------------------------------------- stock

interface ShelfProductRow {
    id: string;
    name: string;
    currency: string;
    on_hand: number;
    value: string | null;
    low: number;
    short: number;
    out: number;
}

/** How many shelves needing stock a stock summary names. */
const NEEDS_NAMED = 40;

interface NeedRow {
    product_id: string;
    name: string;
    variant_id: string | null;
    variant: string | null;
    location_id: string;
    location: string;
    on_hand: number;
    alert_at: number;
    need: "short" | "out" | "low";
}

async function summariseStock(ctx: OrganizationContext, s: Span) {
    const org = ctx.organizationId;
    const money = allows(ctx, "payment:read");
    const notShown = money ? [] : ["payments"];
    const moved = {
        received: 0,
        sold: 0,
        returned: 0,
        wasted: 0,
        counted: 0,
        made: 0,
    };
    const base = {
        span: spanData(s),
        products: 0,
        units: 0,
        value: money ? [] : null,
        low: 0,
        short: 0,
        out: 0,
        top: [],
        needs: [],
        moved,
        not_shown: notShown,
    };
    if (!(await businessTracksStock(prisma, org))) {
        return {
            text: "Stock isn't tracked for this business, so there are no stock figures. Track stock is in Settings.",
            data: { ...base, tracked: false },
        };
    }
    // Each shelf by the Stock screen's rule (`shelfNeed`): short for orders,
    // else nothing left to sell, else at or under its own warning level. A
    // per-variant product's own shelf sells nothing, so only short counts.
    const [rows, entries, needs] = await Promise.all([
        prisma.$queryRaw<ShelfProductRow[]>`
            WITH shelf AS (
                SELECT s."productId", s."onHand", s.promised, s."lowStockAlert",
                    (s."variantId" IS NULL AND EXISTS (
                        SELECT 1 FROM "StockLevel" v
                        WHERE v."productId" = s."productId" AND v."variantId" IS NOT NULL
                    )) AS whole_of_variants,
                    GREATEST(0, s."onHand" - GREATEST(0, s.promised)) AS movable
                FROM "StockLevel" s
                WHERE s."organizationId" = ${org}
            )
            SELECT p.id, p.name, p.currency,
                SUM(sh."onHand")::int AS on_hand,
                (GREATEST(SUM(sh."onHand"), 0) * p.price)::text AS value,
                COUNT(*) FILTER (WHERE sh.promised > GREATEST(0, sh."onHand"))::int AS short,
                COUNT(*) FILTER (WHERE NOT sh.whole_of_variants
                    AND sh.promised <= GREATEST(0, sh."onHand") AND sh.movable <= 0)::int AS out,
                COUNT(*) FILTER (WHERE NOT sh.whole_of_variants
                    AND sh.promised <= GREATEST(0, sh."onHand") AND sh.movable > 0
                    AND sh."lowStockAlert" > 0 AND sh.movable <= sh."lowStockAlert")::int AS low
            FROM shelf sh
            JOIN "Product" p ON p.id = sh."productId"
            WHERE p."organizationId" = ${org} AND p."stockTracked"
              AND p.status <> 'ARCHIVED'
            GROUP BY p.id, p.name, p.currency, p.price`,
        prisma.stockEntry.groupBy({
            by: ["kind"],
            where: {
                organizationId: org,
                createdAt: { gte: s.from, lt: s.to },
                product: { stockTracked: true },
            },
            _sum: { quantity: true },
        }),
        prisma.$queryRaw<NeedRow[]>`
            SELECT * FROM (
                SELECT p.id AS product_id, p.name, v.id AS variant_id,
                    v.title AS variant, st.id AS location_id, st.name AS location,
                    s."onHand" AS on_hand, s."lowStockAlert" AS alert_at,
                    CASE
                        WHEN s.promised > GREATEST(0, s."onHand") THEN 'short'
                        WHEN s."variantId" IS NULL AND EXISTS (
                            SELECT 1 FROM "StockLevel" x
                            WHERE x."productId" = s."productId" AND x."variantId" IS NOT NULL
                        ) THEN NULL
                        WHEN s."onHand" - GREATEST(0, s.promised) <= 0 THEN 'out'
                        WHEN s."lowStockAlert" > 0
                            AND s."onHand" - GREATEST(0, s.promised) <= s."lowStockAlert" THEN 'low'
                    END AS need
                FROM "StockLevel" s
                JOIN "Product" p ON p.id = s."productId"
                JOIN "Store" st ON st.id = s."storeId"
                LEFT JOIN "ProductVariant" v ON v.id = s."variantId"
                WHERE s."organizationId" = ${org} AND p."organizationId" = ${org}
                  AND p."stockTracked" AND p.status <> 'ARCHIVED'
            ) t
            WHERE t.need IS NOT NULL
            ORDER BY CASE t.need WHEN 'short' THEN 0 WHEN 'out' THEN 1 ELSE 2 END,
                t.name, t.variant NULLS FIRST, t.location
            LIMIT ${NEEDS_NAMED}`,
    ]);
    const sum = (kind: string) =>
        entries.find((e) => e.kind === kind)?._sum.quantity ?? 0;
    moved.received = sum("RECEIVED");
    moved.sold = -sum("SOLD");
    moved.returned = sum("RETURNED");
    moved.wasted = -sum("WASTED");
    moved.counted = sum("COUNTED");
    moved.made = sum("BAKED");
    const byValue = [...rows].sort((a, b) =>
        money
            ? Number(b.value ?? 0) - Number(a.value ?? 0) ||
              b.on_hand - a.on_hand
            : b.on_hand - a.on_hand,
    );
    const total = (k: "low" | "short" | "out") =>
        rows.reduce((n, r) => n + Number(r[k]), 0);
    const data = {
        ...base,
        tracked: true,
        products: rows.length,
        units: rows.reduce((n, r) => n + Math.max(0, Number(r.on_hand)), 0),
        value: money
            ? amountsOf(
                  rows.map((r) => ({ currency: r.currency, amount: r.value })),
              )
            : null,
        low: total("low"),
        short: total("short"),
        out: total("out"),
        top: byValue.slice(0, FIRST).map((r) => ({
            product_id: r.id,
            name: r.name,
            on_hand: Number(r.on_hand),
            value: money
                ? moneyWords(Number(r.value ?? 0).toFixed(2), r.currency)
                : null,
        })),
        needs: needs.map((n) => ({ ...n, on_hand: Number(n.on_hand) })),
        moved,
    };
    const shelfWords = (n: NeedRow) =>
        `${JSON.stringify(n.variant ? `${n.name} ${n.variant}` : n.name)} at ${JSON.stringify(n.location)} ${n.need === "low" ? `low, ${n.on_hand} left (alert at ${n.alert_at})` : n.need === "out" ? "out" : `short for orders, ${n.on_hand} on hand`}`;
    const text = [
        // Nothing moves in days still to come: the log is said up to today.
        `Stock now, and what moved from ${s.firstDay} to ${[s.lastDay, localDay(new Date(), s.zone)].sort()[0]} (${s.zone}).`,
        rows.length === 0
            ? "- No product counts stock yet."
            : `- On hand now: ${data.units} units across ${data.products} products${data.value ? `, worth ${data.value.join(", ") || "nothing"} at today's prices` : ""}.`,
        `- Shelves (a product at one location, or one variant) short for open orders: ${data.short}; out of stock: ${data.out}; low: ${data.low}.`,
        ...(data.needs.length
            ? [
                  `- Each shelf needing stock${data.short + data.out + data.low > data.needs.length ? ` (the first ${data.needs.length})` : ""}: ${data.needs.map(shelfWords).join("; ")}.`,
              ]
            : []),
        ...(data.top.length
            ? [
                  `- Most ${money ? "value" : "units"} on hand: ${data.top.map((t) => `${JSON.stringify(t.name)} ${t.on_hand}${t.value ? ` (${t.value})` : ""}`).join("; ")}.`,
              ]
            : []),
        entries.length
            ? `- In the period, from the stock log: received ${moved.received}, sold ${moved.sold}, returned ${moved.returned}, made ${moved.made}, wasted ${moved.wasted}, counts changed it by ${moved.counted}.`
            : "- Nothing moved in the stock log in this period.",
        ...(data.top.length
            ? [cardHolds("the products with the most on hand", "Stock")]
            : []),
        // The card lists products, not these shelves: the answer names them.
        ...(data.needs.length
            ? [
                  "Asked what is low or out: name each shelf above in the answer, with its size or colour and store; never point to the card for them.",
              ]
            : []),
        ...notShownLine(notShown),
    ].join("\n");
    return { text, data };
}

// -------------------------------------------------------------- bookings

/** {@link ownBookingsWhere} as SQL over `b`. */
function ownSql(own: OwnDiary | null): Prisma.Sql {
    if (!own) return Prisma.empty;
    if (!own.staffId) return Prisma.sql` AND FALSE`;
    return own.serviceIds.length
        ? Prisma.sql` AND (b."staffId" = ${own.staffId} OR (b."staffId" IS NULL AND b."serviceId" IN (${Prisma.join([...own.serviceIds])})))`
        : Prisma.sql` AND b."staffId" = ${own.staffId}`;
}

const WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

async function summariseBookings(ctx: OrganizationContext, s: Span) {
    const org = ctx.organizationId;
    const own = await ownDiaryOf(prisma, ctx);
    const where = (from: Date, to: Date): Prisma.BookingWhereInput => ({
        organizationId: org,
        startAt: { gte: from, lt: to },
        ...ownBookingsWhere(own),
    });
    const standing = { status: "CONFIRMED" };
    const [byOutcome, cancelled, before, byService, byStaff, days, first] =
        await Promise.all([
            prisma.booking.groupBy({
                by: ["outcome"],
                where: { ...where(s.from, s.to), ...standing },
                _count: { _all: true },
            }),
            prisma.booking.count({
                where: { ...where(s.from, s.to), status: "CANCELLED" },
            }),
            prisma.booking.count({
                where: { ...where(s.before.from, s.before.to), ...standing },
            }),
            prisma.booking.groupBy({
                by: ["serviceId"],
                where: { ...where(s.from, s.to), ...standing },
                _count: { _all: true },
                orderBy: { _count: { serviceId: "desc" } },
                take: 5,
            }),
            prisma.booking.groupBy({
                by: ["staffId"],
                where: { ...where(s.from, s.to), ...standing },
                _count: { _all: true },
                orderBy: { _count: { staffId: "desc" } },
                take: 5,
            }),
            prisma.$queryRaw<{ dow: number; count: number }[]>`
                SELECT EXTRACT(ISODOW FROM (b."startAt" AT TIME ZONE 'UTC') AT TIME ZONE ${s.zone}::text)::int AS dow,
                    COUNT(*)::int AS count
                FROM "Booking" b
                WHERE b."organizationId" = ${org} AND b.status = 'CONFIRMED'
                  AND b."startAt" >= ${ts(s.from)} AND b."startAt" < ${ts(s.to)}
                  ${ownSql(own)}
                GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3`,
            prisma.booking.findMany({
                where: {
                    ...where(s.from, s.to),
                    status: { in: ["CONFIRMED", "CANCELLED"] },
                },
                orderBy: [{ startAt: "asc" }, { id: "asc" }],
                take: FIRST,
                select: {
                    id: true,
                    startAt: true,
                    status: true,
                    outcome: true,
                    bookerName: true,
                    service: { select: { name: true } },
                    contact: { select: { firstName: true, lastName: true } },
                },
            }),
        ]);
    const [services, staff] = await Promise.all([
        prisma.service.findMany({
            where: {
                organizationId: org,
                id: { in: byService.map((g) => g.serviceId) },
            },
            select: { id: true, name: true },
        }),
        prisma.staffMember.findMany({
            where: {
                organizationId: org,
                id: {
                    in: byStaff.flatMap((g) => (g.staffId ? [g.staffId] : [])),
                },
            },
            select: { id: true, name: true },
        }),
    ]);
    const name = (rows: { id: string; name: string }[], id: string | null) =>
        rows.find((r) => r.id === id)?.name ?? "No one";
    const n = (outcome?: string | null) =>
        byOutcome
            .filter((g) => outcome === undefined || g.outcome === outcome)
            .reduce((t, g) => t + g._count._all, 0);
    const bookings = n();
    const came = n("ATTENDED");
    const noShow = n("NO_SHOW");
    const data = {
        span: spanData(s),
        bookings,
        cancelled,
        came,
        no_show: noShow,
        not_marked: bookings - came - noShow,
        before: { bookings: before },
        by_service: byService.map((g) => ({
            key: name(services, g.serviceId),
            count: g._count._all,
        })),
        by_staff: byStaff.map((g) => ({
            key: name(staff, g.staffId),
            count: g._count._all,
        })),
        busiest_days: days.map((d) => ({
            key: WEEKDAYS[Number(d.dow) - 1] ?? String(d.dow),
            count: Number(d.count),
        })),
        first: first.map((b) => {
            const who = nameOf(
                b.contact?.firstName,
                b.contact?.lastName,
                b.bookerName,
            );
            return {
                booking_id: b.id,
                when: when(b.startAt, s.zone),
                service: b.service.name,
                customer: who ? untrusted(who) : null,
                status:
                    b.status === "CANCELLED"
                        ? "Cancelled"
                        : b.outcome === "ATTENDED"
                          ? "Came"
                          : b.outcome === "NO_SHOW"
                            ? "No-show"
                            : "Booked",
            };
        }),
        not_shown: [],
    };
    const list = (rows: { key: string; count: number }[]) =>
        rows.map((r) => `${JSON.stringify(r.key)} ${r.count}`).join("; ");
    const text = [
        spanLine(s, "Bookings"),
        bookings === 0 && cancelled === 0
            ? "No bookings in this period."
            : `- Bookings: ${bookings} (came ${came}, no-show ${noShow}, not marked yet ${data.not_marked}); ${cancelled} cancelled. Period before (${s.before.firstDay} to ${s.before.lastDay}): ${before} bookings; ${change(bookings, before)}.`,
        ...(bookings || cancelled
            ? [
                  `Answer with: the bookings (${bookings}), came (${came}), no-shows (${noShow}), not marked yet, cancelled (${cancelled}), and the first and last day as dates.`,
              ]
            : []),
        ...(data.by_service.length
            ? [`- By service: ${list(data.by_service)}.`]
            : []),
        ...(data.by_staff.length
            ? [`- By staff: ${list(data.by_staff)}.`]
            : []),
        ...(data.busiest_days.length
            ? [`- Busiest days: ${list(data.busiest_days)}.`]
            : []),
        ...(data.first.length
            ? [
                  `- First ${data.first.length}: ${data.first.map((b) => `${b.when} ${JSON.stringify(b.service)}${b.customer ? ` ${quoteUntrusted("Customer", b.customer.text)}` : ""} ${b.status}`).join("; ")}.`,
              ]
            : []),
        ...(data.first.length
            ? [
                  cardHolds(
                      "the first bookings",
                      s.days === 1
                          ? "that day in Bookings"
                          : "the Bookings list (it has no date range)",
                  ),
              ]
            : []),
    ].join("\n");
    return { text, data };
}

// ----------------------------------------------------------------- tools

async function spanOf(
    ctx: OrganizationContext,
    input: Parameters<typeof resolveSpan>[0],
) {
    return resolveSpan(
        input,
        new Date(),
        await businessTimezone(prisma, ctx.organizationId),
    );
}

const PERIOD_HINT =
    'period this_month by default; "last 3 months" → last_3_months; dates → from and to.';

export function periodSummaryTools(): McpTool[] {
    return [
        defineTool({
            name: "summarise_orders",
            title: "Orders over a period",
            description: `Use this when the person asks about orders over a period: how many, standing vs cancelled, money, by status, by week or month, by store, most ordered products and sizes or colours (variants), against the period before, and the newest orders. Example: "summary of orders from the last 3 months" → ${PERIOD_HINT} Not for one order (get_order).`,
            contract: summariseOrdersTool,
            capability: "order:read",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) =>
                summariseOrders(ctx, await spanOf(ctx, input)),
        }),
        defineTool({
            name: "summarise_invoices",
            title: "Invoices over a period",
            description: `Use this when the person asks for invoices or bills issued over a period: count and amount by status (paid, unpaid, overdue, cancelled, credit notes), collected vs owed, by month, and the newest. Example: "invoices for the last 3 months" → ${PERIOD_HINT} Not for who owes now (list_unpaid_bills).`,
            contract: summariseInvoicesTool,
            // Without invoice:read it says so rather than refusing.
            capability: null,
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) =>
                summariseInvoices(ctx, await spanOf(ctx, input), input.status),
        }),
        defineTool({
            name: "summarise_stock",
            title: "Stock summary",
            description: `Use this when the person asks about stock as a whole: units and value on hand, most stocked products, which products or sizes and colours are low, short or out at which store, and what was received, sold or adjusted over a period. Example: "stock summary" → ${PERIOD_HINT} Not for one product (get_product).`,
            contract: summariseStockTool,
            capability: "store:read",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) =>
                summariseStock(ctx, await spanOf(ctx, input)),
        }),
        defineTool({
            name: "summarise_bookings",
            title: "Bookings over a period",
            description: `Use this when the person asks about bookings over a period: how many, came and no-shows, cancelled, by service, by staff, busiest days, against the period before. Example: "bookings last month" → ${PERIOD_HINT} Not for who is booked on a day (list_bookings).`,
            contract: summariseBookingsTool,
            capability: "booking:read",
            hints: READ_ONLY,
            run: async (input, { ctx }: McpCall) =>
                summariseBookings(ctx, await spanOf(ctx, input)),
        }),
    ];
}

/** Registers the period summaries at boot. */
@Injectable()
export class PeriodSummaryTools implements OnModuleInit {
    constructor(private readonly registry: McpToolRegistry) {}

    onModuleInit(): void {
        this.registry.register(...periodSummaryTools());
    }
}
