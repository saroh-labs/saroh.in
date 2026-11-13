import type { OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { SELLING_PERIODS, SUMMARY_PERIODS } from "@saroh/api-contract";
import {
    findLapsedCustomersTool,
    getBusinessSummaryTool,
    getNeedsAttentionTool,
    getWhatsSellingTool,
    listStaffTool,
} from "@saroh/api-contract";
import { prisma, Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { readOwedByAge } from "../../analytics/owed-by-age";
import type { InsightsPeriod } from "../../analytics/period";
import { DAY_PARTS } from "../../analytics/sells";
import { SellsService } from "../../analytics/sells.service";
import type { TakingsDayRow } from "../../analytics/takings";
import { takingsByDaySql } from "../../analytics/takings.sql";
import { ownBookingsWhere, ownDiaryOf } from "../../bookings/own-diary";
import { businessTimezone } from "../../bookings/staff-availability";
import { notRetired } from "../../customer-workspace/customers-list.sql";
import type { HomeNeedKind } from "../../home/home-model";
import { HomeService } from "../../home/home.service";
import { realOrderWhere } from "../../orders/open-orders";
import { ts } from "../../orders/order-list-filters";
import { orderLocationWhere } from "../../orders/order-location";
import { allows } from "../../organizations/organization-policy";
import type { McpCall, McpTool } from "../tool-registry";
import {
    defineTool,
    McpToolRegistry,
    READ_ONLY,
    ToolError,
} from "../tool-registry";
import { quoteUntrusted, untrusted } from "../untrusted";
import { withContact } from "./day.tools";
import { money, PAGE } from "./v1-bridge";

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
        .map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`);
}

const minorTotals = (
    totals: readonly { currency: string; amountMinor: number }[] | null,
) => (totals ? totals.map((t) => money(t)) : null);

/** The person's role doesn't include these: said once, in their words. */
const notShownLine = (nouns: readonly string[]) =>
    nouns.length
        ? [`Not shown: your role doesn't include ${nouns.join(", ")}.`]
        : [];

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
        see.bills
            ? readOwedByAge(prisma, org, { now, zone }, see.amounts)
            : null,
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
        owed: owed
            ? {
                  totals: minorTotals(owed.totals),
                  bills: owed.bills,
                  overdue: owed.overdue,
              }
            : null,
        not_shown: notShown,
    };
    const text = [
        `${PERIOD_WORDS[period]} (${w.firstDay} to ${w.lastDay}, ${zone}):`,
        ...(data.bookings !== null
            ? [
                  `- Bookings: ${data.bookings} (came ${data.came}, no-show ${data.no_show}, the rest not marked yet)`,
              ]
            : []),
        ...(orders !== null ? [`- Orders placed: ${orders}`] : []),
        ...(data.money_in
            ? [
                  `- Money in: ${data.money_in.length ? data.money_in.join(", ") : "none"}`,
              ]
            : []),
        ...(data.owed
            ? [
                  `- Owed now: ${data.owed.totals ? `${data.owed.totals.join(", ") || "nothing"} on ` : ""}${data.owed.bills} unpaid bills, ${data.owed.overdue} overdue`,
              ]
            : []),
        ...notShownLine(notShown),
    ].join("\n");
    return { text, data };
}

const INSIGHTS_PERIOD: Record<SellingPeriod, InsightsPeriod> = {
    last_7_days: "7d",
    last_4_weeks: "4w",
    last_3_months: "3m",
};

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
            last.at AS "lastSeenAt"
        FROM last
        JOIN "Contact" c ON c.id = last.id
        WHERE c."organizationId" = ${organizationId}
          AND ${notRetired("c")}
          AND last.at < ${ts(cutoff)}
        ORDER BY last.at DESC, c.id
        LIMIT ${limit} OFFSET ${offset}`;
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
                'Use this when the person asks what sells or is booked most, who their best customers are (new or returning), or their busiest and quietest times. Example: "what sold best this month?" → period last_4_weeks. Not for totals of money in (get_business_summary).',
            contract: getWhatsSellingTool,
            capability: "analytics:read",
            module: "INSIGHTS",
            hints: READ_ONLY,
            async run(input, { ctx }: McpCall) {
                const period = input.period ?? "last_4_weeks";
                const r = await d.sells.read(ctx, INSIGHTS_PERIOD[period]);
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
                    `Best sellers: ${
                        data.best_sellers.length
                            ? data.best_sellers
                                  .map(
                                      (p) =>
                                          `${JSON.stringify(p.name)} ${p.sold} sold (${p.sold_before} before)${p.amount ? `, ${p.amount}` : ""}`,
                                  )
                                  .join("; ")
                            : "nothing sold"
                    }.`,
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
                'Use this when the person asks what needs doing or what they missed: orders to pack, unpaid bills, bookings waiting for payment, enquiries, failed payments and renewals, low stock. Example: "anything urgent?" Not for one list in full (list_orders, list_enquiries).',
            contract: getNeedsAttentionTool,
            // Home asks each source's own read.
            capability: null,
            hints: READ_ONLY,
            async run(_input, { ctx }: McpCall) {
                const home = await d.home.build({
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    organizationRole: ctx.role,
                    organizationRoleKey: ctx.roleKey,
                    organizationActions: ctx.actions,
                    edition: ctx.edition,
                });
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
                const data = {
                    total: home.needGroupsTotal ?? 0,
                    groups,
                    unavailable: home.unavailable.map((u) => u.label),
                };
                const text = [
                    groups.length
                        ? `${data.total} things need doing.`
                        : "Nothing needs doing now.",
                    ...groups.map(
                        (g) =>
                            `- ${g.what}: ${g.count}${g.late ? `, ${g.late} late` : ""}${g.totals?.length ? `, ${g.totals.join(", ")}` : ""}.${g.oldest ? ` Oldest: ${quoteUntrusted("Item", g.oldest.title.text)}${g.oldest.who ? `, ${quoteUntrusted("Who", g.oldest.who.text)}` : ""}${g.oldest.at ? `, since ${g.oldest.at}` : ""}.` : ""}`,
                    ),
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
                const offset = input.cursor ? Number(input.cursor) : 0;
                if (!Number.isInteger(offset) || offset < 0) {
                    throw new ToolError(
                        "That cursor isn't one this tool gave.",
                        "Call again without cursor, or with next_cursor from the last result.",
                    );
                }
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
                    `${customers.length} customers not seen for ${days} days or more, most recently seen first.`,
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
                    data: { days, customers, next_cursor: next },
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
