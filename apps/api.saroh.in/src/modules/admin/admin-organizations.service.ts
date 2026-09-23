import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { OPERATOR_LIFECYCLE_ACTIONS } from "./admin-lifecycle.service";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrganizationDirectoryQuery {
    q?: string;
    lifecycle?: string;
    planKey?: string;
    moduleKey?: string;
    /** `attention`: only businesses with something an operator should look at. */
    health?: "attention";
    cursor?: string;
    limit?: number;
}

/** Why a business is flagged for attention. Words, not codes, on screen. */
export type AttentionReason = "PAST_DUE" | "FAILED_JOBS" | "FAILED_WEBHOOKS";

export interface OrganizationDirectoryRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: string;
    createdAt: Date;
    members: number;
    enabledModules: string[];
    plan: { key: string; name: string } | null;
    subscriptionStatus: string | null;
    /** The business's own latest recorded action, or null if it never acted. */
    lastActiveAt: Date | null;
    attention: AttentionReason[];
}

export interface OrganizationDirectoryPage {
    items: OrganizationDirectoryRow[];
    nextCursor?: string;
}

const ROW_SELECT = {
    id: true,
    name: true,
    slug: true,
    lifecycleStatus: true,
    createdAt: true,
    _count: { select: { memberships: true } },
    organizationModules: {
        where: { status: "ENABLED" },
        select: { moduleKey: true },
        orderBy: { moduleKey: "asc" },
    },
    subscription: {
        select: { status: true, plan: { select: { key: true, name: true } } },
    },
} satisfies Prisma.OrganizationSelect;

type RowRecord = Prisma.OrganizationGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * The business directory (admin console U3) — a CROSS-TENANT READ.
 *
 * This service reads across every Organization on the instance, which no
 * tenant path may do. It runs with no Organization context, so the
 * `org_isolation` policies take their permissive branch; that is only safe
 * because the controller in front of it sits behind `PlatformAdminGuard`
 * (`docs/patterns/backend-auth-and-access.md`, "Cross-tenant reads").
 *
 * It returns what decides whether an operator needs to open a business —
 * state, plan, modules, people, last activity — and never the business's own
 * records. Searching by a member's email is a PII read and needs its own
 * permission, checked here rather than trusted to the screen.
 */
@Injectable()
export class AdminOrganizationsService {
    async directory(
        query: OrganizationDirectoryQuery,
        caller: { canReadPii: boolean },
    ): Promise<OrganizationDirectoryPage> {
        const limit = clamp(query.limit);
        const where = this.where(query, caller);

        const records = await prisma.organization.findMany({
            where,
            select: ROW_SELECT,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            take: limit + 1,
            // `id` breaks ties, so a page boundary between two businesses
            // created in the same millisecond neither drops nor repeats one.
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        const hasMore = records.length > limit;
        const page = hasMore ? records.slice(0, limit) : records;
        const items = await this.decorate(page);

        return {
            items,
            nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        };
    }

    /** One business, in the directory's shape. Needs no support session. */
    async summary(organizationId: string): Promise<OrganizationDirectoryRow> {
        const record = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: ROW_SELECT,
        });
        if (!record) throw new NotFoundException("Organization not found");
        const [row] = await this.decorate([record]);
        return row;
    }

    /**
     * Organizations an operator can target with a flag override: id, name
     * and slug only. The flag picker needs nothing else about a tenant.
     */
    async picker(): Promise<{ id: string; name: string; slug: string }[]> {
        return prisma.organization.findMany({
            select: { id: true, name: true, slug: true },
            orderBy: { name: "asc" },
        });
    }

    private where(
        query: OrganizationDirectoryQuery,
        caller: { canReadPii: boolean },
    ): Prisma.OrganizationWhereInput {
        const and: Prisma.OrganizationWhereInput[] = [];
        const q = query.q?.trim();

        if (q) {
            if (q.includes("@")) {
                if (!caller.canReadPii) {
                    throw new ForbiddenException(
                        "Searching by email needs the organization:pii:read permission.",
                    );
                }
                and.push({
                    memberships: {
                        some: {
                            user: {
                                email: { contains: q, mode: "insensitive" },
                            },
                        },
                    },
                });
            } else {
                and.push({
                    OR: [
                        { id: q },
                        { name: { contains: q, mode: "insensitive" } },
                        { slug: { contains: q, mode: "insensitive" } },
                    ],
                });
            }
        }

        if (query.lifecycle) and.push({ lifecycleStatus: query.lifecycle });

        if (query.planKey === "none") {
            and.push({ subscription: { is: null } });
        } else if (query.planKey) {
            and.push({ subscription: { plan: { key: query.planKey } } });
        }

        if (query.moduleKey) {
            and.push({
                organizationModules: {
                    some: { moduleKey: query.moduleKey, status: "ENABLED" },
                },
            });
        }

        if (query.health === "attention") {
            const since = new Date(Date.now() - ATTENTION_WINDOW_MS);
            and.push({
                OR: [
                    { subscription: { status: "PAST_DUE" } },
                    {
                        jobs: {
                            some: {
                                status: "FAILED",
                                updatedAt: { gte: since },
                            },
                        },
                    },
                    {
                        webhookEvents: {
                            some: {
                                status: "FAILED",
                                createdAt: { gte: since },
                            },
                        },
                    },
                ],
            });
        }

        return and.length > 0 ? { AND: and } : {};
    }

    /**
     * Add what cannot be selected per row cheaply — last activity and the
     * attention reasons — with one grouped read each for the whole page.
     */
    private async decorate(
        records: RowRecord[],
    ): Promise<OrganizationDirectoryRow[]> {
        const ids = records.map((record) => record.id);
        if (ids.length === 0) return [];
        const since = new Date(Date.now() - ATTENTION_WINDOW_MS);

        const [activity, failedJobs, failedWebhooks] = await Promise.all([
            prisma.auditEvent.groupBy({
                by: ["organizationId"],
                where: {
                    organizationId: { in: ids },
                    // What the business did, not what an operator did to it.
                    action: { notIn: [...OPERATOR_LIFECYCLE_ACTIONS] },
                },
                _max: { createdAt: true },
            }),
            prisma.job.groupBy({
                by: ["organizationId"],
                where: {
                    organizationId: { in: ids },
                    status: "FAILED",
                    updatedAt: { gte: since },
                },
                _count: { _all: true },
            }),
            prisma.webhookEvent.groupBy({
                by: ["organizationId"],
                where: {
                    organizationId: { in: ids },
                    status: "FAILED",
                    createdAt: { gte: since },
                },
                _count: { _all: true },
            }),
        ]);

        const lastActive = new Map(
            activity.map((row) => [row.organizationId, row._max.createdAt]),
        );
        const jobsFailing = new Set(
            failedJobs.map((row) => row.organizationId),
        );
        const webhooksFailing = new Set(
            failedWebhooks.map((row) => row.organizationId),
        );

        return records.map((record) => {
            const attention: AttentionReason[] = [];
            if (record.subscription?.status === "PAST_DUE") {
                attention.push("PAST_DUE");
            }
            if (jobsFailing.has(record.id)) attention.push("FAILED_JOBS");
            if (webhooksFailing.has(record.id)) {
                attention.push("FAILED_WEBHOOKS");
            }

            return {
                id: record.id,
                name: record.name,
                slug: record.slug,
                lifecycleStatus: record.lifecycleStatus,
                createdAt: record.createdAt,
                members: record._count.memberships,
                enabledModules: record.organizationModules.map(
                    (row) => row.moduleKey,
                ),
                plan: record.subscription?.plan ?? null,
                subscriptionStatus: record.subscription?.status ?? null,
                lastActiveAt: lastActive.get(record.id) ?? null,
                attention,
            };
        });
    }
}

function clamp(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit))
        return DEFAULT_PAGE_SIZE;
    return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}
