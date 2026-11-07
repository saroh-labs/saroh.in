import type { OnApplicationBootstrap } from "@nestjs/common";
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { WaitlistInvitesService } from "../waitlist/invites.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { CancelOperationInput } from "./admin-operation-cancel";
import { cancelOperation, OPERATION_CANCELLED } from "./admin-operation-cancel";
import { AdminPermission } from "./admin-permissions";
import { cancelJob, classifyJobCancels } from "./job-cancel";

export const OPERATION_KINDS = [
    "jobs.retry",
    "jobs.cancel",
    "webhooks.replay",
    "waitlist.invite",
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

/** The most targets one operation may carry. Past this, narrow the filter. */
export const MAX_OPERATION_ITEMS = 500;

/** What a dry run says would happen to one target. */
export interface PlannedItem {
    targetId: string;
    /** `act`: it would run. `skip`: nothing to do. `unsafe`: refused on purpose. */
    verdict: "act" | "skip" | "unsafe";
    detail: string;
}

export interface OperationPlan {
    kind: OperationKind;
    total: number;
    act: number;
    skip: number;
    unsafe: number;
    items: PlannedItem[];
}

const TARGET_TYPE: Record<OperationKind, string> = {
    "jobs.retry": "job",
    "jobs.cancel": "job",
    "webhooks.replay": "webhook_event",
    "waitlist.invite": "waitlist",
};

/**
 * The permission each kind is started under, for the audit trail. Cancelling
 * a job is the other half of retrying one (#907): the same people do both.
 */
export const PERMISSION: Record<OperationKind, AdminPermission> = {
    "jobs.retry": AdminPermission.JobsRetry,
    "jobs.cancel": AdminPermission.JobsRetry,
    "webhooks.replay": AdminPermission.WebhooksReplay,
    "waitlist.invite": AdminPermission.WaitlistInvite,
};

/**
 * Durable bulk operations for the admin console (plan D4, U7–U8).
 *
 * Anything bulk runs in two steps. The DRY RUN reads every target and says
 * what would happen to each — act, skip (nothing to do), or unsafe (refused on
 * purpose) — and changes nothing. EXECUTING runs the same classification
 * again, writes the operation and one row per target BEFORE anything runs,
 * and then works through the rows. Each row is claimed (PENDING → running)
 * before it acts, so a restart resumes from the rows still PENDING and no row
 * can run twice, even with two API processes resuming at once.
 *
 * Dry run and execution share one classifier, so what the operator was shown
 * is what runs — with one honest difference: anything that changed between
 * the two is classified again at execution, not trusted from the preview.
 */
/**
 * Jobs that stop or give back Saroh's own billing (DEC-166): cancelling a
 * provider subscription, refunding a double charge, putting Saroh's ids on
 * a payment. Retrying one never acts for the business, so a suspended or
 * closing business's failed one may be retried: a closing business must
 * not be renewal-charged because its cancel failed on a network error.
 */
export const PROTECTIVE_JOB_TYPES: ReadonlySet<string> = new Set([
    "billing.provider.cancel",
    "billing.refund.double-charge",
    "billing.payment.notes",
]);

@Injectable()
export class AdminOperationsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AdminOperationsService.name);

    constructor(
        private readonly audit: AdminAuditService,
        private readonly webhooks: WebhooksService,
        private readonly invites: WaitlistInvitesService,
    ) {}

    /** Resume whatever a restart interrupted. */
    onApplicationBootstrap(): void {
        void this.resumeInterrupted().catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.error(`Could not resume admin operations: ${message}`);
        });
    }

    async plan(
        kind: OperationKind,
        targetIds: string[],
        edition: Edition | null = null,
    ): Promise<OperationPlan> {
        const ids = requireTargets(targetIds);
        await assertTargetsInEdition(kind, ids, edition);
        const items = await this.classify(kind, ids);
        return summarize(kind, items);
    }

    async start(input: {
        staff: PlatformAdminInfo;
        kind: OperationKind;
        targetIds: string[];
        reason: string;
        idempotencyKey: string;
    }) {
        const reason = input.reason.trim();
        if (reason.length < 4) {
            throw new BadRequestException("Give a reason for this operation.");
        }
        const ids = requireTargets(input.targetIds);
        await assertTargetsInEdition(input.kind, ids, input.staff.edition);
        const idempotencyKey = [
            input.staff.userId,
            input.kind,
            input.idempotencyKey,
        ].join(":");

        const existing = await prisma.adminOperation.findUnique({
            where: { idempotencyKey },
            select: { id: true },
        });
        if (existing) return this.get(existing.id);

        const items = await this.classify(input.kind, ids);
        const plan = summarize(input.kind, items);

        const operation = await prisma.$transaction(async (tx) => {
            const created = await tx.adminOperation.create({
                data: {
                    kind: input.kind,
                    actorUserId: input.staff.userId,
                    reason,
                    idempotencyKey,
                    total: plan.total,
                    // Skipped and unsafe targets are decided now and recorded
                    // as SKIPPED, so the record says what happened to every one.
                    skipped: plan.skip + plan.unsafe,
                    items: {
                        create: items.map((item) => ({
                            targetType: TARGET_TYPE[input.kind],
                            targetId: item.targetId,
                            status:
                                item.verdict === "act" ? "PENDING" : "SKIPPED",
                            detail: item.verdict === "act" ? null : item.detail,
                            processedAt:
                                item.verdict === "act" ? null : new Date(),
                        })),
                    },
                },
                select: { id: true },
            });
            await this.audit.write(tx, {
                actorUserId: input.staff.userId,
                permission: PERMISSION[input.kind],
                action: `operation.${input.kind}.started`,
                targetType: "admin_operation",
                targetId: created.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: `operation:${idempotencyKey}`,
                metadata: {
                    total: plan.total,
                    act: plan.act,
                    skip: plan.skip,
                    unsafe: plan.unsafe,
                },
            });
            return created;
        });

        // Runs after the response; the rows are already durable, so the
        // screen follows progress and a restart picks up where this stopped.
        void this.run(operation.id);
        return this.get(operation.id);
    }

    /** Another edition's operation is a 404, as its targets are (DEC-204 item 6). */
    async get(operationId: string, edition: Edition | null = null) {
        const operation = await prisma.adminOperation.findUnique({
            where: { id: operationId },
            select: {
                id: true,
                kind: true,
                status: true,
                actorUserId: true,
                reason: true,
                total: true,
                succeeded: true,
                skipped: true,
                failed: true,
                createdAt: true,
                startedAt: true,
                finishedAt: true,
                items: {
                    select: {
                        targetId: true,
                        status: true,
                        detail: true,
                        processedAt: true,
                    },
                    orderBy: { id: "asc" },
                },
            },
        });
        if (
            !operation ||
            (edition && (await operationsOutside([operation], edition)).size)
        ) {
            throw new NotFoundException("Operation not found");
        }
        return operation;
    }

    /**
     * The latest operations this console's edition reaches.
     *
     * shortcut: filters the latest `limit` after reading them, so a console
     * can see fewer than `limit` while the other edition is busy; give the
     * operation its edition if that starts to hide work.
     */
    async list(limit = 20, edition: Edition | null = null) {
        const rows = await prisma.adminOperation.findMany({
            select: {
                id: true,
                kind: true,
                status: true,
                actorUserId: true,
                reason: true,
                total: true,
                succeeded: true,
                skipped: true,
                failed: true,
                createdAt: true,
                finishedAt: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit,
        });
        if (!edition) return rows;
        const hidden = await operationsOutside(rows, edition);
        return rows.filter((row) => !hidden.has(row.id));
    }

    /** Stop an operation's rows that have not started (#907). */
    async cancel(input: CancelOperationInput) {
        const edition = input.staff.edition;
        if (edition) {
            const operation = await prisma.adminOperation.findUnique({
                where: { id: input.operationId },
                select: { id: true, kind: true },
            });
            if (
                operation &&
                (await operationsOutside([operation], edition)).size
            ) {
                throw new NotFoundException("Operation not found");
            }
        }
        return cancelOperation(
            this.audit,
            (kind) =>
                (OPERATION_KINDS as readonly string[]).includes(kind)
                    ? PERMISSION[kind as OperationKind]
                    : undefined,
            input,
        );
    }

    /** Work through an operation's PENDING rows, one claimed row at a time. */
    async run(operationId: string): Promise<void> {
        await prisma.adminOperation.updateMany({
            where: { id: operationId, status: "PENDING" },
            data: { status: "RUNNING", startedAt: new Date() },
        });
        const operation = await prisma.adminOperation.findUnique({
            where: { id: operationId },
            select: { kind: true },
        });
        if (!operation) return;
        const kind = operation.kind as OperationKind;

        for (;;) {
            const next = await prisma.adminOperationItem.findFirst({
                where: { operationId, status: "PENDING" },
                select: { id: true, targetId: true },
                orderBy: { id: "asc" },
            });
            if (!next) break;

            // Claim it. A resumed or parallel runner that loses the race moves on.
            const claimed = await prisma.adminOperationItem.updateMany({
                where: { id: next.id, status: "PENDING" },
                data: { status: "RUNNING" },
            });
            if (claimed.count === 0) continue;

            const outcome = await this.execute(kind, next.targetId).catch(
                (error: unknown) => ({
                    status: "FAILED" as const,
                    detail:
                        error instanceof Error ? error.message : String(error),
                }),
            );
            await prisma.$transaction([
                prisma.adminOperationItem.update({
                    where: { id: next.id },
                    data: {
                        status: outcome.status,
                        detail: outcome.detail ?? null,
                        processedAt: new Date(),
                    },
                }),
                prisma.adminOperation.update({
                    where: { id: operationId },
                    data:
                        outcome.status === "DONE"
                            ? { succeeded: { increment: 1 } }
                            : outcome.status === "SKIPPED"
                              ? { skipped: { increment: 1 } }
                              : { failed: { increment: 1 } },
                }),
            ]);
        }

        const counts = await prisma.adminOperation.findUnique({
            where: { id: operationId },
            select: { failed: true, total: true },
        });
        // A cancelled operation keeps its CANCELLED (#907): the row that was
        // running when it was cancelled has recorded what it did above.
        await prisma.adminOperation.updateMany({
            where: { id: operationId, status: { not: OPERATION_CANCELLED } },
            data: {
                status:
                    counts &&
                    counts.failed > 0 &&
                    counts.failed === counts.total
                        ? "FAILED"
                        : "DONE",
                finishedAt: new Date(),
            },
        });
    }

    private async resumeInterrupted(): Promise<void> {
        // A row left RUNNING was mid-flight when the process stopped. It is
        // put back to PENDING: every executor below is safe to run again
        // (a retry of a job already PENDING, a replay of an event no longer
        // FAILED, or an invite already claimed, is a skip), so resuming it
        // cannot apply anything twice.
        const open = await prisma.adminOperation.findMany({
            where: { status: { in: ["PENDING", "RUNNING"] } },
            select: { id: true },
        });
        for (const operation of open) {
            await prisma.adminOperationItem.updateMany({
                where: { operationId: operation.id, status: "RUNNING" },
                data: { status: "PENDING" },
            });
            this.logger.log(`Resuming admin operation ${operation.id}`);
            await this.run(operation.id);
        }
    }

    private async classify(
        kind: OperationKind,
        ids: string[],
    ): Promise<PlannedItem[]> {
        switch (kind) {
            case "jobs.retry":
                return this.classifyJobs(ids);
            case "jobs.cancel":
                return classifyJobCancels(ids);
            case "webhooks.replay":
                return this.classifyWebhooks(ids);
            case "waitlist.invite":
                return this.invites.classify(ids);
        }
    }

    private async classifyJobs(ids: string[]): Promise<PlannedItem[]> {
        const jobs = await prisma.job.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                type: true,
                status: true,
                organization: { select: { lifecycleStatus: true } },
            },
        });
        const byId = new Map(jobs.map((job) => [job.id, job]));
        const renewalPending =
            (await prisma.job.count({
                where: { type: "subscription.renew", status: "PENDING" },
            })) > 0;

        return ids.map((id): PlannedItem => {
            const job = byId.get(id);
            if (!job)
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: "Job not found",
                };
            if (job.status !== "FAILED") {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: `Not failed — it is ${job.status.toLowerCase()}`,
                };
            }
            if (
                job.organization &&
                job.organization.lifecycleStatus !== "ACTIVE" &&
                !PROTECTIVE_JOB_TYPES.has(job.type)
            ) {
                return {
                    targetId: id,
                    verdict: "unsafe",
                    detail: "Its business is suspended or closing; retrying would act for it",
                };
            }
            if (job.type === "subscription.renew" && renewalPending) {
                return {
                    targetId: id,
                    verdict: "unsafe",
                    detail: "A renewal run is already scheduled; a second would fork the chain",
                };
            }
            return {
                targetId: id,
                verdict: "act",
                detail: `Retry ${job.type}`,
            };
        });
    }

    private async classifyWebhooks(ids: string[]): Promise<PlannedItem[]> {
        const events = await prisma.webhookEvent.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                status: true,
                eventType: true,
                organizationId: true,
            },
        });
        const byId = new Map(events.map((event) => [event.id, event]));
        return ids.map((id): PlannedItem => {
            const event = byId.get(id);
            if (!event)
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: "Delivery not found",
                };
            if (event.status !== "FAILED") {
                return {
                    targetId: id,
                    verdict: "unsafe",
                    detail: `Already ${event.status.toLowerCase()}; replaying could apply it twice`,
                };
            }
            if (!event.organizationId) {
                return {
                    targetId: id,
                    verdict: "skip",
                    detail: "Belongs to no business",
                };
            }
            return {
                targetId: id,
                verdict: "act",
                detail: `Replay ${event.eventType}`,
            };
        });
    }

    private async execute(
        kind: OperationKind,
        targetId: string,
    ): Promise<{ status: "DONE" | "SKIPPED" | "FAILED"; detail?: string }> {
        if (kind === "waitlist.invite") return this.invites.sendOne(targetId);
        if (kind === "jobs.cancel") return cancelJob(targetId);
        if (kind === "webhooks.replay") {
            const result = await this.webhooks.replay(targetId);
            if (result.status === "skipped") {
                return { status: "SKIPPED", detail: result.detail };
            }
            if (result.status === "failed") {
                return { status: "FAILED", detail: result.detail };
            }
            return { status: "DONE", detail: `Replayed: ${result.status}` };
        }

        // jobs.retry — classified again now, so a job that changed since the
        // preview is not retried on the strength of a stale answer.
        const item = (await this.classifyJobs([targetId]))[0] as
            PlannedItem | undefined;
        if (item?.verdict !== "act") {
            return { status: "SKIPPED", detail: item?.detail };
        }
        try {
            const updated = await prisma.job.updateMany({
                where: { id: targetId, status: "FAILED" },
                data: {
                    status: "PENDING",
                    attempts: 0,
                    runAt: new Date(),
                    lockedAt: null,
                    lockedBy: null,
                    processedAt: null,
                },
            });
            return updated.count === 1
                ? { status: "DONE", detail: "Queued to run again" }
                : { status: "SKIPPED", detail: "No longer failed" };
        } catch (error) {
            // The one-pending-renewal index refused it: a chain already exists.
            if (isUniqueViolation(error)) {
                return {
                    status: "SKIPPED",
                    detail: "A renewal run is already scheduled",
                };
            }
            throw error;
        }
    }
}

function requireTargets(targetIds: string[]): string[] {
    const ids = [...new Set(targetIds)];
    if (ids.length === 0) throw new BadRequestException("Choose at least one.");
    if (ids.length > MAX_OPERATION_ITEMS) {
        throw new BadRequestException(
            `One operation covers at most ${MAX_OPERATION_ITEMS}; narrow the list.`,
        );
    }
    return ids;
}

function summarize(kind: OperationKind, items: PlannedItem[]): OperationPlan {
    const count = (verdict: PlannedItem["verdict"]) =>
        items.filter((item) => item.verdict === verdict).length;
    return {
        kind,
        total: items.length,
        act: count("act"),
        skip: count("skip"),
        unsafe: count("unsafe"),
        items,
    };
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
    );
}

/**
 * The targets among these that belong to another edition: a job's or a
 * delivery's business, a waitlist signup's own edition. A target of no
 * business is the machinery's, reached from both consoles (DEC-204 item 6).
 */
async function targetsOutside(
    kind: string,
    ids: string[],
    edition: Edition,
): Promise<string[]> {
    const select = { id: true } as const;
    const otherBusiness = {
        id: { in: ids },
        organization: { edition: { not: edition } },
    };
    const rows =
        kind === "jobs.retry" || kind === "jobs.cancel"
            ? await prisma.job.findMany({ where: otherBusiness, select })
            : kind === "webhooks.replay"
              ? await prisma.webhookEvent.findMany({
                    where: otherBusiness,
                    select,
                })
              : kind === "waitlist.invite"
                ? await prisma.waitlistSignup.findMany({
                      where: { id: { in: ids }, edition: { not: edition } },
                      select,
                  })
                : [];
    return rows.map((row) => row.id);
}

/**
 * Acting on another edition's target is a 404 for the whole request, and
 * nothing runs: a 403 would say the id exists.
 */
async function assertTargetsInEdition(
    kind: OperationKind,
    ids: string[],
    edition: Edition | null,
): Promise<void> {
    if (edition && (await targetsOutside(kind, ids, edition)).length) {
        throw new NotFoundException("Not found");
    }
}

/** The operations, among these, with a target of another edition. */
async function operationsOutside(
    operations: { id: string; kind: string }[],
    edition: Edition,
): Promise<Set<string>> {
    const items = await prisma.adminOperationItem.findMany({
        where: { operationId: { in: operations.map((o) => o.id) } },
        select: { operationId: true, targetId: true },
    });
    const kindOf = new Map(operations.map((o) => [o.id, o.kind]));
    const outside = new Set<string>();
    for (const kind of new Set(kindOf.values())) {
        const ofKind = items.filter((i) => kindOf.get(i.operationId) === kind);
        const foreign = new Set(
            await targetsOutside(
                kind,
                ofKind.map((i) => i.targetId),
                edition,
            ),
        );
        for (const item of ofKind) {
            if (foreign.has(item.targetId)) outside.add(item.operationId);
        }
    }
    return outside;
}
