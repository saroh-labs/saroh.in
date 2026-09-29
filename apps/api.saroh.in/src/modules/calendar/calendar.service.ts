import {
    ForbiddenException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { holdsPlace } from "../bookings/booking-hold";
import { bookingDueCents, bookingPrice } from "../bookings/booking-money";
import type { BookingPaperRow } from "../bookings/desk-take";
import { paidAtDesk } from "../bookings/desk-take";
import type { ZoneSource } from "../bookings/staff-availability";
import { businessZone } from "../bookings/staff-availability";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { isPastDue } from "../invoices/invoice-state";
import { realOrderWhere } from "../orders/open-orders";
import { allows, authorize } from "../organizations/organization-policy";
import { dateKey } from "../subscriptions/collections";
import type { CalendarStaff, DayOff } from "./days-off";
import { readDaysOff } from "./days-off";
import type { MoneyEntry, MoneySource } from "./money";
import { moneyByDay, moneyCells, placeMoney } from "./money";
import { readFees, readPaperMoney } from "./money-read";
import type {
    CalendarDay,
    DatedItem,
    LayerKey,
    MoneyCell,
    MoneyTotal,
    TakingEntry,
    ToActOn,
} from "./month";
import {
    buildDays,
    dayOf,
    LAYER_LABELS,
    LAYERS,
    mergeToActOn,
    sumMoney,
} from "./month";
import { orderFlagger } from "./order-flags";
import { readPayments } from "./payments-layer";
import type { CalendarQuery } from "./range";
import { assertWithinReach, monthOf, reachOf, spanOf, windowOf } from "./range";
import { collectionsInMonth, upcomingRenewals } from "./schedules";
import type { WorkingHours } from "./working-hours";

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
 * and `invoice:read`, ADR-008), and count each rupee once: orders plus paid
 * invoices that are not an order's own (ADR-008: every order has one).
 * Order amounts need `payment:read`; subscription and invoice amounts ride
 * with their own reads, and a booking's price with `booking:read` (DEC-039).
 *
 * Money in, out and due (plan 005 E19) go to `payment:read` alone: each
 * item's `in`/`out`/`due`/`failed`, each day's `money` and the month's
 * `money` with its entries (`money.ts`). They are all or nothing — a source
 * they add up that could not be read leaves them out and names "Money".
 *
 * Takings are dated when the money moved, not when the order was placed: an
 * order's money on the day its invoice was paid (online or recorded by hand
 * — `ensureOrderInvoice` stamps both), an edit's difference on the day its
 * supplementary invoice was paid, and a refund taken off on the day its
 * credit note was issued. A pay-later order placed on the 30th and paid on
 * the 2nd is the 2nd's money.
 *
 * The Invoices layer is the paper that has no other layer: an order's own
 * invoice is its order, and a renewal's charge is its renewal on the
 * Subscriptions layer (when that layer is shown). Listing them again would
 * say the day held twice as much.
 *
 * ## Holds
 *
 * Bookings and classes read through `holdsPlace` (the rule every capacity
 * count and clash check uses): a pay-now hold whose time ran out holds
 * nothing and is not on the calendar; a live one takes its place and shows
 * as `held` — never as booked, since nobody has paid for it yet.
 *
 * ## Range (plan 005 E20)
 *
 * The read takes `from`/`to` (local dates, both inclusive) and is refused
 * wholly before the joined month or past three months ahead (`range.ts`).
 * (The one-release `month` alias is gone: Z3.) A caller who reads none
 * of the layers is refused outright (403), which the app shows as locked.
 * Items carry their person, length and flags; the read also returns the
 * days off, the team and the joined day. A business with no orders gets a
 * Payments layer of paid invoices (`payments-layer.ts`).
 *
 * ## Days
 *
 * Days are local dates in the business's zone — `BusinessProfile.timezone`,
 * else the first active service's, else Asia/Kolkata — and the response
 * names the zone it used. Collections are dated in the subscription's own
 * zone, which is the business's for every subscription it sold.
 */

export interface CalendarUnavailable {
    /**
     * A layer, or `takings` / `money` when only those could not be added up.
     */
    source: LayerKey | "takings" | "money" | "days_off";
    label: string;
}

export interface CalendarMonth {
    /** The month `from` is in. */
    month: string;
    timezone: string;
    timezoneSource: ZoneSource;
    /** The first day's and the after-last day's midnights in that zone. */
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
    /**
     * The day the business joined Saroh, in its zone ("YYYY-MM-DD") — the
     * earliest the calendar reaches back to (plan 005 E21, default 119:
     * `Organization.createdAt` until a joined date exists). Null when it
     * could not be read; the app then sets no lower edge.
     */
    joinedAt: string | null;
    /**
     * `payment:read` only (plan 005 E19): the month's money in, out, due and
     * failed per currency, and every entry that adds up to it, each rupee
     * once (`money.ts`). `total` is null, and the entries empty, when a
     * source could not be read.
     */
    money?: { total: MoneyCell[] | null; entries: MoneyEntry[] };
    /**
     * Closures and time off touching the days read (plan 005 E20,
     * `days-off.ts`); time off names its person only for `booking:read`.
     * Empty without Appointments; null when it could not be read.
     */
    daysOff: DayOff[] | null;
    /** Whether the business has anyone on its team; null when unread. */
    hasStaff: boolean | null;
    /** `booking:read` only: the team, for the team filter. */
    staff?: CalendarStaff[];
    /**
     * The team's working hours on each day read (E27, `working-hours.ts`),
     * whose only with `booking:read`; null when days off could not be read.
     */
    hours: WorkingHours[] | null;
}

/**
 * The reads a calendar layer rests on. A caller holding none has nothing
 * to see and is refused (E20), which the app shows as its locked card.
 */
const LAYER_READS = [
    "order:read",
    "booking:read",
    "subscription:read",
    "invoice:read",
    "payment:read",
] as const;

/** Whole minutes from one instant to another. */
function minutesBetween(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
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
    "payments",
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

/** How a booking was paid (U3), as the day panel says it. */
const PAID_WITH: Record<string, string> = {
    MEMBERSHIP: "Membership",
    PACK: "Class pack",
    PAID: "Paid online",
    DESK: "At the desk",
};

type Unavailable = CalendarUnavailable[];

@Injectable()
export class CalendarService {
    private readonly logger = new Logger(CalendarService.name);

    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /** The days asked for: `from`/`to`. */
    async read(
        ctx: OrganizationContext,
        query: CalendarQuery,
        now: Date = new Date(),
    ): Promise<CalendarMonth> {
        authorize(ctx, "org:read");
        if (!LAYER_READS.some((a) => allows(ctx, a))) {
            throw new ForbiddenException(
                "Your role can't see orders, bookings, subscriptions, invoices or payments.",
            );
        }
        const span = spanOf(query);
        const month = monthOf(span);
        const organizationId = ctx.organizationId;

        // NOT guarded: without the zone there are no days, and without
        // availability no layer may be shown (Home's rule).
        const [zone, views, created] = await Promise.all([
            businessZone(this.db, organizationId),
            this.availability.listViews({
                organizationId,
                organizationRole: ctx.role,
                organizationActions: ctx.actions,
            }),
            this.createdAt(organizationId),
        ]);
        const on = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );
        const joinedAt = created ? dayOf(created, zone.zone) : null;
        assertWithinReach(span, reachOf(joinedAt, dayOf(now, zone.zone)));
        const window = windowOf(span, zone.zone);

        const money =
            allows(ctx, "payment:read") && allows(ctx, "invoice:read");
        const orderAmounts = allows(ctx, "payment:read");
        // Money in, out and due: the Payments scope alone (E19).
        const cells = allows(ctx, "payment:read");
        const sees: Record<LayerKey, boolean> = {
            orders: on.has("COMMERCE") && allows(ctx, "order:read"),
            collections: on.has("PAYMENTS") && allows(ctx, "subscription:read"),
            subscriptions:
                on.has("PAYMENTS") && allows(ctx, "subscription:read"),
            invoices: on.has("PAYMENTS") && allows(ctx, "invoice:read"),
            bookings: on.has("APPOINTMENTS") && allows(ctx, "booking:read"),
            classes: on.has("APPOINTMENTS") && allows(ctx, "booking:read"),
            // A business with no orders, and no Invoices layer to list its
            // payments, sees them here (the design's clinic).
            payments: false,
        };
        sees.payments = cells && !on.has("COMMERCE") && !sees.invoices;
        const layers = LAYERS.filter((l) => sees[l]);
        // Orders are read for the takings too, where the layer is not shown.
        const readOrders =
            on.has("COMMERCE") && (sees.orders || money || cells);
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
            payments,
            off,
        ] = await Promise.all([
            attempt("orders", readOrders, () =>
                this.readOrders(
                    organizationId,
                    window,
                    zone.zone,
                    orderAmounts,
                    money,
                    now,
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
                this.readBookings(organizationId, window, zone.zone, now),
            ),
            attempt("classes", sees.classes, () =>
                this.readClasses(organizationId, window, zone.zone, now),
            ),
            attempt("payments", sees.payments, () =>
                readPayments(this.db, organizationId, window, zone.zone),
            ),
            this.readOff(
                organizationId,
                window,
                zone.zone,
                on.has("APPOINTMENTS"),
                allows(ctx, "booking:read"),
            ),
        ]);

        if (off === null) {
            unavailable.push({ source: "days_off", label: "Days off" });
        }

        const items: DatedItem[] = [
            ...(sees.orders ? (orders?.items ?? []) : []),
            ...(collections ?? []),
            ...(subscriptions?.items ?? []),
            ...(invoices?.items ?? []),
            ...(bookings ?? []),
            ...(classes ?? []),
            ...(payments?.items ?? []),
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
                (!readInvoices || invoices !== null) &&
                (!sees.payments || payments !== null);
            if (takingsKnown) {
                takings = [
                    ...(orders?.takings ?? []),
                    ...(invoices?.takings ?? []),
                    ...(payments?.takings ?? []),
                ];
            } else if (!sees.orders && orders === null) {
                // The orders read only fed the takings: name what is missing.
                unavailable.push({ source: "takings", label: "Takings" });
            }
        }

        const failed = new Set(unavailable.map((u) => u.source));

        // Money in, out and due: every source it adds up must have answered
        // — the paper, the fees, the orders read and each layer shown (their
        // Due) — or none of it is sent.
        let moneyOut: CalendarMonth["money"];
        let dayMoney: Map<string, MoneyCell[]> | null = null;
        if (cells) {
            const sources = await this.readMoney(
                organizationId,
                window,
                zone.zone,
            );
            const known =
                sources !== null &&
                (!readOrders || orders !== null) &&
                layers.every((l) => !failed.has(l));
            if (known) {
                const entries = placeMoney(items, [
                    ...sources,
                    ...(orders?.unpaperedSources ?? []),
                ]).filter((e) => window.days.includes(e.date));
                moneyOut = { total: moneyCells(entries), entries };
                dayMoney = moneyByDay(window.days, entries);
            } else {
                moneyOut = { total: null, entries: [] };
                // A layer shown and named already says what is missing;
                // otherwise the money itself is named.
                if (
                    sources === null ||
                    (readOrders && orders === null && !sees.orders)
                ) {
                    unavailable.push({ source: "money", label: "Money" });
                }
            }
        }

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
                money: dayMoney,
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
            joinedAt,
            ...(moneyOut ? { money: moneyOut } : {}),
            daysOff: off?.daysOff ?? null,
            hasStaff: off ? off.hasStaff : null,
            ...(off?.staff ? { staff: off.staff } : {}),
            hours: off?.hours ?? null,
        };
    }

    /**
     * Days off and the team (`days-off.ts`); without Appointments there are
     * none. A failed read is named and leaves the rest of the calendar.
     */
    private async readOff(
        organizationId: string,
        window: Parameters<typeof readDaysOff>[2],
        zone: string,
        appointments: boolean,
        named: boolean,
    ): Promise<Awaited<ReturnType<typeof readDaysOff>> | null> {
        if (!appointments) return { daysOff: [], hasStaff: false, hours: [] };
        try {
            return await readDaysOff(
                this.db,
                organizationId,
                window,
                zone,
                named,
            );
        } catch (error) {
            this.logger.error(
                `Calendar days off failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    /**
     * The paper's money and the providers' fees (`money-read.ts`), or null
     * when either could not be read — a total with a missing part is not
     * the total.
     */
    private async readMoney(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
    ): Promise<MoneySource[] | null> {
        try {
            const [paper, fees] = await Promise.all([
                readPaperMoney(this.db, organizationId, window, zone),
                readFees(this.db, organizationId, window, zone),
            ]);
            return [...paper, ...fees];
        } catch (error) {
            this.logger.error(
                `Calendar money failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
    }

    /**
     * When the business was created. Only the calendar's back edge rests on
     * it, so a failed read leaves the edge open rather than failing the month.
     */
    private async createdAt(organizationId: string): Promise<Date | null> {
        try {
            const org = await this.db.organization.findUnique({
                where: { id: organizationId },
                select: { createdAt: true },
            });
            return org?.createdAt ?? null;
        } catch (error) {
            this.logger.warn(
                `Calendar joined date unread: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return null;
        }
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

    /**
     * Orders placed this month (the layer) and, for a viewer who reads
     * money, the order money that moved this month (the takings) — two
     * reads, because the money is dated by the order's paper, not by when
     * the order was placed.
     */
    private async readOrders(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        amounts: boolean,
        money: boolean,
        now: Date,
    ): Promise<{
        items: DatedItem[];
        takings: TakingEntry[];
        /** Paid orders with no paper, as money in (E19). */
        unpaperedSources: MoneySource[];
    }> {
        const [rows, taken] = await Promise.all([
            this.db.order.findMany({
                where: {
                    organizationId,
                    createdAt: { gte: window.start, lt: window.end },
                    // Never an abandoned site checkout, as Orders (B1).
                    ...realOrderWhere(),
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
                    storeId: true,
                    stage: true,
                    fulfilment: true,
                    customer: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                    // A walk-in (B13) is named by the name they gave.
                    walkInName: true,
                    invoices: {
                        where: { kind: "INVOICE" },
                        select: { id: true },
                    },
                },
            }),
            money
                ? this.readOrderTakings(organizationId, window, zone)
                : Promise.resolve([]),
        ]);
        const flagsOf = await orderFlagger(this.db, rows, now);
        // A paid order with no invoice (placed before orders were invoiced)
        // has no payment date on record: when it was placed is the best
        // there is, as it always was.
        const unpapered = rows.filter(
            (o) => o.paymentStatus === "PAID" && o.invoices.length === 0,
        );
        return {
            unpaperedSources: unpapered.map((o) => ({
                date: dayOf(o.createdAt, zone),
                kind: "order_paid" as const,
                layer: "orders" as const,
                title: o.orderId,
                subtitle: personName(o.customer) ?? o.walkInName,
                currency: o.currency,
                cents: toMinor(o.total),
                links: [{ type: "order" as const, id: o.id }],
            })),
            items: rows.map((o) => {
                const flags = flagsOf(o);
                return {
                    layer: "orders" as const,
                    date: dayOf(o.createdAt, zone),
                    item: {
                        id: o.id,
                        kind: o.status === "CANCELLED" ? "cancelled" : "placed",
                        ...(flags.length ? { flags } : {}),
                        title: o.orderId,
                        subtitle: personName(o.customer) ?? o.walkInName,
                        at: o.createdAt.toISOString(),
                        ...(amounts
                            ? {
                                  amount: toMoneyString(o.total),
                                  currency: o.currency,
                              }
                            : {}),
                        link: { type: "order" as const, id: o.id },
                    },
                };
            }),
            takings: [
                ...taken,
                ...(money ? unpapered : []).map((o) => ({
                    date: dayOf(o.createdAt, zone),
                    currency: o.currency,
                    amount: o.total,
                })),
            ],
        };
    }

    /**
     * The order money that moved this month, from the order's own paper
     * (ADR-008): its invoice on the day it was paid — online or recorded by
     * hand, `ensureOrderInvoice` stamps both — and each supplementary
     * invoice (an edit's difference) on the day it was paid, less each
     * credit note (a refund, or an edit down) on the day it was issued. An
     * invoice later credited in full still took its money the day it was
     * paid; its credit note gives it back on its own day. Each rupee once:
     * this is the only read that counts an order's paper — the Invoices
     * layer leaves it out.
     */
    private async readOrderTakings(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
    ): Promise<TakingEntry[]> {
        const between = { gte: window.start, lt: window.end };
        const paper = await this.db.invoice.findMany({
            where: {
                organizationId,
                orderId: { not: null },
                status: { notIn: ["DRAFT", "VOID"] },
                OR: [
                    {
                        kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
                        paidAt: between,
                    },
                    { kind: "CREDIT_NOTE", issuedAt: between },
                ],
            },
            select: {
                kind: true,
                total: true,
                currency: true,
                paidAt: true,
                issuedAt: true,
            },
        });
        return paper.flatMap((inv): TakingEntry[] => {
            if (inv.kind === "CREDIT_NOTE") {
                return inv.issuedAt
                    ? [
                          {
                              date: dayOf(inv.issuedAt, zone),
                              currency: inv.currency,
                              amount: fromMinor(-toMinor(inv.total)),
                          },
                      ]
                    : [];
            }
            return inv.paidAt
                ? [
                      {
                          date: dayOf(inv.paidAt, zone),
                          currency: inv.currency,
                          amount: inv.total,
                      },
                  ]
                : [];
        });
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
            // Payment failed: the rule `failedCharge` uses — unpaid past
            // due, on a subscription that has not been cancelled.
            const failing =
                c.dueAt !== null &&
                sub.status !== "CANCELLED" &&
                isPastDue(c, now);
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
                    // Raised and not yet paid: still due, until it fails.
                    ...(c.status === "ISSUED" && !failing
                        ? {
                              owes: {
                                  kind: "renewal_due" as const,
                                  currency: c.currency,
                                  cents: toMinor(c.total),
                              },
                          }
                        : {}),
                });
            }
            if (c.dueAt && inMonth(c.dueAt) && failing) {
                const date = dayOf(c.dueAt, zone);
                items.push({
                    layer: "subscriptions",
                    date,
                    item: {
                        id: `${c.id}:failed`,
                        kind: "failed",
                        flags: ["failed"],
                        title: who,
                        subtitle: sub.plan.name,
                        at: c.dueAt.toISOString(),
                        ...amount,
                        link: { type: "subscription", id: sub.id },
                    },
                    owes: {
                        kind: "renewal_failed",
                        currency: c.currency,
                        cents: toMinor(c.total),
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
                    // A renewal still to come is money due.
                    owes: {
                        kind: "renewal_due",
                        currency: s.currency,
                        cents: toMinor(s.price),
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
                    // Unpaid is due — overdue too, as money still owed —
                    // except a renewal's charge past due, which failed.
                    owes: {
                        kind:
                            late && inv.source === "SUBSCRIPTION"
                                ? "renewal_failed"
                                : "invoice_due",
                        currency: inv.currency,
                        cents: toMinor(inv.total),
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

    /**
     * One-to-one bookings that take their place, by start: confirmed ones,
     * and pay-now holds still inside their time (`held`). A hold that ran
     * out is not there.
     */
    private async readBookings(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        now: Date,
    ): Promise<DatedItem[]> {
        const rows = await this.db.booking.findMany({
            where: {
                organizationId,
                ...holdsPlace(now),
                startAt: { gte: window.start, lt: window.end },
                service: { capacity: { lte: 1 } },
            },
            orderBy: { startAt: "asc" },
            select: {
                id: true,
                startAt: true,
                endAt: true,
                staffId: true,
                status: true,
                outcome: true,
                paidWith: true,
                snapshot: true,
                bookerName: true,
                bookerEmail: true,
                service: { select: { name: true } },
                // Its own invoice (ADR-008): what was paid online for it,
                // and whether a pay link still asks for the rest; and what
                // was taken at the desk, a deposit's balance with it (P2).
                invoices: {
                    where: {
                        kind: { in: ["INVOICE", "SUPPLEMENTARY"] },
                        source: "BOOKING",
                    },
                    select: {
                        kind: true,
                        status: true,
                        paymentMethod: true,
                        total: true,
                        paidAt: true,
                        paymentIntents: {
                            where: { status: "SUCCEEDED" },
                            select: { amountCents: true },
                        },
                    },
                },
                staff: { select: { name: true } },
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        });
        const today = dayOf(now, zone);
        return rows.map((b): DatedItem => {
            const held = b.status === "PENDING";
            const date = dayOf(b.startAt, zone);
            const { priceCents, currency } = bookingPrice(b.snapshot);
            const owes = this.bookingOwes(b, held, date >= today);
            const desk = paidAtDesk(b.invoices);
            return {
                layer: "bookings" as const,
                date,
                ...(owes ? { owes } : {}),
                item: {
                    id: b.id,
                    kind: held
                        ? "held"
                        : b.outcome === "NO_SHOW"
                          ? "no_show"
                          : b.outcome === "ATTENDED"
                            ? "attended"
                            : "booked",
                    // "Personal training · Asha Rao", then "With Ravi · Paid
                    // online" — what it is and who, then with whom and how
                    // paid. A hold is not paid yet: its kind says so, and it
                    // names no way it was paid.
                    title: `${b.service.name} · ${bookerLabel(b)}`,
                    subtitle:
                        [
                            b.staff ? `With ${b.staff.name}` : null,
                            held
                                ? null
                                : desk.cents > 0
                                  ? "Paid at the desk"
                                  : b.paidWith
                                    ? PAID_WITH[b.paidWith]
                                    : null,
                        ]
                            .filter(Boolean)
                            .join(" · ") || null,
                    at: b.startAt.toISOString(),
                    // Its price is part of the booking (DEC-039).
                    ...(priceCents !== null && currency
                        ? { amount: fromMinor(priceCents), currency }
                        : {}),
                    link: { type: "booking" as const, id: b.id },
                    staffId: b.staffId,
                    durationMinutes: minutesBetween(b.startAt, b.endAt),
                    ...(b.outcome === "NO_SHOW"
                        ? { flags: ["no_show" as const] }
                        : {}),
                },
            };
        });
    }

    /**
     * What a booking still asks for at the visit (default 50), for the
     * calendar's Due: the price less what was paid online, on a booking
     * that stands, from today on. A live hold is not booked yet, and a pay
     * link still open is the invoice's Due, not the booking's too.
     */
    private bookingOwes(
        b: {
            status: string;
            outcome: string | null;
            paidWith: string | null;
            snapshot: unknown;
            invoices: (BookingPaperRow & {
                paymentIntents: { amountCents: number }[];
            })[];
        },
        held: boolean,
        ahead: boolean,
    ): DatedItem["owes"] {
        if (held || !ahead || b.outcome === "NO_SHOW") return undefined;
        const own = b.invoices.filter((i) => i.kind === "INVOICE");
        if (own.some((i) => i.status === "ISSUED")) return undefined;
        const paidOnline = own
            .filter((i) => i.status === "PAID" || i.status === "CREDITED")
            .flatMap((i) => i.paymentIntents)
            .reduce((n, p) => n + p.amountCents, 0);
        // Taken at the desk (P2) is paid, as online is.
        const due = bookingDueCents(
            b,
            paidOnline,
            paidAtDesk(b.invoices).cents,
        );
        const { currency } = bookingPrice(b.snapshot);
        return due && currency
            ? { kind: "booking_due", currency, cents: due }
            : undefined;
    }

    /**
     * Class sessions with anyone on them: one item per start. A live hold
     * takes a seat — the count the booking page sells against — and is
     * named as held, not booked; a hold that ran out takes none.
     */
    private async readClasses(
        organizationId: string,
        window: { start: Date; end: Date },
        zone: string,
        now: Date,
    ): Promise<DatedItem[]> {
        const rows = await this.db.booking.findMany({
            where: {
                organizationId,
                ...holdsPlace(now),
                startAt: { gte: window.start, lt: window.end },
                service: { capacity: { gt: 1 } },
            },
            orderBy: { startAt: "asc" },
            select: {
                serviceId: true,
                startAt: true,
                endAt: true,
                staffId: true,
                status: true,
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
                staffId: string | null;
                minutes: number;
                booked: number;
                held: number;
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
                staffId: null,
                minutes: minutesBetween(r.startAt, r.endAt),
                booked: 0,
                held: 0,
            };
            if (r.status === "PENDING") s.held += 1;
            else s.booked += 1;
            s.staff ??= r.staff?.name ?? null;
            s.staffId ??= r.staffId ?? null;
            sessions.set(key, s);
        }
        return [...sessions.entries()].map(([key, s]) => ({
            layer: "classes" as const,
            date: dayOf(s.startAt, zone),
            item: {
                id: key,
                kind: s.booked + s.held >= s.capacity ? "full" : "class",
                title: s.name,
                // "3 of 10 booked · 1 held · Meera".
                subtitle: [
                    `${s.booked} of ${s.capacity} booked`,
                    s.held > 0 ? `${s.held} held` : null,
                    s.staff,
                ]
                    .filter(Boolean)
                    .join(" · "),
                at: s.startAt.toISOString(),
                link: { type: "service" as const, id: s.serviceId },
                staffId: s.staffId,
                durationMinutes: s.minutes,
            },
        }));
    }
}
