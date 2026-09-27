import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { UNFULFILLED_STATUSES } from "../orders/order-standing";
import { StockChecksService } from "../stock/stock-checks.service";
import type {
    HomeAction,
    HomeBooking,
    HomeEvidence,
    HomeInput,
    HomeModel,
    HomeNumber,
    HomeSeverity,
    HomeUnavailable,
} from "./home-model";
import { EVIDENCE_LIMIT, holds, overdueTag, personName } from "./home-model";
import { failedRenewals, overdueInvoices } from "./home-money-sources";
import { flattenNeeds, HOME_DEFAULT_ZONE } from "./home-needs";
import { openOrderWords } from "./home-order-rows";
import { sitesNotLive, stockShort } from "./home-site-stock-sources";
import { readToday, todayScope } from "./home-today";

export type {
    HomeAction,
    HomeBooking,
    HomeEvidence,
    HomeInline,
    HomeInput,
    HomeModel,
    HomeNeed,
    HomeNumber,
    HomeSeverity,
    HomeToday,
    HomeTodayItem,
    HomeTone,
    HomeUnavailable,
} from "./home-model";

const SEVERITY_RANK: Record<HomeSeverity, number> = {
    ATTENTION: 0,
    OVERDUE: 1,
    SETUP: 2,
    SUGGESTION: 3,
};

/** How far ahead the schedule band looks. */
const UPCOMING_LIMIT = 8;

/**
 * Home read model (cross-product UX #119, Task 4).
 *
 * Produces ONE aggregated, ranked list of "what should I do next?" for an actor
 * in an Organization (± Project), so the Home page has a single dominant action
 * and no client-side data waterfalls. It composes module availability (the same
 * effective-availability projection the shell uses) with a few cheap operational
 * counts, and ranks by severity so the most important thing is always first.
 *
 * Rank: ATTENTION (a dependency is unhealthy) → OVERDUE (operational work past
 * due) → SETUP (an enabled module isn't ready) → SUGGESTION (a healthy nudge).
 * Actions for disabled/unavailable modules are never emitted (no leakage).
 *
 * OVERDUE outranks SETUP because someone outside the business is waiting on it.
 * The order used to be the other way round, which pushed "Fulfil 1 open order"
 * — a paying customer whose thing has not shipped — below "Connect a provider to
 * send messages". Configuration can wait for a quiet moment; an unfulfilled
 * order cannot, and a merchant who scans only the top of Home must not miss it.
 *
 * ## Evidence (workspace redesign, step 3)
 *
 * "Fulfil 5 open orders" told a merchant a number and made them go hunting for
 * the five. Every operational action now carries the actual rows behind its
 * count — who, how much, how long they have waited — so the decision of what to
 * do next can be made on Home instead of two clicks later. The evidence is
 * capped ({@link EVIDENCE_LIMIT}) and always ordered oldest-first: the thing
 * that has waited longest is the thing most likely to be a problem.
 */
@Injectable()
export class HomeService {
    private readonly logger = new Logger(HomeService.name);

    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
        // Optional so a spec can build Home without the stock module; the
        // app always injects it, and without it the stock row is not read.
        @Optional() private readonly stockChecks?: StockChecksService,
    ) {}

    /**
     * Read one source, and treat its failure as a missing part rather than a
     * dead page.
     *
     * Home aggregates several independent reads. Awaiting them unguarded meant
     * a single failing source — one slow count, one module whose table was
     * mid-migration — threw out of `build()` and took the whole of Home with
     * it. The merchant then saw the segment error boundary: no ranked actions,
     * no schedule, no numbers, including every part that had answered fine.
     *
     * That is the §30 failure in its worst form. Home is where a merchant
     * decides what to do next, and "everything is broken" is both untrue and
     * the least useful thing to tell them. Now the part that failed is named
     * and the rest still renders.
     */
    private async attempt<T>(
        source: HomeUnavailable,
        read: () => Promise<T>,
        fallback: T,
        unavailable: HomeUnavailable[],
    ): Promise<T> {
        try {
            return await read();
        } catch (error) {
            // Logged, not swallowed: the merchant is told a part is missing,
            // and the operator is told which query failed and why.
            this.logger.error(
                `Home source "${source.label}" (${source.moduleKey}) failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            unavailable.push(source);
            return fallback;
        }
    }

    async build(input: HomeInput): Promise<HomeModel> {
        // NOT guarded. Availability decides what Home is even allowed to show;
        // without it there is no page to degrade, and guessing would risk
        // emitting an action for a module the actor cannot see.
        const views = await this.availability.listViews(input);
        const actions: HomeAction[] = [];
        const unavailable: HomeUnavailable[] = [];

        // Setup / attention actions straight from module readiness.
        for (const view of views) {
            if (view.readiness === "ATTENTION_REQUIRED") {
                // SETUP/ATTENTION readiness always carries at least one blocker.
                const blocker = view.blockers[0];
                actions.push({
                    code: `${view.key}_ATTENTION`,
                    title: blocker.message ?? `${view.label} needs attention`,
                    href: blocker.actionHref ?? "/settings/modules",
                    severity: "ATTENTION",
                    moduleKey: view.key,
                });
            } else if (view.readiness === "SETUP_REQUIRED") {
                const blocker = view.blockers[0];
                actions.push({
                    code: `${view.key}_SETUP`,
                    title: blocker.message ?? `Finish setting up ${view.label}`,
                    href: blocker.actionHref ?? "/settings/modules",
                    severity: "SETUP",
                    moduleKey: view.key,
                });
            }
        }

        // Operational actions — only for ACTIVE modules, so a disabled module
        // never contributes work.
        const active = new Set(
            views.filter((v) => v.readiness === "ACTIVE").map((v) => v.key),
        );

        /*
         * Read-only bands (the schedule, the numbers) use AVAILABILITY, not
         * ACTIVE — the same rule the sidebar filters on.
         *
         * ACTIVE means "ready to do new work"; a module can be SETUP_REQUIRED
         * and still hold real records. Appointments with no availability windows
         * configured is exactly that: it cannot take a NEW booking, but the ten
         * bookings already on the books are real appointments someone must turn
         * up for. Gating the schedule on ACTIVE hid them from Home while the
         * sidebar still linked to them — the workspace contradicting itself.
         *
         * DISABLED is still excluded, so nothing leaks for a capability the
         * actor cannot see.
         */
        const available = new Set(
            views.filter((v) => v.readiness !== "DISABLED").map((v) => v.key),
        );
        const now = new Date();
        // Reaching CRM is not reading leads: since DEC-020 a Member reaches the
        // module for contacts and holds no `lead:read`, so the two lead bands
        // below ask for the action rather than the module.
        const canReadLeads = holds(input, "lead:read");
        // The business's days: "Due today" on an order, "was due 14 Sep".
        const zone = await this.businessZone(input.organizationId);
        const numbers: HomeNumber[] = [];
        let upcoming: HomeBooking[] = [];

        if (available.has("CRM")) {
            numbers.push(
                ...(await this.attempt(
                    { moduleKey: "CRM", label: "Customer numbers" },
                    () => this.crmNumbers(input.organizationId, canReadLeads),
                    [],
                    unavailable,
                )),
            );
        }

        if (active.has("CRM") && canReadLeads) {
            const overdue = await this.attempt(
                { moduleKey: "CRM", label: "Overdue follow-ups" },
                () => this.overdueFollowUps(input.organizationId, now),
                { count: 0, evidence: [] },
                unavailable,
            );
            if (overdue.count > 0) {
                actions.push({
                    code: "CRM_OVERDUE_FOLLOWUPS",
                    title: `Follow up on ${overdue.count} overdue lead${overdue.count === 1 ? "" : "s"}`,
                    href: "/leads",
                    severity: "OVERDUE",
                    moduleKey: "CRM",
                    count: overdue.count,
                    evidence: overdue.evidence,
                });
            }
        }

        if (available.has("COMMERCE")) {
            const open = await this.attempt(
                { moduleKey: "COMMERCE", label: "Open orders" },
                () =>
                    this.openOrders(input.organizationId, {
                        now,
                        zone,
                        // An order's money is `order:read`'s; `order:stage`
                        // moves it without seeing it (DEC-024).
                        money: holds(input, "order:read"),
                    }),
                { count: 0, evidence: [] },
                unavailable,
            );

            if (open.count > 0) {
                numbers.push({
                    key: "OPEN_ORDERS",
                    label: "Open orders",
                    value: open.count,
                    // The SCREEN that shows them, not the section above it.
                    // The rail badges whatever href an OVERDUE action carries,
                    // so pointing this at "/commerce" put the count on Sell
                    // and sent the merchant to a list of storefronts to hunt
                    // for orders one storefront at a time.
                    href: "/commerce/orders",
                    moduleKey: "COMMERCE",
                });
            }

            // The ACTION, unlike the number, still requires ACTIVE: telling a
            // merchant to fulfil orders through a module that is not ready is
            // sending them at a door that does not open.
            if (active.has("COMMERCE")) {
                if (open.count > 0) {
                    actions.push({
                        code: "COMMERCE_OPEN_ORDERS",
                        title: `Fulfil ${open.count} open order${open.count === 1 ? "" : "s"}`,
                        href: "/commerce/orders",
                        severity: "OVERDUE",
                        moduleKey: "COMMERCE",
                        count: open.count,
                        evidence: open.evidence,
                    });
                } else {
                    actions.push({
                        code: "COMMERCE_SUGGEST_PRODUCT",
                        title: "Add a product to your catalog",
                        // Likewise the catalogue, not the storefront list.
                        href: "/commerce/products",
                        severity: "SUGGESTION",
                        moduleKey: "COMMERCE",
                    });
                }
            }
        }

        if (available.has("APPOINTMENTS")) {
            const schedule = await this.attempt(
                { moduleKey: "APPOINTMENTS", label: "Schedule" },
                async () => ({
                    upcoming: await this.upcomingBookings(
                        input.organizationId,
                        now,
                    ),
                    total: await this.db.booking.count({
                        where: {
                            organizationId: input.organizationId,
                            status: "CONFIRMED",
                            startAt: { gte: now },
                        },
                    }),
                }),
                { upcoming: [], total: 0 },
                unavailable,
            );
            upcoming = schedule.upcoming;
            const total = schedule.total;
            if (total > 0) {
                numbers.push({
                    key: "UPCOMING_BOOKINGS",
                    label: "Upcoming bookings",
                    value: total,
                    href: "/bookings",
                    moduleKey: "APPOINTMENTS",
                });
            }
        }

        // The business's day, in its zone (F5): bookings, classes, pick-ups.
        const scope = todayScope(input, available);
        const today = scope
            ? await this.attempt(
                  {
                      moduleKey: scope.bookings ? "APPOINTMENTS" : "COMMERCE",
                      label: "Today",
                  },
                  () => readToday(this.db, input, scope, { now, zone }),
                  null,
                  unavailable,
              )
            : null;

        // Money taken through an invoice's pay link after the invoice was
        // already paid or voided (U13). The customer is owed it back, so it
        // is ATTENTION: already wrong, and only the merchant can put it right.
        // Shown wherever Payments is available — a business that has since
        // disconnected its provider still owes the refund — and only to
        // people who can read invoices.
        const canReadInvoices = holds(input, "invoice:read");
        if (available.has("PAYMENTS") && canReadInvoices) {
            const owed = await this.attempt(
                { moduleKey: "PAYMENTS", label: "Payments to refund" },
                () => this.refundsOwed(input.organizationId),
                { count: 0, evidence: [] },
                unavailable,
            );
            if (owed.count > 0) {
                actions.push({
                    code: "PAYMENTS_REFUNDS_OWED",
                    title:
                        owed.count === 1
                            ? "Refund a payment taken on a settled invoice"
                            : `Refund ${owed.count} payments taken on settled invoices`,
                    href:
                        owed.count === 1 && owed.evidence[0]
                            ? owed.evidence[0].href
                            : "/billing/invoices",
                    severity: "ATTENTION",
                    moduleKey: "PAYMENTS",
                    count: owed.count,
                    evidence: owed.evidence,
                });
            }
        }

        // Renewals that haven't been paid, and invoices past due (F1). Like
        // refunds owed, they show wherever Payments is available: the money
        // is owed whether or not a provider is connected today. Each asks
        // for its own read, so a role holding one sees only that one.
        if (available.has("PAYMENTS") && holds(input, "subscription:read")) {
            const renewals = await this.attempt(
                { moduleKey: "PAYMENTS", label: "Failed renewals" },
                () =>
                    failedRenewals(
                        this.db,
                        input.organizationId,
                        now,
                        canReadInvoices,
                    ),
                null,
                unavailable,
            );
            if (renewals) actions.push(renewals);
        }
        if (available.has("PAYMENTS") && canReadInvoices) {
            const overdue = await this.attempt(
                { moduleKey: "PAYMENTS", label: "Overdue invoices" },
                () => overdueInvoices(this.db, input.organizationId, now),
                null,
                unavailable,
            );
            if (overdue) actions.push(overdue);
        }

        // Shelves short for open orders (F1): the Stock screen's own checks.
        const stockChecks = this.stockChecks;
        if (
            available.has("COMMERCE") &&
            holds(input, "store:read") &&
            stockChecks
        ) {
            const short = await this.attempt(
                { moduleKey: "COMMERCE", label: "Stock" },
                () => stockShort(this.db, stockChecks, input.organizationId),
                null,
                unavailable,
            );
            if (short) actions.push(short);
        }

        // Websites that aren't live (F1). Not for a Reviewer: they are asked
        // to look at named sites, and their Home is its own view (F9).
        if (
            available.has("WEBSITE") &&
            holds(input, "site:read") &&
            input.organizationRole !== "REVIEWER"
        ) {
            const notLive = await this.attempt(
                { moduleKey: "WEBSITE", label: "Website" },
                () => sitesNotLive(this.db, input.organizationId),
                null,
                unavailable,
            );
            if (notLive) {
                // It names the sites, so readiness's general "Publish your
                // site to go live" would say the same thing twice.
                const setup = actions.findIndex(
                    (a) => a.code === "WEBSITE_SETUP",
                );
                if (setup >= 0) actions.splice(setup, 1);
                actions.push(notLive);
            }
        }

        if (active.has("INSIGHTS")) {
            actions.push({
                code: "INSIGHTS_VIEW",
                title: "Review this week's performance",
                href: "/analytics",
                severity: "SUGGESTION",
                moduleKey: "INSIGHTS",
            });
        }

        actions.sort(
            (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
        );

        return {
            actions,
            primaryAction: actions[0] ?? null,
            hasAnyModule: views.some((v) => v.readiness !== "DISABLED"),
            upcoming,
            numbers,
            unavailable,
            ...flattenNeeds(actions, zone),
            today,
        };
    }

    /**
     * The zone the business keeps its days in, or India's when it has set
     * none (as invoicing reads it). Not a source of its own: when it can't be
     * read, the default only moves "Due today" by the zones' difference, and
     * saying Home is missing a part would be untrue.
     */
    private async businessZone(organizationId: string): Promise<string> {
        try {
            const profile = await this.db.businessProfile.findUnique({
                where: { organizationId },
                select: { timezone: true },
            });
            // "" included, as older rows stored it.
            const zone = profile?.timezone?.trim() ?? "";
            return zone.length > 0 ? zone : HOME_DEFAULT_ZONE;
        } catch (error) {
            this.logger.warn(
                `Home could not read the business's time zone: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return HOME_DEFAULT_ZONE;
        }
    }

    /**
     * Overdue follow-up tasks, oldest due date first, with the lead and person
     * each one is about.
     */
    private async overdueFollowUps(
        organizationId: string,
        now: Date,
    ): Promise<{ count: number; evidence: HomeEvidence[] }> {
        const where = {
            organizationId,
            dueAt: { lt: now },
            completedAt: null,
        };

        const [count, rows] = await Promise.all([
            this.db.activity.count({ where }),
            this.db.activity.findMany({
                where,
                orderBy: { dueAt: "asc" },
                take: EVIDENCE_LIMIT,
                include: { lead: { include: { contact: true } } },
            }),
        ]);

        return {
            count,
            evidence: rows.map((row) => ({
                id: row.id,
                title: row.lead.title,
                // `Lead.contactId` is required, so a lead always has a contact
                // — no null branch to guard.
                subtitle: personName(row.lead.contact),
                at: row.dueAt?.toISOString() ?? null,
                // A Lead's value is a bare integer in minor units with no
                // currency recorded anywhere on the row — see HomeEvidence.
                amountMinor: row.lead.value,
                currency: null,
                href: `/leads/${row.lead.id}`,
                // The where asked for a due date before now.
                ...(row.dueAt
                    ? { tag: overdueTag(row.dueAt, now), tone: "bad" as const }
                    : {}),
            })),
        };
    }

    /**
     * Unfulfilled orders, oldest first — longest wait is the biggest problem.
     * Each says what to do with it and whether it is late (F3); its money
     * only to someone who reads orders.
     */
    private async openOrders(
        organizationId: string,
        view: { now: Date; zone: string; money: boolean },
    ): Promise<{ count: number; evidence: HomeEvidence[] }> {
        const where = {
            organizationId,
            // The same constant Sell -> Orders resolves a row's standing
            // from, so the number badged here and the tab there cannot drift.
            status: { in: [...UNFULFILLED_STATUSES] },
        };

        const [count, rows] = await Promise.all([
            this.db.order.count({ where }),
            this.db.order.findMany({
                where,
                orderBy: { createdAt: "asc" },
                take: EVIDENCE_LIMIT,
                include: { customer: true },
            }),
        ]);

        return {
            count,
            evidence: rows.map((row) => {
                const who = personName(row.customer);
                return {
                    id: row.id,
                    title: row.orderId,
                    subtitle: who,
                    at: row.createdAt.toISOString(),
                    // Decimal in MAJOR units on the row; the wire contract is
                    // minor units, so it is converted once here rather than in
                    // each client.
                    amountMinor: view.money
                        ? Math.round(Number(row.total) * 100)
                        : null,
                    currency: view.money ? row.currency : null,
                    href: `/commerce/orders/${row.id}?storefront=${row.storeId}`,
                    ...openOrderWords(row, who, view.now, view.zone),
                };
            }),
        };
    }

    /**
     * Invoice payments captured but not applied — the invoice was already
     * paid or void when the money arrived — and not yet refunded, oldest
     * first. A refund the provider has reported (or one Saroh started)
     * takes the row off the list.
     */
    private async refundsOwed(
        organizationId: string,
    ): Promise<{ count: number; evidence: HomeEvidence[] }> {
        const where = {
            organizationId,
            invoiceId: { not: null },
            status: "SUCCEEDED",
            attempts: { some: { status: CAPTURED_NEEDS_REFUND } },
            refunds: { none: { status: { in: ["PENDING", "SUCCEEDED"] } } },
        };
        const [count, rows] = await Promise.all([
            this.db.paymentIntent.count({ where }),
            this.db.paymentIntent.findMany({
                where,
                orderBy: { updatedAt: "asc" },
                take: EVIDENCE_LIMIT,
                select: {
                    id: true,
                    amountCents: true,
                    currency: true,
                    updatedAt: true,
                    invoice: {
                        select: {
                            id: true,
                            number: true,
                            status: true,
                            billToName: true,
                        },
                    },
                },
            }),
        ]);
        const evidence: HomeEvidence[] = [];
        for (const row of rows) {
            if (!row.invoice) continue;
            const after =
                row.invoice.status === "VOID"
                    ? "Paid online after it was voided"
                    : "Paid online after it was already paid";
            evidence.push({
                id: row.id,
                title: row.invoice.number ?? "Invoice",
                subtitle: row.invoice.billToName
                    ? `${row.invoice.billToName} · ${after}`
                    : after,
                at: row.updatedAt.toISOString(),
                amountMinor: row.amountCents,
                currency: row.currency,
                href: `/billing/invoices/${row.invoice.id}`,
            });
        }
        return { count, evidence };
    }

    /** The next confirmed bookings from now, each in the zone it was made in. */
    private async upcomingBookings(
        organizationId: string,
        now: Date,
    ): Promise<HomeBooking[]> {
        const rows = await this.db.booking.findMany({
            where: {
                organizationId,
                status: "CONFIRMED",
                startAt: { gte: now },
            },
            orderBy: { startAt: "asc" },
            take: UPCOMING_LIMIT,
            include: { service: true, contact: true },
        });

        return rows.map((row) => ({
            id: row.id,
            startAt: row.startAt.toISOString(),
            endAt: row.endAt.toISOString(),
            timezone: row.timezone,
            serviceName: row.service.name,
            who:
                (row.contact ? personName(row.contact) : null) ??
                row.bookerName?.trim() ??
                row.bookerEmail?.trim() ??
                null,
            status: row.status,
            href: "/bookings",
        }));
    }

    /** Counts that are destinations: open leads, and everyone on file. */
    private async crmNumbers(
        organizationId: string,
        canReadLeads: boolean,
    ): Promise<HomeNumber[]> {
        const [openLeads, contacts] = await Promise.all([
            canReadLeads
                ? this.db.lead.count({
                      where: { organizationId, status: "OPEN" },
                  })
                : Promise.resolve(0),
            this.db.contact.count({ where: { organizationId } }),
        ]);

        const out: HomeNumber[] = [];
        if (openLeads > 0) {
            out.push({
                key: "OPEN_LEADS",
                label: "Open leads",
                value: openLeads,
                // `?view=` is the DataView filter contract: this lands on Leads
                // with the open filter already applied, not on a list the
                // merchant has to narrow again by hand.
                href: "/leads?view=open",
                moduleKey: "CRM",
            });
        }
        if (contacts > 0) {
            out.push({
                key: "CONTACTS",
                label: "Contacts",
                value: contacts,
                href: "/contacts",
                moduleKey: "CRM",
            });
        }
        return out;
    }
}
