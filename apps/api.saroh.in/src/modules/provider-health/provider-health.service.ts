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
            connectedHealth(
                "PAYMENTS",
                "Payments",
                payments.map((p) => p.status),
                "Connect a payment provider to accept payments.",
                "Payments are ready.",
                "A connected provider is disabled — re-enable it to take payments.",
                "/payments",
            ),
            connectedHealth(
                "COMMUNICATIONS",
                "Communications",
                comms.map((c) => c.status),
                "Connect a provider to send messages.",
                "Messaging is ready.",
                "A connected provider is disabled — re-enable it to send messages.",
                "/communications",
            ),
            domainHealth(domains.map((d) => d.status)),
        ];
    }
}

/** Health for a CONNECTED|DISABLED provider set. */
function connectedHealth(
    key: ProviderHealth["key"],
    label: string,
    statuses: string[],
    notConfigured: string,
    active: string,
    degraded: string,
    actionHref: string,
): ProviderHealth {
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
        actionHref: "/sites",
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
