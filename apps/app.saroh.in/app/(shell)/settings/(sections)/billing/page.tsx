import { PermissionDeniedState } from "@saroh/ui/data-state";

import { PlanBilling } from "@/components/settings/plan-billing";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { planOptions, planSummary } from "@/lib/saroh-billing/plan";
import {
    canChangePlanHere,
    getPlanUsage,
    getSarohSubscription,
    listSarohInvoices,
    listSarohPlans,
} from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Plan and billing: what Saroh charges this business. The owner's
 * alone, as the design has it — the tab is offered only to them
 * (`SETTINGS_PAGES`), and this page refuses anyone else who types the
 * address. The API's own `billing:read` (Owner and Admin) is the backstop.
 */
export const metadata = { title: "Plan and billing" };

const DENIED = (
    <PermissionDeniedState
        title="Plan and billing is the owner's"
        description="What Saroh charges this business, and its invoices, are kept to the owner."
        note="Ask the owner if you need to know which plan the business is on."
    />
);

export default async function PlanBillingPage() {
    await requireSession();
    const org = await resolveActiveOrganization();
    const owner = org === null || org.role === "OWNER";

    const header = <SettingsPanelHeader title="Plan and billing" />;
    if (!owner) {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const [read, plans, invoices, usage] = await Promise.all([
        getSarohSubscription(),
        listSarohPlans(),
        listSarohInvoices(),
        getPlanUsage(),
    ]);
    if (read.status === "denied") {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const businessName = org?.name ?? "this business";
    return (
        <SettingsPanel header={header}>
            <PlanBilling
                summary={planSummary(
                    read.subscription,
                    businessName,
                    usage.status === "ok" ? usage.usage : null,
                )}
                options={planOptions(plans, read.subscription)}
                canChange={canChangePlanHere()}
                invoices={invoices.status === "ok" ? invoices.invoices : null}
                neverBilled={read.subscription === null}
            />
        </SettingsPanel>
    );
}
