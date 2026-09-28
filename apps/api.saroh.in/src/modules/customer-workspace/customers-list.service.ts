import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { fromMinor, toMinor } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    contactEmailForDisplay,
    isReservedContactEmail,
} from "../contacts/contact-email";
import type { OrgAction } from "../organizations/organization-actions";
import { allows } from "../organizations/organization-policy";
import { attentionFor, canSeeSensitive } from "./attention-read";
import { requireCustomerPower } from "./customer-access";
import type { MoneyTotal } from "./customer-detail.service";
import type {
    CustomerChip,
    CustomerSort,
    ListCustomersQueryDto,
    ListUnlinkedQueryDto,
} from "./customers-list.dto";
import { CUSTOMER_CHIPS, CUSTOMERS_PAGE_SIZE } from "./customers-list.dto";
import { possibleDuplicates } from "./customers-list.duplicates";
import {
    chipSql,
    matchesSql,
    orderBySql,
    peopleCte,
    spentRowsSql,
    unlinkedCte,
} from "./customers-list.sql";
import type { AttentionKind } from "./dto";
import { normaliseEmail } from "./duplicates";

/**
 * The Customers list (DEC-041, C3): one list for the whole business, keyed
 * on the contact, with search, chips and their counts, sort, the storefront
 * filter and pages of 50.
 *
 * Each part of a row follows its own read (DEC-039, matrix §1 rule 3):
 * - the person — name, phone, email, offers, Needs attention — with
 *   `contact:read`, which the list itself needs;
 * - their orders — count, last order, where, open — with `order:read`;
 * - "Spent", which sums orders and invoices, with both `order:read` and
 *   `invoice:read`;
 * - whether they subscribe, with `subscription:read`.
 * A part the viewer may not read is left out of the row, never sent as a
 * zero, and its chip and sort are refused.
 */

/** A Needs attention tag on a row: what it says, never its detail. */
export interface CustomerAttentionTag {
    kind: AttentionKind;
    label: string;
    sensitive: boolean;
}

export interface CustomerRow {
    contactId: string;
    /** The person's name; null when none was given. */
    name: string | null;
    /** Their email, or their site account's; never a placeholder. */
    email: string | null;
    phone: string | null;
    /** They sign in on the business's website (A1). */
    signsIn: boolean;
    /** Another contact is likely the same person (C2's pairing). */
    possibleDuplicate: boolean;
    /** A GRANTED marketing consent on any channel. */
    offers: boolean;
    attention: CustomerAttentionTag[];
    /** Sensitive entries on the record this viewer may not see. */
    hiddenSensitiveCount: number;
    /** Two or more paid orders (and, with `invoice:read`, invoices). */
    returning?: boolean;
    /** With `order:read`. */
    orders?: {
        count: number;
        /** Orders not yet with the customer, nor cancelled or refunded. */
        open: number;
        lastAt: string | null;
        /** Where the last order was placed. */
        lastStorefront: { id: string; name: string } | null;
    };
    /** With `order:read` and `invoice:read`: per currency, zeros left out. */
    spent?: MoneyTotal[];
    /** A live subscription; with `subscription:read`. */
    subscriber?: boolean;
}

export type CustomerChipCounts = Partial<Record<CustomerChip, number>>;

export interface CustomersPage {
    rows: CustomerRow[];
    /** Rows matching the search, storefront and chip. */
    total: number;
    page: number;
    pageSize: number;
    /** Every customer the business has, before any search or filter. */
    everyone: number;
    /**
     * Per chip, under the search and storefront but not the chip. A chip
     * the viewer may not use is absent.
     */
    counts: CustomerChipCounts;
    /**
     * Paying store customers the list can't show yet: no contact holds them,
     * because one already held their email (C2). Under the storefront.
     */
    unlinkedPaying: number;
    /** For "Bought at": with `order:read`; the screen shows it past one. */
    storefronts?: { id: string; name: string }[];
    /** Which parts this viewer's rows carry. */
    sees: { orders: boolean; spent: boolean; subscriptions: boolean };
    sort: CustomerSort;
    chip: CustomerChip;
}

export interface UnlinkedCustomer {
    customerId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    storefront: { id: string; name: string } | null;
    /** The contact that already holds their email, to link them to. */
    holder: {
        contactId: string;
        name: string | null;
        email: string | null;
    } | null;
    /** With `order:read`. */
    paidOrders?: number;
    lastPaidOrderAt?: string | null;
}

export interface UnlinkedPage {
    rows: UnlinkedCustomer[];
    total: number;
    page: number;
    pageSize: number;
}

/** What a chip needs beyond `contact:read`. */
const CHIP_NEEDS: Record<CustomerChip, readonly OrgAction[]> = {
    all: [],
    returning: ["order:read"],
    subscribers: ["subscription:read"],
    open: ["order:read"],
    offers: [],
    attention: [],
};

const SORT_NEEDS: Record<CustomerSort, readonly OrgAction[]> = {
    last: ["order:read"],
    spent: ["order:read", "invoice:read"],
    name: [],
};

interface PeopleRow {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    account_email: string | null;
    orders: number;
    paid_orders: number;
    open_orders: number;
    last_order_at: Date | null;
    paid_invoices: number;
    subscriber: boolean;
    offers: boolean;
}

function personName(p: {
    firstName: string | null;
    lastName: string | null;
}): string | null {
    return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || null;
}

/** Sum per currency in minor units, leaving out zeros (as Customer Detail). */
function totals(
    rows: { currency: string; amount: { toString(): string } | null }[],
): MoneyTotal[] {
    const by = new Map<string, number>();
    for (const r of rows) {
        if (r.amount == null) continue;
        by.set(r.currency, (by.get(r.currency) ?? 0) + toMinor(r.amount));
    }
    return [...by.entries()]
        .filter(([, minor]) => minor !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, minor]) => ({ currency, amount: fromMinor(minor) }));
}

@Injectable()
export class CustomersListService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    async list(
        ctx: OrganizationContext,
        query: ListCustomersQueryDto,
    ): Promise<CustomersPage> {
        requireCustomerPower(ctx, "contact:read");
        const organizationId = ctx.organizationId;
        const sees = {
            orders: allows(ctx, "order:read"),
            spent: allows(ctx, "order:read") && allows(ctx, "invoice:read"),
            subscriptions: allows(ctx, "subscription:read"),
        };
        const invoicesToo = allows(ctx, "invoice:read");
        const chip = query.chip ?? "all";
        const sort = query.sort ?? (sees.orders ? "last" : "name");
        for (const action of [...CHIP_NEEDS[chip], ...SORT_NEEDS[sort]]) {
            requireCustomerPower(ctx, action);
        }
        // "Bought at" is about orders; a storefront of another business is
        // a 404, as every cross-tenant id.
        if (query.store) {
            requireCustomerPower(ctx, "order:read");
            await this.requireStore(organizationId, query.store);
        }
        const page = query.page ?? 1;

        const cte = peopleCte({
            organizationId,
            storeId: query.store,
            sensitiveToo: canSeeSensitive(ctx),
        });
        const matches = matchesSql(query.q, query.store);
        const usable = CUSTOMER_CHIPS.filter((c) =>
            CHIP_NEEDS[c].every((a) => allows(ctx, a)),
        );
        const countColumns = usable.map(
            (c) =>
                Prisma.sql`(COUNT(*) FILTER (WHERE ${matches} AND ${chipSql(c, invoicesToo)}))::int AS ${Prisma.raw(`"${c}"`)}`,
        );

        const [rows, [counts], unlinkedPaying, storefronts] = await Promise.all(
            [
                this.db.$queryRaw<PeopleRow[]>`${cte}
                    SELECT m.id, m."firstName", m."lastName", m.email, m.phone,
                        m.account_email, m.orders, m.paid_orders,
                        m.open_orders, m.last_order_at, m.paid_invoices,
                        m.subscriber, m.offers
                    FROM m
                    WHERE ${matches} AND ${chipSql(chip, invoicesToo)}
                    ORDER BY ${orderBySql(sort)}
                    LIMIT ${CUSTOMERS_PAGE_SIZE}
                    OFFSET ${(page - 1) * CUSTOMERS_PAGE_SIZE}`,
                this.db.$queryRaw<Record<string, number>[]>`${cte}
                    SELECT COUNT(*)::int AS everyone, ${Prisma.join(countColumns)}
                    FROM m`,
                this.unlinkedCount(organizationId, query.store),
                sees.orders
                    ? this.db.store.findMany({
                          where: { organizationId },
                          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                          select: { id: true, name: true },
                      })
                    : Promise.resolve(undefined),
            ],
        );

        const ids = rows.map((r) => r.id);
        const [attention, duplicates, spent, lastStores] = await Promise.all([
            attentionFor(ctx, ids, this.db),
            possibleDuplicates(this.db, organizationId, ids),
            sees.spent ? this.spentFor(organizationId, ids) : undefined,
            sees.orders ? this.lastStorefronts(organizationId, ids) : undefined,
        ]);

        const countsOut: CustomerChipCounts = {};
        // COUNT always answers one row.
        for (const c of usable) countsOut[c] = counts[c];

        return {
            rows: rows.map((r) => {
                const read = attention.get(r.id);
                const row: CustomerRow = {
                    contactId: r.id,
                    name: personName(r),
                    email: contactEmailForDisplay(r.email, r.account_email),
                    phone: r.phone,
                    signsIn: r.account_email != null,
                    possibleDuplicate: duplicates.has(r.id),
                    offers: r.offers,
                    attention: (read?.entries ?? []).map((e) => ({
                        kind: e.kind,
                        label: e.label,
                        sensitive: e.sensitive,
                    })),
                    hiddenSensitiveCount: read?.hiddenSensitiveCount ?? 0,
                };
                if (sees.orders) {
                    row.returning =
                        r.paid_orders + (invoicesToo ? r.paid_invoices : 0) >=
                        2;
                    row.orders = {
                        count: r.orders,
                        open: r.open_orders,
                        lastAt: r.last_order_at?.toISOString() ?? null,
                        lastStorefront: lastStores?.get(r.id) ?? null,
                    };
                }
                if (spent) row.spent = spent.get(r.id) ?? [];
                if (sees.subscriptions) row.subscriber = r.subscriber;
                return row;
            }),
            total: countsOut[chip] ?? 0,
            page,
            pageSize: CUSTOMERS_PAGE_SIZE,
            everyone: counts.everyone,
            counts: countsOut,
            unlinkedPaying,
            ...(storefronts ? { storefronts } : {}),
            sees,
            sort,
            chip,
        };
    }

    /**
     * The paying store customers no contact holds (`unlinkedPaying`), a page
     * at a time, each with the contact that holds their email — for the
     * review sheet, where the merchant links them (#120, `POST :contactId/links`).
     */
    async unlinked(
        ctx: OrganizationContext,
        query: ListUnlinkedQueryDto,
    ): Promise<UnlinkedPage> {
        requireCustomerPower(ctx, "contact:read");
        const organizationId = ctx.organizationId;
        // Who paid at a storefront is about orders, as `list`'s filter is.
        if (query.store) {
            requireCustomerPower(ctx, "order:read");
            await this.requireStore(organizationId, query.store);
        }
        const orders = allows(ctx, "order:read");
        const page = query.page ?? 1;
        const cte = unlinkedCte(organizationId, query.store);

        const [rows, total] = await Promise.all([
            this.db.$queryRaw<
                {
                    id: string;
                    firstName: string | null;
                    lastName: string | null;
                    email: string;
                    phone: string | null;
                    storeId: string;
                    paid_orders: number;
                    last_at: Date | null;
                }[]
            >`${cte}
                SELECT u.id, u."firstName", u."lastName", u.email, u.phone,
                    u."storeId", u.paid_orders, u.last_at
                FROM u
                ORDER BY u.last_at DESC NULLS LAST, u.id ASC
                LIMIT ${CUSTOMERS_PAGE_SIZE}
                OFFSET ${(page - 1) * CUSTOMERS_PAGE_SIZE}`,
            this.unlinkedCount(organizationId, query.store),
        ]);

        const storeIds = [...new Set(rows.map((r) => r.storeId))];
        const [stores, holders] = await Promise.all([
            storeIds.length
                ? this.db.store.findMany({
                      where: { organizationId, id: { in: storeIds } },
                      select: { id: true, name: true },
                  })
                : Promise.resolve([]),
            this.holders(
                organizationId,
                rows.map((r) => r.email),
            ),
        ]);
        const storeById = new Map(stores.map((s) => [s.id, s]));

        return {
            rows: rows.map((r) => {
                const email = normaliseEmail(r.email);
                const out: UnlinkedCustomer = {
                    customerId: r.id,
                    name: personName(r),
                    email: isReservedContactEmail(r.email) ? null : r.email,
                    phone: r.phone,
                    storefront: storeById.get(r.storeId) ?? null,
                    holder: (email ? holders.get(email) : undefined) ?? null,
                };
                if (orders) {
                    out.paidOrders = r.paid_orders;
                    out.lastPaidOrderAt = r.last_at?.toISOString() ?? null;
                }
                return out;
            }),
            total,
            page,
            pageSize: CUSTOMERS_PAGE_SIZE,
        };
    }

    private async unlinkedCount(
        organizationId: string,
        storeId?: string,
    ): Promise<number> {
        const [row] = await this.db.$queryRaw<{ n: number }[]>`${unlinkedCte(
            organizationId,
            storeId,
        )}
            SELECT COUNT(*)::int AS n FROM u`;
        return row.n;
    }

    private async requireStore(
        organizationId: string,
        storeId: string,
    ): Promise<void> {
        const store = await this.db.store.findFirst({
            where: { id: storeId, organizationId },
            select: { id: true },
        });
        if (!store) throw new NotFoundException("Storefront not found");
    }

    /** "Spent" per contact and currency, by the rule Customer Detail reads. */
    private async spentFor(
        organizationId: string,
        contactIds: string[],
    ): Promise<Map<string, MoneyTotal[]>> {
        const out = new Map<string, MoneyTotal[]>();
        if (contactIds.length === 0) return out;
        const rows = await this.db.$queryRaw<
            {
                contactId: string;
                currency: string;
                amount: { toString(): string } | null;
            }[]
        >`SELECT s."contactId", s.currency, SUM(s.amount) AS amount
            FROM (${spentRowsSql(organizationId, contactIds)}) s
            GROUP BY s."contactId", s.currency`;
        const by = new Map<
            string,
            { currency: string; amount: { toString(): string } | null }[]
        >();
        for (const r of rows) {
            const list = by.get(r.contactId) ?? [];
            list.push(r);
            by.set(r.contactId, list);
        }
        for (const [id, list] of by) out.set(id, totals(list));
        return out;
    }

    /** Where each contact's latest order was placed. */
    private async lastStorefronts(
        organizationId: string,
        contactIds: string[],
    ): Promise<Map<string, { id: string; name: string }>> {
        const out = new Map<string, { id: string; name: string }>();
        if (contactIds.length === 0) return out;
        const rows = await this.db.$queryRaw<
            { contactId: string; id: string; name: string }[]
        >`SELECT DISTINCT ON (l."contactId") l."contactId", s.id, s.name
            FROM "CustomerIdentityLink" l
            JOIN "Order" o ON o."customerId" = l."customerId"
            JOIN "Store" s ON s.id = o."storeId"
            WHERE l."organizationId" = ${organizationId}
              AND l."contactId" = ANY(${contactIds}::text[])
              AND o."organizationId" = ${organizationId}
              AND NOT (o."placedOnline" AND o."paymentStatus" = 'UNPAID')
            ORDER BY l."contactId", o."createdAt" DESC, o.id DESC`;
        for (const r of rows) out.set(r.contactId, { id: r.id, name: r.name });
        return out;
    }

    /**
     * The contact holding each email: its own, or its live site account's.
     * Keyed by the normalised email.
     */
    private async holders(
        organizationId: string,
        rawEmails: string[],
    ): Promise<
        Map<
            string,
            { contactId: string; name: string | null; email: string | null }
        >
    > {
        const out = new Map<
            string,
            { contactId: string; name: string | null; email: string | null }
        >();
        const emails = [
            ...new Set(
                rawEmails
                    .map((e) => normaliseEmail(e))
                    .filter((e): e is string => e != null),
            ),
        ];
        if (emails.length === 0) return out;
        const contacts = await this.db.contact.findMany({
            where: {
                organizationId,
                OR: [
                    ...emails.map((email) => ({
                        email: { equals: email, mode: "insensitive" as const },
                    })),
                    {
                        customerAccounts: {
                            some: {
                                email: { in: emails },
                                status: { in: ["ACTIVE", "BLOCKED"] },
                            },
                        },
                    },
                ],
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                customerAccounts: {
                    where: { status: { in: ["ACTIVE", "BLOCKED"] } },
                    select: { email: true },
                },
            },
        });
        const views = contacts.map((c) => {
            const account = c.customerAccounts[0]?.email ?? null;
            return {
                own: normaliseEmail(c.email),
                account: normaliseEmail(account),
                view: {
                    contactId: c.id,
                    name: personName(c),
                    email: contactEmailForDisplay(c.email, account),
                },
            };
        });
        // The contact whose own email it is holds it first; one holding it
        // only through its site account (a separate contact, DEC-049) comes
        // second. Oldest, then id, breaks a tie, so the answer never changes
        // between two reads.
        for (const pass of ["own", "account"] as const) {
            for (const v of views) {
                const key = v[pass];
                if (key && emails.includes(key) && !out.has(key)) {
                    out.set(key, v.view);
                }
            }
        }
        return out;
    }
}
