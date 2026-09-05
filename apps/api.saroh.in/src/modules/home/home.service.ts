import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";

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
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

const SEVERITY_RANK: Record<HomeSeverity, number> = {
    ATTENTION: 0,
    OVERDUE: 1,
    SETUP: 2,
    SUGGESTION: 3,
};

/**
 * How many rows of evidence an action carries. Five is what fits on Home
 * without turning it into the list screen it links to; `count` still reports the
 * true total, so "5 of 23" is expressible and nothing is silently hidden.
 */
const EVIDENCE_LIMIT = 5;

/** How far ahead the schedule band looks. */
const UPCOMING_LIMIT = 8;

/**
 * One concrete row behind an action's count.
 *
 * `amountMinor` is in MINOR units and `currency` may be null, because the two
 * sources disagree and pretending otherwise would print wrong money: an Order
 * stores a Decimal with an explicit currency, while a CRM Lead stores a bare
 * integer with no currency at all. A null currency means "this number has no
 * stated currency" and the client must render it without a symbol — not guess
 * one from the locale.
 */
export interface HomeEvidence {
    id: string;
    /** The thing itself — a lead's title, an order's number. */
    title: string;
    /** Who it concerns, when known. */
    subtitle: string | null;
    /** ISO instant this row is measured from: due date, or placed date. */
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
    href: string;
}

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
    /** The true total behind the action, which may exceed `evidence.length`. */
    count?: number;
    evidence?: HomeEvidence[];
}

/**
 * A booking on the schedule band.
 *
 * `timezone` travels with every row rather than being resolved here: a booking
 * is stored in absolute UTC plus the zone the booker saw, and an Organization
 * has no single timezone to fold them into. Deciding server-side what counts as
 * "today" would be wrong for any merchant whose bookers are not in their zone,
 * so the client groups by each booking's own day.
 */
export interface HomeBooking {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    serviceName: string;
    who: string | null;
    status: string;
    href: string;
}

/**
 * A count that is a destination.
 *
 * Every number on Home links to the exact rows it counts — `href` carries the
 * filter, not just the screen. A tile that states "12 open leads" and lands on
 * an unfiltered list has made the merchant do the filtering twice.
 */
export interface HomeNumber {
    key: string;
    label: string;
    value: number;
    href: string;
    moduleKey?: string;
}

/**
 * A part of Home that could not be read.
 *
 * The difference between "you have no open orders" and "we could not find out
 * whether you have open orders" is the whole of PRODUCT_STRATEGY §30, and the
 * client cannot render a difference the API does not express.
 */
export interface HomeUnavailable {
    /** Module key the failed source belongs to, e.g. `COMMERCE`. */
    moduleKey: string;
    /** What the merchant would call it, e.g. "Open orders". */
    label: string;
}

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
    /** Confirmed bookings from now forward; the client groups them by day. */
    upcoming: HomeBooking[];
    numbers: HomeNumber[];
    /**
     * Sources that failed. Empty on a healthy read. Non-empty means what is
     * shown is INCOMPLETE, and Home must say so rather than presenting the
     * subset as the whole picture (§30).
     */
    unavailable: HomeUnavailable[];
}

export interface HomeInput {
    organizationId: string;
    organizationRole: OrgRole;
    projectId?: string;
}

/** A person's display name from optional name parts, falling back to email. */
function personName(person: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}): string | null {
    const full = [person.firstName, person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (full) return full;
    // NOT `?? null`: an email of "" is not nullish, so `??` would return the
    // empty string and the caller would render a blank line where it expects
    // either a name or a deliberate absence.
    const email = person.email?.trim();
    return email !== undefined && email.length > 0 ? email : null;
}

@Injectable()
export class HomeService {
    private readonly logger = new Logger(HomeService.name);

    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
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
        const numbers: HomeNumber[] = [];
        let upcoming: HomeBooking[] = [];

        if (available.has("CRM")) {
            numbers.push(
                ...(await this.attempt(
                    { moduleKey: "CRM", label: "Customer numbers" },
                    () => this.crmNumbers(input.organizationId),
                    [],
                    unavailable,
                )),
            );
        }

        if (active.has("CRM")) {
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
                () => this.openOrders(input.organizationId),
                { count: 0, evidence: [] },
                unavailable,
            );

            if (open.count > 0) {
                numbers.push({
                    key: "OPEN_ORDERS",
                    label: "Open orders",
                    value: open.count,
                    href: "/commerce",
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
                        href: "/commerce",
                        severity: "OVERDUE",
                        moduleKey: "COMMERCE",
                        count: open.count,
                        evidence: open.evidence,
                    });
                } else {
                    actions.push({
                        code: "COMMERCE_SUGGEST_PRODUCT",
                        title: "Add a product to your catalog",
                        href: "/commerce",
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
        };
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
            })),
        };
    }

    /** Unfulfilled orders, oldest first — longest wait is the biggest problem. */
    private async openOrders(
        organizationId: string,
    ): Promise<{ count: number; evidence: HomeEvidence[] }> {
        const where = {
            organizationId,
            status: { in: ["PENDING", "PROCESSING"] },
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
            evidence: rows.map((row) => ({
                id: row.id,
                title: row.orderId,
                subtitle: personName(row.customer),
                at: row.createdAt.toISOString(),
                // Decimal in MAJOR units on the row; the wire contract is minor
                // units, so it is converted once here rather than in each client.
                amountMinor: Math.round(Number(row.total) * 100),
                currency: row.currency,
                href: `/stores/${row.storeId}/orders/${row.id}`,
            })),
        };
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
    private async crmNumbers(organizationId: string): Promise<HomeNumber[]> {
        const [openLeads, contacts] = await Promise.all([
            this.db.lead.count({ where: { organizationId, status: "OPEN" } }),
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
