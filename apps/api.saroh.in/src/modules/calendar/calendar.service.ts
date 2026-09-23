import {
    BadRequestException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { ZoneSource } from "../bookings/staff-availability";
import { businessZone } from "../bookings/staff-availability";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { isPastDue } from "../invoices/invoice-state";
import { allows, authorize } from "../organizations/organization-policy";
import { dateKey } from "../subscriptions/collections";
import type {
    CalendarDay,
    DatedItem,
    LayerKey,
    MoneyTotal,
    TakingEntry,
    ToActOn,
} from "./month";
import {
    buildDays,
    dayOf,
    isMonth,
    LAYER_LABELS,
    LAYERS,
    mergeToActOn,
    monthWindow,
    sumMoney,
} from "./month";
import { collectionsInMonth, upcomingRenewals } from "./schedules";

/**
 * The Business Calendar's month (plan 2026-09-23-003, U4, R8, R18): one
 * read of everything dated — orders, collections, subscription renewals and
 * their failures and ends, invoices due, overdue and paid, bookings and
 * classes — per day, with what needs acting on and what was taken.
 *
 * ## Layers
 *
 * A layer exists only when its module is on (not DISABLED — the same rule
 * the rail and Home use) and the viewer may read it: orders `order:read`;
 * collections and subscriptions `subscription:read`; invoices
 * `invoice:read`; bookings and classes `booking:read`. A Member therefore
 * gets bookings and classes and nothing billed (DEC-020) — the layers are
 * absent, not an error.
 *
 * ## Degrading
 *
 * Each layer is read on its own (Home's per-source pattern): a layer whose
 * read throws is named in `unavailable` and the others still come back. A
 * total with a missing part is not the total, so takings go null when a
 * source they add up failed.
 *
 * ## Money
 *
 * Takings go only to a role that reads the merchant's money (`payment:read`
 * and `invoice:read`, ADR-008), and count each rupee once: paid orders plus
 * paid invoices that are not an order's own (ADR-008: every order has one).
 * Order amounts need `payment:read`; subscription and invoice amounts ride
 * with their own reads.
 *
 * The Invoices layer is the paper that has no other layer: an order's own
 * invoice is its order, and a renewal's charge is its renewal on the
 * Subscriptions layer (when that layer is shown). Listing them again would
 * say the day held twice as much.
 *
 * ## Days
 *
 * Days are local dates in the business's zone — `BusinessProfile.timezone`,
 * else the first active service's, else Asia/Kolkata — and the response
 * names the zone it used. Collections are dated in the subscription's own
 * zone, which is the business's for every subscription it sold.
 */

export interface CalendarUnavailable {
    /** A layer, or `takings` when only the takings could not be added up. */
    source: LayerKey | "takings";
    label: string;
}

export interface CalendarMonth {
    month: string;
    timezone: string;
    timezoneSource: ZoneSource;
    /** The month's first and after-last instants in that zone. */
    from: string;
    to: string;
    /** The layers this viewer gets, in order. */
    layers: LayerKey[];
    /** The whole month's count per layer (null: the layer could not be read). */
    totals: Partial<Record<LayerKey, number | null>>;
    days: CalendarDay[];
    /** Failed renewals and overdue invoices dated this month, each once. */
    toActOn: ToActOn[];
    /**
     * Money only (absent otherwise). `lead` is the layer the takings bar sits
     * under; `total` is null when a source could not be read.
     */
    takings?: { lead: LayerKey | null; total: MoneyTotal[] | null };
    unavailable: CalendarUnavailable[];
}

/**
 * An invoice that is an order's own (ADR-008) is left out of the takings and
 * the Invoices layer — the order already counts that money, and the order is
 * the ledger for its payment.
 */
function isAnOrdersOwn(invoice: { orderId: string | null }): boolean {
    return invoice.orderId !== null;
}

/** What {@link collectionsInMonth} and {@link upcomingRenewals} read. */
const scheduleSelect = {
    status: true,
    interval: true,
    timezone: true,
    anchorAt: true,
    createdAt: true,
    currentPeriodEnd: true,
    cancelAtPeriodEnd: true,
    pausedAt: true,
    cancelledAt: true,
    collectionWeekday: true,
} as const;

/** Which layer leads the takings bar: what the business mostly does. */
const LEAD_ORDER: LayerKey[] = [
    "orders",
    "bookings",
    "classes",
    "collections",
    "subscriptions",
    "invoices",
];

function personName(
    p: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null,
): string | null {
    if (!p) return null;
    const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    const email = p.email?.trim();
    if (email) return email;
    return null;
}

/** Who a booking is for: its contact, else what the booker typed. */
function bookerLabel(b: {
    contact: Parameters<typeof personName>[0];
    bookerName: string | null;
    bookerEmail: string | null;
}): string {
    const contact = personName(b.contact);
    if (contact) return contact;
    const typed = b.bookerName?.trim();
    if (typed) return typed;
    if (b.bookerEmail) return b.bookerEmail;
    return "Booking";
}

type Unavailable = CalendarUnavailable[];

@Injectable()
export class CalendarService {
    private readonly logger = new Logger(CalendarService.name);

    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    async month(
        ctx: OrganizationContext,
        month: string,
        now: Date = new Date(),
    ): Promise<CalendarMonth> {
        authorize(ctx, "org:read");
        if (!isMonth(month)) {
            throw new BadRequestException("month must be YYYY-MM.");
        }
        const organizationId = ctx.organizationId;

        // NOT guarded: without the zone there are no days, and without
        // availability no layer may be shown (Home's rule).
        const [zone, views] = await Promise.all([
            businessZone(this.db, organizationId),
            this.availability.listViews({
                organizationId,
                organizationRole: ctx.role,
                organizationActions: ctx.actions,
            }),
        ]);
        const on = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );
        const window = monthWindow(month, zone.zone);

        const money =
            allows(ctx, "payment:read") && allows(ctx, "invoice:read");
        const orderAmounts = allows(ctx, "payment:read");
        const sees: Record<LayerKey, boolean> = {
            orders: on.has("COMMERCE") && allows(ctx, "order:read"),
            collections: on.has("PAYMENTS") && allows(ctx, "subscription:read"),
            subscriptions:
                on.has("PAYMENTS") && allows(ctx, "subscription:read"),
            invoices: on.has("PAYMENTS") && allows(ctx, "invoice:read"),
            bookings: on.has("APPOINTMENTS") && allows(ctx, "booking:read"),
            classes: on.has("APPOINTMENTS") && allows(ctx, "booking:read"),
        };
        const layers = LAYERS.filter((l) => sees[l]);
        // Orders are read for the takings too, where the layer is not shown.
        const readOrders = on.has("COMMERCE") && (sees.orders || money);
        const readInvoices = sees.invoices;

        const unavailable: Unavailable = [];
        const attempt = <T>(
            source: LayerKey,
            wanted: boolean,
            read: () => Promise<T>,
        ): Promise<T | null | undefined> =>
            wanted
                ? this.attempt(source, read, unavailable, sees[source])
                : Promise.resolve(undefined);

        const [
            orders,
            collections,
            subscriptions,
            invoices,
            bookings,
            classes,
        ] = await Promise.all([
            attempt("orders", readOrders, () =>
                this.readOrders(
                    organizationId,
                    window,
                    zone.zone,
                    orderAmounts,
                ),
            ),
            attempt("collections", sees.collections, () =>
                this.readCollections(organizationId, window),
            ),
            attempt("subscriptions", sees.subscriptions, () =>
                this.readSubscriptions(organizationId, window, zone.zone, now),
            ),
            attempt("invoices", readInvoices, () =>
                this.readInvoices(
                    organizationId,
                    window,
                    zone.zone,
                    now,
                    sees.subscriptions,
                ),
            ),
            attempt("bookings", sees.bookings, () =>
                this.readBookings(organizationId, window, zone.zone),
            ),
            attempt("classes", sees.classes, () =>
                this.readClasses(organizationId, window, zone.zone),
            ),
        ]);

        const items: DatedItem[] = [
            ...(sees.orders ? (orders?.items ?? []) : []),
            ...(collections ?? []),
            ...(subscriptions?.items ?? []),
            ...(invoices?.items ?? []),
            ...(bookings ?? []),
            ...(classes ?? []),
        ];

        const toActOn = mergeToActOn(
            subscriptions?.failed ?? [],
            invoices?.overdue ?? [],
        );

        // Takings: every source they add up must have answered.
        let takings: TakingEntry[] | null = null;
        let takingsKnown = false;
        if (money) {
            takingsKnown =
                (!readOrders || orders !== null) &&
                (!readInvoices || invoices !== null);
            if (takingsKnown) {
                takings = [
                    ...(orders?.takings ?? []),
                    ...(invoices?.takings ?? []),
                ];
            } else if (!sees.orders && orders === null) {
                // The orders read only fed the takings: name what is missing.
                unavailable.push({ source: "takings", label: "Takings" });
            }
        }

        const failed = new Set(unavailable.map((u) => u.source));
        const totals: Partial<Record<LayerKey, number | null>> = {};
        for (const layer of layers) {
            totals[layer] = failed.has(layer)
                ? null
                : items.filter((i) => i.layer === layer).length;
        }

        return {
            month,
            timezone: zone.zone,
            timezoneSource: zone.source,
            from: window.start.toISOString(),
            to: window.end.toISOString(),
            layers,
            totals,
            days: buildDays({
                days: window.days,
                layers,
                items,
                toActOn,
                takings,
            }),
            toActOn,
            ...(money
                ? {
                      takings: {
                          lead: LEAD_ORDER.find((l) => sees[l]) ?? null,
                          total: takingsKnown ? sumMoney(takings ?? []) : null,
                      },
                  }
                : {}),
            unavailable,
        };
    }

    /**
     * Read one layer; its failure is a named gap, not a dead page (Home's
     * pattern). A read made only for the takings is not named here — the
     * takings are, by the caller.
     */
    private async attempt<T>(
        source: LayerKey,
        read: () => Promise<T>,
        unavailable: Unavailable,
        shown: boolean,
    ): Promise<T | null> {
        try {
            return await read();
        } catch (error) {
            this.logger.error(
                `Calendar layer "${source}" failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            if (shown) {
                unavailable.push({ source, label: LAYER_LABELS[source] });
            }
            return null;
        }
    }

    private async readOrders(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        amounts: boolean,
    ): Promise<{ items: DatedItem[]; takings: TakingEntry[] }> {
        const rows = await this.db.order.findMany({
            where: {
                organizationId,
                createdAt: { gte: window.start, lt: window.end },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                orderId: true,
                status: true,
                paymentStatus: true,
                total: true,
                currency: true,
                createdAt: true,
                customer: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        });
        return {
            items: rows.map((o) => ({
                layer: "orders" as const,
                date: dayOf(o.createdAt, zone),
                item: {
                    id: o.id,
                    kind: o.status === "CANCELLED" ? "cancelled" : "placed",
                    title: o.orderId,
                    subtitle: personName(o.customer),
                    at: o.createdAt.toISOString(),
                    ...(amounts
                        ? {
                              amount: toMoneyString(o.total),
                              currency: o.currency,
                          }
                        : {}),
                    link: { type: "order" as const, id: o.id },
                },
            })),
            takings: rows
                .filter((o) => o.paymentStatus === "PAID")
                .map((o) => ({
                    date: dayOf(o.createdAt, zone),
                    currency: o.currency,
                    amount: o.total,
                })),
        };
    }

    /**
     * Collections dated by each subscription's collection weekday
     * (`subscriptions/collections.ts`), skips left out.
     */
    private async readCollections(
        organizationId: string,
        window: { start: Date; end: Date; days: string[] },
    ): Promise<DatedItem[]> {
        const subs = await this.db.customerSubscription.findMany({
            where: {
                organizationId,
                collectionWeekday: { not: null },
                createdAt: { lt: window.end },
                OR: [
                    { status: { in: ["ACTIVE", "PAUSED"] } },
                    { cancelledAt: { gte: window.start } },
                ],
            },
            select: {
                ...scheduleSelect,
                id: true,
                collectionNote: true,
                plan: { select: { name: true } },
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
                skips: {
                    // A day either side: the dates are local to the
                    // subscription, the window is the business's.
                    where: {
                        date: {
                            gte: new Date(window.start.getTime() - 86_400_000),
                            lt: new Date(window.end.getTime() + 86_400_000),
                        },
                    },
                    select: { date: true },
                },
            },
        });
        return subs.flatMap((s) => {
            const skipped = new Set(s.skips.map((k) => dateKey(k.date)));
            const who = personName(s.contact) ?? "Customer";
            return collectionsInMonth(s, window.days, skipped).map((date) => ({
                layer: "collections" as const,
                date,
                item: {
                    id: `${s.id}@${date}`,
                    kind: "collection",
                    title: who,
                    subtitle: s.collectionNote ?? s.plan.name,
                    at: null,
                    link: { type: "subscription" as const, id: s.id },
                },
            }));
        });
    }

    /**
     * Renewals (charges raised this month, and those still to come), failed
     * renewals (a renewal charge unpaid past its due date, on the day it fell
     * due) and ends (cancelled this month, or set to end with a period ending
     * this month).
     *
     * Resumes are not dated: nothing records when a pause ended, so the
     * calendar does not guess.
     */
    private async readSubscriptions(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        now: Date,
    ): Promise<{
        items: DatedItem[];
        failed: (ToActOn & { invoiceId: string })[];
    }> {
        const between = { gte: window.start, lt: window.end };
        const [subs, charges] = await Promise.all([
            this.db.customerSubscription.findMany({
                where: {
                    organizationId,
                    OR: [
                        { status: "ACTIVE" },
                        { cancelledAt: between },
                        {
                            cancelAtPeriodEnd: true,
                            currentPeriodEnd: between,
                        },
                    ],
                },
                select: {
                    ...scheduleSelect,
                    id: true,
                    price: true,
                    currency: true,
                    plan: { select: { name: true } },
                    contact: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            }),
            this.db.invoice.findMany({
                where: {
                    organizationId,
                    source: "SUBSCRIPTION",
                    status: { in: ["ISSUED", "PAID"] },
                    subscriptionId: { not: null },
                    OR: [
                        { periodStart: between },
                        { status: "ISSUED", dueAt: between },
                    ],
                },
                select: {
                    id: true,
                    number: true,
                    status: true,
                    total: true,
                    currency: true,
                    dueAt: true,
                    periodStart: true,
                    subscription: {
                        select: {
                            id: true,
                            status: true,
                            plan: { select: { name: true } },
                            contact: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);

        const items: DatedItem[] = [];
        const failed: (ToActOn & { invoiceId: string })[] = [];
        const raised = new Set<string>();
        const inMonth = (at: Date) => at >= window.start && at < window.end;

        for (const c of charges) {
            const sub = c.subscription;
            if (!sub) continue;
            const who = personName(sub.contact) ?? "Customer";
            const amount = {
                amount: toMoneyString(c.total),
                currency: c.currency,
            };
            if (c.periodStart && inMonth(c.periodStart)) {
                const date = dayOf(c.periodStart, zone);
                raised.add(`${sub.id}@${date}`);
                items.push({
                    layer: "subscriptions",
                    date,
                    item: {
                        id: `${c.id}:renewal`,
                        kind: "renewal",
                        title: who,
                        subtitle: sub.plan.name,
                        at: c.periodStart.toISOString(),
                        ...amount,
                        link: { type: "subscription", id: sub.id },
                    },
                });
            }
            // Payment failed: the rule `failedCharge` uses — unpaid past
            // due, on a subscription that has not been cancelled.
            if (
                c.dueAt &&
                inMonth(c.dueAt) &&
                sub.status !== "CANCELLED" &&
                isPastDue(c, now)
            ) {
                const date = dayOf(c.dueAt, zone);
                items.push({
                    layer: "subscriptions",
                    date,
                    item: {
                        id: `${c.id}:failed`,
                        kind: "failed",
                        title: who,
                        subtitle: sub.plan.name,
                        at: c.dueAt.toISOString(),
                        ...amount,
                        link: { type: "subscription", id: sub.id },
                    },
                });
                failed.push({
                    invoiceId: c.id,
                    kind: "renewal_failed",
                    date,
                    title: who,
                    subtitle: `${sub.plan.name} — renewal not paid`,
                    ...amount,
                    link: { type: "subscription", id: sub.id },
                });
            }
        }

        for (const s of subs) {
            const who = personName(s.contact) ?? "Customer";
            const price = {
                amount: toMoneyString(s.price),
                currency: s.currency,
            };
            for (const at of upcomingRenewals(s, window.start, window.end)) {
                const date = dayOf(at, zone);
                if (raised.has(`${s.id}@${date}`)) continue;
                items.push({
                    layer: "subscriptions",
                    date,
                    item: {
                        id: `${s.id}@${date}:renewal`,
                        kind: "renewal",
                        title: who,
                        subtitle: s.plan.name,
                        at: at.toISOString(),
                        ...price,
                        link: { type: "subscription", id: s.id },
                    },
                });
            }
            const endsAt =
                s.status === "CANCELLED"
                    ? s.cancelledAt
                    : s.cancelAtPeriodEnd
                      ? s.currentPeriodEnd
                      : null;
            if (endsAt && inMonth(endsAt)) {
                items.push({
                    layer: "subscriptions",
                    date: dayOf(endsAt, zone),
                    item: {
                        id: `${s.id}:ended`,
                        kind: "ended",
                        title: who,
                        subtitle: s.plan.name,
                        at: endsAt.toISOString(),
                        link: { type: "subscription", id: s.id },
                    },
                });
            }
        }
        return { items, failed };
    }

    /**
     * Invoices due (issued, not yet past due), overdue (issued, past due —
     * derived, never stored) on their due date, and paid on the day paid.
     * Paid invoices that are not an order's own are the invoices' takings.
     *
     * An order's own invoice is none of these: its order is on the Orders
     * layer and holds its payment. A renewal's charge is left off the layer
     * when the Subscriptions layer shows it, but still counts as overdue —
     * `mergeToActOn` keeps it once, as the failed renewal it is.
     */
    private async readInvoices(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        now: Date,
        renewalsShown: boolean,
    ): Promise<{
        items: DatedItem[];
        overdue: (ToActOn & { invoiceId: string })[];
        takings: TakingEntry[];
    }> {
        const between = { gte: window.start, lt: window.end };
        const rows = await this.db.invoice.findMany({
            where: {
                organizationId,
                OR: [
                    { status: "ISSUED", dueAt: between },
                    { status: "PAID", paidAt: between },
                ],
            },
            select: {
                id: true,
                number: true,
                status: true,
                source: true,
                total: true,
                currency: true,
                dueAt: true,
                paidAt: true,
                billToName: true,
                subscriptionId: true,
                orderId: true,
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        });
        const items: DatedItem[] = [];
        const overdue: (ToActOn & { invoiceId: string })[] = [];
        const takings: TakingEntry[] = [];
        for (const inv of rows) {
            if (isAnOrdersOwn(inv)) continue;
            const listed = !(renewalsShown && inv.subscriptionId !== null);
            const title = inv.number ?? "Invoice";
            const subtitle = inv.billToName ?? personName(inv.contact);
            const amount = {
                amount: toMoneyString(inv.total),
                currency: inv.currency,
            };
            const link = { type: "invoice" as const, id: inv.id };
            if (inv.status === "PAID" && inv.paidAt) {
                const date = dayOf(inv.paidAt, zone);
                if (listed) {
                    items.push({
                        layer: "invoices",
                        date,
                        item: {
                            id: inv.id,
                            kind: "paid",
                            title,
                            subtitle,
                            at: inv.paidAt.toISOString(),
                            ...amount,
                            link,
                        },
                    });
                }
                takings.push({
                    date,
                    currency: inv.currency,
                    amount: inv.total,
                });
                continue;
            }
            if (inv.status !== "ISSUED" || !inv.dueAt) continue;
            const late = isPastDue(inv, now);
            const date = dayOf(inv.dueAt, zone);
            if (listed) {
                items.push({
                    layer: "invoices",
                    date,
                    item: {
                        id: inv.id,
                        kind: late ? "overdue" : "due",
                        title,
                        subtitle,
                        at: inv.dueAt.toISOString(),
                        ...amount,
                        link,
                    },
                });
            }
            if (late) {
                overdue.push({
                    invoiceId: inv.id,
                    kind:
                        inv.source === "SUBSCRIPTION"
                            ? "renewal_failed"
                            : "invoice_overdue",
                    date,
                    title,
                    subtitle,
                    ...amount,
                    link,
                });
            }
        }
        return { items, overdue, takings };
    }

    /** One-to-one bookings that stand (not cancelled), by start. */
    private async readBookings(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
    ): Promise<DatedItem[]> {
        const rows = await this.db.booking.findMany({
            where: {
                organizationId,
                status: { not: "CANCELLED" },
                startAt: { gte: window.start, lt: window.end },
                service: { capacity: { lte: 1 } },
            },
            orderBy: { startAt: "asc" },
            select: {
                id: true,
                startAt: true,
                status: true,
                outcome: true,
                bookerName: true,
                bookerEmail: true,
                service: { select: { name: true } },
                staff: { select: { name: true } },
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        });
        return rows.map((b) => ({
            layer: "bookings" as const,
            date: dayOf(b.startAt, zone),
            item: {
                id: b.id,
                kind:
                    b.outcome === "NO_SHOW"
                        ? "no_show"
                        : b.outcome === "ATTENDED"
                          ? "attended"
                          : "booked",
                title: bookerLabel(b),
                subtitle: [b.service.name, b.staff?.name]
                    .filter(Boolean)
                    .join(" · "),
                at: b.startAt.toISOString(),
                link: { type: "booking" as const, id: b.id },
            },
        }));
    }

    /** Class sessions with anyone on them: one item per start. */
    private async readClasses(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
    ): Promise<DatedItem[]> {
        const rows = await this.db.booking.findMany({
            where: {
                organizationId,
                status: { not: "CANCELLED" },
                startAt: { gte: window.start, lt: window.end },
                service: { capacity: { gt: 1 } },
            },
            orderBy: { startAt: "asc" },
            select: {
                serviceId: true,
                startAt: true,
                service: { select: { name: true, capacity: true } },
                staff: { select: { name: true } },
            },
        });
        const sessions = new Map<
            string,
            {
                serviceId: string;
                startAt: Date;
                name: string;
                capacity: number;
                staff: string | null;
                taken: number;
            }
        >();
        for (const r of rows) {
            const key = `${r.serviceId}@${r.startAt.toISOString()}`;
            const s = sessions.get(key) ?? {
                serviceId: r.serviceId,
                startAt: r.startAt,
                name: r.service.name,
                capacity: r.service.capacity,
                staff: null,
                taken: 0,
            };
            s.taken += 1;
            s.staff ??= r.staff?.name ?? null;
            sessions.set(key, s);
        }
        return [...sessions.entries()].map(([key, s]) => ({
            layer: "classes" as const,
            date: dayOf(s.startAt, zone),
            item: {
                id: key,
                kind: s.taken >= s.capacity ? "full" : "class",
                title: s.name,
                subtitle: [`${s.taken} of ${s.capacity} booked`, s.staff]
                    .filter(Boolean)
                    .join(" · "),
                at: s.startAt.toISOString(),
                link: { type: "service" as const, id: s.serviceId },
            },
        }));
    }
}
