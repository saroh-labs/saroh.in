import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { accountAreaOn } from "../site-accounts/account-area";
import { ThreadsService } from "../site-accounts/threads.service";
import { StockChecksService } from "../stock/stock-checks.service";
import {
    overdueFollowUps,
    crmNumbers as readCrmNumbers,
} from "./home-crm-sources";
import { HomeInlineService } from "./home-inline";
import { lastDayHeader, readLastDay } from "./home-last-day";
import type {
    HomeAction,
    HomeEvidence,
    HomeInput,
    HomeModel,
    HomeNumber,
    HomeSeverity,
    HomeUnavailable,
} from "./home-model";
import { EVIDENCE_LIMIT, holds } from "./home-model";
import type { RefundReason } from "./home-money-sources";
import {
    failedRenewals,
    overdueInvoices,
    refundReason,
    refundReasonWords,
    refundsOwedTitle,
} from "./home-money-sources";
import { flattenNeeds, HOME_DEFAULT_ZONE } from "./home-needs";
import type { OpenOrders } from "./home-open-orders";
import { readOpenOrders } from "./home-open-orders";
import { pausesWaitingOnPayments } from "./home-pause-sources";
import {
    bookingPageNotes,
    lowStarReviews,
    MESSAGE_WAIT_MS,
    unansweredMessages,
    viewerOf,
} from "./home-people-sources";
import { readReviews } from "./home-reviewer";
import type { HomeSchedule } from "./home-schedule";
import { NO_SCHEDULE, readSchedule } from "./home-schedule";
import { sitesNotLive, stockShort } from "./home-site-stock-sources";
import { isStaffView, readStaffNarrow, WHOLE_BUSINESS } from "./home-staff";
import { readToday, todayScope } from "./home-today";
import { readWeek, weekScope } from "./home-week";

export type {
    HomeAction,
    HomeBooking,
    HomeEvidence,
    HomeInline,
    HomeInlineKind,
    HomeInput,
    HomeLastDay,
    HomeModel,
    HomeNeed,
    HomeNumber,
    HomeRetryVia,
    HomeReviewPage,
    HomeReviewSite,
    HomeSeverity,
    HomeSinceItem,
    HomeStaff,
    HomeStaffStore,
    HomeToday,
    HomeTodayItem,
    HomeTone,
    HomeUnavailable,
    HomeView,
    HomeWeek,
    HomeWeekChange,
    HomeWeekOwed,
    HomeWeekTakings,
} from "./home-model";

const SEVERITY_RANK: Record<HomeSeverity, number> = {
    ATTENTION: 0,
    OVERDUE: 1,
    SETUP: 2,
    SUGGESTION: 3,
};

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
        // Optional as the stock checks: without it no message is read.
        @Optional() private readonly threads?: ThreadsService,
        // Optional too: without it every row stays a link (F4).
        @Optional() private readonly inline?: HomeInlineService,
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
        // A Reviewer's Home is its own view (F9): read before anything
        // else, so no other source is ever asked on their behalf.
        if (input.organizationRole === "REVIEWER") {
            return this.buildReviewer(input);
        }

        // NOT guarded. Availability decides what Home is even allowed to show;
        // without it there is no page to degrade, and guessing would risk
        // emitting an action for a module the actor cannot see. Nor is a
        // staff member's narrowing (F11, `home-staff.ts`): without it, Home
        // can't tell their storefronts' work from the rest.
        const [views, staffView] = await Promise.all([
            this.availability.listViews(input),
            isStaffView(input) ? readStaffNarrow(this.db, input) : null,
        ]);
        const narrow = staffView?.narrow ?? WHOLE_BUSINESS;
        const stores = narrow.storeIds;
        const actions: HomeAction[] = [];

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

        /*
         * Every source below is independent of the others, so they are read
         * at once rather than one after another (H-4): Home is read on every
         * navigation (the rail's badges), and some twenty-five serial reads
         * made each one wait on the sum of them. Each keeps its own guard —
         * one failing is named and the rest still render — and each records
         * its failure in its own slot, so `unavailable` lists the parts in
         * the same order however the reads finish.
         */
        const slots: HomeUnavailable[][] = [];
        const guard = <T>(
            source: HomeUnavailable,
            read: () => Promise<T>,
            fallback: T,
        ): Promise<T> => {
            const slot: HomeUnavailable[] = [];
            slots.push(slot);
            return this.attempt(source, read, fallback, slot);
        };
        const skip = <T>(value: T): Promise<T> => Promise.resolve(value);

        const noEvidence = { count: 0, evidence: [] as HomeEvidence[] };
        const noRefunds: typeof noEvidence & { reason?: RefundReason } =
            noEvidence;
        const canReadInvoices = holds(input, "invoice:read");
        const canReadSubscriptions = holds(input, "subscription:read");
        const stockChecks = this.stockChecks;
        const threads = this.threads;
        const viewer = viewerOf(input);
        const scope = todayScope(input, available);
        const week = weekScope(input, available);

        const [
            crmNumbers,
            overdue,
            open,
            schedule,
            today,
            lastDay,
            owed,
            renewals,
            waiting,
            overdueInvoiceAction,
            short,
            notLive,
            thisWeek,
            reviews,
            notes,
            messages,
        ] = await Promise.all([
            available.has("CRM")
                ? guard(
                      { moduleKey: "CRM", label: "Customer numbers" },
                      () =>
                          readCrmNumbers(
                              this.db,
                              input.organizationId,
                              canReadLeads,
                          ),
                      [] as HomeNumber[],
                  )
                : skip([] as HomeNumber[]),
            active.has("CRM") && canReadLeads
                ? guard(
                      { moduleKey: "CRM", label: "Overdue follow-ups" },
                      () =>
                          overdueFollowUps(this.db, input.organizationId, now),
                      noEvidence,
                  )
                : skip(noEvidence),
            available.has("COMMERCE")
                ? guard<OpenOrders>(
                      { moduleKey: "COMMERCE", label: "Open orders" },
                      () =>
                          readOpenOrders(this.db, input.organizationId, {
                              now,
                              zone,
                              // An order's money is `order:read`'s;
                              // `order:stage` moves it without seeing it
                              // (DEC-024).
                              money: holds(input, "order:read"),
                              storeIds: stores,
                          }),
                      noEvidence,
                  )
                : skip<OpenOrders>(noEvidence),
            available.has("APPOINTMENTS")
                ? guard<HomeSchedule>(
                      { moduleKey: "APPOINTMENTS", label: "Schedule" },
                      () =>
                          readSchedule(
                              this.db,
                              input.organizationId,
                              now,
                              narrow,
                          ),
                      NO_SCHEDULE,
                  )
                : skip(NO_SCHEDULE),
            // The business's day, in its zone (F5): bookings, classes,
            // pick-ups.
            scope
                ? guard(
                      {
                          moduleKey: scope.bookings
                              ? "APPOINTMENTS"
                              : "COMMERCE",
                          label: "Today",
                      },
                      () =>
                          readToday(
                              this.db,
                              input,
                              scope,
                              { now, zone },
                              narrow,
                          ),
                      null,
                  )
                : skip(null),
            // The greeting's clock and the last 24 hours (F6), in the same
            // zone.
            guard(
                { moduleKey: "HOME", label: "The last 24 hours" },
                () =>
                    readLastDay(
                        this.db,
                        input,
                        available,
                        { now, zone },
                        stores,
                    ),
                lastDayHeader(now, zone),
            ),
            // Money taken through an invoice's pay link after the invoice
            // was already paid or voided (U13). The customer is owed it
            // back, so it is ATTENTION: already wrong, and only the merchant
            // can put it right. Shown wherever Payments is available — a
            // business that has since disconnected its provider still owes
            // the refund — and only to people who can read invoices.
            available.has("PAYMENTS") && canReadInvoices
                ? guard(
                      { moduleKey: "PAYMENTS", label: "Payments to refund" },
                      () => this.refundsOwed(input.organizationId),
                      noRefunds,
                  )
                : skip(noRefunds),
            // Renewals that haven't been paid, and invoices past due (F1).
            // Like refunds owed, they show wherever Payments is available:
            // the money is owed whether or not a provider is connected
            // today. Each asks for its own read, so a role holding one sees
            // only that one.
            available.has("PAYMENTS") && canReadSubscriptions
                ? guard(
                      { moduleKey: "PAYMENTS", label: "Failed renewals" },
                      () =>
                          failedRenewals(
                              this.db,
                              input.organizationId,
                              now,
                              canReadInvoices,
                              undefined,
                              undefined,
                              zone,
                          ),
                      null,
                  )
                : skip(null),
            // Pauses that ended with Payments off (D8): shown because
            // Payments is off, so not gated on it.
            canReadSubscriptions
                ? guard(
                      { moduleKey: "PAYMENTS", label: "Paused subscriptions" },
                      () =>
                          pausesWaitingOnPayments(
                              this.db,
                              input.organizationId,
                              now,
                          ),
                      null,
                  )
                : skip(null),
            available.has("PAYMENTS") && canReadInvoices
                ? guard(
                      { moduleKey: "PAYMENTS", label: "Overdue invoices" },
                      () => overdueInvoices(this.db, input.organizationId, now),
                      null,
                  )
                : skip(null),
            // Shelves short for open orders (F1): the Stock screen's own
            // checks.
            available.has("COMMERCE") &&
            holds(input, "store:read") &&
            stockChecks
                ? guard(
                      { moduleKey: "COMMERCE", label: "Stock" },
                      () =>
                          stockShort(
                              this.db,
                              stockChecks,
                              input.organizationId,
                              stores,
                          ),
                      null,
                  )
                : skip(null),
            // Websites that aren't live (F1). Never a Reviewer's: their Home
            // is its own view (F9) and returned before any of this.
            available.has("WEBSITE") && holds(input, "site:read")
                ? guard(
                      { moduleKey: "WEBSITE", label: "Website" },
                      () => sitesNotLive(this.db, input.organizationId),
                      null,
                  )
                : skip(null),
            // This week (F7): each figure for whoever holds its read.
            week
                ? guard(
                      { moduleKey: "HOME", label: "This week" },
                      () =>
                          readWeek(
                              this.db,
                              input.organizationId,
                              week,
                              { now, zone },
                              stores,
                          ),
                      null,
                  )
                : skip(null),
            // People waiting on the business (F2), each for whoever may
            // read it. Low-rated reviews without a reply.
            available.has("COMMERCE") && holds(input, "product-review:read")
                ? guard(
                      { moduleKey: "COMMERCE", label: "Reviews" },
                      () =>
                          lowStarReviews(this.db, input.organizationId, stores),
                      null,
                  )
                : skip(null),
            // Notes from the booking page, waiting to be checked (C12).
            available.has("APPOINTMENTS") && holds(input, "contact:write")
                ? guard(
                      {
                          moduleKey: "APPOINTMENTS",
                          label: "Booking-page notes",
                      },
                      () => bookingPageNotes(this.db, viewer, now),
                      null,
                  )
                : skip(null),
            // Messages nobody has answered (A13): only once customers can
            // write them, and only to someone who may read them.
            accountAreaOn() && holds(input, "message:read") && threads
                ? guard(
                      { moduleKey: "CRM", label: "Messages" },
                      async () =>
                          unansweredMessages(
                              await threads.waitingOnTeam(viewer, {
                                  now,
                                  olderThanMs: MESSAGE_WAIT_MS,
                                  limit: EVIDENCE_LIMIT,
                              }),
                              now,
                          ),
                      null,
                  )
                : skip(null),
        ]);
        const unavailable = slots.flat();

        numbers.push(...crmNumbers);

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

        if (available.has("COMMERCE")) {
            if (open.count > 0) {
                numbers.push({
                    key: "OPEN_ORDERS",
                    label: "Open orders",
                    value: open.count,
                    // The SCREEN that shows them, not the section above it.
                    // The rail badges whatever href an OVERDUE action
                    // carries, so pointing this at "/commerce" put the count
                    // on Sell and sent the merchant to a list of storefronts
                    // to hunt for orders one storefront at a time.
                    href: "/commerce/orders",
                    moduleKey: "COMMERCE",
                });
            }

            // The ACTION, unlike the number, still requires ACTIVE: telling
            // a merchant to fulfil orders through a module that is not ready
            // is sending them at a door that does not open.
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
                        ...(open.moreTone ? { moreTone: open.moreTone } : {}),
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

        const upcoming = schedule.upcoming;
        if (schedule.total > 0) {
            numbers.push({
                key: "UPCOMING_BOOKINGS",
                label: "Upcoming bookings",
                value: schedule.total,
                href: "/bookings",
                moduleKey: "APPOINTMENTS",
            });
        }

        if (owed.count > 0) {
            actions.push({
                code: "PAYMENTS_REFUNDS_OWED",
                title: refundsOwedTitle(owed.count, owed.reason),
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
        if (renewals) actions.push(renewals);
        if (waiting) actions.push(waiting);
        if (overdueInvoiceAction) actions.push(overdueInvoiceAction);
        if (short) actions.push(short);
        for (const waitingOnUs of [notes, messages, reviews]) {
            if (waitingOnUs) actions.push(waitingOnUs);
        }
        if (notLive) {
            // It names the sites, so readiness's general "Publish your site
            // to go live" would say the same thing twice.
            const setup = actions.findIndex((a) => a.code === "WEBSITE_SETUP");
            if (setup >= 0) actions.splice(setup, 1);
            actions.push(notLive);
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
        // What each row offers in place (F4), for whoever may do it.
        await this.inline?.decorate(actions, input, now);

        return {
            // A staff member's Home is the business's rows, narrowed (F11).
            ...(staffView
                ? { view: "staff" as const, staff: staffView.staff }
                : { view: "business" as const }),
            actions,
            primaryAction: actions[0] ?? null,
            hasAnyModule: views.some((v) => v.readiness !== "DISABLED"),
            upcoming,
            numbers,
            unavailable,
            ...flattenNeeds(actions, zone),
            today,
            lastDay,
            week: thisWeek,
        };
    }

    /**
     * A Reviewer's Home (F9): the greeting, and the sites they were asked
     * to review with their pages and open notes. No module readiness, no
     * numbers, no other source: every business-shaped field is sent empty,
     * so an app from before F9 still renders it. Without a viewer to scope
     * the grants to, there is nothing to read.
     */
    private async buildReviewer(input: HomeInput): Promise<HomeModel> {
        const now = new Date();
        const zone = await this.businessZone(input.organizationId);
        const unavailable: HomeUnavailable[] = [];
        const userId = input.userId;
        const reviews = userId
            ? await this.attempt(
                  { moduleKey: "WEBSITE", label: "Sites to review" },
                  () => readReviews(this.db, input.organizationId, userId),
                  [],
                  unavailable,
              )
            : [];
        return {
            view: "reviewer",
            reviews,
            actions: [],
            primaryAction: null,
            // Not the first-run question: a Reviewer has their sites.
            hasAnyModule: true,
            upcoming: [],
            numbers: [],
            unavailable,
            needs: [],
            needsTotal: 0,
            today: null,
            lastDay: lastDayHeader(now, zone),
            // No `week` at all (F7): not even an empty one travels to a
            // Reviewer.
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
     * Invoice payments captured but not applied — the invoice was already
     * paid or void when the money arrived — and not yet refunded, oldest
     * first. A refund the provider has reported (or one Saroh started)
     * takes the row off the list.
     */
    private async refundsOwed(organizationId: string): Promise<{
        count: number;
        evidence: HomeEvidence[];
        /** The oldest row's reason, for the action's title. */
        reason?: RefundReason;
    }> {
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
                            billToName: true,
                        },
                    },
                    attempts: {
                        where: { status: CAPTURED_NEEDS_REFUND },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { rawResponse: true },
                    },
                },
            }),
        ]);
        const evidence: HomeEvidence[] = [];
        let reason: RefundReason | undefined;
        for (const row of rows) {
            if (!row.invoice) continue;
            // Why, as recorded when the money came (K-1): the invoice's
            // status now can't tell a cancelled booking's pay link from an
            // invoice never paid.
            const why = refundReason(row.attempts[0]?.rawResponse);
            reason ??= why;
            const after = refundReasonWords(why);
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
        return { count, evidence, reason };
    }
}
