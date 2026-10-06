import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    PayloadTooLargeException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import {
    liveCatalogueVersion,
    prisma,
    writeCatalogueVersionInTx,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { diff, planRows, validateCatalog } from "@saroh/pricing-catalog";

import { prismaErrorCode } from "../../common/prisma-errors";
import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import { AdminPermission } from "../admin/admin-permissions";
import {
    CATALOGUE_BILLING_PROVIDER,
    enqueueProviderPlanSync,
    PROVIDER_PLAN_SYNC_TYPE,
    retryProviderPlanSyncInTx,
} from "../billing/provider-plan-sync.service";
import type { StaffName } from "./catalogue.service";
import { DRAFT_SAVE_ACTION, SHARED_DRAFT_ID } from "./catalogue.service";
import type { PublishPolicy } from "./dto";
import type { ScheduledMoves } from "./moves.service";
import { cancelMovesTo, scheduleMoves } from "./moves.service";
import {
    enqueueSiteRevalidation,
    PRICING_REVALIDATE_TYPE,
} from "./revalidate-site.job";

type Tx = Prisma.TransactionClient;

/** A draft larger than this is not a catalogue someone is editing. */
export const MAX_DRAFT_BYTES = 256 * 1024;

/** How far ahead a version may be scheduled. */
const MAX_SCHEDULE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Publishing writes every subscription's move; give it room. */
const WRITE_TX = { maxWait: 10_000, timeout: 60_000 } as const;

/** `PUT /admin/pricing/draft`: the draft as saved. */
export interface DraftSaved {
    revision: number;
    baseVersion: number | null;
    createdAt: string;
    updatedAt: string;
    valid: boolean;
    errors: string[];
    /** What it changes from the live version, in words; empty when invalid. */
    changes: string[];
}

/**
 * Live: visitors see it now. Scheduled: at `goLiveAt`. Waiting: its go-live
 * has come but its paid plans aren't at the billing provider yet, so the
 * version before it stays live until they are (U15 syncs them).
 */
export type PublishedStatus = "live" | "scheduled" | "waiting";

/** `POST /admin/pricing/publish` and `…/versions/:v/rollback`. */
export interface PublishResult {
    version: number;
    goLiveAt: string;
    status: PublishedStatus;
    policy: PublishPolicy;
    changes: string[];
    moves: ScheduledMoves;
    /** Paid plan × cycle rows queued for the billing provider. */
    providerPlans: number;
}

/** `DELETE /admin/pricing/versions/:v`. */
export interface CancelResult {
    cancelled: number;
    /** Subscriptions whose pending move to it was cleared. */
    movesCleared: number;
}

/** Key order doesn't make two snapshots different. */
function canonical(value: unknown): string {
    const sort = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(sort);
        if (v && typeof v === "object") {
            return Object.fromEntries(
                Object.entries(v as Record<string, unknown>)
                    .filter(([, x]) => x !== undefined)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([k, x]) => [k, sort(x)]),
            );
        }
        return v;
    };
    return JSON.stringify(sort(value));
}

function dayWords(at: Date): string {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(at);
}

/**
 * Catalogue writes (plans catalogue U4): the shared draft, publish (now or
 * scheduled, "keep their terms" or "move them"), cancelling a scheduled
 * version, and rolling back to an earlier one.
 *
 * Every write runs in one transaction with its admin audit row, so nothing
 * changes unaudited; the controller wraps each in `IdempotencyService.run`.
 * A version and its `Plan` rows are written by `writeCatalogueVersionInTx`; its
 * paid rows get a PENDING billing-provider plan, and the version can't go
 * live until those are SYNCED (`liveCatalogueVersion`).
 *
 * Only one version may be scheduled at a time, and nothing is published
 * while one is: the live version is the newest whose go-live has passed, so
 * a version published under a scheduled one would be overtaken by it.
 */
@Injectable()
export class CatalogueWritesService {
    constructor(private readonly audit: AdminAuditService) {}

    // ── The shared draft (KTD-3) ────────────────────────────────────────

    /**
     * Save the whole draft. `revision` is the one the editor started from;
     * 0 starts a new draft. Anything else that doesn't match is a 409 naming
     * who saved since, and the editor reloads (the D5 plan-draft rule).
     */
    async saveDraft(
        actorUserId: string,
        input: { catalog: Record<string, unknown>; revision: number },
        now: Date,
    ): Promise<DraftSaved> {
        const bytes = Buffer.byteLength(JSON.stringify(input.catalog), "utf8");
        if (bytes > MAX_DRAFT_BYTES) {
            throw new PayloadTooLargeException(
                "This draft is too large to save.",
            );
        }
        const catalog = input.catalog as Prisma.InputJsonObject;
        return prisma.$transaction(async (tx) => {
            if (input.revision === 0) {
                const live = await liveCatalogueVersion(tx, now);
                // Insert-or-nothing: a caught unique violation would abort
                // the transaction, so the race is read from the count.
                const made = await tx.pricingCatalogDraft.createMany({
                    data: [
                        {
                            id: SHARED_DRAFT_ID,
                            catalog,
                            revision: 1,
                            baseVersion: live?.version ?? null,
                            updatedByUserId: actorUserId,
                        },
                    ],
                    skipDuplicates: true,
                });
                if (made.count === 0) throw await this.staleDraft(tx);
            } else {
                const saved = await tx.pricingCatalogDraft.updateMany({
                    where: { id: SHARED_DRAFT_ID, revision: input.revision },
                    data: {
                        catalog,
                        revision: { increment: 1 },
                        updatedByUserId: actorUserId,
                    },
                });
                if (saved.count === 0) throw await this.staleDraft(tx);
            }
            const row = await tx.pricingCatalogDraft.findUniqueOrThrow({
                where: { id: SHARED_DRAFT_ID },
            });
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingEdit,
                action: DRAFT_SAVE_ACTION,
                targetType: "pricing_draft",
                targetId: SHARED_DRAFT_ID,
                outcome: AdminAuditOutcome.Success,
                metadata: { revision: row.revision },
            });
            const check = validateCatalog(row.catalog);
            let changes: string[] = [];
            if (check.ok) {
                const live = await this.liveCatalog(tx, now);
                changes = live ? diff(live.catalog, check.catalog) : [];
            }
            return {
                revision: row.revision,
                baseVersion: row.baseVersion,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
                valid: check.ok,
                errors: check.ok ? [] : check.errors,
                changes,
            };
        });
    }

    /** Throw the draft away, if it is still the revision the person saw. */
    async discardDraft(
        actorUserId: string,
        input: { revision: number; reason?: string; idempotencyKey: string },
    ): Promise<{ discarded: true }> {
        return prisma.$transaction(async (tx) => {
            const gone = await tx.pricingCatalogDraft.deleteMany({
                where: { id: SHARED_DRAFT_ID, revision: input.revision },
            });
            if (gone.count === 0) {
                const now = await tx.pricingCatalogDraft.findUnique({
                    where: { id: SHARED_DRAFT_ID },
                    select: { id: true },
                });
                if (!now) throw new NotFoundException("There's no draft.");
                throw await this.staleDraft(tx);
            }
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingEdit,
                action: "pricing.draft.discard",
                targetType: "pricing_draft",
                targetId: SHARED_DRAFT_ID,
                reason: input.reason === "" ? undefined : input.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: this.auditKey(
                    actorUserId,
                    "pricing.draft.discard",
                    input.idempotencyKey,
                ),
                metadata: { revision: input.revision },
            });
            return { discarded: true as const };
        });
    }

    // ── Publish, cancel, roll back ──────────────────────────────────────

    /**
     * Publish the draft as the next version: now, or at `goLiveAt`. With
     * policy `move`, every subscription on an older version is moved at its
     * first renewal at least seven days after go-live (KTD-4). The draft is
     * deleted in the same transaction.
     */
    async publish(
        actorUserId: string,
        input: {
            revision: number;
            goLiveAt?: string;
            policy: PublishPolicy;
            note?: string;
            reason: string;
            idempotencyKey: string;
        },
        now: Date,
    ): Promise<PublishResult> {
        const goLiveAt = this.goLiveAt(input.goLiveAt, now);
        return this.versionTx(async (tx) => {
            // The draft row is the lock between a publish and a save.
            await tx.$queryRaw`SELECT "id" FROM "PricingCatalogDraft" WHERE "id" = ${SHARED_DRAFT_ID} FOR UPDATE`;
            const draft = await tx.pricingCatalogDraft.findUnique({
                where: { id: SHARED_DRAFT_ID },
            });
            if (!draft)
                throw new NotFoundException("There's no draft to publish.");
            if (draft.revision !== input.revision) {
                throw await this.staleDraft(tx);
            }
            const check = validateCatalog(draft.catalog);
            if (!check.ok) {
                throw new BadRequestException({
                    message: "Fix the draft before publishing it.",
                    details: { errors: check.errors },
                });
            }
            const result = await this.writeVersion(tx, {
                actorUserId,
                catalog: check.catalog,
                goLiveAt,
                now,
                policy: input.policy,
                note: input.note ?? "",
                same: (live) =>
                    `The draft is the same as version ${live}, which is live. There's nothing to publish.`,
            });
            await tx.pricingCatalogDraft.delete({
                where: { id: SHARED_DRAFT_ID },
            });
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingPublish,
                action: "pricing.version.publish",
                targetType: "pricing_version",
                targetId: String(result.version),
                reason: input.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: this.auditKey(
                    actorUserId,
                    "pricing.version.publish",
                    input.idempotencyKey,
                ),
                metadata: {
                    version: result.version,
                    draftRevision: draft.revision,
                    goLiveAt: result.goLiveAt,
                    status: result.status,
                    policy: result.policy,
                    changes: result.changes.slice(0, 50),
                    moved: result.moves.moved,
                },
            });
            return result;
        });
    }

    /**
     * Cancel a version that hasn't gone live: its pending moves and notices,
     * its go-live revalidation, its `Plan` rows (with their provider plans)
     * and the version itself go. The next publish takes its number.
     */
    async cancelVersion(
        actorUserId: string,
        version: number,
        input: { reason: string; idempotencyKey: string },
        now: Date,
    ): Promise<CancelResult> {
        return this.versionTx(async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "PricingCatalogVersion" WHERE "version" = ${version} FOR UPDATE`;
            const row = await tx.pricingCatalogVersion.findUnique({
                where: { version },
                select: { goLiveAt: true },
            });
            if (!row)
                throw new NotFoundException(`There's no version ${version}.`);
            if (row.goLiveAt.getTime() <= now.getTime()) {
                throw new ConflictException(
                    `Version ${version} has gone live, so it can't be cancelled. Roll back to an earlier version instead.`,
                );
            }
            const subscribed = await tx.subscription.count({
                where: {
                    plan: { version, key: { startsWith: "catalog." } },
                },
            });
            if (subscribed > 0) {
                throw new ConflictException(
                    `${subscribed} businesses are already billed on version ${version}, so it can't be cancelled.`,
                );
            }
            const movesCleared = await cancelMovesTo(tx, version);
            await this.dropRevalidations(tx, version);
            await tx.plan.deleteMany({
                where: { version, key: { startsWith: "catalog." } },
            });
            await tx.pricingCatalogVersion.delete({ where: { version } });
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingPublish,
                action: "pricing.version.cancel",
                targetType: "pricing_version",
                targetId: String(version),
                reason: input.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: this.auditKey(
                    actorUserId,
                    "pricing.version.cancel",
                    input.idempotencyKey,
                ),
                metadata: {
                    version,
                    goLiveAt: row.goLiveAt.toISOString(),
                    movesCleared,
                },
            });
            return { cancelled: version, movesCleared };
        });
    }

    /**
     * Put an earlier version's pricing back: a new version with that
     * snapshot, live now, policy keep. Refused while a draft exists (the
     * design's rule: a draft would be published over it next), and for a
     * version that is scheduled, or whose pricing is already live.
     */
    async rollback(
        actorUserId: string,
        version: number,
        input: { note?: string; reason: string; idempotencyKey: string },
        now: Date,
    ): Promise<PublishResult> {
        return this.versionTx(async (tx) => {
            const draft = await tx.pricingCatalogDraft.findUnique({
                where: { id: SHARED_DRAFT_ID },
                select: { id: true },
            });
            if (draft) {
                throw new ConflictException(
                    "There's a draft. Publish or discard it before rolling back.",
                );
            }
            const target = await tx.pricingCatalogVersion.findUnique({
                where: { version },
            });
            if (!target)
                throw new NotFoundException(`There's no version ${version}.`);
            if (target.goLiveAt.getTime() > now.getTime()) {
                throw new ConflictException(
                    `Version ${version} hasn't gone live yet, so there's nothing to roll back to.`,
                );
            }
            const check = validateCatalog(target.catalog);
            if (!check.ok) {
                throw new Error(
                    `Catalogue version ${version} does not validate`,
                );
            }
            const result = await this.writeVersion(tx, {
                actorUserId,
                catalog: check.catalog,
                goLiveAt: now,
                now,
                policy: "keep",
                note:
                    input.note === undefined || input.note === ""
                        ? `Rolled back to version ${version}`
                        : input.note,
                same: () => `Version ${version}'s pricing is already live.`,
            });
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingPublish,
                action: "pricing.version.rollback",
                targetType: "pricing_version",
                targetId: String(result.version),
                reason: input.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: this.auditKey(
                    actorUserId,
                    "pricing.version.rollback",
                    input.idempotencyKey,
                ),
                metadata: {
                    version: result.version,
                    from: version,
                    status: result.status,
                    changes: result.changes.slice(0, 50),
                },
            });
            return result;
        });
    }

    /**
     * Ask the billing provider again for a version's plans that failed to
     * sync (U15): the FAILED rows go back to PENDING and a sync is queued.
     * Nothing else changes; the version goes live when they are SYNCED.
     */
    async retryProviderSync(
        actorUserId: string,
        version: number,
        input: { reason: string; idempotencyKey: string },
        now: Date,
    ): Promise<{ version: number; retried: number }> {
        return prisma.$transaction(async (tx) => {
            const row = await tx.pricingCatalogVersion.findUnique({
                where: { version },
                select: { id: true },
            });
            if (!row)
                throw new NotFoundException(`There's no version ${version}.`);
            const retried = await retryProviderPlanSyncInTx(tx, version, now);
            if (retried === 0) {
                throw new ConflictException(
                    `Version ${version} has no plans that failed to reach the billing provider.`,
                );
            }
            await this.audit.write(tx, {
                actorUserId,
                permission: AdminPermission.PricingPublish,
                action: "pricing.version.provider-sync.retry",
                targetType: "pricing_version",
                targetId: String(version),
                reason: input.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: this.auditKey(
                    actorUserId,
                    "pricing.version.provider-sync.retry",
                    input.idempotencyKey,
                ),
                metadata: { version, retried },
            });
            return { version, retried };
        });
    }

    // ── Shared steps ────────────────────────────────────────────────────

    /**
     * Write the next version on `tx`: its snapshot and change log, its
     * `Plan` rows, PENDING provider plans for the paid ones, the moves for
     * policy `move`, and the saroh.in revalidation.
     */
    private async writeVersion(
        tx: Tx,
        input: {
            actorUserId: string;
            catalog: Catalog;
            goLiveAt: Date;
            now: Date;
            policy: PublishPolicy;
            note: string;
            /** The refusal when the snapshot is the live one already. */
            same: (liveVersion: number) => string;
        },
    ): Promise<PublishResult> {
        const scheduled = await tx.pricingCatalogVersion.findFirst({
            where: { goLiveAt: { gt: input.now } },
            orderBy: { goLiveAt: "asc" },
            select: { version: true, goLiveAt: true },
        });
        if (scheduled) {
            throw new ConflictException(
                `Version ${scheduled.version} is scheduled for ${dayWords(scheduled.goLiveAt)}. Cancel it before publishing another.`,
            );
        }
        const live = await this.liveCatalog(tx, input.now);
        if (live && canonical(live.catalog) === canonical(input.catalog)) {
            throw new ConflictException(input.same(live.version));
        }
        const newest = await tx.pricingCatalogVersion.findFirst({
            orderBy: { version: "desc" },
            select: { version: true },
        });
        const version = (newest?.version ?? 0) + 1;
        const rows = planRows(input.catalog, version);
        const changes = live ? diff(live.catalog, input.catalog) : [];

        const { planIds } = await writeCatalogueVersionInTx(tx, {
            version,
            catalog: input.catalog,
            goLiveAt: input.goLiveAt,
            policy: input.policy,
            note: input.note,
            changes,
            publishedByUserId: input.actorUserId,
            planRows: rows,
        });

        // A paid plan needs its plan at the billing provider before anyone
        // can be charged for it; yearly ones only while yearly is offered.
        const paid = rows.flatMap((r, i) =>
            r.priceCents > 0 &&
            (r.interval === "month" || input.catalog.yearly.on)
                ? [planIds[i]]
                : [],
        );
        if (paid.length) {
            await tx.pricingProviderPlan.createMany({
                data: paid.map((planId) => ({
                    planId,
                    provider: CATALOGUE_BILLING_PROVIDER,
                    status: "PENDING",
                })),
            });
            // The provider sync (U15) runs once this commits.
            await enqueueProviderPlanSync(tx, version, input.now);
        }

        const moves: ScheduledMoves =
            input.policy === "move"
                ? await scheduleMoves(tx, {
                      version,
                      goLiveAt: input.goLiveAt,
                  })
                : { moved: 0, notices: 0 };

        const later = input.goLiveAt.getTime() > input.now.getTime();
        const status: PublishedStatus = later
            ? "scheduled"
            : paid.length
              ? "waiting"
              : "live";
        // Live now: refresh saroh.in once this commits. Scheduled: at its
        // go-live. Waiting: the provider sync (U15) refreshes it when the
        // version goes live, since nothing here knows when that will be.
        if (status === "live") {
            await enqueueSiteRevalidation(
                tx,
                { version, cause: "publish" },
                input.now,
            );
        } else if (status === "scheduled") {
            await enqueueSiteRevalidation(
                tx,
                { version, cause: "go-live" },
                input.goLiveAt,
            );
        }

        return {
            version,
            goLiveAt: input.goLiveAt.toISOString(),
            status,
            policy: input.policy,
            changes,
            moves,
            providerPlans: paid.length,
        };
    }

    /** Run a version write; two at once meet the version's unique index. */
    private async versionTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
        try {
            return await prisma.$transaction(fn, WRITE_TX);
        } catch (error) {
            if (
                prismaErrorCode(error) === "P2002" ||
                prismaErrorCode(error) === "P2034"
            ) {
                throw new ConflictException(
                    "Someone else changed the pricing at the same moment. Reload and try again.",
                );
            }
            throw error;
        }
    }

    private goLiveAt(value: string | undefined, now: Date): Date {
        if (value === undefined) return now;
        const at = new Date(value);
        if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
            throw new BadRequestException(
                "Pick a go-live time that hasn't passed.",
            );
        }
        if (at.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * DAY_MS) {
            throw new BadRequestException("Pick a go-live date within a year.");
        }
        return at;
    }

    private async liveCatalog(
        tx: Tx,
        now: Date,
    ): Promise<{ version: number; catalog: Catalog } | null> {
        const row = await liveCatalogueVersion(tx, now);
        if (!row) return null;
        const check = validateCatalog(row.catalog);
        if (!check.ok) {
            throw new Error(
                `Catalogue version ${row.version} does not validate`,
            );
        }
        return { version: row.version, catalog: check.catalog };
    }

    /** A cancelled version's go-live revalidation and provider sync, not yet run. */
    private async dropRevalidations(tx: Tx, version: number): Promise<void> {
        const jobs = await tx.job.findMany({
            where: {
                type: {
                    in: [PRICING_REVALIDATE_TYPE, PROVIDER_PLAN_SYNC_TYPE],
                },
                status: "PENDING",
            },
            select: { id: true, payload: true },
        });
        const ids = jobs
            .filter(
                (j) =>
                    (j.payload as { version?: unknown } | null)?.version ===
                    version,
            )
            .map((j) => j.id);
        if (ids.length) {
            await tx.job.deleteMany({
                where: { id: { in: ids }, status: "PENDING" },
            });
        }
    }

    /** The 409 for a save or publish against a draft that has moved on. */
    private async staleDraft(tx: Tx): Promise<ConflictException> {
        const draft = await tx.pricingCatalogDraft.findUnique({
            where: { id: SHARED_DRAFT_ID },
            select: { revision: true, updatedAt: true, updatedByUserId: true },
        });
        if (!draft) {
            return new ConflictException({
                message:
                    "The draft was published or discarded since you opened it. Reload to start from the live pricing.",
                details: { revision: null, updatedBy: null, updatedAt: null },
            });
        }
        const user = draft.updatedByUserId
            ? await tx.user.findUnique({
                  where: { id: draft.updatedByUserId },
                  select: { id: true, name: true, email: true },
              })
            : null;
        const updatedBy: StaffName | null = user
            ? { userId: user.id, name: user.name, email: user.email }
            : null;
        const who = updatedBy?.name ?? updatedBy?.email ?? "Someone";
        return new ConflictException({
            message: `${who} saved the draft since. Reload the draft to see their changes.`,
            details: {
                revision: draft.revision,
                updatedBy,
                updatedAt: draft.updatedAt.toISOString(),
            },
        });
    }

    private auditKey(actor: string, action: string, key: string): string {
        return [actor, action, key].join(":");
    }
}
