import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";
import { DomainsService } from "../domains/domains.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JobListQuery {
    status?: string;
    type?: string;
    organizationId?: string;
    cursor?: string;
}

export interface WebhookListQuery {
    status?: string;
    provider?: string;
    organizationId?: string;
    cursor?: string;
}

/**
 * The machinery behind the instance, read for the admin console (U7–U8) —
 * CROSS-TENANT READS of the job queue, webhook deliveries and provider
 * connections. They return what an operator needs to find what is broken:
 * type, state, error, age and which business. A job's payload and a
 * delivery's body stay out; they carry customers' details and the error
 * says what went wrong.
 */
@Injectable()
export class AdminMachineryService {
    constructor(
        private readonly domains: DomainsService,
        private readonly audit: AdminAuditService,
    ) {}

    /** The queue at a glance: how much is waiting, how late, what is failing. */
    async queue() {
        const now = new Date();
        const since = new Date(now.getTime() - DAY_MS);
        const [
            byStatus,
            oldestDue,
            failedByType,
            doneToday,
            failedToday,
            renewal,
        ] = await Promise.all([
            prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
            prisma.job.findFirst({
                where: { status: "PENDING", runAt: { lte: now } },
                select: { runAt: true },
                orderBy: { runAt: "asc" },
            }),
            prisma.job.groupBy({
                by: ["type"],
                where: { status: "FAILED" },
                _count: { _all: true },
                orderBy: { _count: { type: "desc" } },
            }),
            prisma.job.count({
                where: { status: "DONE", processedAt: { gte: since } },
            }),
            prisma.job.count({
                where: { status: "FAILED", processedAt: { gte: since } },
            }),
            prisma.job.findFirst({
                where: { type: "subscription.renew" },
                select: {
                    status: true,
                    runAt: true,
                    processedAt: true,
                    lastError: true,
                },
                orderBy: { createdAt: "desc" },
            }),
        ]);

        const counts = Object.fromEntries(
            byStatus.map((row) => [row.status, row._count._all]),
        ) as Record<string, number | undefined>;

        return {
            pending: counts.PENDING ?? 0,
            processing: counts.PROCESSING ?? 0,
            failed: counts.FAILED ?? 0,
            done: counts.DONE ?? 0,
            doneLastDay: doneToday,
            failedLastDay: failedToday,
            /** How long the oldest due job has waited, in seconds. 0 when none is due. */
            oldestDueSeconds: oldestDue
                ? Math.max(
                      0,
                      Math.round(
                          (now.getTime() - oldestDue.runAt.getTime()) / 1000,
                      ),
                  )
                : 0,
            failedByType: failedByType.map((row) => ({
                type: row.type,
                count: row._count._all,
            })),
            renewal,
        };
    }

    async jobs(query: JobListQuery) {
        const where: Prisma.JobWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.type ? { type: query.type } : {}),
            ...(query.organizationId
                ? { organizationId: query.organizationId }
                : {}),
        };
        const rows = await prisma.job.findMany({
            where,
            select: {
                id: true,
                type: true,
                status: true,
                attempts: true,
                maxAttempts: true,
                runAt: true,
                lastError: true,
                createdAt: true,
                updatedAt: true,
                processedAt: true,
                organization: { select: { id: true, name: true } },
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });
        return page(rows);
    }

    async webhookSummary() {
        const since = new Date(Date.now() - DAY_MS);
        const [byStatus, lastDay] = await Promise.all([
            prisma.webhookEvent.groupBy({
                by: ["status"],
                _count: { _all: true },
            }),
            prisma.webhookEvent.groupBy({
                by: ["status"],
                where: { createdAt: { gte: since } },
                _count: { _all: true },
            }),
        ]);
        // Partial: a status nothing is in has no key, and readers must say 0.
        const toMap = (
            rows: typeof byStatus,
        ): Partial<Record<string, number>> =>
            Object.fromEntries(
                rows.map((row) => [row.status, row._count._all]),
            );
        return { total: toMap(byStatus), lastDay: toMap(lastDay) };
    }

    async webhooks(query: WebhookListQuery) {
        const where: Prisma.WebhookEventWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.provider ? { provider: query.provider } : {}),
            ...(query.organizationId
                ? { organizationId: query.organizationId }
                : {}),
        };
        const rows = await prisma.webhookEvent.findMany({
            where,
            select: {
                id: true,
                provider: true,
                providerEventId: true,
                eventType: true,
                status: true,
                error: true,
                createdAt: true,
                processedAt: true,
                organization: { select: { id: true, name: true } },
            },
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: PAGE_SIZE + 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        return page(rows);
    }

    /**
     * Provider connections across the instance: how many businesses have each
     * kind connected, which have one that has stopped working, and which
     * domains are still waiting on DNS. Derived from stored state; a domain
     * can be checked again live with `recheckDomain`.
     */
    async providers() {
        const [payments, messaging, domains, attentionDomains] =
            await Promise.all([
                prisma.merchantPaymentProvider.groupBy({
                    by: ["provider", "status"],
                    _count: { _all: true },
                }),
                prisma.communicationProvider.groupBy({
                    by: ["channel", "provider", "status"],
                    _count: { _all: true },
                }),
                prisma.domain.groupBy({
                    by: ["status"],
                    _count: { _all: true },
                }),
                prisma.domain.findMany({
                    where: { status: { not: "VERIFIED" } },
                    select: {
                        id: true,
                        hostname: true,
                        status: true,
                        lastCheckedAt: true,
                        lastCheckResult: true,
                        createdAt: true,
                        organization: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 50,
                }),
            ]);

        return {
            payments: payments.map((row) => ({
                provider: row.provider,
                status: row.status,
                count: row._count._all,
            })),
            messaging: messaging.map((row) => ({
                channel: row.channel,
                provider: row.provider,
                status: row.status,
                count: row._count._all,
            })),
            domains: domains.map((row) => ({
                status: row.status,
                count: row._count._all,
            })),
            waitingDomains: attentionDomains,
        };
    }

    /**
     * Check a waiting domain's DNS again, now, through the same verifier its
     * owner uses. The result is recorded on the domain and in the trail.
     */
    async recheckDomain(staff: PlatformAdminInfo, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
            select: { id: true, organizationId: true },
        });
        if (!domain) throw new NotFoundException("Domain not found");

        const ctx: OrganizationContext = {
            organizationId: domain.organizationId,
            userId: staff.userId,
            role: "MEMBER",
            roleKey: PLATFORM_OPERATOR_ROLE_KEY,
            actions: new Set(["domain:manage"]),
        };
        const result = await this.domains.verify(ctx, domain.id);
        await this.audit.write(prisma, {
            actorUserId: staff.userId,
            permission: AdminPermission.ProvidersRecheck,
            action: "provider.domain.rechecked",
            targetType: "domain",
            targetId: domain.id,
            organizationId: domain.organizationId,
            outcome: AdminAuditOutcome.Success,
            metadata: {
                verified: result.verified,
                reason: "reason" in result ? (result.reason ?? null) : null,
            },
        });
        return {
            verified: result.verified,
            reason: "reason" in result ? (result.reason ?? null) : null,
        };
    }
}

function page<T extends { id: string }>(rows: T[]) {
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
}
