import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type {
    RangePeriod,
    SELLING_PERIODS,
    SUMMARY_PERIODS,
} from "@saroh/api-contract";
import {
    findLapsedCustomersTool,
    getBusinessSummaryTool,
    getNeedsAttentionTool,
    getWhatsSellingTool,
    listStaffTool,
    listUnpaidBillsTool,
} from "@saroh/api-contract";
import { prisma, Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { moneyWords } from "../../../common/words-format";
import type { OwedByAge } from "../../analytics/owed-by-age";
import { foldOwedByAge, readOwedByAge } from "../../analytics/owed-by-age";
import type { SellsPeriod } from "../../analytics/period";
import { DAY_PARTS } from "../../analytics/sells";
import { SellsService } from "../../analytics/sells.service";
import { lastProductSaleSql } from "../../analytics/sells.sql";
import type { TakingsDayRow } from "../../analytics/takings";
import { takingsByDaySql } from "../../analytics/takings.sql";
import { ownBookingsWhere, ownDiaryOf } from "../../bookings/own-diary";
import { businessTimezone } from "../../bookings/staff-availability";
import { notRetired } from "../../customer-workspace/customers-list.sql";
import type {
    HomeInput,
    HomeMoneyTotal,
    HomeNeedKind,
} from "../../home/home-model";
import { billedTo } from "../../home/home-money-sources";
import { HomeService } from "../../home/home.service";
import { leftToPayCents, OWED_VIEW_WHERE } from "../../invoices/invoice-state";
import { realOrderWhere } from "../../orders/open-orders";
import { ts } from "../../orders/order-list-filters";
import { orderLocationWhere } from "../../orders/order-location";
import { allows } from "../../organizations/organization-policy";
import { movable } from "../../stock/stock-words";
import type { McpCall, McpTool } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { quoteUntrusted, untrusted } from "../untrusted";
import { withContact } from "./day.tools";
import { resolveSpan } from "./period";
import { money, PAGE, totalLine } from "./v1-bridge";

/**
 * The summary tools (plan 2026-11-13-001, U4): what Home and Insights
 * show, as a tool an AI calls as the person. Ask AI's first answers come
 * from here; outside AI apps get them too. Each figure is read only when
 * the person holds its read, as Home's are (DEC-098: money only with
 * `payment:read`); a figure left out is named in `not_shown`, never 0.
 */

type SummaryPeriod = (typeof SUMMARY_PERIODS)[number];
type SellingPeriod = (typeof SELLING_PERIODS)[number];

const DAY_MS = 86_400_000;

/** The period's `[from, to)` in the business's calendar; weeks start Monday. */
export function summaryWindow(
    period: SummaryPeriod,
    now: Date,
    zone: string,
): { from: Date; to: Date; firstDay: string; lastDay: string } {
    const at = DateTime.fromJSDate(now, { zone });
    const week = at.startOf("week");
    const month = at.startOf("month");
    const [from, to] =
        period === "today"
            ? [at.startOf("day"), at.startOf("day").plus({ days: 1 })]
            : period === "this_week"
              ? [week, week.plus({ weeks: 1 })]
              : period === "last_week"
                ? [week.minus({ weeks: 1 }), week]
                : [month, month.plus({ months: 1 })];
    return {
        from: from.toJSDate(),
        to: to.toJSDate(),
        firstDay: from.toISODate() ?? "",
        lastDay: to.minus({ days: 1 }).toISODate() ?? "",
    };
}

const PERIOD_WORDS: Record<SummaryPeriod, string> = {
    today: "Today",
    this_week: "This week",
    last_week: "Last week",
    this_month: "This month",
};

/** Takings rows (major units) as one readable amount per currency. */
function moneyOf(rows: readonly TakingsDayRow[]): string[] {
    const by = new Map<string, number>();
    for (const r of rows) {
        by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.amount));
    }
    return [...by.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => moneyWords(amount.toFixed(2), currency));
}

const minorTotals = (
    totals: readonly { currency: string; amountMinor: number }[] | null,
) => (totals ? totals.map((t) => money(t)) : null);

/** The person's role doesn't include these: said once, in their words. */
const notShownLine = (nouns: readonly string[]) =>
    nouns.length
        ? [
              `Not shown: your role doesn't include ${nouns.join(", ")}. If that was asked, say so in one line, give no other figure in its place, and offer one or two things the role can ask about instead.`,
          ]
        : [];

/** Two per-currency totals added together; null when either is. */
function addTotals(
    a: readonly HomeMoneyTotal[] | null,
    b: readonly HomeMoneyTotal[] | null,
): HomeMoneyTotal[] | null {
    if (!a || !b) return null;
    const by = new Map<string, number>();
    for (const t of [...a, ...b]) {
        by.set(t.currency, (by.get(t.currency) ?? 0) + t.amountMinor);
    }
    return [...by.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/**
 * What is owed, by owed by age (DEC-171), the read Home's "How it's going"
 * and Insights' Money tab fold: every issued bill not an order's own,
 * overdue once past its due date. Both summary tools say it this way, so
 * they never disagree on a count. A business that never billed owes none.
 */
async function readOwed(
    org: string,
    clock: { now: Date; zone: string },
    money: boolean,
) {
    const o: OwedByAge =
        (await readOwedByAge(prisma, org, clock, money)) ??
        foldOwedByAge([], clock, money);
    return {
        totals: minorTotals(o.totals),
        bills: o.bills,
        overdue: o.overdue,
        overdue_totals: minorTotals(
            addTotals(o.byAge.late1to30.totals, o.byAge.lateOver30.totals),
        ),
        not_due: o.byAge.notDue.count,
        not_due_totals: minorTotals(o.byAge.notDue.totals),
    };
}
type OwedData = Awaited<ReturnType<typeof readOwed>>;

const inBrackets = (totals: string[] | null) =>
    totals ? ` (${totals.join(", ") || "nothing"})` : "";

/**
 * The bookings line, with how many are not marked yet as a number: "the
 * rest" read as some even when it was none (80 came + 10 no-show of 90).
 */
export const bookingsLine = (bookings: number, came: number, noShow: number) =>
    `- Bookings: ${bookings} (came ${came}, no-show ${noShow}, not marked yet ${bookings - came - noShow})`;

/** The one owed line both summary tools send. */
export function owedLine(o: OwedData): string {
    if (o.bills === 0) return "- Unpaid bills: none.";
    return `- Unpaid bills: ${o.bills}${inBrackets(o.totals)}. Overdue, past their due date: ${o.overdue}${inBrackets(o.overdue_totals)}. Not due yet: ${o.not_due}${inBrackets(o.not_due_totals)}.`;
}

async function businessSummary(
    ctx: OrganizationContext,
    period: SummaryPeriod,
) {
    const org = ctx.organizationId;
    const now = new Date();
    const zone = await businessTimezone(prisma, org);
    const w = summaryWindow(period, now, zone);
    const see = {
        bookings: allows(ctx, "booking:read"),
        orders: allows(ctx, "order:read"),
        // Takings are the business's money, as Home's: payments and bills.
        money: allows(ctx, "payment:read") && allows(ctx, "invoice:read"),
        bills: allows(ctx, "invoice:read"),
        amounts: allows(ctx, "payment:read"),
    };
    const notShown = [
        ...(see.bookings ? [] : ["bookings"]),
        ...(see.orders ? [] : ["orders"]),
        ...(see.amounts ? [] : ["payments"]),
        ...(see.bills ? [] : ["bills"]),
    ];
    const [byOutcome, orders, takings, owed] = await Promise.all([
        see.bookings
            ? ownDiaryOf(prisma, ctx).then((own) =>
                  prisma.booking.groupBy({
                      by: ["outcome"],
                      where: {
                          organizationId: org,
                          // Standing bookings, as Home counts them.
                          status: "CONFIRMED",
                          startAt: { gte: w.from, lt: w.to },
                          ...ownBookingsWhere(own),
                      },
                      _count: { _all: true },
                  }),
              )
            : null,
        see.orders
            ? prisma.order.count({
                  where: {
                      organizationId: org,
                      ...orderLocationWhere(ctx),
                      createdAt: { gte: w.from, lt: w.to },
                      ...realOrderWhere(),
                  },
              })
            : null,
        see.money
            ? prisma.$queryRaw<TakingsDayRow[]>(
                  takingsByDaySql(org, zone, w.from, w.to),
              )
            : null,
        see.bills ? readOwed(org, { now, zone }, see.amounts) : null,
    ]);
    const count = (outcome?: string) =>
        byOutcome
            ? byOutcome
                  .filter((g) => outcome === undefined || g.outcome === outcome)
                  .reduce((n, g) => n + g._count._all, 0)
            : null;
    const data = {
        period,
        timezone: zone,
        from: w.firstDay,
        to: w.lastDay,
        bookings: count(),
        came: count("ATTENDED"),
        no_show: count("NO_SHOW"),
        orders,
        money_in: takings ? moneyOf(takings) : null,
        owed,
        not_shown: notShown,
    };
    const text = [
        `${PERIOD_WORDS[period]} (${w.firstDay} to ${w.lastDay}, ${zone}):`,
        ...(data.bookings !== null
            ? [bookingsLine(data.bookings, data.came ?? 0, data.no_show ?? 0)]
            : []),
        ...(orders !== null ? [`- Orders placed: ${orders}`] : []),
        ...(data.money_in
            ? [
                  `- Money in: ${data.money_in.length ? data.money_in.join(", ") : "none"}`,
              ]
            : []),
        ...(owed ? [owedLine(owed)] : []),
        ...notShownLine(notShown),
    ].join("\n");
    return { text, data };
}

const INSIGHTS_PERIOD: Record<SellingPeriod, SellsPeriod> = {
    last_7_days: "7d",
    last_4_weeks: "4w",
    last_3_months: "3m",
    this_month: "this_month",
    last_month: "last_month",
};

const SELLING_WORDS: Record<SellingPeriod, string> = {
    last_7_days: "in the last 7 days",
    last_4_weeks: "in the last 4 weeks",
    last_3_months: "in the last 3 months",
    this_month: "this month",
    last_month: "last month",
};

/**
 * Best sellers said plainly when there are none, with the last sale, so
 * an answer never stands in a product list for them (Northwind, 14 Nov).
 */
export function noSalesLine(period: string, lastSaleOn: string | null): string {
    const none = `No products sold ${(SELLING_WORDS as Partial<Record<string, string>>)[period] ?? "in that period"}`;
    return lastSaleOn
        ? `${none}; the last sale was on ${lastSaleOn}.`
        : `${none}; no product has sold yet.`;
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
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const busyWords = (cell: { dow: number; part: number } | null) => {
    if (!cell) return null;
    const part = DAY_PARTS[cell.part];
    return `${WEEKDAYS[cell.dow - 1]} ${hour(part.from)}–${hour(part.to)}`;
};

const NEED_WORDS: Record<HomeNeedKind, string> = {
    ORDERS: "Orders to pack or hand over",
    BILLS: "Unpaid bills",
    AWAITING_PAYMENT: "Bookings waiting for payment",
    ENQUIRIES: "Enquiries waiting for a reply",
    PAYMENTS: "Payments failed (renewals too) and refunds",
    REVIEWS: "Reviews to answer",
    STOCK: "Stock running low or short",
    SETUP: "Setting up and fixing",
};

interface LapsedRow {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    lastSeenAt: Date;
    /** Every lapsed customer, before the page (`COUNT(*) OVER ()`). */
    total: bigint;
}

/**
 * Customers last seen before `cutoff`, most recently seen first. Seen = a
 * standing booking that wasn't a no-show (a coming one counts, so someone
 * booked for next week isn't lapsed), or an order that wasn't cancelled or
 * an abandoned online checkout. Someone never seen isn't lapsed.
 */
function lapsedSql(
    organizationId: string,
    cutoff: Date,
    limit: number,
    offset: number,
): Prisma.Sql {
    return Prisma.sql`
        WITH seen AS (
            SELECT b."contactId" AS id, MAX(b."startAt") AS at
            FROM "Booking" b
            WHERE b."organizationId" = ${organizationId}
              AND b."contactId" IS NOT NULL
              AND b.status = 'CONFIRMED'
              AND b.outcome IS DISTINCT FROM 'NO_SHOW'
            GROUP BY 1
            UNION ALL
            SELECT l."contactId", MAX(o."createdAt")
            FROM "Order" o
            JOIN "CustomerIdentityLink" l
              ON l."customerId" = o."customerId" AND l."organizationId" = ${organizationId}
            WHERE o."organizationId" = ${organizationId}
              AND o.status <> 'CANCELLED'
              AND (o."paymentStatus" IN ('PAID', 'REFUNDED') OR NOT o."placedOnline")
            GROUP BY 1
        ),
        last AS (SELECT id, MAX(at) AS at FROM seen GROUP BY id)
        SELECT c.id, c."firstName", c."lastName", c.email, c.phone,
            last.at AS "lastSeenAt", COUNT(*) OVER () AS total
        FROM last
        JOIN "Contact" c ON c.id = last.id
        WHERE c."organizationId" = ${organizationId}
          AND ${notRetired("c")}
          AND last.at < ${ts(cutoff)}
        ORDER BY last.at DESC, c.id
        LIMIT ${limit} OFFSET ${offset}`;
}

/** Home's read, as the person asking. */
const homeInput = (ctx: OrganizationContext): HomeInput => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    organizationRole: ctx.role,
    organizationRoleKey: ctx.roleKey,
    organizationActions: ctx.actions,
    edition: ctx.edition,
});

/** A list's offset cursor, refused when it isn't one a tool gave. */
function offsetOf(cursor: string | undefined): number {
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
        throw new ToolError(
            "That cursor isn't one this tool gave.",
            "Call again without cursor, or with next_cursor from the last result.",
        );
    }
    return offset;
}

const money_ = (currency: string, amountMinor: number) =>
    money({ currency, amountMinor });

/** Whole days past due, at least 1 once late, as Home's "Late · N days". */
export function daysLate(dueAt: Date | null, now: Date): number {
    if (!dueAt || dueAt >= now) return 0;
    return Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS));
}

const shelfName = (product: string, variant: string | null) =>
    variant ? `${product} · ${variant}` : product;

/** How many shelves a stock line names before "and N more". */
const STOCK_NAMED = 10;

function named<T>(rows: readonly T[], say: (row: T) => string): string {
    const shown = rows.slice(0, STOCK_NAMED).map(say).join("; ");
    const more = rows.length - STOCK_NAMED;
    return more > 0 ? `${shown}; and ${more} more` : shown;
}

/**
 * The stock lines, always said: an empty one is "none", and a business
 * that counts no stock is told so, so nobody guesses why there's no line.
 */
export function stockLines(stock: {
    tracked: boolean;
    short: {
        name: string;
        location: string;
        on_hand: number;
        promised: number;
        short: number;
    }[];
    low: { name: string; location: string; left: number; alert_at: number }[];
}): string[] {
    if (!stock.tracked) {
        return [
            "- Stock: Stock isn't tracked for any product, so nothing shows as low or short.",
        ];
    }
    return [
        stock.short.length
            ? `- Short for open orders: ${stock.short.length}: ${named(stock.short, (r) => `${JSON.stringify(r.name)} at ${JSON.stringify(r.location)}, ${r.short} short (${r.promised} promised, ${r.on_hand} on hand)`)}.`
            : "- Short for open orders: none.",
        stock.low.length
            ? `- Low stock: ${stock.low.length}: ${named(stock.low, (r) => `${JSON.stringify(r.name)} at ${JSON.stringify(r.location)}, ${r.left} left (alert at ${r.alert_at})`)}.`
            : "- Low stock: none.",
    ];
}

export interface SummaryDeps {
    home: HomeService;
    sells: SellsService;
}

export function summaryTools(d: SummaryDeps): McpTool[] {
    return [
        defineTool({
            name: "get_business_summary",
            title: "Business at a glance",
            description:
                'Use this when the person asks how the business is doing for today, this week, last week or this month: bookings and who came, orders, money in, and what is owed. Example: "how was last week?" → period last_week. Not for which products or services sell (get_whats_selling).',
            contract: getBusinessSummaryTool,
            // Each figure checks its own read, as Home's do.
            capability: null,
            hints: READ_ONLY,
            run: (input, { ctx }: McpCall) =>
                businessSummary(ctx, input.period ?? "today"),
        }),
        defineTool({
            name: "get_whats_selling",
            title: "What sells",
            description:
                'Use this when the person asks what sells or is booked most (best sellers, top products, top services), who their best customers are (new or returning), or their busiest and quietest times. Example: "top products this month?" → period this_month; "what sold best lately?" → last_4_weeks; "products sold in the last 3 months" → last_3_months. Not for totals of money in (get_business_summary). Never answer best sellers from list_products.',
            contract: getWhatsSellingTool,
            capability: "analytics:read",
            module: "INSIGHTS",
            hints: READ_ONLY,
            async run(input, { ctx }: McpCall) {
                const own = (
                    INSIGHTS_PERIOD as Partial<Record<string, SellsPeriod>>
                )[input.period ?? "last_4_weeks"];
                const period =
                    input.from || input.to
                        ? "custom"
                        : (input.period ?? "last_4_weeks");
                // A shared period (or from/to) is read as its exact days.
                const span =
                    own && !input.from && !input.to
                        ? undefined
                        : resolveSpan(
                              {
                                  period: input.period as RangePeriod,
                                  from: input.from,
                                  to: input.to,
                              },
                              new Date(),
                              await businessTimezone(
                                  prisma,
                                  ctx.organizationId,
                              ),
                          );
                const r = await d.sells.read(
                    ctx,
                    own ?? "4w",
                    new Date(),
                    span && { from: span.firstDay, to: span.lastDay },
                );
                const lastSale = r.bestSellers.rows.length
                    ? null
                    : await prisma.$queryRaw<{ day: string | null }[]>(
                          lastProductSaleSql(
                              ctx.organizationId,
                              r.zone,
                              new Date(),
                          ),
                      );
                const amount = (minor: number | null) =>
                    minor !== null && r.currency
                        ? money({ currency: r.currency, amountMinor: minor })
                        : null;
                const data = {
                    period,
                    from: r.window.from,
                    to: r.window.to,
                    best_sellers: r.bestSellers.rows.map((p) => ({
                        product_id: p.productId,
                        name: p.name,
                        sold: p.sold,
                        sold_before: p.soldBefore,
                        amount: amount(p.amountMinor),
                    })),
                    last_sale_on: lastSale?.[0]?.day ?? null,
                    booked: r.booked.rows.map((s) => ({
                        service_id: s.serviceId,
                        name: s.name,
                        bookings: s.bookings,
                        full_percent: s.fullPercent,
                    })),
                    busiest: r.busiest.enough
                        ? busyWords(r.busiest.busiest)
                        : null,
                    quietest: r.busiest.enough
                        ? busyWords(r.busiest.quietest)
                        : null,
                    customers: {
                        total: r.customers.total,
                        returning: r.customers.cameBack,
                        new: r.customers.firstTime,
                        best: r.customers.rows.map((c) => ({
                            customer_id: c.contactId,
                            name: c.name ? untrusted(c.name) : null,
                            amount: amount(c.amountMinor),
                            visits: c.orders + c.bills + c.classes + c.bookings,
                        })),
                    },
                    not_shown: [
                        ...(r.money ? [] : ["payments"]),
                        ...(r.names ? [] : ["customers"]),
                    ],
                };
                const text = [
                    `${r.window.from} to ${r.window.to}, against the same number of days before.`,
                    data.best_sellers.length
                        ? `Best sellers: ${data.best_sellers
                              .map(
                                  (p) =>
                                      `${JSON.stringify(p.name)} (product_id ${p.product_id}) ${p.sold} sold (${p.sold_before} before)${p.amount ? `, ${p.amount}` : ""}`,
                              )
                              .join(
                                  "; ",
                              )}. Best sellers count units on paid orders, on the day paid, less refunds. Answer with: at least the top 3 with units.`
                        : noSalesLine(period, data.last_sale_on),
                    `Booked most: ${
                        data.booked.length
                            ? data.booked
                                  .map(
                                      (s) =>
                                          `${JSON.stringify(s.name)} ${s.bookings}${s.full_percent !== null ? ` (${s.full_percent}% full)` : ""}`,
                                  )
                                  .join("; ")
                            : "no bookings"
                    }.`,
                    data.busiest
                        ? `Busiest: ${data.busiest}; quietest: ${data.quietest ?? "none"}.`
                        : "Too few sales and visits yet to say the busiest times.",
                    `Customers: ${data.customers.total} paid or came, ${data.customers.returning} returning, ${data.customers.new} new.`,
                    ...data.customers.best.map(
                        (c) =>
                            `- ${c.name ? quoteUntrusted("Customer", c.name.text) : "A customer"}${c.customer_id ? ` (customer_id ${c.customer_id})` : ""}: ${c.visits} visits or orders${c.amount ? `, ${c.amount}` : ""}`,
                    ),
                    ...notShownLine(data.not_shown),
                ].join("\n");
                return { text, data };
            },
        }),
        defineTool({
            name: "get_needs_attention",
            title: "What needs doing",
            description:
                'Use this when the person asks what needs doing or what they missed: orders to pack, unpaid bills, bookings waiting for payment, enquiries, failed payments and renewals, low or short stock. Example: "anything urgent?" Not for one list in full (list_orders, list_enquiries, list_unpaid_bills).',
            contract: getNeedsAttentionTool,
            // Home asks each source's own read.
            capability: null,
            hints: READ_ONLY,
            async run(_input, { ctx }: McpCall) {
                const org = ctx.organizationId;
                const see = {
                    bills: allows(ctx, "invoice:read"),
                    amounts: allows(ctx, "payment:read"),
                    stock: allows(ctx, "store:read"),
                };
                const unavailable: string[] = [];
                const [home, owed, stock] = await Promise.all([
                    d.home.build(homeInput(ctx)),
                    see.bills
                        ? businessTimezone(prisma, org).then((zone) =>
                              readOwed(
                                  org,
                                  { now: new Date(), zone },
                                  see.amounts,
                              ),
                          )
                        : null,
                    d.home.stockWatch(homeInput(ctx)).catch(() => {
                        unavailable.push("Stock");
                        return null;
                    }),
                ]);
                const groups = (home.needGroups ?? []).map((g) => ({
                    kind: g.kind,
                    what: NEED_WORDS[g.kind],
                    count: g.count,
                    late: g.late,
                    totals: minorTotals(g.totals),
                    oldest: g.oldest
                        ? {
                              title: untrusted(g.oldest.title),
                              who: g.oldest.who
                                  ? untrusted(g.oldest.who)
                                  : null,
                              at: g.oldest.at,
                          }
                        : null,
                }));
                const stockData = stock
                    ? {
                          tracked: stock.tracked,
                          short: stock.short.map((c) => ({
                              product_id: c.productId,
                              name: shelfName(c.productName, c.variantTitle),
                              location: c.storeName,
                              on_hand: c.numbers.onHand,
                              promised: c.numbers.promised,
                              short: c.numbers.short,
                          })),
                          low: stock.low.map((r) => ({
                              product_id: r.productId,
                              name: shelfName(
                                  r.product.name,
                                  r.variant?.title ?? null,
                              ),
                              location: r.store.name,
                              left: movable(r),
                              alert_at: r.lowStockAlert,
                          })),
                      }
                    : null;
                const notShown = [
                    ...(see.bills ? [] : ["bills"]),
                    ...(see.bills && !see.amounts ? ["payments"] : []),
                    ...(see.stock ? [] : ["stock"]),
                ];
                const data = {
                    total: home.needGroupsTotal ?? 0,
                    groups,
                    owed,
                    stock: stockData,
                    not_shown: notShown,
                    unavailable: [
                        ...home.unavailable.map((u) => u.label),
                        ...unavailable,
                    ],
                };
                // Bills and stock get their own fuller lines below.
                const said = new Set<string>([
                    ...(owed ? ["BILLS"] : []),
                    ...(stockData ? ["STOCK"] : []),
                ]);
                const chase =
                    groups.find((g) => g.kind === "BILLS")?.count ?? 0;
                const text = [
                    groups.length
                        ? `${data.total} things need doing.`
                        : "Nothing needs doing now.",
                    ...groups
                        .filter((g) => !said.has(g.kind))
                        .map(
                            (g) =>
                                `- ${g.what}: ${g.count}${g.late ? `, ${g.late} late` : ""}${g.totals?.length ? `, ${g.totals.join(", ")}` : ""}.${g.oldest ? ` Oldest: ${quoteUntrusted("Item", g.oldest.title.text)}${g.oldest.who ? `, ${quoteUntrusted("Who", g.oldest.who.text)}` : ""}${g.oldest.at ? `, since ${g.oldest.at}` : ""}.` : ""}`,
                        ),
                    ...(owed
                        ? [
                              owedLine(owed) +
                                  (owed.overdue > chase
                                      ? ` Of the overdue, Home lists ${owed.overdue - chase} under payments (a subscription's renewal, or a payment to refund) rather than as bills to chase. list_unpaid_bills names every one.`
                                      : owed.bills > 0
                                        ? " list_unpaid_bills names every one."
                                        : ""),
                          ]
                        : []),
                    ...(stockData ? stockLines(stockData) : []),
                    ...notShownLine(notShown),
                    ...(data.unavailable.length
                        ? [
                              `Couldn't read just now: ${data.unavailable.join(", ")}; this may be incomplete.`,
                          ]
                        : []),
                ].join("\n");
                return { text, data };
            },
        }),
        defineTool({
            name: "list_unpaid_bills",
            title: "Unpaid bills",
            description:
                "Use this when the person asks who hasn't paid, who owes them, how many bills or invoices are pending or unpaid, or which are overdue: every unpaid bill with who it's to, what is left to pay, its due date and how late, oldest due first. Example: \"who hasn't paid?\" Not for totals (get_business_summary).",
            contract: listUnpaidBillsTool,
            // Without invoice:read it says so rather than refusing.
            capability: null,
            hints: READ_ONLY,
            async run(input, { ctx }: McpCall) {
                if (!allows(ctx, "invoice:read")) {
                    const notShown = ["bills"];
                    return {
                        text: notShownLine(notShown).join("\n"),
                        data: {
                            bills: null,
                            total: null,
                            next_cursor: null,
                            not_shown: notShown,
                        },
                    };
                }
                const seesAmounts = allows(ctx, "payment:read");
                const limit = input.limit ?? PAGE;
                const offset = offsetOf(input.cursor);
                const org = ctx.organizationId;
                // Owed by age's bills, so the count is the summary's.
                const where = { organizationId: org, ...OWED_VIEW_WHERE };
                const now = new Date();
                const [zone, total, overdue, rows] = await Promise.all([
                    businessTimezone(prisma, org),
                    prisma.invoice.count({ where }),
                    // Counted whole, so "how many are overdue" needs no second page.
                    prisma.invoice.count({
                        where: { ...where, dueAt: { lt: now } },
                    }),
                    prisma.invoice.findMany({
                        where,
                        orderBy: [
                            { dueAt: { sort: "asc", nulls: "last" } },
                            { id: "asc" },
                        ],
                        skip: offset,
                        take: limit + 1,
                        select: {
                            id: true,
                            number: true,
                            total: true,
                            paidCents: true,
                            currency: true,
                            dueAt: true,
                            billToName: true,
                            contact: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                },
                            },
                        },
                    }),
                ]);
                const next =
                    rows.length > limit ? String(offset + limit) : null;
                const bills = rows.slice(0, limit).map((b) => {
                    const who = billedTo(b);
                    return {
                        invoice_id: b.id,
                        number: b.number,
                        customer: who ? untrusted(who) : null,
                        left_to_pay: seesAmounts
                            ? money_(b.currency, leftToPayCents(b))
                            : null,
                        due_on: b.dueAt
                            ? DateTime.fromJSDate(b.dueAt, {
                                  zone,
                              }).toISODate()
                            : null,
                        days_late: daysLate(b.dueAt, now),
                    };
                });
                const notShown = seesAmounts ? [] : ["payments"];
                const text = [
                    total === 0
                        ? "No unpaid bills."
                        : `${total} unpaid bills in all: ${overdue} overdue (past their due date), ${total - overdue} not due yet. Oldest due first; ${offset === 0 ? (bills.length < total ? `showing the first ${bills.length}` : "all here") : `${offset + 1} to ${offset + bills.length} here`}.`,
                    ...bills.map(
                        (b) =>
                            `- ${b.number ?? "Bill"} (invoice_id ${b.invoice_id}), ${b.customer ? quoteUntrusted("Customer", b.customer.text) : "no customer named"}${b.left_to_pay ? `, ${b.left_to_pay} left to pay` : ""}, ${
                                b.days_late > 0
                                    ? `due ${b.due_on}, ${b.days_late} day${b.days_late === 1 ? "" : "s"} late`
                                    : b.due_on
                                      ? `due ${b.due_on}, not due yet`
                                      : "no due date"
                            }`,
                    ),
                    ...(total > 0
                        ? [
                              next
                                  ? `More: call again with cursor ${next}.`
                                  : "That's all.",
                          ]
                        : []),
                    ...notShownLine(notShown),
                ].join("\n");
                return {
                    text,
                    data: {
                        bills,
                        total,
                        next_cursor: next,
                        not_shown: notShown,
                    },
                };
            },
        }),
        defineTool({
            name: "find_lapsed_customers",
            title: "Customers who stopped coming",
            description:
                "Use this when the person asks which customers haven't come back or ordered in a while. Seen = a booking they didn't miss, or an order. Example: \"who hasn't visited in 3 months?\" → days 90. Not for searching customers by name (list_customers).",
            contract: findLapsedCustomersTool,
            capability: "contact:read",
            hints: READ_ONLY,
            async run(input, call: McpCall) {
                const days = input.days ?? 60;
                const limit = input.limit ?? PAGE;
                const offset = offsetOf(input.cursor);
                const rows = await prisma.$queryRaw<LapsedRow[]>(
                    lapsedSql(
                        call.ctx.organizationId,
                        new Date(Date.now() - days * DAY_MS),
                        limit + 1,
                        offset,
                    ),
                );
                const page = rows.slice(0, limit);
                const next =
                    rows.length > limit ? String(offset + limit) : null;
                // shortcut: a cursor past the end reads no row to count on, so the total is the offset; fine for a stale cursor.
                const total = rows[0] ? Number(rows[0].total) : offset;
                const contact = withContact(call, input.include_contact);
                const customers = page.map((c) => {
                    const name =
                        [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                        null;
                    return {
                        customer_id: c.id,
                        name: name ? untrusted(name) : null,
                        last_seen_at: c.lastSeenAt.toISOString(),
                        email: contact ? c.email : null,
                        phone: contact ? c.phone : null,
                    };
                });
                const text = [
                    `${totalLine(total, customers.length, `customers not seen for ${days} days or more`, offset > 0)} Most recently seen first.`,
                    ...customers.map(
                        (c) =>
                            `- ${c.name ? quoteUntrusted("Customer", c.name.text) : "someone"} (customer_id ${c.customer_id}), last seen ${c.last_seen_at.slice(0, 10)}${c.email ? `, ${c.email}` : ""}${c.phone ? `, ${c.phone}` : ""}`,
                    ),
                    next
                        ? `More: call again with cursor ${next}.`
                        : "That's all.",
                ].join("\n");
                return {
                    text,
                    data: { days, customers, total, next_cursor: next },
                };
            },
        }),
        defineTool({
            name: "list_staff",
            title: "List staff",
            description:
                'Use this when the person asks who works here, who takes bookings, or where someone works, or you need a staff_id or location_id for list_bookings. Example: "is Asha on the diary?" Not for their free times (find_free_slots with staff_id).',
            contract: listStaffTool,
            capability: "service:read",
            module: "APPOINTMENTS",
            hints: READ_ONLY,
            async run(_input, { ctx }: McpCall) {
                const org = ctx.organizationId;
                // Calendar only sees itself (#868), as the Team screen.
                const own = await ownDiaryOf(prisma, ctx);
                const rows = await prisma.staffMember.findMany({
                    where: {
                        organizationId: org,
                        ...(own ? { id: own.staffId ?? { in: [] } } : {}),
                    },
                    orderBy: [{ status: "asc" }, { name: "asc" }],
                    select: {
                        id: true,
                        name: true,
                        title: true,
                        status: true,
                        _count: { select: { services: true } },
                        membership: {
                            select: {
                                role: true,
                                user: {
                                    select: {
                                        storeMembers: {
                                            where: {
                                                store: {
                                                    organizationId: org,
                                                    deletedAt: null,
                                                },
                                            },
                                            select: {
                                                store: {
                                                    select: {
                                                        id: true,
                                                        name: true,
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });
                const staff = rows.map((s) => ({
                    staff_id: s.id,
                    name: s.name,
                    title: s.title,
                    role: s.membership?.role ?? null,
                    bookable: s.status === "ACTIVE" && s._count.services > 0,
                    locations: (s.membership?.user.storeMembers ?? []).map(
                        (m) => ({
                            location_id: m.store.id,
                            name: m.store.name,
                        }),
                    ),
                }));
                const text = [
                    `${staff.length} staff.`,
                    ...staff.map(
                        (s) =>
                            `- ${JSON.stringify(s.name)} (staff_id ${s.staff_id})${s.title ? `, ${JSON.stringify(s.title)}` : ""}, ${s.bookable ? "takes bookings" : "takes no bookings"}${s.role ? `, signs in as ${s.role}` : ", no login"}${s.locations.length ? `, works at ${s.locations.map((l) => `${JSON.stringify(l.name)} (location_id ${l.location_id})`).join(", ")}` : ""}`,
                    ),
                ].join("\n");
                return { text, data: { staff } };
            },
        }),
    ];
}

/** Registers the summary tools at boot. */
@Injectable()
export class SummaryTools implements OnModuleInit {
    constructor(
        private readonly registry: McpToolRegistry,
        readonly home: HomeService,
        readonly sells: SellsService,
    ) {}

    onModuleInit(): void {
        this.registry.register(...summaryTools(this));
    }
}
