import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";

/**
 * Home read model (cross-product UX #119, Task 4).
 *
 * Produces ONE aggregated, ranked list of "what should I do next?" for an actor
 * in an Organization (± Project), so the Home page has a single dominant action
 * and no client-side data waterfalls. It composes module availability (the same
 * effective-availability projection the shell uses) with a few cheap operational
 * counts, and ranks by severity so the most important thing is always first.
 *
 * Rank: ATTENTION (a dependency is unhealthy) → SETUP (an enabled module isn't
 * ready) → OVERDUE (operational work past due) → SUGGESTION (a healthy nudge).
 * Actions for disabled/unavailable modules are never emitted (no leakage).
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

const SEVERITY_RANK: Record<HomeSeverity, number> = {
    ATTENTION: 0,
    SETUP: 1,
    OVERDUE: 2,
    SUGGESTION: 3,
};

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
}

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
}

export interface HomeInput {
    organizationId: string;
    organizationRole: OrgRole;
    projectId?: string;
}

@Injectable()
export class HomeService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    async build(input: HomeInput): Promise<HomeModel> {
        const views = await this.availability.listViews(input);
        const actions: HomeAction[] = [];

        // Setup / attention actions straight from module readiness.
        for (const view of views) {
            if (view.readiness === "ATTENTION_REQUIRED") {
                // SETUP/ATTENTION readiness always carries at least one blocker.
                const blocker = view.blockers[0];
                actions.push({
                    code: `${view.key}_ATTENTION`,
                    title: blocker.message ?? `${view.label} needs attention`,
                    href: blocker.actionHref ?? "/settings/modules",
                    severity: "ATTENTION",
                    moduleKey: view.key,
                });
            } else if (view.readiness === "SETUP_REQUIRED") {
                const blocker = view.blockers[0];
                actions.push({
                    code: `${view.key}_SETUP`,
                    title: blocker.message ?? `Finish setting up ${view.label}`,
                    href: blocker.actionHref ?? "/settings/modules",
                    severity: "SETUP",
                    moduleKey: view.key,
                });
            }
        }

        // Operational actions — only for ACTIVE modules, so a disabled module
        // never contributes work.
        const active = new Set(
            views.filter((v) => v.readiness === "ACTIVE").map((v) => v.key),
        );
        const now = new Date();

        if (active.has("CRM")) {
            const overdue = await this.db.activity.count({
                where: {
                    organizationId: input.organizationId,
                    dueAt: { lt: now },
                    completedAt: null,
                },
            });
            if (overdue > 0) {
                actions.push({
                    code: "CRM_OVERDUE_FOLLOWUPS",
                    title: `Follow up on ${overdue} overdue lead${overdue === 1 ? "" : "s"}`,
                    href: "/leads",
                    severity: "OVERDUE",
                    moduleKey: "CRM",
                });
            }
        }

        if (active.has("COMMERCE")) {
            const open = await this.db.order.count({
                where: {
                    organizationId: input.organizationId,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (open > 0) {
                actions.push({
                    code: "COMMERCE_OPEN_ORDERS",
                    title: `Fulfil ${open} open order${open === 1 ? "" : "s"}`,
                    href: "/commerce",
                    severity: "OVERDUE",
                    moduleKey: "COMMERCE",
                });
            } else {
                actions.push({
                    code: "COMMERCE_SUGGEST_PRODUCT",
                    title: "Add a product to your catalog",
                    href: "/commerce",
                    severity: "SUGGESTION",
                    moduleKey: "COMMERCE",
                });
            }
        }

        if (active.has("INSIGHTS")) {
            actions.push({
                code: "INSIGHTS_VIEW",
                title: "Review this week's performance",
                href: "/analytics",
                severity: "SUGGESTION",
                moduleKey: "INSIGHTS",
            });
        }

        actions.sort(
            (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
        );

        return {
            actions,
            primaryAction: actions[0] ?? null,
            hasAnyModule: views.some((v) => v.readiness !== "DISABLED"),
        };
    }
}
