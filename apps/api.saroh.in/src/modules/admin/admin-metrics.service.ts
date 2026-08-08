import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

/** Platform-wide counts for the admin dashboard. Aggregates only. */
export interface PlatformMetrics {
    organizations: { total: number; createdLast30Days: number };
    users: { total: number; verified: number; createdLast30Days: number };
    /** Enabled-module installations per module key, highest first. */
    moduleAdoption: { moduleKey: string; organizations: number }[];
    commerce: { orders: number; openOrders: number };
    content: { sites: number; publishedSites: number };
    /** Analytics events captured in the last 30 days, by type. */
    activity: { type: string; events: number }[];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Read model for the platform dashboard (S1-012 admin).
 *
 * The ONLY place in the API that reads across tenants, which is why it is
 * restricted to aggregates: counts and group-bys, never a customer record, an
 * email, or the contents of any org's data. A staff dashboard needs "how is
 * Saroh doing", not "what is in this tenant" — so per-tenant inspection stays a
 * separate, explicitly-audited surface rather than something this quietly grows
 * into.
 *
 * Note for the RLS rollout (ADR-002): these queries run with no Organization
 * context. Once `RLS_ENFORCEMENT` is on, they must run as a role that is
 * explicitly permitted to read across tenants — the org predicate would
 * otherwise reduce every count here to zero.
 */
@Injectable()
export class AdminMetricsService {
    async summary(): Promise<PlatformMetrics> {
        const since = new Date(Date.now() - THIRTY_DAYS_MS);

        const [
            organizations,
            recentOrganizations,
            users,
            verifiedUsers,
            recentUsers,
            moduleRows,
            orders,
            openOrders,
            sites,
            publishedSites,
            activityRows,
        ] = await Promise.all([
            prisma.organization.count(),
            prisma.organization.count({ where: { createdAt: { gte: since } } }),
            prisma.user.count(),
            prisma.user.count({ where: { emailVerified: true } }),
            prisma.user.count({ where: { createdAt: { gte: since } } }),
            prisma.organizationModule.groupBy({
                by: ["moduleKey"],
                where: { status: "ENABLED" },
                _count: { _all: true },
            }),
            prisma.order.count(),
            prisma.order.count({
                where: { status: { in: ["PENDING", "PROCESSING"] } },
            }),
            prisma.site.count(),
            prisma.publication.count(),
            prisma.analyticsEvent.groupBy({
                by: ["type"],
                where: { createdAt: { gte: since } },
                _count: { _all: true },
            }),
        ]);

        return {
            organizations: {
                total: organizations,
                createdLast30Days: recentOrganizations,
            },
            users: {
                total: users,
                verified: verifiedUsers,
                createdLast30Days: recentUsers,
            },
            moduleAdoption: moduleRows
                .map((row) => ({
                    moduleKey: row.moduleKey,
                    organizations: row._count._all,
                }))
                .sort((a, b) => b.organizations - a.organizations),
            commerce: { orders, openOrders },
            content: { sites, publishedSites },
            activity: activityRows
                .map((row) => ({ type: row.type, events: row._count._all }))
                .sort((a, b) => b.events - a.events),
        };
    }
}
