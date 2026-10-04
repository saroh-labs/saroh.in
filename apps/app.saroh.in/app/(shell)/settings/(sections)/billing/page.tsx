import { formatInr, offeredPlans } from "@saroh/pricing-catalog";
import { PartialNotice, PermissionDeniedState } from "@saroh/ui/data-state";

import { AddonsCard } from "@/components/settings/plan-billing/addons-card";
import { PlanChooser } from "@/components/settings/plan-billing/plan-chooser";
import { SarohInvoices } from "@/components/settings/plan-billing/saroh-invoices";
import type { YourPlanProps } from "@/components/settings/plan-billing/your-plan";
import { YourPlan } from "@/components/settings/plan-billing/your-plan";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { planSummary, usageLine } from "@/lib/saroh-billing/plan";
import type { Cycle } from "@/lib/saroh-billing/plan-view";
import {
    addonRows,
    billedCycle,
    billedPlanId,
    pickerRows,
    yearlyOffer,
    yourPlan,
} from "@/lib/saroh-billing/plan-view";
import {
    getBillingAccess,
    getCheckouts,
    getPlanUsage,
    getSarohSubscription,
    listAddons,
    listSarohInvoices,
    livePricing,
    quotePlan,
} from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Plan and billing ("Saroh Settings" design; plans catalogue
 * U14): the plan this business is on and what it pays, the plans it could
 * be on (changed through a quote, a confirm and the payment page), add-ons,
 * a coupon, and Saroh's invoices to it.
 *
 * The owner's alone, as the design has it — the tab is offered only to
 * them (`SETTINGS_PAGES`), and this page refuses anyone else who types the
 * address. The API's own `billing:read` / `billing:manage` is the backstop.
 *
 * Reads degrade per source: the plan and access are the page (a failure is
 * the section's boundary); the price list, invoices, add-ons and checkouts
 * each say when they couldn't be read, and the rest still shows.
 */
export const metadata = { title: "Plan and billing" };

const DENIED = (
    <PermissionDeniedState
        title="Plan and billing is the owner's"
        description="What Saroh charges this business, and its invoices, are kept to the owner."
        note="Ask the owner if you need to know which plan the business is on."
    />
);

/** A side read: its value, or null when it couldn't be had (said on the page). */
async function settle<T>(p: Promise<T>): Promise<T | null> {
    try {
        return await p;
    } catch {
        // Named on the page as missing, never drawn as empty.
        return null;
    }
}

export default async function PlanBillingPage() {
    await requireSession();
    const org = await resolveActiveOrganization();
    const owner = org === null || org.role === "OWNER";

    const header = <SettingsPanelHeader title="Plan and billing" />;
    if (!owner) {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const [read, accessRead, pricing, invoices, addons, checkouts, usage] =
        await Promise.all([
            getSarohSubscription(),
            getBillingAccess(),
            livePricing(),
            settle(listSarohInvoices()),
            settle(listAddons()),
            settle(getCheckouts()),
            getPlanUsage(),
        ]);
    if (read.status === "denied" || accessRead.status === "denied") {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const subscription = read.subscription;
    const access = accessRead.data;
    const catalog = pricing?.catalog ?? null;
    const businessName = org?.name ?? "this business";
    const footnote =
        usage.status === "ok"
            ? usageLine(usage.usage, businessName)
            : `A monthly summary of what Saroh did for ${businessName} isn't ready yet.`;

    const addonsView = addons?.status === "ok" ? addons.data : null;
    const checkoutsView = checkouts?.status === "ok" ? checkouts.data : null;

    const plan: YourPlanProps =
        access && access.source === "catalogue"
            ? {
                  ...yourPlan({
                      access,
                      subscription,
                      catalog,
                      liveVersion: pricing?.version ?? null,
                      checkouts: checkoutsView,
                      addonsHeld: (addonsView?.heldPaise ?? 0) > 0,
                  }),
                  footnote,
              }
            : planSummary(
                  subscription,
                  businessName,
                  usage.status === "ok" ? usage.usage : null,
              );

    // "Start N-day trial" only where this business would get one: ask.
    const billed = billedPlanId(catalog, subscription);
    const trialIds = catalog
        ? offeredPlans(catalog).filter(
              (p) => p.trial?.on && p.pricePaise > 0 && p.id !== billed,
          )
        : [];
    const trials = new Set(
        (
            await Promise.all(
                trialIds.map(async (p) => {
                    const q = await quotePlan(p.id, "month");
                    return q?.kind === "TRIAL" ? p.id : null;
                }),
            )
        ).filter((id): id is string => id !== null),
    );

    const rows = catalog
        ? (Object.fromEntries(
              (["month", "year"] as const).map((cycle) => [
                  cycle,
                  pickerRows({ catalog, subscription, cycle, trials }),
              ]),
          ) as Record<Cycle, ReturnType<typeof pickerRows>>)
        : null;

    const addonList = addonsView ? addonRows(addonsView) : [];
    const missing = [
        addons === null ? "add-ons" : null,
        checkouts === null ? "a plan change waiting for payment" : null,
    ].filter(Boolean);

    return (
        <SettingsPanel header={header}>
            <div className="grid max-w-[760px] gap-4">
                {missing.length ? (
                    <PartialNotice>
                        {`What you hold in ${missing.join(" and ")} couldn't be read just now, so it isn't shown. Nothing has changed.`}
                    </PartialNotice>
                ) : null}
                <YourPlan {...plan} />
                <PlanChooser
                    rows={rows}
                    yearly={yearlyOffer(catalog)}
                    initialCycle={billedCycle(subscription)}
                    canChange
                    addons={
                        addonList.length > 0 ? (
                            <AddonsCard
                                rows={addonList}
                                sum={
                                    addonsView && addonsView.heldPaise > 0
                                        ? `${formatInr(addonsView.heldPaise)} a month in add-ons`
                                        : ""
                                }
                                max={addonsView?.max ?? 0}
                                canChange={addonsView?.canBuy ?? false}
                            />
                        ) : null
                    }
                />
                <SarohInvoices
                    invoices={invoices?.status === "ok" ? invoices.data : null}
                />
            </div>
        </SettingsPanel>
    );
}
