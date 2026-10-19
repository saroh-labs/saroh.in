import {
    CatalogueActions,
    PlanOverrideDialog,
} from "@/components/business/catalogue-actions";
import { CataloguePlan } from "@/components/business/catalogue-plan";
import { PlanActions, RevokeLimit } from "@/components/business/plan-actions";
import { SessionTab } from "@/components/business/session-tab";
import { Facts, Panel } from "@/components/panel";
import { readPlans } from "@/lib/business-page";
import type { BusinessPlan } from "@/lib/businesses";
import { can } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";
import { asWords, camelToWords, formatDate } from "@/lib/format";

/**
 * The Billing tab's detail (admin plan U2, kept by U5): every catalogue
 * row as its plan gives it and as it gets it now, the limits in use, and
 * the plan, limit and catalogue controls the operator's permissions allow.
 * It reads the business's own details, so it needs a support session; the
 * tab's rows above it (`BillingTab`) don't. Grant a module and a custom
 * price moved to the offer sheet, and Remove a module to Take away a
 * module… (U5).
 */
export async function PlanDetail({
    staff,
    organizationId,
}: {
    staff: StaffIdentity;
    organizationId: string;
}) {
    const subscriptionWrite = can(staff, "subscription:override");
    const pricingOverride = can(staff, "pricing:override");
    const pricingPrice = pricingOverride && can(staff, "pricing:publish");
    const plans = can(staff, "subscription:read") ? await readPlans() : [];

    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const id = view.facts.id;
                return (
                    <Panel
                        title="Plan and limits in detail"
                        description="What its plan gives, what applies now after overrides, and how much is in use."
                        data={view.plan}
                    >
                        {(plan) => (
                            <div className="grid gap-4">
                                {plan.catalogue ? (
                                    <CataloguePlan
                                        organizationId={id}
                                        plan={plan}
                                        catalogue={plan.catalogue}
                                        canOverride={pricingOverride}
                                        canSetPrice={pricingPrice}
                                        canRaise={subscriptionWrite}
                                    />
                                ) : (
                                    <Facts
                                        rows={[
                                            [
                                                "Plan",
                                                plan.subscription
                                                    ? `${plan.subscription.plan.name} (v${plan.subscription.plan.version})`
                                                    : "No plan yet, so they get the free basics",
                                            ],
                                            [
                                                "Catalogue",
                                                LEGACY_REASON[
                                                    plan.legacyReason ?? ""
                                                ] ?? "Not on the catalogue",
                                            ],
                                            [
                                                "Status",
                                                plan.subscription
                                                    ? asWords(
                                                          plan.subscription
                                                              .status,
                                                      )
                                                    : "—",
                                            ],
                                            [
                                                plan.subscription?.status ===
                                                "TRIALING"
                                                    ? "Trial ends"
                                                    : "Period ends",
                                                formatDate(
                                                    plan.subscription
                                                        ?.currentPeriodEnd,
                                                ),
                                            ],
                                        ]}
                                    />
                                )}
                                {plan.limits.length > 0 && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[440px] text-sm">
                                            <thead>
                                                <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                                                    <th className="py-2 pr-3 font-semibold">
                                                        {plan.catalogue
                                                            ? "Other limits"
                                                            : "Limit"}
                                                    </th>
                                                    <th className="py-2 pr-3 text-right font-semibold">
                                                        In use
                                                    </th>
                                                    <th className="py-2 pr-3 text-right font-semibold">
                                                        Allowed
                                                    </th>
                                                    <th className="py-2 font-semibold" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {plan.limits.map((limit) => (
                                                    <tr
                                                        key={limit.key}
                                                        className="border-b last:border-0"
                                                    >
                                                        <td className="py-2 pr-3">
                                                            {camelToWords(
                                                                limit.key,
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-3 text-right tabular-nums">
                                                            {limit.usage ?? (
                                                                <span className="text-muted-foreground">
                                                                    Not measured
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-3 text-right tabular-nums">
                                                            {describeLimit(
                                                                limit.effective,
                                                            )}
                                                            {limit.override && (
                                                                <span className="block text-[12.5px] text-muted-foreground">
                                                                    raised until{" "}
                                                                    {formatDate(
                                                                        limit
                                                                            .override
                                                                            .expiresAt,
                                                                    )}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 text-right">
                                                            {limit.override &&
                                                                subscriptionWrite && (
                                                                    <RevokeLimit
                                                                        organizationId={
                                                                            id
                                                                        }
                                                                        overrideId={
                                                                            limit
                                                                                .override
                                                                                .id
                                                                        }
                                                                        label={camelToWords(
                                                                            limit.key,
                                                                        )}
                                                                        expiresAt={
                                                                            limit
                                                                                .override
                                                                                .expiresAt
                                                                        }
                                                                    />
                                                                )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {subscriptionWrite && (
                                    <PlanActions
                                        organizationId={id}
                                        plans={plans}
                                        currentPlanId={
                                            plan.subscription?.plan.id ?? null
                                        }
                                        subscriptionStatus={
                                            plan.subscription?.status ?? null
                                        }
                                        numericLimits={raisableLimits(plan)}
                                        catalogueLive={Boolean(
                                            plan.liveCatalogue,
                                        )}
                                    />
                                )}
                                {pricingOverride &&
                                    plan.legacyReason === "no-plan" &&
                                    plan.liveCatalogue && (
                                        <div className="flex flex-wrap gap-2">
                                            <PlanOverrideDialog
                                                organizationId={id}
                                                plans={plan.liveCatalogue.plans}
                                                current={null}
                                                defaultPlanId={
                                                    plan.liveCatalogue.plans[0]
                                                        ?.id ?? ""
                                                }
                                            />
                                        </div>
                                    )}
                                {pricingOverride && plan.catalogue && (
                                    <CatalogueActions
                                        organizationId={id}
                                        catalogue={plan.catalogue}
                                        canMove={
                                            plan.catalogue.liveVersion !==
                                                null &&
                                            plan.subscription?.plan.key.startsWith(
                                                "catalog.",
                                            ) === true &&
                                            plan.subscription.status !==
                                                "CANCELLED" &&
                                            plan.subscription.plan.version <
                                                plan.catalogue.liveVersion
                                        }
                                    />
                                )}
                            </div>
                        )}
                    </Panel>
                );
            }}
        </SessionTab>
    );
}

/** Why the catalogue doesn't reach a business yet, in words. */
const LEGACY_REASON: Record<string, string> = {
    "no-plan":
        "Not yet: no subscription or plan override, so they get the free basics",
    "unmapped-plan": "Not yet — its billing plan has no catalogue plan",
    "no-catalogue": "No catalogue version is live, or it can't be read",
    "unknown-plan": "Its plan isn't in the version it is on",
};

/**
 * What an operator may raise for a while (`subscription:override`): every
 * numeric limit its plan sets — the catalogue rows by id and the keys no row
 * covers.
 */
function raisableLimits(
    plan: BusinessPlan,
): { key: string; label: string; planValue: number }[] {
    const rows = (plan.catalogue?.modules ?? []).flatMap((m) =>
        m.planState === "on" && m.planLimit !== null
            ? [{ key: m.moduleId, label: m.name, planValue: m.planLimit }]
            : [],
    );
    const keys = plan.limits.flatMap((limit) =>
        typeof limit.planValue === "number"
            ? [
                  {
                      key: limit.key,
                      label: camelToWords(limit.key),
                      planValue: limit.planValue,
                  },
              ]
            : [],
    );
    return [...rows, ...keys];
}

function describeLimit(value: number | boolean | null): string {
    if (value === null) return "No limit";
    if (typeof value === "boolean") return value ? "Included" : "Not included";
    return String(value);
}
