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
                        "/website",
                    );
                return setup(
                    "WEBSITE_NO_SITE",
                    "Create a site to get started.",
                    "/website",
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
                    "/crm",
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
                        "/appointments",
                    );
                if (rules === 0)
                    return setup(
                        "APPOINTMENTS_NO_AVAILABILITY",
                        "Set your availability so customers can book.",
                        "/appointments",
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
                if (
                    (await this.db.merchantPaymentProvider.count({
                        where: { organizationId },
                    })) > 0
                )
                    return active();
                return setup(
                    "PAYMENTS_NO_PROVIDER",
                    "Connect a payment provider to accept payments.",
                    "/payments",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private communications(): ModuleReadinessAdapter {
        return {
            key: "COMMUNICATIONS",
            evaluate: async ({ organizationId }) => {
                if (
                    (await this.db.communicationProvider.count({
                        where: { organizationId },
                    })) > 0
                )
                    return active();
                return setup(
                    "COMMUNICATIONS_NO_PROVIDER",
                    "Connect a provider to send messages.",
                    "/communications",
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
                return setup(
                    "AUTOMATIONS_NO_RULE",
                    "Create a rule to automate follow-up.",
                    "/automations",
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
                    "/insights",
                );
            },
            deactivationBlockers: () => Promise.resolve([]),
        };
    }
}
