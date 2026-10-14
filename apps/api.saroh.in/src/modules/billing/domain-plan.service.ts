import { Injectable, Logger, Optional } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { BusinessAccess } from "./catalogue-access.service";
import {
    CatalogueAccessService,
    newestPlanOverride,
} from "./catalogue-access.service";
import type { DomainPlanState } from "./domain-plan";
import {
    DOMAIN_ENDED_KEY,
    DOMAIN_ENDED_KIND,
    DOMAIN_ENTITLEMENT,
    domainPlanState,
} from "./domain-plan";
import { PLAN_ENDING_SHOWN_DAYS } from "./plan-ending";
import { termEndingOf } from "./term-ending";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead a plan's end is read: as far as its first notice. */
const AHEAD_MS = PLAN_ENDING_SHOWN_DAYS * DAY_MS;

/** How long a "is the domain paused" answer is reused for one business. */
const CACHE_MS = 30_000;

/** A connected domain: verified, and bound to a website. */
export interface ConnectedDomain {
    hostname: string;
    siteId: string;
    /** The website's Saroh address (`yourshop` in `yourshop.saroh.app`). */
    subdomain: string | null;
}

/** Where a business's own domain stands against its plan now. */
export interface DomainStanding {
    /** `PLAN_ENFORCEMENT` for this business. */
    enforced: boolean;
    plan: DomainPlanState;
    /** Its connected domains, the first verified first. */
    domains: ConnectedDomain[];
}

/**
 * Whether a business's plan includes its own domain, and what that means
 * for the domain now (DEC-139, `domain-plan.ts`). The one reader: the
 * renderer's host lookup, the canonical and link origins, the Website
 * settings row and the notices all ask here.
 *
 * What it reads:
 *
 * - **The plan now**: `customDomain` in the business's entitlements
 *   (`CatalogueAccessService.resolve`), the key `DomainsService.claim` has
 *   always asked.
 * - **An end known ahead**, while the plan still includes a domain: a plan
 *   override's end, a move waiting on the subscription (`pendingFrom`), or
 *   an autopay nobody has approved again (`termEndingOf`), whichever
 *   comes first and reads without a domain. Only within the 30 days the
 *   plan's own notices cover.
 * - **The clock**, once it doesn't: the business's `DOMAIN_PLAN_ENDED`
 *   claim, written by the billing sweep.
 *
 * Fails safe, as the other plan reads do: a read that throws pauses
 * nothing and is logged (`domain_plan_unresolved`).
 */
@Injectable()
export class DomainPlanService {
    private readonly logger = new Logger(DomainPlanService.name);
    private readonly cache = new Map<
        string,
        { until: number; value: boolean }
    >();

    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    /** The state alone, for a caller that doesn't need the domains. */
    async stateOf(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<DomainPlanState> {
        return (await this.read(organizationId, now)).plan;
    }

    /** The state and the business's connected domains. */
    async standing(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<DomainStanding> {
        const read = await this.read(organizationId, now);
        const rows = await prisma.domain.findMany({
            where: {
                organizationId,
                status: "VERIFIED",
                siteId: { not: null },
            },
            orderBy: [{ verifiedAt: "asc" }, { id: "asc" }],
            select: {
                hostname: true,
                siteId: true,
                site: { select: { subdomain: true, deletedAt: true } },
            },
        });
        const domains = rows.flatMap((d) =>
            d.siteId && d.site && !d.site.deletedAt
                ? [
                      {
                          hostname: d.hostname,
                          siteId: d.siteId,
                          subdomain: d.site.subdomain,
                      },
                  ]
                : [],
        );
        return { ...read, domains };
    }

    /**
     * {@link standing} for a caller the domain is only a part of (a list of
     * domains, the plan's own notice): null when it can't be read, logged,
     * so the rest goes on without it.
     */
    async standingOrNull(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<DomainStanding | null> {
        try {
            return await this.standing(organizationId, now);
        } catch (err) {
            this.logger.warn(
                `domain_plan_unresolved org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return null;
        }
    }

    /**
     * Whether the business's domain is paused now, for the reads that act
     * on it: the host lookup, and every place that picks the site's
     * address. Reused for {@link CACHE_MS} per business, since a public
     * page asks on every read. Never throws: unknown reads as not paused.
     */
    async paused(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        const hit = this.cache.get(organizationId);
        if (hit && hit.until > Date.now()) return hit.value;
        let value: boolean;
        try {
            // A visitor names only a host: read as the business itself.
            const plan = await runInOrgContext(organizationId, () =>
                this.stateOf(organizationId, now),
            );
            value = plan.state === "paused";
        } catch (err) {
            this.logger.warn(
                `domain_plan_unresolved org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return false;
        }
        this.cache.set(organizationId, { until: Date.now() + CACHE_MS, value });
        return value;
    }

    /** Drop a business's cached answer (a test, or a write that changes it). */
    forget(organizationId?: string): void {
        if (organizationId) this.cache.delete(organizationId);
        else this.cache.clear();
    }

    private async read(
        organizationId: string,
        now: Date,
    ): Promise<{ enforced: boolean; plan: DomainPlanState }> {
        const enforced = await this.flags.isEnabled(
            FlagKey.PLAN_ENFORCEMENT,
            organizationId,
        );
        if (!enforced) return { enforced, plan: { state: "included" } };
        const a = await this.access.resolve(organizationId, now);
        const includedNow = includes(a);
        const [endsAt, endedAt] = await Promise.all([
            includedNow ? this.endsAt(organizationId, now, a) : null,
            includedNow ? null : this.clock(organizationId),
        ]);
        return {
            enforced,
            plan: domainPlanState({
                enforced,
                includedNow,
                endsAt,
                endedAt,
                now,
            }),
        };
    }

    /** When the plan stopped including a domain, as the sweep recorded it. */
    private async clock(organizationId: string): Promise<Date | null> {
        const claim = await prisma.customerNotice.findUnique({
            where: {
                organizationId_eventKey: {
                    organizationId,
                    eventKey: DOMAIN_ENDED_KEY,
                },
            },
            select: { createdAt: true, kind: true },
        });
        return claim?.kind === DOMAIN_ENDED_KIND ? claim.createdAt : null;
    }

    /**
     * The first time ahead, within 30 days, at which the plan is known to
     * read without a domain; null when none is known.
     */
    private async endsAt(
        organizationId: string,
        now: Date,
        a: BusinessAccess,
    ): Promise<Date | null> {
        const within = (at: Date | null | undefined): at is Date =>
            !!at &&
            at.getTime() > now.getTime() &&
            at.getTime() - now.getTime() <= AHEAD_MS;
        const sub = await prisma.subscription.findUnique({
            where: { organizationId },
            select: { id: true, status: true, pendingFrom: true },
        });
        const live = sub && sub.status !== "CANCELLED" ? sub : null;

        const ends: Date[] = [];
        // A plan given until a date, or a move waiting on the subscription:
        // read the business as it will be then.
        for (const at of [a.planOverride?.expiresAt, live?.pendingFrom]) {
            if (!within(at)) continue;
            if (!includes(await this.access.resolve(organizationId, at))) {
                ends.push(at);
            }
        }
        // A term nobody has paid for again moves to Free at its end
        // (`term-end.ts`), unless a plan given to the business still
        // stands then.
        if (live) {
            const term = await termEndingOf(prisma, live.id, now);
            const at = term?.term.endsAt;
            if (
                within(at) &&
                !(await this.planGivenAt(organizationId, at, a))
            ) {
                ends.push(at);
            }
        }
        if (ends.length === 0) return null;
        return ends.reduce((first, at) =>
            at.getTime() < first.getTime() ? at : first,
        );
    }

    /**
     * Whether a plan override that stands at `at` gives the business a paid
     * plan: the one thing that keeps a domain past a term's move to Free.
     * Off the catalogue the plan's price isn't known, so an override that
     * stands counts (nothing is paused on a guess).
     */
    private async planGivenAt(
        organizationId: string,
        at: Date,
        a: BusinessAccess,
    ): Promise<boolean> {
        const rows = await prisma.entitlementOverride.findMany({
            where: {
                organizationId,
                kind: "plan",
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: at } }],
            },
            select: {
                id: true,
                kind: true,
                key: true,
                moduleKey: true,
                value: true,
                planKey: true,
                createdAt: true,
                expiresAt: true,
                revokedAt: true,
            },
        });
        const given = newestPlanOverride(rows, at);
        if (!given) return false;
        if (a.source !== "catalogue") return true;
        const plan = a.catalog.plans.find((p) => p.id === given.planKey);
        return (plan?.pricePaise ?? 0) > 0;
    }
}

/** Whether a resolved business's plan includes its own domain. */
function includes(a: BusinessAccess): boolean {
    return a.entitlements[DOMAIN_ENTITLEMENT] === true;
}

/** The service built bare, for free functions (as `overLimit` is). */
export const domainPlan = new DomainPlanService();
