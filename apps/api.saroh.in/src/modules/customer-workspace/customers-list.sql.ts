import { Prisma } from "@saroh/database";

import { RESERVED_CONTACT_EMAIL_DOMAINS } from "../contacts/contact-email";
import { openSql } from "../orders/order-list-filters";
import type { CustomerChip, CustomerSort } from "./customers-list.dto";
import { owesRowsSql, unpaidOrderSql } from "./owes.sql";
import {
    orderRefundedSql,
    spentLedgerRowsSql,
    spentRowsSql,
} from "./spent.sql";

// Spent's rule lives in `spent.sql.ts` (C14: net of refunds; an invoice's
// ledger by the money-in rule, DEC-173), which Customer Detail reads too.
export { spentRowsSql };

/**
 * The Customers list as SQL (DEC-041, C3). Pure: builds `Prisma.Sql`, runs
 * nothing; `customers-list.service.ts` runs it.
 *
 * A customer is a contact who has paid — an order through a store customer
 * linked to them, a payment that counts on an invoice that isn't an order's
 * own (part of one is enough; a bounced cheque isn't), a subscription
 * or a class pack — or who signs in on the business's site (a live
 * `CustomerAccount`, A1), or whom the merchant added on the list itself
 * (`ADDED_AS_CUSTOMER`, DEC-056). Leads, Pipeline and Contacts are not asked.
 *
 * Every figure comes from one CTE, so the chip counts can never disagree with
 * the rows they count.
 *
 * A store customer who has paid but whom no contact holds yet (C2 left them
 * for the merchant to link, DEC-041) is a row too, marked `unlinked`
 * (DEC-275): the list never reads "No customers yet" while people have
 * paid. Their figures are their own orders'; linking them stays the
 * merchant's action.
 */

/**
 * Where a contact came from when the merchant added them on the Customers
 * list (DEC-056, C14; `customer-add.service.ts`). The list shows them before
 * they have paid — "Added by hand" — which it doesn't for a contact made in
 * Contacts, a lead or an enquiry.
 */
export const ADDED_AS_CUSTOMER = "customers:added";

/** Account states that sign in; a MERGED account sits on a tombstone. */
const LIVE_ACCOUNT = ["ACTIVE", "BLOCKED"] as const;

/** An order that was paid for, whether or not it was refunded since. */
export const PAID_ORDER = Prisma.sql`o."paymentStatus" IN ('PAID', 'REFUNDED')`;

/** An order that counts at all: never an abandoned checkout (plan B, B1). */
export const REAL_ORDER = Prisma.sql`NOT (o."placedOnline" AND NOT o."payOnHandover" AND o."paymentStatus" = 'UNPAID')`;

/** True when `column` holds one of `contact-email.ts`'s placeholders. */
function reservedEmail(column: Prisma.Sql): Prisma.Sql {
    const patterns = RESERVED_CONTACT_EMAIL_DOMAINS.map((d) => `%@${d}`);
    return Prisma.sql`(lower(btrim(${column})) LIKE ANY (${patterns}::text[]))`;
}

/** A privacy removal's placeholder (`reservedRemovedEmail`). */
const REMOVED_PLACEHOLDER = "removed+%@removed.invalid";

/**
 * Not a merge's tombstone (C9: `mergedIntoId`) or a privacy removal (C11:
 * `removedAt`, and its `removed+<id>@removed.invalid` placeholder, which
 * every removal also writes). A site account's separate contact
 * (`…@account.invalid`) is a customer.
 */
export function notRetired(alias: string): Prisma.Sql {
    const column = (name: string) => Prisma.raw(`${alias}."${name}"`);
    return Prisma.sql`(${column("mergedIntoId")} IS NULL AND ${column("removedAt")} IS NULL AND lower(btrim(${column("email")})) NOT LIKE ${REMOVED_PLACEHOLDER})`;
}

export interface PeopleOptions {
    organizationId: string;
    /** "Bought at": the storefront whose orders `at_store` asks about. */
    storeId?: string;
    /** Whether the viewer sees sensitive Needs attention (`canSeeSensitive`). */
    sensitiveToo: boolean;
}

/**
 * `WITH … m AS (…)`: one row per customer, with what the chips, the sorts
 * and the page read. Follow it with a `SELECT … FROM m`.
 */
export function peopleCte(opts: PeopleOptions): Prisma.Sql {
    const org = opts.organizationId;
    const atStore = opts.storeId
        ? Prisma.sql`BOOL_OR(o."storeId" = ${opts.storeId})`
        : Prisma.sql`FALSE`;
    const attentionVisible = opts.sensitiveToo
        ? Prisma.sql`TRUE`
        : Prisma.sql`NOT a.sensitive`;
    return Prisma.sql`WITH ord AS (
        SELECT l."contactId",
            COUNT(*)::int AS orders,
            (COUNT(*) FILTER (WHERE ${PAID_ORDER}))::int AS paid_orders,
            (COUNT(*) FILTER (WHERE ${openSql()}))::int AS open_orders,
            MAX(o."createdAt") AS last_order_at,
            ${atStore} AS at_store
        FROM "CustomerIdentityLink" l
        JOIN "Order" o ON o."customerId" = l."customerId"
        WHERE l."organizationId" = ${org}
          AND o."organizationId" = ${org}
          AND ${REAL_ORDER}
        GROUP BY l."contactId"
    ),
    inv AS (
        SELECT x."contactId", COUNT(DISTINCT x."invoiceId")::int AS paid_invoices
        FROM (${spentLedgerRowsSql(org)}) x
        GROUP BY x."contactId"
    ),
    spent AS (
        SELECT s."contactId", SUM(s.amount) AS spent
        FROM (${spentRowsSql(org)}) s
        GROUP BY s."contactId"
    ),
    owe AS (
        SELECT w."contactId", SUM(w.amount) AS owes
        FROM (${owesRowsSql(org, { orders: true, invoices: true })}) w
        GROUP BY w."contactId"
    ),
    people AS (
        SELECT c.id, c."firstName", c."lastName", c.email, c.phone,
            c."createdAt",
            acc.email AS account_email,
            COALESCE(ord.orders, 0) AS orders,
            COALESCE(ord.paid_orders, 0) AS paid_orders,
            COALESCE(ord.open_orders, 0) AS open_orders,
            ord.last_order_at,
            COALESCE(ord.at_store, FALSE) AS at_store,
            COALESCE(inv.paid_invoices, 0) AS paid_invoices,
            spent.spent,
            owe.owes,
            COALESCE(c.source = ${ADDED_AS_CUSTOMER}, FALSE) AS added_by_hand,
            EXISTS (
                SELECT 1 FROM "CustomerSubscription" s
                WHERE s."contactId" = c.id AND s."organizationId" = ${org}
            ) AS has_subscription,
            EXISTS (
                SELECT 1 FROM "CustomerSubscription" s
                WHERE s."contactId" = c.id AND s."organizationId" = ${org}
                  AND s.status <> 'CANCELLED'
            ) AS subscriber,
            EXISTS (
                SELECT 1 FROM "PackPurchase" p
                WHERE p."contactId" = c.id AND p."organizationId" = ${org}
            ) AS has_pack,
            EXISTS (
                SELECT 1 FROM "Consent" k
                WHERE k."contactId" = c.id AND k."organizationId" = ${org}
                  AND k.status = 'GRANTED'
            ) AS offers,
            EXISTS (
                SELECT 1 FROM "ContactAttention" a
                WHERE a."contactId" = c.id AND a."organizationId" = ${org}
                  AND a.status::text = 'ACTIVE' AND a."removedAt" IS NULL
                  AND ${attentionVisible}
            ) AS attention,
            FALSE AS unlinked
        FROM "Contact" c
        LEFT JOIN ord ON ord."contactId" = c.id
        LEFT JOIN inv ON inv."contactId" = c.id
        LEFT JOIN spent ON spent."contactId" = c.id
        LEFT JOIN owe ON owe."contactId" = c.id
        LEFT JOIN LATERAL (
            SELECT ca.email FROM "CustomerAccount" ca
            WHERE ca."contactId" = c.id
              AND ca."organizationId" = ${org}
              AND ca.status::text IN (${Prisma.join([...LIVE_ACCOUNT])})
            ORDER BY ca."createdAt" ASC
            LIMIT 1
        ) acc ON TRUE
        WHERE c."organizationId" = ${org}
          AND ${notRetired("c")}
    ),
    unl AS (
        ${unlinkedPeopleSql(org, atStore)}
    ),
    m AS (
        SELECT x.*,
            CASE WHEN ${reservedEmail(Prisma.sql`x.email`)}
                THEN x.account_email ELSE x.email END AS shown_email
        FROM (
            SELECT ${PEOPLE_COLUMNS} FROM people
            WHERE people.paid_orders > 0
               OR people.paid_invoices > 0
               OR people.has_subscription
               OR people.has_pack
               OR people.account_email IS NOT NULL
               OR people.added_by_hand
            UNION ALL
            SELECT ${PEOPLE_COLUMNS} FROM unl
        ) x
    )`;
}

/** The columns `people` and `unl` share, in one order, for the UNION. */
const PEOPLE_COLUMNS = Prisma.raw(
    [
        "id",
        '"firstName"',
        '"lastName"',
        "email",
        "phone",
        '"createdAt"',
        "account_email",
        "orders",
        "paid_orders",
        "open_orders",
        "last_order_at",
        "at_store",
        "paid_invoices",
        "spent",
        "owes",
        "added_by_hand",
        "has_subscription",
        "subscriber",
        "has_pack",
        "offers",
        "attention",
        "unlinked",
    ].join(", "),
);

/**
 * The paying store customers no contact holds, as people rows (DEC-275):
 * the same who `unlinkedCte` counts — paid, a usable email, no link —
 * with their own orders' figures. Driven from the business's own orders,
 * so it never reads another business's store customers.
 */
function unlinkedPeopleSql(org: string, atStore: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`SELECT cu.id, cu."firstName", cu."lastName", cu.email,
            cu.phone, cu."createdAt",
            NULL::text AS account_email,
            COUNT(*)::int AS orders,
            (COUNT(*) FILTER (WHERE ${PAID_ORDER}))::int AS paid_orders,
            (COUNT(*) FILTER (WHERE ${openSql()}))::int AS open_orders,
            MAX(o."createdAt") AS last_order_at,
            ${atStore} AS at_store,
            0 AS paid_invoices,
            SUM(CASE WHEN o."paymentStatus" = 'PAID'
                THEN GREATEST(o.total - ${orderRefundedSql(org)}, 0) END) AS spent,
            SUM(CASE WHEN ${unpaidOrderSql()} THEN o.total END) AS owes,
            FALSE AS added_by_hand,
            FALSE AS has_subscription,
            FALSE AS subscriber,
            FALSE AS has_pack,
            FALSE AS offers,
            FALSE AS attention,
            TRUE AS unlinked
        FROM "Order" o
        JOIN "Customer" cu ON cu.id = o."customerId"
        WHERE o."organizationId" = ${org}
          AND ${REAL_ORDER}
          AND btrim(COALESCE(cu.email, '')) <> ''
          AND NOT ${reservedEmail(Prisma.sql`cu.email`)}
          AND NOT EXISTS (
            SELECT 1 FROM "CustomerIdentityLink" l
            WHERE l."customerId" = cu.id
              AND l."organizationId" = ${org}
          )
        GROUP BY cu.id
        HAVING COUNT(*) FILTER (WHERE ${PAID_ORDER}) > 0`;
}

/** `%`, `_` and `\` typed into the search are themselves, not wildcards. */
export function likeEscape(value: string): string {
    return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Digits typed that are enough to look a phone up by. */
const MIN_PHONE_SEARCH = 3;

/**
 * The search (R3): the name, the email (the contact's own or, for a site
 * account's separate contact, the account's) and the phone, on its digits.
 * Anyone who can open the list holds `contact:read`, which covers all three
 * (DEC-039). A placeholder email is never searched.
 */
export function searchSql(q: string | undefined): Prisma.Sql {
    const text = q?.trim();
    if (!text) return Prisma.sql`TRUE`;
    const like = `%${likeEscape(text.toLowerCase())}%`;
    const or: Prisma.Sql[] = [
        Prisma.sql`lower(concat_ws(' ', m."firstName", m."lastName")) LIKE ${like}`,
        Prisma.sql`lower(COALESCE(m.shown_email, '')) LIKE ${like}`,
    ];
    const digits = text.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_SEARCH) {
        or.push(
            Prisma.sql`regexp_replace(COALESCE(m.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`,
        );
    }
    return Prisma.sql`(${Prisma.join(or, " OR ")})`;
}

/** Search and storefront: what the chip counts honour. */
export function matchesSql(
    q: string | undefined,
    storeId?: string,
): Prisma.Sql {
    const and = [searchSql(q)];
    if (storeId) and.push(Prisma.sql`m.at_store`);
    return Prisma.join(and, " AND ");
}

/**
 * A chip's condition over `m`. `invoicesToo`: Returning counts paid
 * invoices only for a viewer who may read invoices, so the chip never tells
 * anyone about money they can't see.
 */
export function chipSql(chip: CustomerChip, invoicesToo: boolean): Prisma.Sql {
    switch (chip) {
        case "returning":
            return invoicesToo
                ? Prisma.sql`(m.paid_orders + m.paid_invoices) >= 2`
                : Prisma.sql`m.paid_orders >= 2`;
        case "subscribers":
            return Prisma.sql`m.subscriber`;
        case "open":
            return Prisma.sql`m.open_orders > 0`;
        case "offers":
            return Prisma.sql`m.offers`;
        case "attention":
            return Prisma.sql`m.attention`;
        case "owes":
            return Prisma.sql`COALESCE(m.owes, 0) > 0`;
        case "unlinked":
            return Prisma.sql`m.unlinked`;
        case "all":
            return Prisma.sql`TRUE`;
    }
}

/** The name as it sorts: the person's name, else the email shown. */
const SORT_NAME = Prisma.sql`lower(COALESCE(NULLIF(btrim(concat_ws(' ', m."firstName", m."lastName")), ''), m.shown_email, ''))`;

/** Every sort ends on the id, so a page never repeats or skips a row. */
export function orderBySql(sort: CustomerSort): Prisma.Sql {
    switch (sort) {
        case "spent":
            // One currency per business (DEC-030 amendment), so one number.
            return Prisma.sql`m.spent DESC NULLS LAST, ${SORT_NAME} ASC, m.id ASC`;
        case "name":
            return Prisma.sql`${SORT_NAME} ASC, m.id ASC`;
        case "last":
            return Prisma.sql`m.last_order_at DESC NULLS LAST, ${SORT_NAME} ASC, m.id ASC`;
    }
}

/**
 * Store customers who have paid and whom no contact holds (C2 left them for
 * the merchant: a contact already held their email). `storeId` narrows to
 * those who paid at that storefront. Follow with `SELECT … FROM u`.
 *
 * Driven from the business's own paid orders, so it never reads another
 * business's store customers (review C-2). A store customer with no usable
 * email (blank, or a reserved placeholder) is left out: C2 makes no contact
 * for them and nobody holds their email, so no link is coming — they are a
 * walk-in, as the list treats one (review C-4).
 */
export function unlinkedCte(
    organizationId: string,
    storeId?: string,
): Prisma.Sql {
    const atStore = storeId
        ? Prisma.sql`AND o."storeId" = ${storeId}`
        : Prisma.empty;
    return Prisma.sql`WITH paid AS (
        SELECT o."customerId" AS id, COUNT(*)::int AS orders,
            MAX(o."createdAt") AS last_at
        FROM "Order" o
        WHERE o."organizationId" = ${organizationId}
          AND o."customerId" IS NOT NULL
          AND ${PAID_ORDER} ${atStore}
        GROUP BY o."customerId"
    ), u AS (
        SELECT cu.id, cu."firstName", cu."lastName", cu.email, cu.phone,
            cu."storeId", paid.orders AS paid_orders, paid.last_at
        FROM paid
        JOIN "Customer" cu ON cu.id = paid.id
        WHERE btrim(COALESCE(cu.email, '')) <> ''
          AND NOT ${reservedEmail(Prisma.sql`cu.email`)}
          AND NOT EXISTS (
            SELECT 1 FROM "CustomerIdentityLink" l
            WHERE l."customerId" = cu.id
              AND l."organizationId" = ${organizationId}
        )
    )`;
}
