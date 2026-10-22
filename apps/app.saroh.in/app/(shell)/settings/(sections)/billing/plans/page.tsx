import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { CheckoutPending } from "@/components/settings/plan-billing/checkout-pending";
import { PlanChooser } from "@/components/settings/plan-billing/plan-chooser";
import { BILLING_HREF } from "@/components/settings/plan-billing/styles";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { mayChangePlan, mayOpenPlan } from "@/lib/billing/plan-access";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readPlanBasics, readPlanCards } from "@/lib/saroh-billing/plan-reads";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { requireSession } from "@/lib/session";

/**
 * Settings › Plan and billing › Change plan (owner, 14 Oct 2026): the next
 * screen from the plan the business is on, with every plan as a card side
 * by side (stacked on a phone), Monthly | Yearly when the catalogue offers
 * yearly, the coupon that goes with the next change, and the way to the
 * full comparison. Choosing a plan opens its quote (`ChangePlanDialog`);
 * once the change is made, or its payment started, the person is back on
 * Plan and billing, where the status line and the one message say how it
 * stands. `?plan=&cycle=` opens that plan's change straight away: it is
 * where every "Upgrade" in the app lands (`upgradeHref`).
 *
 * Opened by whoever may open Plan and billing (`billing:read`). Without
 * `billing:manage` it is read: the plans and what each is for, no button
 * and no coupon. A payment still waiting is said first, as on the page
 * before it, so nobody starts a second one.
 *
 * Not found while plans aren't shown (DEC-136): the section's layout
 * answers first, and the page says so too.
 */
export const metadata = { title: "Change plan · Settings" };

const PARENT = { label: "Plan and billing", href: BILLING_HREF };

export default async function ChangePlanPage() {
    if (!plansShown()) notFound();
    await requireSession();
    const org = await resolveActiveOrganization();
    // Unknown (no business resolved) opens, and the API decides.
    const mayOpen = org === null || mayOpenPlan(org);
    const canChange = org === null || mayChangePlan(org);

    const header = (
        <SettingsPanelHeader
            title={canChange ? "Change plan" : "Saroh's plans"}
            parent={PARENT}
            actions={
                <Button asChild variant="outline">
                    <Link href={BILLING_HREF}>Back to Plan and billing</Link>
                </Button>
            }
        />
    );
    const denied = (
        <SettingsPanel header={header}>
            <PermissionDeniedState
                {...whoCanChange({ thing: "Plan and billing" })}
            />
        </SettingsPanel>
    );
    if (!mayOpen) return denied;

    const basics = await readPlanBasics();
    if (basics === null) return denied;
    const cards = await readPlanCards(basics, { quotes: true });
    const open = basics.checkouts?.open ?? null;

    return (
        <SettingsPanel header={header}>
            <div className="grid gap-4">
                {canChange ? null : (
                    <ReadOnlyNote className="mb-0" ownerOnly>
                        Your role can read the plans but not change the plan.
                    </ReadOnlyNote>
                )}
                {open && canChange ? (
                    <CheckoutPending
                        pending={{
                            planName: open.plan.name,
                            expiresAt: open.expiresAt,
                            handoff: open.handoff ?? null,
                        }}
                    />
                ) : null}
                <PlanChooser
                    rows={cards.rows}
                    yearly={cards.yearly}
                    initialCycle={cards.cycle}
                    currentPlan={cards.currentPlan}
                    canChange={canChange}
                />
            </div>
        </SettingsPanel>
    );
}
