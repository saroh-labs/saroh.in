import { PermissionDeniedState } from "@saroh/ui/data-state";

import type { BillingSide } from "@/components/business/billing/billing-tab";
import { BillingTab } from "@/components/business/billing/billing-tab";
import { PlanDetail } from "@/components/business/billing/plan-detail";
import { Panel } from "@/components/panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { getSarohSubscription } from "@/lib/billing";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readOverview,
    readSummary,
    tabTitle,
} from "@/lib/business-page";
import { can } from "@/lib/console";
import type { StaffIdentity } from "@/lib/control-plane";
import type { BusinessOverview } from "@/lib/overview-words";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Billing", organizationId) };
}

/**
 * Billing (admin plan U5, R6): its plan, the offers running, who it is
 * billed to (its billing profile, DEC-167), its limits and extras and its
 * last invoice, with links to the subscription sheet and Sync with
 * Razorpay…. The rows read without a support session (R10): the plan from
 * the Overview's read (`organization:read`), who pays and the invoices
 * from Saroh's billing (`saroh-billing:read`, Platform owners and Billing
 * only). Give a custom offer… opens the offer sheet over the tab.
 *
 * Inside a support session, the plan's detail follows (`PlanDetail`):
 * every catalogue row, the limits in use and the older plan controls.
 */
export default async function BillingTabPage({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;

    let overview: BusinessOverview | null | undefined;
    try {
        overview = await readOverview(organizationId);
    } catch {
        overview = undefined;
    }
    if (overview === undefined || overview?.plan.status === "failed") {
        return (
            <FailedPanel
                things="its billing"
                reassurance="The rest of the page is current."
            />
        );
    }
    if (overview === null) {
        return (
            <PermissionDeniedState
                title="This business isn't one of yours"
                description="Your access covers the businesses you look after."
            />
        );
    }

    const plan = overview.plan.data;
    const [summary, side] = await Promise.all([
        readSummary(organizationId),
        billingSide(staff, plan.subscriptionId),
    ]);

    return (
        <div className="grid gap-5">
            <Panel
                title="Billing"
                description="What they are on, what they get, who pays and what was last charged."
                data={{ status: "ok" as const, data: plan }}
            >
                {(p) => (
                    <BillingTab
                        organizationId={organizationId}
                        businessName={summary?.name ?? "this business"}
                        plan={p}
                        usage={
                            overview.usage.status === "ok"
                                ? overview.usage.data
                                : null
                        }
                        billedTo={overview.billedTo}
                        side={side}
                        canOffer={
                            summary?.lifecycleStatus !== "DELETED_RETAINED" &&
                            (can(staff, "pricing:override") ||
                                can(staff, "subscription:override"))
                        }
                        canSync={can(staff, "saroh-billing:act")}
                    />
                )}
            </Panel>
            {can(staff, "organization:view-as") && (
                <PlanDetail staff={staff} organizationId={organizationId} />
            )}
        </div>
    );
}

/** Who pays and the last invoice, for a `saroh-billing:read` holder. */
async function billingSide(
    staff: StaffIdentity,
    subscriptionId: string | null,
): Promise<BillingSide> {
    if (!can(staff, "saroh-billing:read")) return { status: "hidden" };
    if (!subscriptionId) return { status: "none" };
    try {
        const detail = await getSarohSubscription(subscriptionId);
        return detail ? { status: "ok", detail } : { status: "hidden" };
    } catch {
        return { status: "failed" };
    }
}
