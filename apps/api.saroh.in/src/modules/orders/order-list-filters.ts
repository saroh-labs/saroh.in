import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@saroh/database";
import { DateTime, IANAZone } from "luxon";

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
 * so a filter may name a value this database does not have yet (the six
 * fulfilment types before B2a's migration, OUT_FOR_DELIVERY and SENT): it
 * matches nothing instead of failing the query.
 */

/** The tabs: All · Open · Refunded (default 14). */
export const LIST_TABS = ["all", "open", "refunded"] as const;
export type ListTab = (typeof LIST_TABS)[number];

/**
 * How the money on an order stands, as one word for the row and the filter.
 * Derived from payments and refunds the way Order Detail's `refundStanding`
 * is, so the list and the order never disagree.
 */
export const PAYMENT_STANDINGS = [
    "PAID",
    "UNPAID",
    "PARTLY_REFUNDED",
    "REFUNDED",
] as const;
export type PaymentStanding = (typeof PAYMENT_STANDINGS)[number];

/**
 * The six fulfilment types (DEC-045) and the two stored words they replace.
 *
 * TODO(B2a): `orders/fulfilment.ts` owns the one normaliser (`typeOf`) and the
 * types' default late thresholds. It was not on the branch when B1 was built,
 * so this file carries the smallest piece the list needs; whichever of B1 and
 * B2a merges second points these at `fulfilment.ts` and deletes them here.
 */
export const FULFILMENT_TYPES = [
    "PICKUP",
    "LOCAL_DELIVERY",
    "SHIPPING",
    "DIGITAL",
    "APPOINTMENT_IN_PERSON",
    "APPOINTMENT_ONLINE",
] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

/** Every word the `fulfilment` filter accepts: the types and the legacy two. */
export const FULFILMENT_FILTER_VALUES = [
    ...FULFILMENT_TYPES,
    "COLLECT",
    "DELIVERY",
] as const;

const LEGACY_TYPE: Record<string, FulfilmentType> = {
    COLLECT: "PICKUP",
    DELIVERY: "LOCAL_DELIVERY",
};

/** A stored fulfilment as its type: COLLECT is Pick-up, DELIVERY Local delivery. */
export function fulfilmentTypeOf(stored: string): FulfilmentType {
    return (
        LEGACY_TYPE[stored] ??
        ((FULFILMENT_TYPES as readonly string[]).includes(stored)
            ? (stored as FulfilmentType)
            : "PICKUP")
    );
}

/**
 * The stored values a `fulfilment` filter matches: each type with its legacy
 * word (until B2d drops the old values), so Pick-up finds COLLECT orders.
 */
export function storedFulfilments(values: readonly string[]): string[] {
    const out = new Set<string>();
    for (const v of values) {
        const type = fulfilmentTypeOf(v);
        out.add(type);
        for (const [legacy, t] of Object.entries(LEGACY_TYPE)) {
            if (t === type) out.add(legacy);
        }
    }
    return [...out];
}

/** Every stage the `stage` filter accepts, B2a's two new ones included. */
export const STAGE_FILTER_VALUES = [
    "NEW",
    "PREPARING",
    "READY",
    "COLLECTED",
    "OUT_FOR_DELIVERY",
    "HANDED_TO_COURIER",
    "SENT",
    "DELIVERED",
] as const;

/**
 * When an open order counts as late, in minutes from when it was placed, per
 * stored fulfilment (default 16: 2 h, 24 h, 48 h). Digital and appointments
 * are never late here: Digital never is, and appointments go by their visits.
 *
 * TODO(B17): the storefront's own thresholds replace these defaults, read
 * through a join on `StoreSettings` in {@link lateSql}.
 */
export const DEFAULT_LATE_AFTER_MINUTES: Readonly<Record<string, number>> = {
    COLLECT: 120,
    PICKUP: 120,
    DELIVERY: 1440,
    LOCAL_DELIVERY: 1440,
    SHIPPING: 2880,
};

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
    /** A calendar day, YYYY-MM-DD, in the business's zone. */
    from?: string;
    to?: string;
    q?: string;
}

/** What the caller may search and see. */
export interface OrderListView {
    /** `contact:read`: search, and see, a customer's phone and email. */
    contact: boolean;
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
    ];
    if (view.contact) {
        parts.push(Prisma.sql`c.email ILIKE ${pattern}`);
        const digits = text.replace(/\D/g, "");
        // Three digits at least, or "9" would find every phone.
        if (digits.length >= 3) {
            parts.push(
                Prisma.sql`regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`,
            );
        }
    }
    return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
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
 * is still open until it is delivered.
 */
export function openSql(): Prisma.Sql {
    return Prisma.sql`(o.status IN ('PENDING', 'PROCESSING', 'SHIPPED') AND o."paymentStatus" <> 'REFUNDED')`;
}

/**
 * Late: an open order not yet handed over, placed longer ago than its type's
 * threshold (DEC-045: the clock starts at placed, paid or not). Never stored;
 * `now` is bound so a page and its counts use one clock.
 */
export function lateSql(now: Date): Prisma.Sql {
    const whens = Object.entries(DEFAULT_LATE_AFTER_MINUTES).map(
        ([stored, minutes]) => Prisma.sql`WHEN ${stored} THEN ${minutes}::int`,
    );
    const threshold = Prisma.sql`(CASE o.fulfilment::text ${Prisma.join(whens, " ")} END)`;
    return Prisma.sql`(o.status IN ('PENDING', 'PROCESSING')
        AND o."paymentStatus" <> 'REFUNDED'
        AND o.stage::text IN ('NEW', 'PREPARING', 'READY')
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
        Prisma.sql`NOT (o."placedOnline" AND o."paymentStatus" = 'UNPAID')`,
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
    if (filter.fulfilment?.length) {
        and.push(
            Prisma.sql`o.fulfilment::text = ANY(${storedFulfilments(filter.fulfilment)})`,
        );
    }
    if (range.gte) and.push(Prisma.sql`o."createdAt" >= ${ts(range.gte)}`);
    if (range.lt) and.push(Prisma.sql`o."createdAt" < ${ts(range.lt)}`);
    if (filter.q?.trim()) and.push(searchSql(filter.q, view));
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
