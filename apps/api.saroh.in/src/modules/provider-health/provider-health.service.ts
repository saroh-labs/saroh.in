import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";

/**
 * Provider & dependency health (#123, Task 8).
 *
 * A single OWNER/ADMIN surface reporting the health of the Organization's
 * external dependencies — merchant payments, business communications, and
 * domain verification — WITHOUT ever returning credentials. Health is derived
 * from last-known persisted state (provider status, domain verification), not a
 * live secret-bearing probe, so it is cheap and leaks nothing. States are
 * distinct and actionable; each maps to the exact place to fix it.
 */
export type HealthStatus =
    | "NOT_CONFIGURED"
    | "PENDING"
    | "ACTIVE"
    | "DEGRADED"
    | "FAILED";

export interface ProviderHealth {
    key: "PAYMENTS" | "COMMUNICATIONS" | "DOMAINS";
    label: string;
    status: HealthStatus;
    message: string;
    actionHref: string;
}

/**
 * Where a merchant actually configures providers. Payments and Communications
 * both resolve here: `/payments` and `/communications` were emitted for years
 * and neither has ever been a route in `app.saroh.in`, so every "connect a
 * provider" call to action 404'd. `scripts/check-app-routes.mjs` now fails the
 * build if a destination we emit has no page behind it.
 */
const PROVIDERS_HREF = "/settings/providers";
const SITES_HREF = "/sites";

@Injectable()
export class ProviderHealthService {
    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    async list(ctx: OrganizationContext): Promise<ProviderHealth[]> {
        // Provider configuration is an OWNER/ADMIN concern.
        if (ctx.role === "MEMBER") {
            throw new ForbiddenException(
                "Only owners and admins can view provider health.",
            );
        }
        const where = { organizationId: ctx.organizationId };

        const [payments, comms, domains] = await Promise.all([
            this.db.merchantPaymentProvider.findMany({
                where,
                select: { status: true },
            }),
            this.db.communicationProvider.findMany({
                where,
                select: { status: true },
            }),
            this.db.domain.findMany({ where, select: { status: true } }),
        ]);

        return [
            connectedHealth({
                key: "PAYMENTS",
                label: "Payments",
                statuses: payments.map((p) => p.status),
                notConfigured: "Connect a payment provider to accept payments.",
                active: "Payments are ready.",
                degraded:
                    "A connected provider is disabled — re-enable it to take payments.",
                actionHref: PROVIDERS_HREF,
            }),
            connectedHealth({
                key: "COMMUNICATIONS",
                label: "Communications",
                statuses: comms.map((c) => c.status),
                notConfigured: "Connect a provider to send messages.",
                active: "Messaging is ready.",
                degraded:
                    "A connected provider is disabled — re-enable it to send messages.",
                actionHref: PROVIDERS_HREF,
            }),
            domainHealth(domains.map((d) => d.status)),
        ];
    }
}

/** Health for a CONNECTED|DISABLED provider set. */
function connectedHealth({
    key,
    label,
    statuses,
    notConfigured,
    active,
    degraded,
    actionHref,
}: {
    key: ProviderHealth["key"];
    label: string;
    statuses: string[];
    notConfigured: string;
    active: string;
    degraded: string;
    actionHref: string;
}): ProviderHealth {
    if (statuses.length === 0)
        return {
            key,
            label,
            status: "NOT_CONFIGURED",
            message: notConfigured,
            actionHref,
        };
    if (statuses.some((s) => s === "CONNECTED"))
        return { key, label, status: "ACTIVE", message: active, actionHref };
    // Present but none connected.
    return { key, label, status: "DEGRADED", message: degraded, actionHref };
}

/** Health across the org's domain verifications (PENDING → VERIFIED, FAILED). */
function domainHealth(statuses: string[]): ProviderHealth {
    const base = {
        key: "DOMAINS" as const,
        label: "Domains",
        actionHref: SITES_HREF,
    };
    if (statuses.length === 0)
        return {
            ...base,
            status: "NOT_CONFIGURED",
            message:
                "No custom domain connected — you're using a Saroh subdomain.",
        };
    if (statuses.some((s) => s === "FAILED"))
        return {
            ...base,
            status: "FAILED",
            message: "A domain failed verification — check its DNS records.",
        };
    if (statuses.some((s) => s === "PENDING"))
        return {
            ...base,
            status: "PENDING",
            message: "A domain is awaiting DNS verification.",
        };
    return { ...base, status: "ACTIVE", message: "Your domains are verified." };
}
