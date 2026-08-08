import { Injectable, NotFoundException } from "@nestjs/common";
import type { Plan } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * The Saroh plan catalog (S7-005).
 *
 * `Plan` is a GLOBAL catalog (NOT org-owned): every tenant is offered the same
 * plans, so reads need only an authenticated session (no OrganizationContext).
 * Only `active` plans are offerable to NEW subscribers; a plan version is
 * immutable, so `resolveActiveByKey` picks the LATEST active version for a key
 * (existing subscribers keep the version they signed up under, resolved via
 * their stored `planId`).
 */
@Injectable()
export class PlansService {
    /** All active plans, cheapest first — the offerable catalog. */
    listActive(): Promise<Plan[]> {
        return prisma.plan.findMany({
            where: { active: true },
            orderBy: [{ priceCents: "asc" }, { version: "desc" }],
        });
    }

    /**
     * Resolve the LATEST active `Plan` version for a catalog key (e.g. "pro").
     * 404s when no active plan exists for the key — a subscribe request can only
     * target an offerable plan.
     */
    async resolveActiveByKey(key: string): Promise<Plan> {
        const plan = await prisma.plan.findFirst({
            where: { key, active: true },
            orderBy: { version: "desc" },
        });
        if (!plan) {
            throw new NotFoundException(`No active plan for key "${key}"`);
        }
        return plan;
    }
}
