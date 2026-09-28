import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@saroh/database";
import { DateTime, IANAZone } from "luxon";

import type { DatePreset, ListTab, OrderStage, PaymentStanding } from "./dto";
import { ORDER_FULFILMENTS, ORDER_STAGES } from "./dto";
import {
    DEFAULT_LATE_THRESHOLDS,
    fulfilmentView,
    LATE_STAGES,
    LATE_STATUSES,
    lateStoredValues,
    storedValuesOf,
} from "./fulfilment";
import { LATE_THRESHOLD_COLUMNS } from "./late-thresholds";
import { openSql, realOrderSql } from "./open-orders";
import { attentionSql } from "./order-attention";
import { refundStanding } from "./order-refunds";

/**
 * The Orders list's filters (plan B, B1), as SQL.
 *
 * Pure: no Prisma client, no Nest DI. `order-list.ts` runs what this builds.
 * The filters that need a sum or a clock (payment standing, late) are SQL
 * expressions rather than a filter over loaded rows, so the tab counts and
 * the cursor stay exact however many orders a business has.
 *
 * Every enum column is compared as TEXT (`o.stage::text`, `o.fulfilment::text`),
 * so a filter may name a value this database does not have yet: it matches
 * nothing instead of failing the query.
 */

// The tabs and payment standings live with the DTO that validates them
// (dto.ts), so dto.ts never imports this file.
export { DATE_PRESETS, LIST_TABS, PAYMENT_STANDINGS } from "./dto";
export type { DatePreset, ListTab, PaymentStanding } from "./dto";
export type { FulfilmentType } from "./fulfilment";

/**
 * The join that gives the list's query each order's storefront's settings
 * row as `ss`, which {@link lateSql} reads the thresholds from (B17). A
 * function, not a constant, so importing this file builds no SQL.
 */
export function lateSettingsJoin(): Prisma.Sql {
    return Prisma.sql`LEFT JOIN "StoreSettings" ss ON ss."storeId" = o."storeId"`;
}

/** The list's filters once the query string is validated (dto.ts). */
export interface OrderListFilter {
    tab?: ListTab;
    stage?: string[];
    fulfilment?: string[];
    payment?: PaymentStanding;
    productId?: string;
    customerId?: string;
    storeId?: string;
    late?: boolean;
    /**
     * Whether its customer has Needs attention this viewer may see (B15):
     * true keeps only those orders, false only the others.
     */
    attention?: boolean;
    /**
     * What the row's pill says, as a key ("ready", "handed-to-courier",
     * "refunded"): see {@link stepSql}. B4.
     */
    step?: string;
    /**
     * Today, yesterday, the last 7 days or this month, in the business's
     * zone (B4). Instead of `from`/`to`, never with them.
     */
    date?: DatePreset;
    /** A calendar day, YYYY-MM-DD, in the business's zone. */
    from?: string;
    to?: string;
    /** Only orders placed at or after this instant (`?since=`, F6). */
    since?: Date;
    q?: string;
}

/** What the caller may search and see. */
export interface OrderListView {
    /** `contact:read`: search, and see, a customer's phone and email. */
    contact: boolean;
    /**
     * Whether sensitive Needs attention counts for this viewer
     * (`canSeeSensitive`, B15); without it only non-sensitive entries do.
     */
    sensitive?: boolean;
}

/** The instants a `from`/`to` day range covers: `[gte, lt)`. */
export function dayRange(
    from: string | undefined,
    to: string | undefined,
    zone: string,
): { gte?: Date; lt?: Date } {
    const tz = IANAZone.isValidZone(zone) ? zone : "Asia/Kolkata";
    const day = (d: string, field: string) => {
        const at = DateTime.fromISO(d, { zone: tz });
        if (!at.isValid) {
            throw new BadRequestException({
                message: "That date isn't a real day.",
                details: { field },
            });
        }
        return at.startOf("day");
    };
    const gte = from ? day(from, "from") : undefined;
    const lt = to ? day(to, "to").plus({ days: 1 }) : undefined;
    if (gte && lt && gte >= lt) {
        throw new BadRequestException({
            message: "The range ends before it starts.",
            details: { field: "to" },
        });
    }
    return { gte: gte?.toJSDate(), lt: lt?.toJSDate() };
}

/**
 * The instants a date preset covers, `[gte, lt)`, in the business's zone
 * (B4): today, yesterday, the last 7 days (today and the six before it) or
 * this calendar month so far. Worked out here rather than in the app, so
 * "today" is the business's today wherever the viewer is.
 */
export function presetRange(
    preset: DatePreset,
    zone: string,
    now: Date,
): { gte: Date; lt: Date } {
    const tz = IANAZone.isValidZone(zone) ? zone : "Asia/Kolkata";
    const today = DateTime.fromJSDate(now, { zone: tz }).startOf("day");
    const tomorrow = today.plus({ days: 1 });
    const from =
        preset === "today"
            ? today
            : preset === "yesterday"
              ? today.minus({ days: 1 })
              : preset === "7d"
                ? today.minus({ days: 6 })
                : today.startOf("month");
    const to = preset === "yesterday" ? today : tomorrow;
    return { gte: from.toJSDate(), lt: to.toJSDate() };
}

/** `%`, `_` and `\` taken literally in an ILIKE pattern. */
function likeEscape(text: string): string {
    return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * A Date as the `timestamp without time zone` Prisma stores: the UTC
 * wall-clock. Passing the Date itself would bind a timestamptz, which
 * Postgres converts through the SESSION's zone, so a server in IST would be
 * off by five and a half hours.
 */
export function ts(at: Date): Prisma.Sql {
    return Prisma.sql`${at.toISOString().replace("Z", "")}::timestamp`;
}

/**
 * The search: an order number (with or without "#") or a customer's name;
 * their email or phone only with `contact:read`, so a caller without it
 * cannot learn whether a number belongs to a customer.
 */
export function searchSql(q: string, view: OrderListView): Prisma.Sql {
    const text = q.trim().replace(/^#/, "");
    const pattern = `%${likeEscape(text)}%`;
    const parts: Prisma.Sql[] = [
        Prisma.sql`o."orderId" ILIKE ${pattern}`,
        Prisma.sql`CONCAT_WS(' ', c."firstName", c."lastName") ILIKE ${pattern}`,
        // A walk-in is found by the name they gave (B13).
        Prisma.sql`o."walkInName" ILIKE ${pattern}`,
    ];
    if (view.contact) {
        parts.push(Prisma.sql`c.email ILIKE ${pattern}`);
        const digits = text.replace(/\D/g, "");
        // Three digits at least, or "9" would find every phone.
        if (digits.length >= 3) {
            parts.push(
                Prisma.sql`regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`,
            );
            parts.push(
                Prisma.sql`regexp_replace(COALESCE(o."walkInPhone", ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`,
            );
        }
    }
    return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

/** "Handed to courier" → "handed-to-courier": a step's key in a URL. */
export function stepKey(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * The pill's words for a refunded or cancelled order, which it shows instead
 * of the step, with `orderStanding`'s precedence: money first.
 */
export const STANDING_STEPS = {
    refunded: "Refunded",
    cancelled: "Cancelled",
} as const;

/**
 * The step word a row's pill shows for a stored fulfilment value and stage
 * (before refunded or cancelled take over): its type's step, or the step
 * `stepIndexOf` places a stage its type has none for.
 */
export function stepLabelOf(stored: string, stage: OrderStage): string {
    // `stepIndexOf` always lands on one of the type's steps.
    const view = fulfilmentView(stored, stage);
    return view.steps[view.stepIndex].label;
}

/**
 * Every stored `fulfilment.stage` pair whose pill reads the step `key`.
 * Worked out from the table in `fulfilment.ts`, the one the rows read, so
 * the filter and the pill never disagree, and a word several types share
 * ("New", "Delivered") matches exactly the orders that show it.
 */
export function stepPairs(key: string): string[] {
    const pairs: string[] = [];
    for (const stored of ORDER_FULFILMENTS) {
        for (const stage of ORDER_STAGES) {
            if (stepKey(stepLabelOf(stored, stage)) === key) {
                pairs.push(`${stored}.${stage}`);
            }
        }
    }
    return pairs;
}

/**
 * The Step filter (B4): the orders whose pill says what `key` names.
 * "refunded" and "cancelled" are the pill's words for those standings; any
 * other key is a step, which a refunded or cancelled order never shows. An
 * unknown key matches nothing rather than failing, as the enum filters do.
 */
export function stepSql(key: string): Prisma.Sql {
    const refunded = Prisma.sql`o."paymentStatus" = 'REFUNDED'`;
    if (key === "refunded") return refunded;
    const cancelled = Prisma.sql`o.status::text = 'CANCELLED'`;
    if (key === "cancelled")
        return Prisma.sql`(NOT ${refunded} AND ${cancelled})`;
    const pairs = stepPairs(key);
    if (pairs.length === 0) return Prisma.sql`FALSE`;
    return Prisma.sql`(NOT ${refunded} AND NOT ${cancelled}
        AND (o.fulfilment::text || '.' || o.stage::text) = ANY(${pairs}))`;
}

/**
 * The order's payment standing in SQL — the same precedence as
 * {@link paymentStandingOf}. `money` is the lateral join in `order-list.ts`:
 * what SUCCEEDED payments took, and what their non-failed refunds gave back.
 */
export function paymentSql(): Prisma.Sql {
    return Prisma.sql`(CASE
    WHEN o."paymentStatus" = 'REFUNDED'
        OR (money.captured > 0 AND money.refunded >= money.captured)
        THEN 'REFUNDED'
    WHEN money.refunded > 0 THEN 'PARTLY_REFUNDED'
    WHEN o."paymentStatus" = 'PAID' THEN 'PAID'
    ELSE 'UNPAID'
END)`;
}

/** The row's payment standing, from the sums {@link paymentSql} reads. */
export function paymentStandingOf(
    paymentStatus: string,
    capturedCents: number,
    refundedCents: number,
): PaymentStanding {
    const refund = refundStanding(paymentStatus, capturedCents, refundedCents);
    if (refund !== "NONE") return refund;
    return paymentStatus === "PAID" ? "PAID" : "UNPAID";
}

/**
 * Open: the goods have not reached the customer and the order is neither
 * cancelled nor refunded in full (the Open tab; default 14). A shipped order
 * is still open until it is delivered. One definition with Home's
 * (`open-orders.ts`).
 */
export { openSql };

/**
 * Late: an open order not yet handed over, placed longer ago than the
 * threshold its storefront sets for its type (B17; DEC-045: the clock starts
 * at placed, paid or not). Reads the settings row {@link lateSettingsJoin}
 * joins, and a storefront without one reads the defaults, as `lateOf` does.
 * Never stored; `now` is bound so a page and its counts use one clock.
 */
export function lateSql(now: Date): Prisma.Sql {
    const whens = lateStoredValues().map(([stored, type]) => {
        const column = Prisma.raw(`ss."${LATE_THRESHOLD_COLUMNS[type]}"`);
        return Prisma.sql`WHEN ${stored} THEN COALESCE(${column}, ${DEFAULT_LATE_THRESHOLDS[type]}::int)`;
    });
    const threshold = Prisma.sql`(CASE o.fulfilment::text ${Prisma.join(whens, " ")} END)`;
    // The same open-and-not-handed-over lists `lateOf` reads for one order.
    return Prisma.sql`(o.status::text = ANY(${[...LATE_STATUSES]})
        AND o."paymentStatus" <> 'REFUNDED'
        AND o.stage::text = ANY(${[...LATE_STAGES]})
        AND ${threshold} IS NOT NULL
        AND o."createdAt" < ${ts(now)} - make_interval(mins => ${threshold}))`;
}

/**
 * The conditions on the order itself — everything but the tab, payment and
 * late, which read the computed columns. Always inside the organization, and
 * never an abandoned checkout (a `placedOnline` order still UNPAID).
 */
export function orderConditions(
    organizationId: string,
    filter: OrderListFilter,
    view: OrderListView,
    range: { gte?: Date; lt?: Date },
): Prisma.Sql {
    const and: Prisma.Sql[] = [
        Prisma.sql`o."organizationId" = ${organizationId}`,
        realOrderSql(),
    ];
    // Each narrows within the organization; none can widen past it, so a
    // storefront or product from another business simply matches nothing.
    if (filter.storeId) and.push(Prisma.sql`o."storeId" = ${filter.storeId}`);
    if (filter.customerId) {
        and.push(Prisma.sql`o."customerId" = ${filter.customerId}`);
    }
    if (filter.productId) {
        and.push(
            Prisma.sql`EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o.id AND oi."productId" = ${filter.productId})`,
        );
    }
    if (filter.stage?.length) {
        and.push(Prisma.sql`o.stage::text = ANY(${filter.stage})`);
    }
    if (filter.step) and.push(stepSql(filter.step));
    if (filter.fulfilment?.length) {
        and.push(
            Prisma.sql`o.fulfilment::text = ANY(${storedValuesOf(filter.fulfilment)})`,
        );
    }
    if (range.gte) and.push(Prisma.sql`o."createdAt" >= ${ts(range.gte)}`);
    if (range.lt) and.push(Prisma.sql`o."createdAt" < ${ts(range.lt)}`);
    if (filter.since) {
        and.push(Prisma.sql`o."createdAt" >= ${ts(filter.since)}`);
    }
    if (filter.q?.trim()) and.push(searchSql(filter.q, view));
    if (filter.attention !== undefined) {
        const has = attentionSql(view.sensitive ?? false);
        and.push(filter.attention ? has : Prisma.sql`NOT ${has}`);
    }
    return Prisma.join(and, " AND ");
}

/** Payment and late, over the computed columns of the list's CTE. */
export function computedConditions(filter: OrderListFilter): Prisma.Sql {
    const and: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (filter.payment) and.push(Prisma.sql`m.payment = ${filter.payment}`);
    if (filter.late !== undefined)
        and.push(Prisma.sql`m.late = ${filter.late}`);
    return Prisma.join(and, " AND ");
}

/** The tab, over the computed columns. */
export function tabCondition(tab: ListTab | undefined): Prisma.Sql {
    if (tab === "open") return Prisma.sql`m.open`;
    if (tab === "refunded") return Prisma.sql`m.payment = 'REFUNDED'`;
    return Prisma.sql`TRUE`;
}
