import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { ModuleAccess } from "@saroh/pricing-catalog";
import { LIMIT_WARN_AT } from "@saroh/pricing-catalog";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { CatalogueAccessService } from "./catalogue-access.service";
import type { MeteredLimitKey } from "./metering";
import { countUsage, meteredKeyOf } from "./metering";
import { moduleLocked, planLimitReached } from "./plan-limit-errors";

/** The job that tells a business it is near or at a limit. */
export const PLAN_LIMIT_NOTICE_TYPE = "plan.limit.notice";

/** `plan.limit.notice`'s payload: ids only; the handler re-reads the rest. */
export interface PlanLimitNoticePayload {
    organizationId: string;
    moduleId: string;
}

/** What a metered write found: the cap, and the count before it adds. */
export interface PlanRoom {
    organizationId: string;
    moduleId: string;
    key: MeteredLimitKey;
    limit: number;
    used: number;
    adding: number;
}

export interface RoomOptions {
    /** How many the write adds (default 1; 0 checks nothing). */
    adding?: number;
    /**
     * Never refuse: count, and tell the business when it passes its cap —
     * the site's checkout at the monthly orders cap (OQ-8: a soft cap). A
     * row the catalogue marks soft (`ModuleAccess.soft`: storage, visits)
     * is soft whatever the call site passes.
     */
    soft?: boolean;
    /** The refusal to throw instead of `PLAN_LIMIT_REACHED` (the booking page's). */
    refuse?: () => Error;
    /**
     * For a write that must never go unmetered (Saroh's emails, DEC-086):
     * the error to throw, before anything is counted or told, when the
     * catalogue marks the row soft — a soft row would never refuse it.
     */
    refuseSoft?: () => Error;
    now?: Date;
}

/** The tables a metered write's transaction needs. */
type MeterTx = Prisma.TransactionClient;

/**
 * Serialise a business's writes against one limit for the rest of the
 * transaction (`backend-jobs.md`, advisory lock registry: `plan-meter`), so
 * two creates at once can't both pass a count that only one fits.
 */
export async function lockMeter(
    tx: Pick<MeterTx, "$executeRaw">,
    organizationId: string,
    key: MeteredLimitKey,
): Promise<void> {
    const lock = `plan-meter:${organizationId}:${key}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
}

/**
 * The catalogue's limits made real (plans catalogue U13, R7, KTD-9).
 *
 * Every write that adds a metered thing asks {@link roomInTx} on its own
 * transaction before writing; every write a switch row governs asks
 * {@link assertIncluded}. Both answer only behind the `PLAN_ENFORCEMENT`
 * kill switch (OQ-4): off, they read nothing and refuse nothing. They read
 * the business through `CatalogueAccessService`, so its plan, overrides and
 * add-ons are the same ones `GET …/billing/access` shows; a business the
 * catalogue doesn't reach yet (`source: "legacy"`) is never refused here.
 * Websites and locations: where {@link enforcedRow} answers for `sites` or
 * `locations`, the catalogue governs them and the old `sites`/`storefronts`
 * floor isn't asked; where it doesn't (switch off, off the catalogue), the
 * callers keep the floor `EntitlementService.check` has always enforced
 * (`LEGACY_FLOOR_ENTITLEMENTS`), so nothing new locks behind the switch.
 *
 * Fail safe (OQ-4): if the plan can't be read, the write goes ahead and the
 * failure is logged (`plan_meter_unresolved`) — a business keeps what it has
 * rather than being refused because a lookup failed.
 *
 * "Over" after a downgrade is not refused for what exists: existing things
 * stay readable and editable, and only adding more is refused.
 */
@Injectable()
export class MeteringService {
    private readonly logger = new Logger(MeteringService.name);

    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
        @Optional()
        private readonly flags: FeatureFlagService = new FeatureFlagService(),
    ) {}

    /** Whether the catalogue's limits and locks apply to this business. */
    async enforcing(organizationId: string): Promise<boolean> {
        return this.flags.isEnabled(FlagKey.PLAN_ENFORCEMENT, organizationId);
    }

    /**
     * One catalogue row as this business has it, when enforcement applies;
     * null when it doesn't (switch off, off the catalogue, a row its version
     * doesn't have) or when the lookup failed (logged).
     */
    async enforcedRow(
        organizationId: string,
        moduleId: string,
        now: Date = new Date(),
    ): Promise<ModuleAccess | null> {
        try {
            if (!(await this.enforcing(organizationId))) return null;
            const a = await this.access.resolve(organizationId, now);
            if (a.source !== "catalogue") return null;
            return a.modules.find((m) => m.moduleId === moduleId) ?? null;
        } catch (err) {
            this.logger.warn(
                `plan_meter_unresolved org=${organizationId} module=${moduleId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return null;
        }
    }

    /**
     * Refuse (403 `MODULE_LOCKED`) a write the business's plan leaves off:
     * custom roles, themes, site review. Nothing behind the kill switch.
     */
    async assertIncluded(
        organizationId: string,
        moduleId: string,
        now: Date = new Date(),
    ): Promise<void> {
        const row = await this.enforcedRow(organizationId, moduleId, now);
        if (row && row.state !== "on") throw moduleLocked(row);
    }

    /**
     * Before a write adds `adding` of a metered row's things, on the write's
     * own transaction: refuse (403 `PLAN_LIMIT_REACHED`, or `refuse`) when
     * they would pass the cap, or (403 `MODULE_LOCKED`) when the plan leaves
     * the row off; then queue the 80% / 100% notice when this write reaches
     * one (`plan.limit.notice`, sent once the transaction commits).
     *
     * Takes the row's advisory lock before counting, so call it before the
     * transaction takes row locks of its own. Returns what it counted, or
     * null when nothing applies (switch off, no cap, off the catalogue).
     */
    async roomInTx(
        tx: MeterTx,
        organizationId: string,
        moduleId: string,
        options: RoomOptions = {},
    ): Promise<PlanRoom | null> {
        if ((options.adding ?? 1) <= 0) return null;
        const now = options.now ?? new Date();
        const row = await this.enforcedRow(organizationId, moduleId, now);
        if (!row) return null;
        return this.room(tx, row, organizationId, { ...options, now });
    }

    /**
     * A write that adds a metered thing, run where its check can hold:
     * with enforcement on, on a transaction that checks first
     * ({@link roomInTx}; `addingIn` counts what the write adds on that
     * transaction); with it off, on the client as before, with no
     * transaction or count added. For writes that had no transaction of
     * their own (an invitation, a provider connection).
     */
    async withRoom<T>(
        organizationId: string,
        moduleId: string,
        write: (db: MeterTx) => Promise<T>,
        options: RoomOptions & {
            addingIn?: (db: MeterTx) => Promise<number>;
        } = {},
    ): Promise<T> {
        const now = options.now ?? new Date();
        const row = await this.enforcedRow(organizationId, moduleId, now);
        if (!row) return write(prisma);
        return prisma.$transaction(async (tx) => {
            const adding = options.addingIn
                ? await options.addingIn(tx)
                : (options.adding ?? 1);
            if (adding > 0) {
                await this.room(tx, row, organizationId, {
                    ...options,
                    adding,
                    now,
                });
            }
            return write(tx);
        });
    }

    /**
     * {@link roomInTx} for a write that isn't one transaction with its check
     * (bringing an archived product back): counts on a short transaction of
     * its own. The lock ends with it, so two such writes at once can both
     * pass; use `roomInTx` wherever the write has a transaction to share.
     */
    async assertRoom(
        organizationId: string,
        moduleId: string,
        options: RoomOptions = {},
    ): Promise<void> {
        await this.withRoom(
            organizationId,
            moduleId,
            () => Promise.resolve(),
            options,
        );
    }

    /** The check itself, for a row already read. */
    private async room(
        tx: MeterTx,
        row: ModuleAccess,
        organizationId: string,
        options: RoomOptions & { now: Date },
    ): Promise<PlanRoom | null> {
        const adding = options.adding ?? 1;
        const { now } = options;
        const moduleId = row.moduleId;
        // A write that must stay metered takes no soft cell at all.
        if (row.soft && options.refuseSoft) throw options.refuseSoft();
        // The catalogue's word wins over the call site's: a soft cell
        // counts and tells, and never refuses.
        const soft = options.soft === true || row.soft === true;
        if (row.state !== "on") {
            if (soft) return null;
            throw moduleLocked(row);
        }
        const key = meteredKeyOf(moduleId);
        if (!key || row.limit === null) return null;
        const limit = row.limit;

        await lockMeter(tx, organizationId, key);
        const used = await countUsage(tx, organizationId, key, now);
        if (!soft && used + adding > limit) {
            throw options.refuse?.() ?? planLimitReached(row, key, limit, used);
        }
        const room: PlanRoom = {
            organizationId,
            moduleId,
            key,
            limit,
            used,
            adding,
        };
        if (crossesNotice(room)) await queueLimitNoticeInTx(tx, room);
        return room;
    }
}

/**
 * Whether a write takes a business over a notice's line: to 80% of its cap,
 * to the cap, or (a soft cap) past it for the first time.
 */
export function crossesNotice(
    room: Pick<PlanRoom, "limit" | "used" | "adding">,
): boolean {
    const { limit, used } = room;
    const after = used + room.adding;
    const warnAt = Math.ceil(LIMIT_WARN_AT * limit);
    return (
        (used < warnAt && after >= warnAt) ||
        (used < limit && after >= limit) ||
        (used <= limit && after > limit)
    );
}

/** Queue `plan.limit.notice` on the write's transaction (outbox). */
export async function queueLimitNoticeInTx(
    tx: Pick<MeterTx, "job">,
    room: Pick<PlanRoom, "organizationId" | "moduleId">,
): Promise<void> {
    const payload: PlanLimitNoticePayload = {
        organizationId: room.organizationId,
        moduleId: room.moduleId,
    };
    await tx.job.create({
        data: {
            type: PLAN_LIMIT_NOTICE_TYPE,
            organizationId: room.organizationId,
            payload: { ...payload },
        },
    });
}

/**
 * The metering every free function shares (a reservation, a checkout): the
 * same service Nest gives the billing module, built bare as other modules'
 * flag readers are.
 */
export const planMeter = new MeteringService();
