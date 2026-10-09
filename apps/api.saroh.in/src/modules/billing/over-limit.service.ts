import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { CatalogueAccessService } from "./catalogue-access.service";
import { openInvitations, SHOP_KIND } from "./metering";
import type {
    Cut,
    NamedPlace,
    PausedNow,
    PauseLimits,
    PauseMeasure,
    TeamPerson,
} from "./over-limit";
import {
    anythingPauses,
    keepOldest,
    keepTeam,
    MOVE_DOWN_CLAIM_KIND,
    moveDownClaimKey,
    pausedFromMeasure,
    pauseLimitsOf,
    pausesFrom,
} from "./over-limit";
import { BOOKABLE_STAFF, countedOnDiary, roleActionsOf, seatOf } from "./seats";

/** The tables measuring reads. */
export type OverLimitDb = Pick<
    Prisma.TransactionClient,
    | "membership"
    | "staffMember"
    | "organizationInvitation"
    | "organizationRole"
    | "product"
    | "post"
    | "store"
    | "site"
    | "customerNotice"
>;

/** Where a business stands against its limits now. */
export interface OverLimitStanding {
    limits: PauseLimits;
    measure: PauseMeasure;
    /** Anything over its limit. */
    over: boolean;
    /** The grace claim for these limits, when the business was told. */
    toldAt: Date | null;
    /** When pausing starts (7 days after it was told); null if not told. */
    pausesFrom: Date | null;
    /** Over, told, and the 7 days are up: things are paused. */
    paused: boolean;
}

/** The products a limit counts: everything not archived (metering's). */
export const COUNTED_PRODUCTS = { status: { not: "ARCHIVED" } } as const;

/** The posts a limit counts: live on a site that isn't deleted. */
export function countedPosts(organizationId: string): Prisma.PostWhereInput {
    return {
        currentPublicationId: { not: null },
        site: { organizationId, deletedAt: null },
    };
}

/** How long a "what is paused" answer is reused for one business. */
const CACHE_MS = 30_000;

/**
 * What a move to a lower plan pauses (#800), derived from the plan the
 * business reads and a fixed order (`over-limit.ts`), never stored. The
 * reads and writes that enforce it ask {@link pausedNow}; the notices
 * (#801) ask {@link previewAt} and {@link previewOnPlan}, so what a notice
 * lists is what then pauses.
 *
 * Behind `PLAN_ENFORCEMENT` and the catalogue path, as metering is: with
 * the switch off, or a business the catalogue doesn't reach, nothing
 * pauses. Fail safe as metering is (OQ-4): a plan or count that can't be
 * read pauses nothing, and is logged (`over_limit_unresolved`).
 *
 * **The 7-day promise.** Over a limit is not enough: a business pauses
 * only once it was told what would pause at least 7 days ago — the grace
 * claim (`MOVE_DOWN` `CustomerNotice`, keyed by the limits it was told
 * about) the notices write. A move told 7 days ahead pauses on its date; a
 * move that happens at once (a failed payment, a cancel now, a limit an
 * operator lowered) is told by the next hourly sweep and pauses 7 days
 * after (`move-down-notice.ts`).
 */
@Injectable()
export class OverLimitService {
    private readonly logger = new Logger(OverLimitService.name);
    private readonly cache = new Map<
        string,
        { until: number; value: PausedNow | null }
    >();

    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    /**
     * The caps that pause things now; null when nothing is enforced
     * (switch off, off the catalogue).
     */
    async limitsNow(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<PauseLimits | null> {
        if (
            !(await this.flags.isEnabled(
                FlagKey.PLAN_ENFORCEMENT,
                organizationId,
            ))
        )
            return null;
        const a = await this.access.resolve(organizationId, now);
        if (a.source !== "catalogue") return null;
        return pauseLimitsOf(a.modules);
    }

    /** Where the business stands now; null when nothing is enforced. */
    async standing(
        organizationId: string,
        now: Date = new Date(),
        db: OverLimitDb = prisma,
    ): Promise<OverLimitStanding | null> {
        const limits = await this.limitsNow(organizationId, now);
        if (!limits) return null;
        const measure = await measurePauses(db, organizationId, limits);
        const over = anythingPauses(measure);
        if (!over) {
            return {
                limits,
                measure,
                over,
                toldAt: null,
                pausesFrom: null,
                paused: false,
            };
        }
        const claim = await db.customerNotice.findUnique({
            where: {
                organizationId_eventKey: {
                    organizationId,
                    eventKey: moveDownClaimKey(limits),
                },
            },
            select: { createdAt: true, kind: true },
        });
        const toldAt =
            claim?.kind === MOVE_DOWN_CLAIM_KIND ? claim.createdAt : null;
        const from = toldAt ? pausesFrom(toldAt) : null;
        return {
            limits,
            measure,
            over,
            toldAt,
            pausesFrom: from,
            paused: from !== null && from.getTime() <= now.getTime(),
        };
    }

    /**
     * What is paused now, for the reads and writes that enforce it; null
     * when nothing is. Reused for {@link CACHE_MS} per business: a public
     * page asks on every read.
     */
    async pausedNow(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<PausedNow | null> {
        const hit = this.cache.get(organizationId);
        if (hit && hit.until > Date.now()) return hit.value;
        let value: PausedNow | null;
        try {
            const s = await this.standing(organizationId, now);
            value =
                s?.paused && s.pausesFrom
                    ? pausedFromMeasure(organizationId, s.pausesFrom, s.measure)
                    : null;
        } catch (err) {
            this.logger.warn(
                `over_limit_unresolved org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return null;
        }
        this.cache.set(organizationId, { until: Date.now() + CACHE_MS, value });
        return value;
    }

    /** Drop a business's cached answer (a test, or a write that changes it). */
    forget(organizationId?: string): void {
        if (organizationId) this.cache.delete(organizationId);
        else this.cache.clear();
    }

    /**
     * What would pause at `at`, reading the business then
     * (`CatalogueAccessService.resolve(…, at)`: a plan override that has
     * ended, a move whose date has come). Null when nothing is enforced.
     */
    async previewAt(
        organizationId: string,
        at: Date,
    ): Promise<PauseMeasure | null> {
        if (
            !(await this.flags.isEnabled(
                FlagKey.PLAN_ENFORCEMENT,
                organizationId,
            ))
        )
            return null;
        const a = await this.access.resolve(organizationId, at);
        if (a.source !== "catalogue") return null;
        return this.previewFor(organizationId, a.modules);
    }

    /**
     * What would pause on catalogue plan `planId` at `at` (a term that ends
     * unpaid moves to Free). Null when nothing is enforced.
     */
    async previewOnPlan(
        organizationId: string,
        planId: string,
        at: Date,
        now: Date = new Date(),
    ): Promise<PauseMeasure | null> {
        if (
            !(await this.flags.isEnabled(
                FlagKey.PLAN_ENFORCEMENT,
                organizationId,
            ))
        )
            return null;
        const modules = await this.access.modulesOnPlan(
            organizationId,
            planId,
            at,
            now,
        );
        if (!modules) return null;
        return this.previewFor(organizationId, modules);
    }

    private previewFor(
        organizationId: string,
        modules: readonly ModuleAccess[],
    ): Promise<PauseMeasure> {
        return measurePauses(prisma, organizationId, pauseLimitsOf(modules));
    }
}

/** The service built bare, for free functions (as `planMeter` is). */
export const overLimit = new OverLimitService();

/**
 * Measure what `limits` pause in a business, reading only what a capped
 * key needs.
 */
export async function measurePauses(
    db: OverLimitDb,
    organizationId: string,
    limits: PauseLimits,
): Promise<PauseMeasure> {
    const [people, products, posts, locations, sites] = await Promise.all([
        limits.teamMembers !== null || limits.reviewers !== null
            ? teamPaused(db, organizationId, limits)
            : Promise.resolve([] as TeamPerson[]),
        newestCut(
            limits.products,
            () =>
                db.product.count({
                    where: { organizationId, ...COUNTED_PRODUCTS },
                }),
            (skip) =>
                db.product.findFirst({
                    where: { organizationId, ...COUNTED_PRODUCTS },
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    skip,
                    select: { id: true, createdAt: true },
                }),
        ),
        newestCut(
            limits.blogPosts,
            () => db.post.count({ where: countedPosts(organizationId) }),
            (skip) =>
                db.post.findFirst({
                    where: countedPosts(organizationId),
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    skip,
                    select: { id: true, createdAt: true },
                }),
        ),
        limits.shopLocations === null
            ? Promise.resolve([] as NamedPlace[])
            : db.store
                  .findMany({
                      where: {
                          organizationId,
                          deletedAt: null,
                          settings: { kind: SHOP_KIND },
                      },
                      select: { id: true, name: true, createdAt: true },
                  })
                  .then(
                      (rows) => keepOldest(rows, limits.shopLocations).paused,
                  ),
        limits.sites === null
            ? Promise.resolve([] as NamedPlace[])
            : db.site
                  .findMany({
                      where: { organizationId, deletedAt: null },
                      select: { id: true, name: true, createdAt: true },
                  })
                  .then((rows) => keepOldest(rows, limits.sites).paused),
    ]);
    return { limits, people, products, posts, locations, sites };
}

/**
 * "Newest N stay" over a table counted, not listed: how many pause, and
 * the oldest row kept (`Cut`).
 */
async function newestCut(
    limit: number | null,
    count: () => Promise<number>,
    nth: (skip: number) => Promise<{ id: string; createdAt: Date } | null>,
): Promise<{ cut: Cut; count: number }> {
    if (limit === null) return { cut: null, count: 0 };
    const total = await count();
    if (total <= limit) return { cut: null, count: 0 };
    if (limit <= 0) return { cut: "all", count: total };
    const row = await nth(limit - 1);
    // Rows went between the count and the read: nothing to cut by.
    if (!row) return { cut: null, count: 0 };
    return { cut: row, count: total - limit };
}

/** The team, in pause order, past each seat kind's limit (DEC-105). */
async function teamPaused(
    db: OverLimitDb,
    organizationId: string,
    limits: PauseLimits,
): Promise<TeamPerson[]> {
    const now = new Date();
    const [members, diary, invites, roles] = await Promise.all([
        db.membership.findMany({
            where: { organizationId },
            select: {
                id: true,
                role: true,
                extraActions: true,
                createdAt: true,
                staffMember: { select: { status: true } },
                user: { select: { name: true, email: true } },
            },
        }),
        db.staffMember.findMany({
            where: {
                organizationId,
                status: BOOKABLE_STAFF,
                membershipId: null,
            },
            select: { id: true, name: true, createdAt: true },
        }),
        db.organizationInvitation.findMany({
            where: { organizationId, ...openInvitations(now) },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                staffMember: { select: { status: true, membershipId: true } },
            },
        }),
        db.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
    ]);
    const lookup = roleActionsOf(roles);
    const people: TeamPerson[] = [
        ...members.map((m): TeamPerson => ({
            id: m.id,
            createdAt: m.createdAt,
            kind: "member",
            label: m.user.name?.trim() ? m.user.name.trim() : m.user.email,
            owner: m.role === "OWNER",
            seat: seatOf(
                lookup,
                m.role,
                m.extraActions,
                m.staffMember?.status === BOOKABLE_STAFF,
            ),
        })),
        ...diary.map((d): TeamPerson => ({
            id: d.id,
            createdAt: d.createdAt,
            kind: "diary",
            label: d.name,
            owner: false,
            seat: "seat",
        })),
        ...invites
            .filter((i) => !countedOnDiary(i.staffMember))
            .map((i): TeamPerson => ({
                id: i.id,
                createdAt: i.createdAt,
                kind: "invite",
                label: i.email,
                owner: false,
                seat: seatOf(lookup, i.role),
            })),
    ];
    return [
        ...keepTeam(people, "seat", limits.teamMembers).paused,
        ...keepTeam(people, "viewOnly", limits.reviewers).paused,
    ];
}
