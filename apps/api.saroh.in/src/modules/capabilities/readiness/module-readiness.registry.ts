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

import { lacksWebhookSecret } from "../../payments/webhook-setup";
import {
    SHOP_AWAITS_SELLS_FROM,
    sellsFromHref,
    siteAwaitingSellsFrom,
} from "../../sites/sells-from-awaiting";
import type { ModuleKey } from "../module-registry";
import { deactivationImpactOf } from "./module-deactivation-impact";
import type {
    DeactivationBlocker,
    DeactivationImpactItem,
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

/** A live site's shop could serve, but "Sells from" is unanswered (P4). */
export const WEBSITE_SHOP_NOT_CHOSEN = "WEBSITE_SHOP_NOT_CHOSEN";

/** Payments connected, but no payment through them can be confirmed (DEC-063). */
export const PAYMENTS_WEBHOOK_SECRET_MISSING =
    "PAYMENTS_WEBHOOK_SECRET_MISSING";

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
            this.courses(),
            this.classPacks(),
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

    /**
     * What turning the module off touches, with real counts (F13). Beside
     * the blockers, never instead of them: an impact line informs, a
     * blocker refuses. A module with nothing to count says nothing here.
     */
    deactivationImpact(
        key: ModuleKey,
        input: ReadinessInput,
    ): Promise<DeactivationImpactItem[]> {
        return deactivationImpactOf(this.db, key, input);
    }

    // --- adapters ---------------------------------------------------------

    private website(): ModuleReadinessAdapter {
        return {
            key: "WEBSITE",
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                // A test release's snapshot (kind TEST, DEC-071) has never
                // been live, so it doesn't make the website published.
                const published = await this.db.publication.count({
                    where: { organizationId, kind: "LIVE" },
                });
                if (published > 0) {
                    // Live, but its shop waits on "Sells from" (P4): said
                    // only while the shop could serve (DEC-057).
                    const waiting = await siteAwaitingSellsFrom(
                        this.db,
                        organizationId,
                    );
                    return waiting
                        ? setup(
                              WEBSITE_SHOP_NOT_CHOSEN,
                              SHOP_AWAITS_SELLS_FROM,
                              sellsFromHref(waiting),
                          )
                        : active();
                }
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

    private courses(): ModuleReadinessAdapter {
        return {
            key: "COURSES",
            evaluate: async ({ organizationId }) => {
                const [all, open] = await Promise.all([
                    this.db.course.count({ where: { organizationId } }),
                    this.db.course.count({
                        where: { organizationId, status: "OPEN" },
                    }),
                ]);
                if (all === 0)
                    return setup(
                        "COURSES_NO_COURSE",
                        "Make a course to start taking enrolments.",
                        "/courses/new",
                    );
                if (open === 0)
                    return setup(
                        "COURSES_NONE_OPEN",
                        "Open a course to take enrolments.",
                        "/courses",
                    );
                return active();
            },
            // Turning Courses off keeps every course, enrolment and booked
            // session; it only stops new enrolments.
            deactivationBlockers: () => Promise.resolve([]),
        };
    }

    private classPacks(): ModuleReadinessAdapter {
        return {
            key: "CLASS_PACKS",
            evaluate: async ({ organizationId }) => {
                // A draft (E14) isn't published yet: it isn't a pack to sell.
                const [all, onSale, drafts] = await Promise.all([
                    this.db.classPack.count({
                        where: { organizationId, status: { not: "DRAFT" } },
                    }),
                    this.db.classPack.count({
                        where: { organizationId, status: "ACTIVE" },
                    }),
                    this.db.classPack.count({
                        where: { organizationId, status: "DRAFT" },
                    }),
                ]);
                if (all === 0)
                    return drafts > 0
                        ? setup(
                              "CLASS_PACKS_NO_PACK",
                              "Publish a pack to start selling it.",
                              "/class-packs",
                          )
                        : setup(
                              "CLASS_PACKS_NO_PACK",
                              "Make a pack to start selling them.",
                              "/class-packs/new",
                          );
                if (onSale === 0)
                    return setup(
                        "CLASS_PACKS_NONE_ON_SALE",
                        "Every pack is archived. Restore one or make a new one to sell.",
                        "/class-packs",
                    );
                return active();
            },
            // Turning Class packs off keeps every pack, purchase and class
            // already spent (DEC-016); it only stops new sales.
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
            deactivationBlockers: async ({ organizationId, may }) => {
                const open = await this.db.order.count({
                    where: {
                        organizationId,
                        status: { in: [...OPEN_ORDER_STATES] },
                    },
                });
                if (open === 0) return [];
                // The number only for someone who may read orders (F13).
                const counts = !may || may("order:read") || may("order:stage");
                return [
                    {
                        code: "COMMERCE_OPEN_ORDERS",
                        message: counts
                            ? `${open} open ${open === 1 ? "order needs" : "orders need"} sending or cancelling first. Orders already placed stay in Orders.`
                            : "Some open orders need sending or cancelling first. Orders already placed stay in Orders.",
                        actionHref: "/commerce/orders",
                    },
                ];
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

                if (connected > 0) {
                    // Connected is not confirmed (DEC-063): a Razorpay
                    // connection saved without its webhook signing secret
                    // takes the money, and every payment update it sends
                    // is refused — the order waits "Awaiting payment"
                    // forever. When no connected one can confirm a
                    // payment, the business isn't ready to take one.
                    const rows = await this.db.merchantPaymentProvider.findMany(
                        {
                            where: { organizationId, status: CONNECTED },
                            select: {
                                provider: true,
                                encryptedCredentials: true,
                                credentialsIv: true,
                                credentialsAuthTag: true,
                            },
                        },
                    );
                    if (rows.length > 0 && rows.every(lacksWebhookSecret))
                        return attention(
                            PAYMENTS_WEBHOOK_SECRET_MISSING,
                            "Payments can't be confirmed — add the webhook signing secret to your payment provider's connection.",
                            "/settings/providers",
                        );
                    return active();
                }
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
            // Activity is a visit counted or money taken: Insights' takings
            // (DEC-075) read paid orders and paid invoices, so a business
            // that has sold has something to see before its site is visited.
            evaluate: async ({ organizationId }) => {
                const where = { organizationId };
                const [events, aggregates, order, invoice] = await Promise.all([
                    this.db.analyticsEvent.count({ where }),
                    this.db.analyticsDailyAggregate.count({ where }),
                    this.db.order.findFirst({
                        where: { organizationId, paymentStatus: "PAID" },
                        select: { id: true },
                    }),
                    this.db.invoice.findFirst({
                        where: { organizationId, paidAt: { not: null } },
                        select: { id: true },
                    }),
                ]);
                if (events > 0 || aggregates > 0 || order || invoice) {
                    return active();
                }
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
