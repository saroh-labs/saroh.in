import { PartialRead } from "@/components/shared/failed-read";
import { formatInr, offeredPlans } from "@saroh/pricing-catalog";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { NOTHING_CHANGED } from "@saroh/ui/lib/state-copy";
import { notFound } from "next/navigation";

import { AddonsCard } from "@/components/settings/plan-billing/addons-card";
import { PlanChooser } from "@/components/settings/plan-billing/plan-chooser";
import { SarohInvoices } from "@/components/settings/plan-billing/saroh-invoices";
import type { YourPlanProps } from "@/components/settings/plan-billing/your-plan";
import { YourPlan } from "@/components/settings/plan-billing/your-plan";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { whoCanChange } from "@/components/shared/who-can-change";
import { mayChangePlan, mayOpenPlan } from "@/lib/billing/plan-access";
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
import { plansShown } from "@/lib/saroh-billing/plans-shown";
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
 * Opened by whoever the API reads it to (`billing:read`: Owner and Admin
 * by default), and changed by the Owner alone (`billing:manage`, DEC-131
 * amended 2026-10-11). The tab (`SETTINGS_PAGES`), this page and every plan
 * prompt ask the same two (`lib/billing/plan-access.ts`), so none sends a
 * person to a page that turns them away. Someone who may read but not
 * change (an Admin) sees the plan, the plans and the invoices with no
 * button to press, and that only the owner can.
 *
 * Reads degrade per source: the plan and access are the page (a failure is
 * the section's boundary); the price list, invoices, add-ons and checkouts
 * each say when they couldn't be read, and the rest still shows.
 *
 * Not found while plans aren't shown (DEC-136): the segment's layout
 * answers first, and the page says so too.
 */
// Always named. While plans aren't shown the address is not-found, and
// the not-found page's own title replaces this one; a tab never falls back
// to the bare "Saroh".
export const metadata = { title: "Plan and billing · Settings" };

const DENIED = (
    <PermissionDeniedState {...whoCanChange({ thing: "Plan and billing" })} />
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
    if (!plansShown()) notFound();
    await requireSession();
    const org = await resolveActiveOrganization();
    // Unknown (no business resolved) opens, and the API decides.
    const mayOpen = org === null || mayOpenPlan(org);
    const canChange = org === null || mayChangePlan(org);

    const header = <SettingsPanelHeader title="Plan and billing" />;
    if (!mayOpen) {
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
    // No summary exists yet: the line is left out rather than promised
    // (UX-080).
    const footnote =
        usage.status === "ok" ? usageLine(usage.usage, businessName) : "";

    const addonsView = addons?.status === "ok" ? addons.data : null;
    const checkoutsView = checkouts?.status === "ok" ? checkouts.data : null;

    const plan: YourPlanProps =
        access?.source === "catalogue"
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

    // A plan given for a while (a launch offer) is the one it's on (UX-044).
    const override =
        access?.source === "catalogue" ? access.planOverride : null;
    const given = override
        ? { planId: override.planKey, until: override.expiresAt ?? null }
        : null;
    const rows = catalog
        ? (Object.fromEntries(
              (["month", "year"] as const).map((cycle) => [
                  cycle,
                  pickerRows({ catalog, subscription, cycle, trials, given }),
              ]),
          ) as Record<Cycle, ReturnType<typeof pickerRows>>)
        : null;

    const addonList = addonsView ? addonRows(addonsView) : [];
    const missing = [
        addons === null ? "your add-ons" : null,
        checkouts === null ? "any plan change waiting for payment" : null,
    ].filter((m): m is string => m !== null);
    const partial = missing.length === 0 ? null : missing.join(" and ");

    return (
        <SettingsPanel header={header}>
            <div className="grid gap-4">
                {partial ? (
                    <PartialRead things={partial} so={NOTHING_CHANGED} />
                ) : null}
                {canChange ? null : (
                    <ReadOnlyNote className="mb-0" ownerOnly>
                        Your role can read the plan but not change it.
                    </ReadOnlyNote>
                )}
                <YourPlan {...plan} canChange={canChange} />
                <PlanChooser
                    rows={rows}
                    yearly={yearlyOffer(catalog)}
                    initialCycle={billedCycle(subscription)}
                    currentPlan={
                        access?.source === "catalogue"
                            ? (access.plan?.name ?? "Free")
                            : (subscription?.plan.name ?? "Free")
                    }
                    canChange={canChange}
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
                                canChange={
                                    canChange && (addonsView?.canBuy ?? false)
                                }
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
