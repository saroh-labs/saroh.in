import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { siteRootDomain } from "../sites/site-host-mode";
import { OPERATOR_LIFECYCLE_ACTIONS } from "./admin-lifecycle.service";
import { businessesWaitingOnRefunds } from "./deletion-trail";
import type { EffectivePlan } from "./effective-plan";
import { effectivePlan } from "./effective-plan";
import { UNFINISHED_CLEANUP_JOB } from "./organization-deletion-cleanup.handler";
import {
    domainSearchTerms,
    domainSearchWhere,
} from "./organization-domain-search";

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
    /** `on`: only businesses on legal hold (DEC-122). */
    legalHold?: "on";
    cursor?: string;
    limit?: number;
}

/** Why a business is flagged for attention. Words, not codes, on screen. */
export type AttentionReason =
    | "PAST_DUE"
    | "FAILED_JOBS"
    | "FAILED_WEBHOOKS"
    /** A deleted business whose clean-up has failed and isn't done (#921). */
    | "DELETION_CLEANUP"
    /**
     * Past its deletion window and still `PENDING_DELETION`: its customers
     * are owed refunds (#921, owner 9 Oct). The business page lists them.
     */
    | "DELETION_WAITING_REFUNDS";

export interface OrganizationDirectoryRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: string;
    /**
     * On legal hold (DEC-122): its data is kept whatever is asked. Who,
     * when and why are on the business page, behind a support session.
     */
    legalHold: boolean;
    createdAt: Date;
    members: number;
    enabledModules: string[];
    /** Its subscription's plan row, which the directory's filter matches. */
    plan: { key: string; name: string } | null;
    /**
     * The plan it is on now, a live plan override winning (UX-087), as
     * `CatalogueAccessService.resolve` reads it. Null off the catalogue, or
     * when it couldn't be read (logged): the screen falls back to `plan`.
     */
    effectivePlan: EffectivePlan | null;
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
    legalHoldAt: true,
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
    private readonly logger = new Logger(AdminOrganizationsService.name);

    constructor(private readonly access: CatalogueAccessService) {}

    async directory(
        query: OrganizationDirectoryQuery,
        caller: { canReadPii: boolean },
    ): Promise<OrganizationDirectoryPage> {
        const limit = clamp(query.limit);
        const waiting =
            query.health === "attention"
                ? await businessesWaitingOnRefunds(new Date())
                : new Set<string>();
        const where = this.where(query, caller, waiting);

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

    /** One business's {@link EffectivePlan}; null (logged) if unreadable. */
    private async effective(
        organizationId: string,
        now: Date,
    ): Promise<EffectivePlan | null> {
        try {
            return effectivePlan(
                await this.access.resolve(organizationId, now),
            );
        } catch (err) {
            this.logger.warn(
                `admin_effective_plan_unread org=${organizationId} error=${err instanceof Error ? err.message : "unknown"}`,
            );
            return null;
        }
    }

    private where(
        query: OrganizationDirectoryQuery,
        caller: { canReadPii: boolean },
        waitingOnRefunds: ReadonlySet<string> = new Set(),
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
                        // Its custom domain or Saroh address (#907).
                        ...domainSearchWhere(
                            domainSearchTerms(q, siteRootDomain()),
                        ),
                    ],
                });
            }
        }

        if (query.lifecycle) and.push({ lifecycleStatus: query.lifecycle });
        if (query.legalHold === "on") and.push({ legalHoldAt: { not: null } });

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
                    // However long ago: a half-cleared business stays flagged.
                    { jobs: { some: UNFINISHED_CLEANUP_JOB } },
                    // A deletion held back by refunds owed (#921).
                    ...(waitingOnRefunds.size > 0
                        ? [{ id: { in: [...waitingOnRefunds] } }]
                        : []),
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

        const now = new Date();
        const [activity, failedJobs, failedWebhooks, plans, cleanups, waiting] =
            await Promise.all([
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
                // The resolver, once a business (a page is at most 100): a plan
                // override can't be read in a grouped query without deciding
                // again here what wins, which only the resolver may do.
                Promise.all(ids.map((id) => this.effective(id, now))),
                // A deleted business's clean-up that has failed (#921).
                prisma.job.findMany({
                    where: {
                        organizationId: { in: ids },
                        ...UNFINISHED_CLEANUP_JOB,
                    },
                    select: { organizationId: true },
                }),
                // A deletion held back by refunds owed (#921).
                businessesWaitingOnRefunds(now, ids),
            ]);
        const effective = new Map(ids.map((id, i) => [id, plans[i]]));
        const cleanupUnfinished = new Set(
            cleanups.map((row) => row.organizationId),
        );

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
            if (cleanupUnfinished.has(record.id)) {
                attention.push("DELETION_CLEANUP");
            }
            if (waiting.has(record.id)) {
                attention.push("DELETION_WAITING_REFUNDS");
            }

            return {
                id: record.id,
                name: record.name,
                slug: record.slug,
                lifecycleStatus: record.lifecycleStatus,
                legalHold: record.legalHoldAt !== null,
                createdAt: record.createdAt,
                members: record._count.memberships,
                enabledModules: record.organizationModules.map(
                    (row) => row.moduleKey,
                ),
                plan: record.subscription?.plan ?? null,
                effectivePlan: effective.get(record.id) ?? null,
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
