"use client";

import type { ReactNode } from "react";

import type { PlanOption } from "@/lib/businesses";
import { formatDate } from "@/lib/format";
import type { OverviewPanel, OverviewPlan } from "@/lib/overview-words";
import {
    billedToLine,
    offerLine,
    overviewNextCharge,
    priceLine,
} from "@/lib/overview-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { Facts } from "../../panel";
import { PlanOverrideDialog } from "../catalogue-actions";
import { PlanActions } from "../plan-actions";
import { CardLink, OverviewCard } from "./overview-card";

/**
 * Plan and access (U3, R2): the plan it is on now and until when, what it
 * pays and when it is charged next, who it is billed to (only for Billing
 * readers), and the offers running with their end dates. Its action is the
 * existing plan control, opened over Overview: Put on a plan… while a
 * catalogue is live (`pricing:override`), the old plan controls otherwise
 * (`subscription:override`).
 */
export function PlanCard({
    organizationId,
    plan,
    billedTo,
    canOverride,
    canChangePlan,
    legacyPlans,
}: {
    organizationId: string;
    plan: OverviewPanel<OverviewPlan>;
    /** Null: not for this reader (`saroh-billing:read`). */
    billedTo: { name: string | null } | null;
    /** Holds `pricing:override`. */
    canOverride: boolean;
    /** Holds `subscription:override`. */
    canChangePlan: boolean;
    /** The old plans, for a business off the catalogue. */
    legacyPlans: PlanOption[];
}) {
    const feedback = useChangeFeedback();
    const report = (message: string) =>
        feedback.report({ message, rowId: "plan" });

    let action: ReactNode = null;
    if (plan.status === "ok") {
        const p = plan.data;
        const live = p.livePlans;
        if (canOverride && live && live.length > 0) {
            const current = p.effective?.override
                ? {
                      planKey: p.effective.id,
                      expiresAt: p.effective.override.expiresAt,
                  }
                : null;
            action = (
                <PlanOverrideDialog
                    organizationId={organizationId}
                    plans={live}
                    current={current}
                    defaultPlanId={live[0]?.id ?? ""}
                    trigger={
                        current ? "Change plan override…" : "Put on a plan…"
                    }
                    onDone={report}
                />
            );
        } else if (canChangePlan && !live) {
            action = (
                <PlanActions
                    organizationId={organizationId}
                    plans={legacyPlans}
                    currentPlanId={null}
                    subscriptionStatus={p.status}
                    numericLimits={[]}
                    catalogueLive={false}
                    onDone={report}
                />
            );
        }
    }

    return (
        <OverviewCard
            id="plan"
            title="Plan and access"
            data={plan}
            actions={action}
            highlighted={feedback.isHighlighted("plan")}
        >
            {(p) => {
                const planName = (id: string) =>
                    p.livePlans?.find((x) => x.id === id)?.name ?? id;
                const rows: [string, ReactNode][] = [["Plan", planWords(p)]];
                const price = priceLine(p);
                if (price) rows.push(["Pays", price]);
                rows.push(["Next charge", overviewNextCharge(p)]);
                if (billedTo) rows.push(["Billed to", billedToLine(billedTo)]);
                return (
                    <div className="grid gap-4">
                        <Facts rows={rows} />
                        <div className="grid gap-1.5">
                            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                Offers running
                            </p>
                            {p.offers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    None. It gets what its plan gives.
                                </p>
                            ) : (
                                <ul className="grid gap-1 text-sm">
                                    {p.offers.map((offer) => (
                                        <li key={offer.id}>
                                            {offerLine(offer, planName)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <CardLink organizationId={organizationId} tab="billing">
                            Open Billing
                        </CardLink>
                    </div>
                );
            }}
        </OverviewCard>
    );
}

/** "Plan C until 3 Nov 2026 · base plan Plan A", or "No plan yet". */
function planWords(p: OverviewPlan): string {
    if (!p.name) return "No plan yet, so they get the free basics";
    if (!p.effective?.override) return p.name;
    const until = p.overrideEndsAt
        ? `until ${formatDate(p.overrideEndsAt)}`
        : "until removed";
    return p.basePlanName && p.basePlanName !== p.name
        ? `${p.name} ${until} · base plan ${p.basePlanName}`
        : `${p.name} ${until}`;
}
