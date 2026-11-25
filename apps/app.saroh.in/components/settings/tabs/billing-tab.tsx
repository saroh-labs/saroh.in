"use client";

import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { PartialRead } from "@saroh/ui/failed-read";
import { IntentLink } from "@saroh/ui/intent-link";
import { NOTHING_CHANGED, planLabel } from "@saroh/ui/lib/state-copy";

import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { AddonsCard } from "@/components/settings/plan-billing/addons-card";
import { AskAiUsageRow } from "@/components/settings/plan-billing/ask-ai-usage-row";
import { BillingProfilePanel } from "@/components/settings/plan-billing/billing-profile-panel";
import { CurrentPlanCard } from "@/components/settings/plan-billing/current-plan-card";
import { FreeNote } from "@/components/settings/plan-billing/free-note";
import { HowBillingWorks } from "@/components/settings/plan-billing/how-billing-works";
import { OldPlanLink } from "@/components/settings/plan-billing/old-plan-link";
import { SarohInvoices } from "@/components/settings/plan-billing/saroh-invoices";
import { PLANS_HREF } from "@/components/settings/plan-billing/styles";
import { YourPlan } from "@/components/settings/plan-billing/your-plan";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import type { BillingScreen } from "@/lib/saroh-billing/queries";
import { useBillingScreen } from "@/lib/saroh-billing/use-billing";

import { Drawn } from "./drawn";

const TITLE = "Plan and billing";

/** Plan and billing's loader: `loading.tsx` draws the same pieces. */
function BillingLoading() {
    return <SettingsLoading title={TITLE} rows={4} />;
}

/**
 * Settings › Plan and billing on React Query (DEC-259): the status line,
 * the plan it is on, who Saroh bills (the owner's alone), add-ons and
 * Saroh's invoices, worked out on the server (`screen-service.ts`). A
 * change here (cancel, add-on, billing profile, a payment confirmed) calls
 * `afterSettingsSave()`, which reads this tab and the shell again.
 */
export function BillingContainer() {
    return (
        <Drawn
            query={useBillingScreen()}
            section="billing"
            loading={<BillingLoading />}
        >
            {(b) => <BillingView screen={b} />}
        </Drawn>
    );
}

/** The tab as read: props in, nothing fetched. */
export function BillingView({ screen: b }: { screen: BillingScreen }) {
    const header = <SettingsPanelHeader title={TITLE} />;
    if (b.kind === "free") {
        return (
            <SettingsPanel header={header}>
                <FreeNote />
            </SettingsPanel>
        );
    }
    if (b.kind === "denied") {
        return (
            <SettingsPanel header={header}>
                <PermissionDeniedState {...whoCanChange({ thing: TITLE })} />
            </SettingsPanel>
        );
    }
    const { canChange } = b;
    return (
        <SettingsPanel header={header}>
            <OldPlanLink />
            <div className="grid gap-4">
                {b.partial ? (
                    <PartialRead things={b.partial} so={NOTHING_CHANGED} />
                ) : null}
                {canChange ? null : (
                    <ReadOnlyNote className="mb-0" ownerOnly>
                        Your role can read the plan but not change it.
                    </ReadOnlyNote>
                )}
                <YourPlan {...b.plan} canChange={canChange} />
                {b.card ? (
                    <CurrentPlanCard
                        row={b.card.row}
                        coming={b.coming}
                        canChange={canChange}
                    />
                ) : canChange ? (
                    // A plan from before the catalogue: the way to the plans.
                    <p>
                        <Button asChild variant="outline">
                            <IntentLink href={PLANS_HREF}>
                                {planLabel()}
                            </IntentLink>
                        </Button>
                    </p>
                ) : null}
                {b.askAi ? (
                    <AskAiUsageRow
                        used={b.askAi.used}
                        limit={b.askAi.limit}
                        canOpen={b.canOpenAskAi}
                    />
                ) : null}
                {b.billedTo !== undefined ? (
                    <BillingProfilePanel view={b.billedTo} />
                ) : null}
                <HowBillingWorks
                    notes={b.notes}
                    yearly={b.yearly}
                    charges={b.charges}
                    canChange={canChange}
                />
                {b.addons ? (
                    <AddonsCard
                        rows={b.addons.rows}
                        sum={b.addons.sum}
                        canChange={b.addons.canChange}
                    />
                ) : null}
                <SarohInvoices invoices={b.invoices} />
            </div>
        </SettingsPanel>
    );
}
