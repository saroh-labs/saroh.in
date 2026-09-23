import type { OnApplicationBootstrap } from "@nestjs/common";
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

export const OPERATION_KINDS = ["jobs.retry", "webhooks.replay"] as const;
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
    "webhooks.replay": "webhook_event",
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
@Injectable()
export class AdminOperationsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AdminOperationsService.name);

    constructor(
        private readonly audit: AdminAuditService,
        private readonly webhooks: WebhooksService,
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
    ): Promise<OperationPlan> {
        const ids = requireTargets(targetIds);
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
                permission:
                    input.kind === "jobs.retry"
                        ? AdminPermission.JobsRetry
                        : AdminPermission.WebhooksReplay,
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

    async get(operationId: string) {
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
        if (!operation) throw new NotFoundException("Operation not found");
        return operation;
    }

    async list(limit = 20) {
        return prisma.adminOperation.findMany({
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
        await prisma.adminOperation.update({
            where: { id: operationId },
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
        // (a retry of a job already PENDING, or a replay of an event no longer
        // FAILED, is a skip), so resuming it cannot apply anything twice.
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
        return kind === "jobs.retry"
            ? this.classifyJobs(ids)
            : this.classifyWebhooks(ids);
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
                job.organization.lifecycleStatus !== "ACTIVE"
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
