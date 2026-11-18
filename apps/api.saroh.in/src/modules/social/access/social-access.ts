import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { dayWords } from "../../../common/words-format";
import { CatalogueAccessService } from "../../billing/catalogue-access.service";
import type { MeterDb } from "../../billing/metering";
import { countedPosts, meterWindow } from "../../billing/metering";
import { lockMeter } from "../../billing/metering.service";
import {
    moduleLocked,
    PLAN_LIMIT_REACHED,
} from "../../billing/plan-limit-errors";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import type { OrgAction } from "../../organizations/organization-actions";
import { allows, authorize } from "../../organizations/organization-policy";

/** Saroh Social's row in the plans catalogue (`MODULE_MAP`), and its add-on's module. */
export const SOCIAL_MODULE = "social";
export const SOCIAL_LIMIT_KEY = "socialPostsPerMonth" as const;

/** Whether Saroh Social is open to this business, as the screens need it (S1, S7). */
export interface SocialAccessView {
    /**
     * `on`: it may be used. `locked`: the plan leaves it off (Free, Grow
     * without the add-on). `unavailable`: not rolled out to this business.
     */
    state: "on" | "locked" | "unavailable";
    /** May make, schedule and fix posts, and connect channels (`social:post`). */
    canPost: boolean;
    /** May see the plan and buy the add-on (`billing:manage`). */
    canBuy: boolean;
    /** The business's plan, and the next one with Social, when locked. */
    plan: { id: string; name: string } | null;
    upgradeTo: { planId: string; name: string } | null;
    /** This month's count, when on: one post to several channels is one. */
    usage: {
        used: number;
        /** Null: no cap. */
        limit: number | null;
        /** When the count starts again (ISO). */
        resetsAt: string;
        /** Request more was sent this month. */
        requested: boolean;
    } | null;
}

/** A count of posts and its window. */
export interface SocialRoom {
    used: number;
    limit: number | null;
    start: Date;
    end: Date;
    windowKey: string;
    zone: string;
}

/**
 * Who may use Saroh Social, and how much (plan saroh-social
 * 2026-11-18-001, U1). The gates, in order: the person's permission
 * (`social:read` to see, `social:post` to post and connect), the
 * `MODULE_SOCIAL` rollout (off: 404, as if nothing were here), and the
 * catalogue's `social` row (locked on Free, on Grow until its add-on is
 * bought, included on Pro). The plan check fails closed, as Ask AI's
 * does: a business the catalogue doesn't reach is locked, since every
 * post is Saroh's work on Meta's limits.
 *
 * The monthly count is per post, in the window of its `publishAt`
 * (`countedPosts`), so a post scheduled into next month counts there.
 */
@Injectable()
export class SocialAccess {
    constructor(
        private readonly flags: FeatureFlagService,
        @Optional()
        private readonly catalogue: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    /** The rollout alone: for the jobs, which have no person. */
    rolledOut(organizationId: string): Promise<boolean> {
        return this.flags.isEnabled("MODULE_SOCIAL", organizationId);
    }

    /** The catalogue's `social` row for the business, or null when the catalogue doesn't reach it. */
    async planRow(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<ModuleAccess | null> {
        const a = await this.catalogue.resolve(organizationId, now);
        if (a.source !== "catalogue") return null;
        return a.modules.find((m) => m.moduleId === SOCIAL_MODULE) ?? null;
    }

    /** The plan includes Social now (the jobs' re-check). */
    async included(
        organizationId: string,
        now: Date = new Date(),
    ): Promise<boolean> {
        return (await this.planRow(organizationId, now))?.state === "on";
    }

    /**
     * Refuse unless this person may do `action` with Social here, now:
     * 403 for the permission, 404 while it isn't rolled out, 403
     * `MODULE_LOCKED` when the plan leaves it off. The row, when it passes.
     */
    async assertOn(
        ctx: OrganizationContext,
        action: Extract<OrgAction, "social:read" | "social:post">,
        now: Date = new Date(),
    ): Promise<ModuleAccess> {
        authorize(ctx, action);
        if (!(await this.rolledOut(ctx.organizationId))) {
            throw new NotFoundException("Saroh Social isn't available yet.");
        }
        const row = await this.planRow(ctx.organizationId, now);
        if (!row) throw lockedOffCatalogue();
        if (row.state !== "on") throw moduleLocked(row);
        return row;
    }

    async view(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<SocialAccessView> {
        authorize(ctx, "social:read");
        const base = {
            canPost: allows(ctx, "social:post"),
            canBuy: allows(ctx, "billing:manage"),
        };
        if (!(await this.rolledOut(ctx.organizationId))) {
            return {
                ...base,
                state: "unavailable",
                plan: null,
                upgradeTo: null,
                usage: null,
            };
        }
        const row = await this.planRow(ctx.organizationId, now);
        const plan = row ? { id: row.planId, name: row.plan } : null;
        if (row?.state !== "on") {
            return {
                ...base,
                state: "locked",
                plan,
                upgradeTo: row?.upgradePlanId
                    ? { planId: row.upgradePlanId, name: row.upgradeTo }
                    : null,
                usage: null,
            };
        }
        const room = await countRoom(prisma, ctx.organizationId, row, now);
        const requested = await prisma.socialRequest.count({
            where: {
                organizationId: ctx.organizationId,
                windowKey: room.windowKey,
            },
        });
        return {
            ...base,
            state: "on",
            plan,
            upgradeTo: null,
            usage: {
                used: room.used,
                limit: room.limit,
                resetsAt: room.end.toISOString(),
                requested: requested > 0,
            },
        };
    }
}

/** The count in the window `at` falls in, against the row's cap. */
export async function countRoom(
    db: MeterDb,
    organizationId: string,
    row: Pick<ModuleAccess, "limit">,
    at: Date,
): Promise<SocialRoom> {
    const window = await meterWindow(db, organizationId, at);
    const used = await db.socialPost.count({
        where: { organizationId, ...countedPosts(window) },
    });
    return {
        used,
        limit: row.limit,
        start: window.start,
        end: window.end,
        windowKey: window.key,
        zone: window.zone,
    };
}

/**
 * Before a post starts counting (scheduled, or posted now), on the write's
 * own transaction: under the business's meter lock, refuse (403
 * `PLAN_LIMIT_REACHED`, with when it resets) when the month `at` falls in
 * is full. Scheduled posts already counted still go out.
 */
export async function assertPostRoom(
    tx: Prisma.TransactionClient,
    organizationId: string,
    row: Pick<ModuleAccess, "limit">,
    at: Date,
): Promise<SocialRoom> {
    await lockMeter(tx, organizationId, SOCIAL_LIMIT_KEY);
    const room = await countRoom(tx, organizationId, row, at);
    if (room.limit !== null && room.used >= room.limit) {
        throw postLimitReached(room);
    }
    return room;
}

export function postLimitReached(room: SocialRoom): ForbiddenException {
    const resets = dayWords(room.end, room.zone);
    return new ForbiddenException({
        message: `You've used your ${room.limit ?? 0} posts for this month. Posts already scheduled still go out. More from ${resets}.`,
        details: {
            code: PLAN_LIMIT_REACHED,
            moduleId: SOCIAL_MODULE,
            limitKey: SOCIAL_LIMIT_KEY,
            limit: room.limit,
            used: room.used,
            per: "month",
            resetsAt: room.end.toISOString(),
        },
    });
}

function lockedOffCatalogue(): ForbiddenException {
    return new ForbiddenException({
        message: "Saroh Social isn't in your plan.",
        details: {
            code: "MODULE_LOCKED",
            moduleId: SOCIAL_MODULE,
            plan: null,
            upgradeTo: null,
        },
    });
}
