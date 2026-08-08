/**
 * Organization module backfill (ADR-003 / #113, plan Task 2 Step 3).
 *
 * On rollout, existing Organizations must not lose access to functionality they
 * already use. This routine derives which modules an Organization is *already
 * using* from evidence in its own data, enables those (plus their declared
 * dependencies), and records every other module as `DISABLED`. It is
 * **idempotent**: re-running never overwrites a pre-existing explicit
 * installation row (`skipDuplicates`), so an operator who later disables a
 * module is not silently re-enabled.
 *
 * It runs per-Organization, each in its own transaction (never one global
 * transaction), so a single bad Organization cannot abort the whole backfill.
 *
 * Why an application routine and not raw SQL in the migration: the integration
 * test harness provisions its schema with `prisma db push` (not `migrate`), so
 * a backfill embedded in `migration.sql` would be untestable there. Keeping it
 * here lets `module-backfill.spec.ts` exercise it against a real Postgres. The
 * deploy pipeline runs it as a post-`migrate deploy` step (see #104).
 *
 * Evidence → module (dependency closure is applied separately from the typed
 * registry, so e.g. Appointments pulls in CRM):
 *
 *   Site/Page/Form/Domain/Publication ............... WEBSITE
 *   Contact/Lead/Pipeline/Stage/Activity ............ CRM
 *   Service/AvailabilityRule/Booking ................ APPOINTMENTS
 *   Store/Product/Inventory/Cart/Order/Customer ..... COMMERCE
 *   MerchantPaymentProvider/PaymentIntent/
 *     PaymentAttempt/WebhookEvent ................... PAYMENTS
 *   CommunicationProvider/Message/Delivery/Consent .. COMMUNICATIONS
 *   AutomationRule/AutomationRun .................... AUTOMATIONS
 *   AnalyticsEvent/AnalyticsDailyAggregate .......... INSIGHTS
 *
 * Modules are NEVER inferred from subscription plans, feature flags, or business
 * size — only from concrete domain records.
 */
import { prisma } from "@saroh/database";

import type { ModuleKey } from "./module-registry";
import { MODULE_BY_KEY, MODULE_KEYS } from "./module-registry";

/** The minimal transactional client surface this routine needs. */
type BackfillClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Per-Organization backfill outcome, for logging and verification. */
export interface OrganizationBackfillResult {
    organizationId: string;
    evidence: ModuleKey[];
    enabled: ModuleKey[];
    createdRows: number;
}

/** Whole-run summary. */
export interface BackfillSummary {
    organizations: number;
    results: OrganizationBackfillResult[];
}

/** True when at least one of the given counts is greater than zero. */
async function anyExists(...counts: Promise<number>[]): Promise<boolean> {
    const resolved = await Promise.all(counts);
    return resolved.some((n) => n > 0);
}

/** Derive the modules an Organization already uses from its domain records. */
export async function deriveModuleEvidence(
    client: BackfillClient,
    organizationId: string,
): Promise<Set<ModuleKey>> {
    const where = { organizationId };
    const evidence = new Set<ModuleKey>();

    if (
        await anyExists(
            client.site.count({ where }),
            client.page.count({ where }),
            client.form.count({ where }),
            client.domain.count({ where }),
            client.publication.count({ where }),
        )
    ) {
        evidence.add("WEBSITE");
    }

    if (
        await anyExists(
            client.contact.count({ where }),
            client.lead.count({ where }),
            client.pipeline.count({ where }),
            client.stage.count({ where }),
            client.activity.count({ where }),
        )
    ) {
        evidence.add("CRM");
    }

    if (
        await anyExists(
            client.service.count({ where }),
            client.availabilityRule.count({ where }),
            client.booking.count({ where }),
        )
    ) {
        evidence.add("APPOINTMENTS");
    }

    if (
        await anyExists(
            client.store.count({ where }),
            client.product.count({ where }),
            client.inventory.count({ where }),
            client.cart.count({ where }),
            client.order.count({ where }),
            client.customer.count({ where }),
        )
    ) {
        evidence.add("COMMERCE");
    }

    if (
        await anyExists(
            client.merchantPaymentProvider.count({ where }),
            client.paymentIntent.count({ where }),
            client.paymentAttempt.count({ where }),
            client.webhookEvent.count({ where }),
        )
    ) {
        evidence.add("PAYMENTS");
    }

    if (
        await anyExists(
            client.communicationProvider.count({ where }),
            client.message.count({ where }),
            client.delivery.count({ where }),
            client.consent.count({ where }),
        )
    ) {
        evidence.add("COMMUNICATIONS");
    }

    if (
        await anyExists(
            client.automationRule.count({ where }),
            client.automationRun.count({ where }),
        )
    ) {
        evidence.add("AUTOMATIONS");
    }

    if (
        await anyExists(
            client.analyticsEvent.count({ where }),
            client.analyticsDailyAggregate.count({ where }),
        )
    ) {
        evidence.add("INSIGHTS");
    }

    return evidence;
}

/** Expand a set of modules to include all transitive hard dependencies. */
export function withDependencies(keys: Iterable<ModuleKey>): Set<ModuleKey> {
    const out = new Set<ModuleKey>(keys);
    let changed = true;
    while (changed) {
        changed = false;
        for (const key of [...out]) {
            for (const dep of MODULE_BY_KEY.get(key)?.dependencies ?? []) {
                if (!out.has(dep)) {
                    out.add(dep);
                    changed = true;
                }
            }
        }
    }
    return out;
}

/**
 * Backfill module installations for every Organization. Idempotent and safe to
 * re-run. Returns a per-Organization summary.
 */
export async function backfillOrganizationModules(
    client: typeof prisma = prisma,
): Promise<BackfillSummary> {
    const organizations = await client.organization.findMany({
        select: { id: true },
    });

    const results: OrganizationBackfillResult[] = [];

    for (const org of organizations) {
        const result = await client.$transaction(async (tx) => {
            const evidence = await deriveModuleEvidence(tx, org.id);
            const enabled = withDependencies(evidence);

            const now = new Date();
            const rows = MODULE_KEYS.map((moduleKey) => {
                const isEnabled = enabled.has(moduleKey);
                return {
                    organizationId: org.id,
                    moduleKey,
                    status: isEnabled ? "ENABLED" : "DISABLED",
                    enabledAt: isEnabled ? now : null,
                    // System backfill — no human actor.
                    enabledByUserId: null,
                };
            });

            // Never overwrite a pre-existing explicit installation row.
            const created = await tx.organizationModule.createMany({
                data: rows,
                skipDuplicates: true,
            });

            // One system audit event per Organization, listing derived evidence.
            await tx.auditEvent.create({
                data: {
                    action: "organization.modules.backfill",
                    actorUserId: "system:module-backfill",
                    organizationId: org.id,
                    outcome: "SUCCESS",
                    metadata: {
                        evidence: [...evidence],
                        enabled: [...enabled],
                    },
                },
            });

            // Requery + compare: every module has exactly one row, no dupes.
            const stored = await tx.organizationModule.findMany({
                where: { organizationId: org.id },
                select: { moduleKey: true },
            });
            const storedKeys = new Set(stored.map((r) => r.moduleKey));
            if (
                stored.length !== MODULE_KEYS.length ||
                storedKeys.size !== MODULE_KEYS.length
            ) {
                throw new Error(
                    `backfill verification failed for organization ${org.id}: expected ${MODULE_KEYS.length} distinct module rows, got ${stored.length}`,
                );
            }

            return {
                organizationId: org.id,
                evidence: [...evidence],
                enabled: [...enabled],
                createdRows: created.count,
            } satisfies OrganizationBackfillResult;
        });

        results.push(result);
    }

    return { organizations: organizations.length, results };
}
