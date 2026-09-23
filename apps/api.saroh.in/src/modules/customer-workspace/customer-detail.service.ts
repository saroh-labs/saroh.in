import {
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { InvoiceStanding } from "../invoices/invoice-state";
import {
    invoiceStanding,
    isPastDue,
    NOT_A_BOOKING_HOLD,
    OWED_WHERE,
} from "../invoices/invoice-state";
import { allows, authorize } from "../organizations/organization-policy";
import type { ContactNoteView } from "./contact-notes.service";
import { loadContactNotes, notedAllergens } from "./contact-notes.service";

/**
 * One read of a customer (U8, R17), rooted on the CRM contact — the record
 * every business kind has; a gym has no store customers.
 *
 * What the contact holds is read on the contact itself: bookings,
 * subscriptions, invoices, class packs and notes. Orders come only from
 * store customers joined to it by a CONFIRMED `CustomerIdentityLink` — a
 * person linked them. A store customer that merely shares the email is
 * returned as a possible match (id, name, storefront) and contributes
 * nothing else: no orders, no totals (saroh-product: never merge people,
 * never claim they are unified).
 *
 * ## Shape
 *
 * A block the viewer may not read — or whose module is off — is ABSENT. A
 * block that could not be read is `null` and named in `unavailable`; the rest
 * still come back (saroh-product-states: an aggregate degrades per source).
 * Each block says where its rows came from (`from`).
 *
 * ## Money
 *
 * Money figures go only to a role that may read the merchant's money
 * (`invoice:read` and `payment:read`, ADR-008): spent, owed, prices and
 * totals are left OUT for anyone else, not sent for the screen to hide. The
 * invoices and subscriptions blocks are money and need it too.
 *
 * "Spent" counts each rupee once: paid orders plus paid invoices that are not
 * an order's own invoice (ADR-008). Owed is unpaid issued invoices, again
 * leaving order invoices out — the order is the ledger for its own payment.
 */

/** A source of the read, as the merchant would name it when it is missing. */
export type DetailSource =
    | "notes"
    | "linkedCustomers"
    | "possibleMatches"
    | "orders"
    | "bookings"
    | "subscriptions"
    | "invoices"
    | "packs";

export interface DetailUnavailable {
    source: DetailSource;
    label: string;
}

const LABELS: Record<DetailSource, string> = {
    notes: "Notes",
    linkedCustomers: "Linked store customers",
    possibleMatches: "Possible matches",
    orders: "Orders",
    bookings: "Bookings",
    subscriptions: "Subscriptions",
    invoices: "Invoices",
    packs: "Class packs",
};

/** Kept per currency; amounts in different currencies are never added. */
export interface MoneyTotal {
    currency: string;
    amount: string;
}

export interface Storefront {
    id: string;
    name: string;
}

export interface LinkedCustomer {
    linkId: string;
    customerId: string;
    name: string;
    email: string;
    storefront: Storefront;
    linkedAt: string;
}

/** An exact-email store customer nobody has linked: named, nothing more. */
export interface PossibleMatch {
    customerId: string;
    name: string;
    storefront: Storefront;
}

export interface DetailOrder {
    id: string;
    number: string;
    placedAt: string;
    status: string;
    paymentStatus: string;
    itemCount: number;
    /** Money only — absent for a viewer who reads no money. */
    total?: string;
    currency?: string;
    /** The linked store customer this order came through. */
    via: { customerId: string; storefront: Storefront };
}

export interface DetailBooking {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    service: { id: string; name: string };
    status: string;
    outcome: string | null;
    /** Paid with a class pack (a redemption not given back). */
    paidWithPack: boolean;
}

export interface DetailSubscription {
    id: string;
    plan: { id: string; name: string };
    status: string;
    interval: string;
    price: string;
    currency: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    /** When the next charge falls; null when none will (paused, cancelling). */
    nextChargeAt: string | null;
    cancelAtPeriodEnd: boolean;
    pausedAt: string | null;
    cancelledAt: string | null;
}

export interface DetailInvoice {
    id: string;
    number: string | null;
    status: string;
    standing: InvoiceStanding;
    source: string;
    /** INVOICE | CREDIT_NOTE | SUPPLEMENTARY (ADR-008). */
    kind: string;
    /** Set on an order's paper: it is counted on the order, not here. */
    orderId: string | null;
    total: string;
    currency: string;
    issuedAt: string | null;
    dueAt: string | null;
    paidAt: string | null;
}

export interface DetailPack {
    id: string;
    pack: { id: string; name: string };
    credits: number;
    used: number;
    left: number;
    /** Use-by: the classes left lapse after this. */
    expiresAt: string;
    standing: "ACTIVE" | "USED_UP" | "EXPIRED";
    /** Money only. */
    price?: string;
    currency?: string;
}

export interface DetailStats {
    orders?: number | null;
    bookings?: number | null;
    attended?: number | null;
    noShows?: number | null;
    /**
     * Cancelled after the free-cancellation window. Null until bookings
     * record it (U3 adds the rule and the record); the screen shows no figure
     * rather than a zero that is not known.
     */
    lateCancels?: number | null;
    classesLeft?: {
        total: number;
        /** Unexpired pack classes. */
        packs: number;
        /**
         * What a membership's monthly allowance leaves this month. Null until
         * plans carry an allowance (U3: `SubscriptionPlan.classesPerMonth`).
         */
        membership: number | null;
        /** The soonest use-by among packs with classes left. */
        nextExpiry: string | null;
    } | null;
    spent?: MoneyTotal[] | null;
    owed?: {
        totals: MoneyTotal[];
        unpaidCount: number;
        overdueCount: number;
    } | null;
}

export interface CustomerDetail {
    contact: {
        id: string;
        name: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        phone: string | null;
        company: string | null;
        source: string | null;
        createdAt: string;
    };
    /** Whether money figures were included for this viewer. */
    money: boolean;
    stats: DetailStats;
    notes: { from: "contact"; rows: ContactNoteView[] } | null;
    /** Every allergen the notes name, once — what Order Detail matches on. */
    allergens: { id: string; name: string }[] | null;
    linkedCustomers?: LinkedCustomer[] | null;
    possibleMatches?: PossibleMatch[] | null;
    orders?: { from: "linked-customers"; rows: DetailOrder[] } | null;
    bookings?: {
        from: "contact";
        upcoming: DetailBooking[];
        past: DetailBooking[];
    } | null;
    subscriptions?: { from: "contact"; rows: DetailSubscription[] } | null;
    invoices?: { from: "contact"; rows: DetailInvoice[] } | null;
    packs?: { from: "contact"; rows: DetailPack[] } | null;
    unavailable: DetailUnavailable[];
}

/** How many rows a list block carries; counts in `stats` are the true totals. */
const ROWS = 50;
const UPCOMING = 20;
const PAST = 30;

/**
 * The invoices that are an order's own (ADR-008) — and credit notes — are
 * left out of spent and owed: the order already counts that money, so a sum
 * that took them too would count each rupee twice.
 */
const NOT_AN_ORDER_INVOICE = OWED_WHERE;

/**
 * Whose invoices these are: billed to the contact, and the invoices of
 * orders placed through a store customer linked to it (ADR-008) — its
 * orders' paper, listed with the rest but counted once, on the order.
 */
function invoicesOf(
    organizationId: string,
    contactId: string,
    linkedCustomerIds: readonly string[] = [],
) {
    return linkedCustomerIds.length > 0
        ? {
              organizationId,
              OR: [
                  { contactId },
                  { order: { customerId: { in: [...linkedCustomerIds] } } },
              ],
          }
        : { organizationId, contactId };
}

/** Add per currency, in minor units. */
class Purse {
    private readonly byCurrency = new Map<string, number>();

    add(currency: string, amount: { toString(): string } | null): void {
        if (amount === null) return;
        this.byCurrency.set(
            currency,
            (this.byCurrency.get(currency) ?? 0) + toMinor(amount),
        );
    }

    totals(): MoneyTotal[] {
        return [...this.byCurrency.entries()]
            .filter(([, minor]) => minor !== 0)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, minor]) => ({
                currency,
                amount: fromMinor(minor),
            }));
    }
}

function personName(p: {
    firstName: string | null;
    lastName: string | null;
    email: string;
}): string {
    return (
        [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.email
    );
}

@Injectable()
export class CustomerDetailService {
    private readonly logger = new Logger(CustomerDetailService.name);

    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    async detail(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<CustomerDetail> {
        authorize(ctx, "contact:read");
        const organizationId = ctx.organizationId;

        // NOT guarded: without the contact there is no page, and a contact in
        // another organization is a 404.
        const contact = await this.db.contact.findFirst({
            where: { id: contactId, organizationId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                company: true,
                source: true,
                createdAt: true,
            },
        });
        if (!contact) throw new NotFoundException("Contact not found");

        // NOT guarded either, as on Home: availability decides which blocks
        // may exist at all, and guessing could show a module that is off.
        const views = await this.availability.listViews({
            organizationId,
            organizationRole: ctx.role,
            organizationActions: ctx.actions,
        });
        const on = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );

        const money =
            allows(ctx, "invoice:read") && allows(ctx, "payment:read");
        const commerce = on.has("COMMERCE");
        const wants = {
            orders: commerce && allows(ctx, "order:read"),
            bookings: on.has("APPOINTMENTS") && allows(ctx, "booking:read"),
            packs: on.has("APPOINTMENTS") && allows(ctx, "pack:read"),
            subscriptions:
                on.has("PAYMENTS") && money && allows(ctx, "subscription:read"),
            invoices: on.has("PAYMENTS") && money,
        };

        const unavailable: DetailUnavailable[] = [];
        const attempt = <T>(source: DetailSource, read: () => Promise<T>) =>
            this.attempt(source, read, unavailable);
        const skip = Promise.resolve(undefined);

        // Links first: orders and possible matches both depend on them.
        const links = commerce
            ? await attempt("linkedCustomers", () =>
                  this.readLinks(organizationId, contactId),
              )
            : undefined;

        const [
            notes,
            possibleMatches,
            orders,
            bookings,
            subscriptions,
            invoices,
            packs,
        ] = await Promise.all([
            attempt("notes", () =>
                loadContactNotes(this.db, organizationId, contactId),
            ),
            links === undefined
                ? skip
                : links === null
                  ? this.missing("possibleMatches", unavailable)
                  : attempt("possibleMatches", () =>
                        this.readPossibleMatches(
                            organizationId,
                            contact.email,
                            links.map((l) => l.customerId),
                        ),
                    ),
            !wants.orders
                ? skip
                : links === null || links === undefined
                  ? this.missing("orders", unavailable)
                  : attempt("orders", () =>
                        this.readOrders(organizationId, links, money),
                    ),
            wants.bookings
                ? attempt("bookings", () =>
                      this.readBookings(organizationId, contactId),
                  )
                : skip,
            wants.subscriptions
                ? attempt("subscriptions", () =>
                      this.readSubscriptions(organizationId, contactId),
                  )
                : skip,
            wants.invoices
                ? attempt("invoices", () =>
                      this.readInvoices(
                          organizationId,
                          contactId,
                          links?.map((l) => l.customerId) ?? [],
                      ),
                  )
                : skip,
            wants.packs
                ? attempt("packs", () =>
                      this.readPacks(organizationId, contactId, money),
                  )
                : skip,
        ]);

        const stats: DetailStats = {};
        if (wants.orders) stats.orders = orders ? orders.count : null;
        if (wants.bookings) {
            stats.bookings = bookings ? bookings.counts.bookings : null;
            stats.attended = bookings ? bookings.counts.attended : null;
            stats.noShows = bookings ? bookings.counts.noShows : null;
            stats.lateCancels = null;
        }
        if (wants.packs) {
            stats.classesLeft = packs
                ? {
                      total: packs.classesLeft,
                      packs: packs.classesLeft,
                      membership: null,
                      nextExpiry: packs.nextExpiry,
                  }
                : null;
        }
        if (money) {
            // A total with a missing part is not the total: null, and the
            // source that failed is already named.
            const spentKnown =
                (!wants.orders || orders !== null) &&
                (!wants.invoices || invoices !== null);
            if (spentKnown) {
                const purse = new Purse();
                for (const t of orders?.paid ?? [])
                    purse.add(t.currency, t.sum);
                for (const t of invoices?.paid ?? [])
                    purse.add(t.currency, t.sum);
                stats.spent = purse.totals();
            } else {
                stats.spent = null;
            }
            if (wants.invoices) stats.owed = invoices ? invoices.owed : null;
        }

        const noteRows = notes ?? null;
        return {
            contact: {
                id: contact.id,
                name: personName(contact),
                firstName: contact.firstName,
                lastName: contact.lastName,
                email: contact.email,
                phone: contact.phone,
                company: contact.company,
                source: contact.source,
                createdAt: contact.createdAt.toISOString(),
            },
            money,
            stats,
            notes: noteRows ? { from: "contact", rows: noteRows } : null,
            allergens: noteRows ? notedAllergens(noteRows) : null,
            ...(links === undefined ? {} : { linkedCustomers: links }),
            ...(possibleMatches === undefined ? {} : { possibleMatches }),
            ...(orders === undefined
                ? {}
                : {
                      orders: orders
                          ? {
                                from: "linked-customers" as const,
                                rows: orders.rows,
                            }
                          : null,
                  }),
            ...(bookings === undefined
                ? {}
                : {
                      bookings: bookings
                          ? {
                                from: "contact" as const,
                                upcoming: bookings.upcoming,
                                past: bookings.past,
                            }
                          : null,
                  }),
            ...(subscriptions === undefined
                ? {}
                : {
                      subscriptions: subscriptions
                          ? { from: "contact" as const, rows: subscriptions }
                          : null,
                  }),
            ...(invoices === undefined
                ? {}
                : {
                      invoices: invoices
                          ? { from: "contact" as const, rows: invoices.rows }
                          : null,
                  }),
            ...(packs === undefined
                ? {}
                : {
                      packs: packs
                          ? { from: "contact" as const, rows: packs.rows }
                          : null,
                  }),
            unavailable,
        };
    }

    /**
     * Read one source; its failure is a named gap, not a dead page (the Home
     * service's pattern). Logged so the operator knows which query failed.
     */
    private async attempt<T>(
        source: DetailSource,
        read: () => Promise<T>,
        unavailable: DetailUnavailable[],
    ): Promise<T | null> {
        try {
            return await read();
        } catch (error) {
            this.logger.error(
                `Customer detail source "${source}" failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            unavailable.push({ source, label: LABELS[source] });
            return null;
        }
    }

    /** A source that cannot be read because one it depends on failed. */
    private missing(
        source: DetailSource,
        unavailable: DetailUnavailable[],
    ): Promise<null> {
        unavailable.push({ source, label: LABELS[source] });
        return Promise.resolve(null);
    }

    private async readLinks(
        organizationId: string,
        contactId: string,
    ): Promise<LinkedCustomer[]> {
        const rows = await this.db.customerIdentityLink.findMany({
            where: { organizationId, contactId },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                createdAt: true,
                customer: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        store: { select: { id: true, name: true } },
                    },
                },
            },
        });
        return rows.map((l) => ({
            linkId: l.id,
            customerId: l.customer.id,
            name: personName(l.customer),
            email: l.customer.email,
            storefront: l.customer.store,
            linkedAt: l.createdAt.toISOString(),
        }));
    }

    /**
     * Store customers with exactly this email that nobody has linked. Only
     * who they are and where — their orders and totals stay theirs until a
     * person links them.
     */
    private async readPossibleMatches(
        organizationId: string,
        email: string,
        linkedIds: string[],
    ): Promise<PossibleMatch[]> {
        const rows = await this.db.customer.findMany({
            where: {
                organizationId,
                email: { equals: email.trim(), mode: "insensitive" },
                ...(linkedIds.length > 0 ? { id: { notIn: linkedIds } } : {}),
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                store: { select: { id: true, name: true } },
            },
        });
        return rows.map((c) => ({
            customerId: c.id,
            name: personName(c),
            storefront: c.store,
        }));
    }

    private async readOrders(
        organizationId: string,
        links: LinkedCustomer[],
        money: boolean,
    ): Promise<{
        rows: DetailOrder[];
        count: number;
        paid: { currency: string; sum: { toString(): string } | null }[];
    }> {
        const customerIds = links.map((l) => l.customerId);
        if (customerIds.length === 0) return { rows: [], count: 0, paid: [] };
        const where = { organizationId, customerId: { in: customerIds } };

        const [rows, count, paid] = await Promise.all([
            this.db.order.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: ROWS,
                select: {
                    id: true,
                    orderId: true,
                    customerId: true,
                    createdAt: true,
                    status: true,
                    paymentStatus: true,
                    total: true,
                    currency: true,
                    store: { select: { id: true, name: true } },
                    _count: { select: { items: true } },
                },
            }),
            this.db.order.count({ where }),
            money
                ? this.db.order.groupBy({
                      by: ["currency"],
                      where: { ...where, paymentStatus: "PAID" },
                      _sum: { total: true },
                  })
                : Promise.resolve([]),
        ]);

        return {
            count,
            paid: paid.map((p) => ({
                currency: p.currency,
                sum: p._sum.total,
            })),
            rows: rows.map((o) => ({
                id: o.id,
                number: o.orderId,
                placedAt: o.createdAt.toISOString(),
                status: o.status,
                paymentStatus: o.paymentStatus,
                itemCount: o._count.items,
                ...(money
                    ? { total: toMoneyString(o.total), currency: o.currency }
                    : {}),
                via: { customerId: o.customerId, storefront: o.store },
            })),
        };
    }

    private async readBookings(organizationId: string, contactId: string) {
        const now = new Date();
        const where = { organizationId, contactId };
        const select = {
            id: true,
            startAt: true,
            endAt: true,
            timezone: true,
            status: true,
            outcome: true,
            service: { select: { id: true, name: true } },
            packRedemption: { select: { reversedAt: true } },
        } as const;
        const [upcoming, past, bookings, attended, noShows] = await Promise.all(
            [
                this.db.booking.findMany({
                    where: { ...where, startAt: { gte: now } },
                    orderBy: { startAt: "asc" },
                    take: UPCOMING,
                    select,
                }),
                this.db.booking.findMany({
                    where: { ...where, startAt: { lt: now } },
                    orderBy: { startAt: "desc" },
                    take: PAST,
                    select,
                }),
                this.db.booking.count({
                    where: { ...where, status: { not: "CANCELLED" } },
                }),
                this.db.booking.count({
                    where: { ...where, outcome: "ATTENDED" },
                }),
                this.db.booking.count({
                    where: { ...where, outcome: "NO_SHOW" },
                }),
            ],
        );
        const view = (b: (typeof upcoming)[number]): DetailBooking => ({
            id: b.id,
            startAt: b.startAt.toISOString(),
            endAt: b.endAt.toISOString(),
            timezone: b.timezone,
            service: b.service,
            status: b.status,
            outcome: b.outcome,
            paidWithPack:
                b.packRedemption !== null &&
                b.packRedemption.reversedAt === null,
        });
        return {
            upcoming: upcoming.map(view),
            past: past.map(view),
            counts: { bookings, attended, noShows },
        };
    }

    private async readSubscriptions(
        organizationId: string,
        contactId: string,
    ): Promise<DetailSubscription[]> {
        const rows = await this.db.customerSubscription.findMany({
            where: { organizationId, contactId },
            orderBy: { createdAt: "desc" },
            take: ROWS,
            select: {
                id: true,
                status: true,
                interval: true,
                price: true,
                currency: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
                pausedAt: true,
                cancelledAt: true,
                plan: { select: { id: true, name: true } },
            },
        });
        return rows.map((s) => ({
            id: s.id,
            plan: s.plan,
            status: s.status,
            interval: s.interval,
            price: toMoneyString(s.price),
            currency: s.currency,
            currentPeriodStart: s.currentPeriodStart.toISOString(),
            currentPeriodEnd: s.currentPeriodEnd.toISOString(),
            nextChargeAt:
                s.status === "ACTIVE" && !s.cancelAtPeriodEnd
                    ? s.currentPeriodEnd.toISOString()
                    : null,
            cancelAtPeriodEnd: s.cancelAtPeriodEnd,
            pausedAt: s.pausedAt?.toISOString() ?? null,
            cancelledAt: s.cancelledAt?.toISOString() ?? null,
        }));
    }

    private async readInvoices(
        organizationId: string,
        contactId: string,
        linkedCustomerIds: readonly string[] = [],
    ) {
        const now = new Date();
        const where = invoicesOf(organizationId, contactId, linkedCustomerIds);
        const [rows, unpaid, paid] = await Promise.all([
            this.db.invoice.findMany({
                where: { ...where, ...NOT_A_BOOKING_HOLD },
                orderBy: { createdAt: "desc" },
                take: ROWS,
                select: {
                    id: true,
                    number: true,
                    status: true,
                    source: true,
                    kind: true,
                    orderId: true,
                    total: true,
                    currency: true,
                    issuedAt: true,
                    dueAt: true,
                    paidAt: true,
                },
            }),
            this.db.invoice.findMany({
                where: { ...where, ...NOT_AN_ORDER_INVOICE, status: "ISSUED" },
                select: {
                    status: true,
                    dueAt: true,
                    total: true,
                    currency: true,
                },
            }),
            this.db.invoice.groupBy({
                by: ["currency"],
                where: { ...where, ...NOT_AN_ORDER_INVOICE, status: "PAID" },
                _sum: { total: true },
            }),
        ]);
        const owed = new Purse();
        let overdueCount = 0;
        for (const r of unpaid) {
            owed.add(r.currency, r.total);
            if (isPastDue(r, now)) overdueCount += 1;
        }
        return {
            rows: rows.map((i): DetailInvoice => ({
                id: i.id,
                number: i.number,
                status: i.status,
                standing: invoiceStanding(i, now),
                source: i.source,
                kind: i.kind,
                orderId: i.orderId,
                total: toMoneyString(i.total),
                currency: i.currency,
                issuedAt: i.issuedAt?.toISOString() ?? null,
                dueAt: i.dueAt?.toISOString() ?? null,
                paidAt: i.paidAt?.toISOString() ?? null,
            })),
            owed: {
                totals: owed.totals(),
                unpaidCount: unpaid.length,
                overdueCount,
            },
            paid: paid.map((p) => ({
                currency: p.currency,
                sum: p._sum.total,
            })),
        };
    }

    private async readPacks(
        organizationId: string,
        contactId: string,
        money: boolean,
    ) {
        const now = new Date();
        const rows = await this.db.packPurchase.findMany({
            where: { organizationId, contactId },
            orderBy: { createdAt: "desc" },
            take: ROWS,
            select: {
                id: true,
                credits: true,
                price: true,
                currency: true,
                expiresAt: true,
                pack: { select: { id: true, name: true } },
                _count: {
                    select: { redemptions: { where: { reversedAt: null } } },
                },
            },
        });
        let classesLeft = 0;
        let nextExpiry: Date | null = null;
        const views = rows.map((p): DetailPack => {
            const used = p._count.redemptions;
            const left = Math.max(0, p.credits - used);
            const expired = p.expiresAt <= now;
            if (!expired && left > 0) {
                classesLeft += left;
                if (!nextExpiry || p.expiresAt < nextExpiry)
                    nextExpiry = p.expiresAt;
            }
            return {
                id: p.id,
                pack: p.pack,
                credits: p.credits,
                used,
                left,
                expiresAt: p.expiresAt.toISOString(),
                standing: expired
                    ? "EXPIRED"
                    : left === 0
                      ? "USED_UP"
                      : "ACTIVE",
                ...(money
                    ? { price: toMoneyString(p.price), currency: p.currency }
                    : {}),
            };
        });
        return {
            rows: views,
            classesLeft,
            nextExpiry: (nextExpiry as Date | null)?.toISOString() ?? null,
        };
    }
}
