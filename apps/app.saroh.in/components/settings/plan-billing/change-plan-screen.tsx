"use client";

import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";

import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { SettingsSectionError } from "@/components/settings/page/settings-section-error";
import { PageLoading } from "@/components/shared/page/page-loading";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import type { PlansScreen } from "@/lib/saroh-billing/queries";
import { usePlansScreen } from "@/lib/saroh-billing/use-billing";

import { CheckoutPending } from "./checkout-pending";
import { PlanChooser } from "./plan-chooser";
import { BILLING_HREF } from "./styles";

const PARENT = { label: "Plan and billing", href: BILLING_HREF };

/** Change plan's header: drawn at once, from the page's gate. */
export function ChangePlanHeader({ canChange }: { canChange: boolean }) {
    return (
        <SettingsPanelHeader
            title={canChange ? "Change plan" : "Saroh's plans"}
            parent={PARENT}
            actions={
                <Button asChild variant="outline">
                    <IntentLink href={BILLING_HREF}>
                        Back to Plan and billing
                    </IntentLink>
                </Button>
            }
        />
    );
}

/** "You can't open Plan and billing": the page's own refusal, and the API's. */
export function ChangePlanDenied({ canChange }: { canChange: boolean }) {
    return (
        <SettingsPanel header={<ChangePlanHeader canChange={canChange} />}>
            <PermissionDeniedState
                {...whoCanChange({ thing: "Plan and billing" })}
            />
        </SettingsPanel>
    );
}

/**
 * Change plan on React Query (DEC-259): the header at once, then the plans
 * from `/api/settings/billing/plans`. A change made here calls
 * `afterSettingsSave()`, which reads this and Plan and billing again.
 */
export function ChangePlanScreen({ canChange }: { canChange: boolean }) {
    const query = usePlansScreen();
    if (!query.data && query.isError) {
        return (
            <SettingsSectionError
                section="billing"
                error={query.error}
                retry={() => void query.refetch()}
            />
        );
    }
    return <ChangePlanView screen={query.data} canChange={canChange} />;
}

/** Change plan as read (undefined: still loading): props in, nothing fetched. */
export function ChangePlanView({
    screen: p,
    canChange,
}: {
    screen: PlansScreen | undefined;
    canChange: boolean;
}) {
    if (p?.kind === "denied") return <ChangePlanDenied canChange={canChange} />;
    return (
        <SettingsPanel header={<ChangePlanHeader canChange={canChange} />}>
            {p ? (
                <div className="grid gap-4">
                    {canChange ? null : (
                        <ReadOnlyNote className="mb-0" ownerOnly>
                            Your role can read the plans but not change the
                            plan.
                        </ReadOnlyNote>
                    )}
                    {p.pending && canChange ? (
                        <CheckoutPending pending={p.pending} />
                    ) : null}
                    <PlanChooser
                        rows={p.rows}
                        yearly={p.yearly}
                        initialCycle={p.cycle}
                        currentPlan={p.currentPlan}
                        canChange={canChange}
                    />
                </div>
            ) : (
                <PageLoading
                    shape="settings"
                    width="full"
                    rows={4}
                    label="Loading Change plan"
                    bare
                />
            )}
        </SettingsPanel>
    );
}
