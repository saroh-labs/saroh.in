import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { ActionState, EventFilter } from "./admin-billing-controls.dto";
import { assertSarohBillingActor } from "./admin-billing-controls.service";
import { assertSarohBillingReader } from "./admin-billing.service";
import { requireReason } from "./admin-lifecycle.service";
import { AdminPermission } from "./admin-permissions";

export const ACTIONS_PAGE_SIZE = 50;
/** Failed billing jobs shown beside the queue (Billing has no Jobs screen). */
export const FAILED_BILLING_JOBS = 25;

interface OrgBrief {
    id: string;
    name: string;
    slug: string;
}

export interface AdminBillingActionRow {
    id: string;
    organization: OrgBrief | null;
    code: string;
    refs: Record<string, string>;
    note: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
    resolution: string | null;
}

export interface FailedBillingJob {
    id: string;
    type: string;
    organization: OrgBrief | null;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    failedAt: string;
}

export interface AdminBillingActionPage {
    items: AdminBillingActionRow[];
    page: number;
    limit: number;
    total: number;
    /** Open across every business, whatever the page shows. */
    openCount: number;
    failedJobs: FailedBillingJob[];
}

export interface ProviderEventRow {
    id: string;
    provider: string;
    providerEventId: string;
    type: string;
    organization: OrgBrief | null;
    receivedAt: string;
    processedAt: string | null;
    /** The provider's ids the event names; never the payload itself. */
    refs: Record<string, string>;
}

export interface ProviderEventPage {
    items: ProviderEventRow[];
    page: number;
    limit: number;
    total: number;
}

/**
 * Admin › Billing › Needs action and Provider events (DEC-166) — a
 * CROSS-TENANT READ, and the one write that closes an action. Every billing
 * problem Saroh can't solve itself is a `BillingAction` row (written beside
 * each billing ops notice, by the daily reconcile, an unmatched webhook and
 * a refund on an invoice); this lists them across businesses, oldest open
 * first, with the failed `billing.*` jobs beside them, since the Billing
 * role has no Jobs screen (`jobs:read` can't be narrowed to billing's
 * jobs). Reads need `saroh-billing:read`; "Mark resolved" needs
 * `saroh-billing:act`, a reason, and goes on the admin ledger. Returns ids
 * and Saroh's words, never a provider payload.
 */
@Injectable()
export class AdminBillingActionsService {
    constructor(private readonly audit: AdminAuditService) {}

    async list(
        staff: PlatformAdminInfo,
        query: { state?: ActionState; page?: number },
    ): Promise<AdminBillingActionPage> {
        assertSarohBillingReader(staff);
        const resolved = query.state === "resolved";
        const where: Prisma.BillingActionWhereInput = resolved
            ? { resolvedAt: { not: null } }
            : { resolvedAt: null };
        const page = Math.max(1, query.page ?? 1);
        const [rows, total, openCount, jobs] = await Promise.all([
            prisma.billingAction.findMany({
                where,
                orderBy: resolved
                    ? [{ resolvedAt: "desc" }, { id: "desc" }]
                    : [{ createdAt: "asc" }, { id: "asc" }],
                skip: (page - 1) * ACTIONS_PAGE_SIZE,
                take: ACTIONS_PAGE_SIZE,
            }),
            prisma.billingAction.count({ where }),
            prisma.billingAction.count({ where: { resolvedAt: null } }),
            prisma.job.findMany({
                where: { type: { startsWith: "billing." }, status: "FAILED" },
                orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
                take: FAILED_BILLING_JOBS,
                select: {
                    id: true,
                    type: true,
                    organizationId: true,
                    attempts: true,
                    maxAttempts: true,
                    lastError: true,
                    updatedAt: true,
                },
            }),
        ]);
        const orgs = await orgBriefs([
            ...rows.map((r) => r.organizationId),
            ...jobs.map((j) => j.organizationId),
        ]);
        return {
            items: rows.map((r) => actionRow(r, orgs)),
            page,
            limit: ACTIONS_PAGE_SIZE,
            total,
            openCount,
            failedJobs: jobs.map((j) => ({
                id: j.id,
                type: j.type,
                organization: j.organizationId
                    ? (orgs.get(j.organizationId) ?? null)
                    : null,
                attempts: j.attempts,
                maxAttempts: j.maxAttempts,
                lastError: j.lastError?.slice(0, 300) ?? null,
                failedAt: j.updatedAt.toISOString(),
            })),
        };
    }

    /** One business's open actions, for its subscription sheet. */
    async openFor(organizationId: string): Promise<AdminBillingActionRow[]> {
        const rows = await prisma.billingAction.findMany({
            where: { organizationId, resolvedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 25,
        });
        const orgs = await orgBriefs([organizationId]);
        return rows.map((r) => actionRow(r, orgs));
    }

    /**
     * Mark an action resolved, with the operator's reason, on the ledger in
     * the same transaction. Already resolved: nothing changes (a second
     * operator, or a retry), and it says so.
     */
    async resolve(
        staff: PlatformAdminInfo,
        actionId: string,
        reasonText: string,
        now: Date = new Date(),
    ): Promise<{ ok: true; changed: boolean }> {
        assertSarohBillingActor(staff);
        const reason = requireReason(reasonText);
        return prisma.$transaction(async (tx) => {
            const action = await tx.billingAction.findUnique({
                where: { id: actionId },
                select: { id: true, organizationId: true, code: true },
            });
            if (!action) throw new NotFoundException("Action not found");
            const { count } = await tx.billingAction.updateMany({
                where: { id: actionId, resolvedAt: null },
                data: {
                    resolvedAt: now,
                    resolvedBy: staff.userId,
                    resolution: reason,
                },
            });
            if (count === 0) return { ok: true, changed: false };
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohBillingAct,
                action: "billing.action.resolved",
                targetType: "billing_action",
                targetId: action.id,
                organizationId: action.organizationId ?? undefined,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { code: action.code },
            });
            return { ok: true, changed: true };
        });
    }

    /**
     * What the billing provider sent, across businesses, newest first:
     * "not applied" (no `processedAt`: rejected, or matching nothing) and
     * "no business" (no business found) filter it.
     */
    async events(
        staff: PlatformAdminInfo,
        query: { filter?: EventFilter; page?: number },
    ): Promise<ProviderEventPage> {
        assertSarohBillingReader(staff);
        const where: Prisma.BillingWebhookEventWhereInput =
            query.filter === "not-applied"
                ? { processedAt: null }
                : query.filter === "no-business"
                  ? { organizationId: null }
                  : {};
        const page = Math.max(1, query.page ?? 1);
        const [rows, total] = await Promise.all([
            prisma.billingWebhookEvent.findMany({
                where,
                orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
                skip: (page - 1) * ACTIONS_PAGE_SIZE,
                take: ACTIONS_PAGE_SIZE,
            }),
            prisma.billingWebhookEvent.count({ where }),
        ]);
        const orgs = await orgBriefs(rows.map((r) => r.organizationId));
        return {
            items: rows.map((r) => ({
                id: r.id,
                provider: r.provider,
                providerEventId: r.providerEventId,
                type: r.type,
                organization: r.organizationId
                    ? (orgs.get(r.organizationId) ?? null)
                    : null,
                receivedAt: r.receivedAt.toISOString(),
                processedAt: r.processedAt?.toISOString() ?? null,
                refs: eventRefs(r.payload),
            })),
            page,
            limit: ACTIONS_PAGE_SIZE,
            total,
        };
    }
}

function actionRow(
    r: {
        id: string;
        organizationId: string | null;
        code: string;
        refs: Prisma.JsonValue;
        note: string;
        createdAt: Date;
        resolvedAt: Date | null;
        resolvedBy: string | null;
        resolution: string | null;
    },
    orgs: Map<string, OrgBrief>,
): AdminBillingActionRow {
    return {
        id: r.id,
        organization: r.organizationId
            ? (orgs.get(r.organizationId) ?? null)
            : null,
        code: r.code,
        refs: stringRecord(r.refs),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolvedBy: r.resolvedBy,
        resolution: r.resolution,
    };
}

async function orgBriefs(
    ids: (string | null)[],
): Promise<Map<string, OrgBrief>> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return new Map();
    const orgs = await prisma.organization.findMany({
        where: { id: { in: wanted } },
        select: { id: true, name: true, slug: true },
    });
    return new Map(orgs.map((o) => [o.id, o]));
}

function stringRecord(value: Prisma.JsonValue): Record<string, string> {
    const out: Record<string, string> = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
            if (typeof v === "string") out[k] = v;
        }
    }
    return out;
}

/** An id the provider gave, or nothing: short, no spaces. */
const ID = /^[A-Za-z0-9_]{3,64}$/;
const idOf = (v: unknown) =>
    typeof v === "string" && ID.test(v) ? v : undefined;

/**
 * The provider's ids an event names, read from its payload (Razorpay's
 * `payload.<entity>.entity.id`, the fake's flat fields). Ids only: the
 * payload itself never leaves the API.
 */
export function eventRefs(payload: Prisma.JsonValue): Record<string, string> {
    const out: Record<string, string> = {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return out;
    }
    const body = payload as Record<string, unknown>;
    const inner = (body.payload ?? {}) as Record<string, unknown>;
    const entity = (name: string) => {
        const wrap = inner[name] as
            { entity?: Record<string, unknown> } | undefined;
        return wrap?.entity ?? {};
    };
    const put = (key: string, value: unknown) => {
        const id = idOf(value);
        if (id && !out[key]) out[key] = id;
    };
    put("subscription", entity("subscription").id);
    put("order", entity("order").id);
    put("payment", entity("payment").id);
    put("customer", entity("subscription").customer_id);
    put("customer", entity("payment").customer_id);
    put("refund", entity("refund").id);
    put("dispute", entity("dispute").id);
    // The fake provider's flat shape (tests and local).
    put("subscription", body.providerSubscriptionId);
    put("payment", body.providerPaymentId);
    put("customer", body.providerCustomerId);
    return out;
}
