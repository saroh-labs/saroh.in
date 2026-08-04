/**
 * Per-module readiness + safe-deactivation adapters (ADR-003 / #114, Task 4).
 *
 * Each adapter answers readiness with cheap count queries against the module's
 * own domain tables, mirroring the readiness/deactivation matrix in the plan.
 * SETUP_REQUIRED vs ACTIVE is derived from evidence; ATTENTION_REQUIRED is
 * reserved for wired provider-health signals (a per-module follow-up — see the
 * enforcement rollout, #117). Deactivation blockers protect public/financial
 * obligations; Commerce is the worked example (open orders block a full
 * disable). Codes are stable; messages are safe plain language.
 */
import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { ModuleKey } from "../module-registry";
import type {
    DeactivationBlocker,
    ModuleReadinessAdapter,
    ReadinessInput,
    ReadinessResult,
} from "./module-readiness.port";

/** Non-terminal order states that represent live checkout/fulfilment. */
const OPEN_ORDER_STATES = ["PENDING", "PROCESSING"] as const;

function active(): ReadinessResult {
    return { readiness: "ACTIVE", blockers: [] };
}

function setup(
    code: string,
    message: string,
    actionHref?: string,
): ReadinessResult {
    return {
        readiness: "SETUP_REQUIRED",
        blockers: [{ code, message, severity: "SETUP", actionHref }],
    };
}

/**
 * A dependency the merchant already configured has stopped working.
 *
 * Distinct from `setup()`, and the distinction is the whole point: SETUP means
 * "you have not connected this yet" — expected, unhurried, part of onboarding.
 * ATTENTION means "you connected it and it is no longer functioning" — nothing
 * is being onboarded, something is broken, and money or messages are being lost
 * right now.
 *
 * Nothing emitted this severity before, so `ATTENTION_REQUIRED` was a state the
 * types allowed, the UI rendered, and the product could not produce.
 */
function attention(
    code: string,
    message: string,
    actionHref?: string,
): ReadinessResult {
    return {
        readiness: "ATTENTION_REQUIRED",
        blockers: [{ code, message, severity: "ATTENTION", actionHref }],
    };
}

/** Providers the merchant connected and has not switched off. */
const CONNECTED = "CONNECTED";

/**
 * The readiness registry. Holds one adapter per module and resolves readiness /
 * deactivation for any enabled module. Missing adapters default to ACTIVE with
 * no deactivation blockers (safe pause), so a new module is never wrongly
 * reported broken.
 */
@Injectable()
export class ModuleReadinessRegistry {
    private readonly adapters: ReadonlyMap<ModuleKey, ModuleReadinessAdapter>;

    constructor(@Optional() private readonly db: typeof prisma = prisma) {
        const list: ModuleReadinessAdapter[] = [
            this.website(),
            this.crm(),
            this.appointments(),
            this.commerce(),
            this.payments(),
            this.communications(),
            this.automations(),
            this.insights(),
        ];
        this.adapters = new Map(list.map((a) => [a.key, a]));
    }

    async evaluate(
        key: ModuleKey,
        input: ReadinessInput,
    ): Promise<ReadinessResult> {
        const adapter = this.adapters.get(key);
        return adapter ? adapter.evaluate(input) : active();
    }

    async deactivationBlockers(
        key: ModuleKey,
        input: ReadinessInput,
    ): Promise<DeactivationBlocker[]> {
        const adapter = this.adapters.get(key);
        return adapter ? adapter.deactivationBlockers(input) : [];
    }

    // --- adapters ---------------------------------------------------------

    private website(): ModuleReadinessAdapter {
        return {
            key: "WEBSITE",
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                if ((await this.db.publication.count({ where })) > 0)
                    return active();
                if ((await this.db.site.count({ where })) > 0)
                    return setup(
                        "WEBSITE_NO_PUBLICATION",
                        "Publish your site to go live.",
                        "/sites",
                    );
                return setup(
                    "WEBSITE_NO_SITE",
                    "Create a site to get started.",
                    "/sites/new",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private crm(): ModuleReadinessAdapter {
        return {
            key: "CRM",
            evaluate: async ({ organizationId }) => {
                if (
                    (await this.db.pipeline.count({
                        where: { organizationId },
                    })) > 0
                )
                    return active();
                return setup(
                    "CRM_NO_PIPELINE",
                    "Create a pipeline to start tracking leads.",
                    "/pipeline",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private appointments(): ModuleReadinessAdapter {
        return {
            key: "APPOINTMENTS",
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                const [services, rules] = await Promise.all([
                    this.db.service.count({ where }),
                    this.db.availabilityRule.count({ where }),
                ]);
                if (services === 0)
                    return setup(
                        "APPOINTMENTS_NO_SERVICE",
                        "Add a bookable service.",
                        "/services/new",
                    );
                if (rules === 0)
                    return setup(
                        "APPOINTMENTS_NO_AVAILABILITY",
                        "Set your availability so customers can book.",
                        "/services",
                    );
                return active();
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private commerce(): ModuleReadinessAdapter {
        return {
            key: "COMMERCE",
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                const [stores, products] = await Promise.all([
                    this.db.store.count({ where }),
                    this.db.product.count({ where }),
                ]);
                if (stores === 0 && products === 0)
                    return setup(
                        "COMMERCE_NO_CATALOG",
                        "Add a product to start selling.",
                        "/commerce",
                    );
                return active();
            },
            deactivationBlockers: async ({ organizationId }) => {
                const open = await this.db.order.count({
                    where: {
                        organizationId,
                        status: { in: [...OPEN_ORDER_STATES] },
                    },
                });
                if (open > 0)
                    return [
                        {
                            code: "COMMERCE_OPEN_ORDERS",
                            message: `Resolve ${open} open order(s) before disabling Commerce. Existing orders remain manageable.`,
                            actionHref: "/commerce",
                        },
                    ];
                return [];
            },
        };
    }

    private payments(): ModuleReadinessAdapter {
        return {
            key: "PAYMENTS",
            evaluate: async ({ organizationId }) => {
                // Counting rows is not the same question as "can this merchant
                // take a payment?". This adapter used to count providers and
                // ignore their status, so an organization whose only provider
                // was DISABLED read as ACTIVE while `/provider-health` correctly
                // reported DEGRADED — two subsystems contradicting each other
                // about the same row, with the merchant-facing one wrong.
                const [total, connected] = await Promise.all([
                    this.db.merchantPaymentProvider.count({
                        where: { organizationId },
                    }),
                    this.db.merchantPaymentProvider.count({
                        where: { organizationId, status: CONNECTED },
                    }),
                ]);

                if (connected > 0) return active();
                if (total > 0)
                    return attention(
                        "PAYMENTS_PROVIDER_DISABLED",
                        "A connected provider is disabled — re-enable it to take payments.",
                        "/settings/providers",
                    );
                return setup(
                    "PAYMENTS_NO_PROVIDER",
                    "Connect a payment provider to accept payments.",
                    "/settings/providers",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private communications(): ModuleReadinessAdapter {
        return {
            key: "COMMUNICATIONS",
            evaluate: async ({ organizationId }) => {
                // Same count-only defect as PAYMENTS, same fix. A merchant whose
                // only messaging provider is switched off is not "active"; their
                // follow-ups are silently not being sent.
                const [total, connected] = await Promise.all([
                    this.db.communicationProvider.count({
                        where: { organizationId },
                    }),
                    this.db.communicationProvider.count({
                        where: { organizationId, status: CONNECTED },
                    }),
                ]);

                if (connected > 0) return active();
                if (total > 0)
                    return attention(
                        "COMMUNICATIONS_PROVIDER_DISABLED",
                        "A connected provider is disabled — re-enable it to send messages.",
                        "/settings/providers",
                    );
                return setup(
                    "COMMUNICATIONS_NO_PROVIDER",
                    "Connect a provider to send messages.",
                    "/settings/providers",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private automations(): ModuleReadinessAdapter {
        return {
            key: "AUTOMATIONS",
            evaluate: async ({ organizationId }) => {
                if (
                    (await this.db.automationRule.count({
                        where: { organizationId },
                    })) > 0
                )
                    return active();
                // No actionHref: Automations has no shell surface yet, so the
                // consumer's fallback (Settings → Modules) is the only honest
                // destination. NEVER point a blocker at an unbuilt route — a
                // 404 is worse than no link (release gate §2, no inaccessible
                // action leakage).
                return setup(
                    "AUTOMATIONS_NO_RULE",
                    "Create a rule to automate follow-up.",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private insights(): ModuleReadinessAdapter {
        return {
            key: "INSIGHTS",
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                const [events, aggregates] = await Promise.all([
                    this.db.analyticsEvent.count({ where }),
                    this.db.analyticsDailyAggregate.count({ where }),
                ]);
                if (events > 0 || aggregates > 0) return active();
                return setup(
                    "INSIGHTS_NO_DATA",
                    "Insights become available once your modules produce activity.",
                    "/analytics",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }
}
