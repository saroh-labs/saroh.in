import { PartialRead } from "@/components/shared/failed-read";
import { autopayCharges, formatInr } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { NOTHING_CHANGED, planLabel } from "@saroh/ui/lib/state-copy";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AddonsCard } from "@/components/settings/plan-billing/addons-card";
import { BillingProfilePanel } from "@/components/settings/plan-billing/billing-profile-panel";
import { CurrentPlanCard } from "@/components/settings/plan-billing/current-plan-card";
import { HowBillingWorks } from "@/components/settings/plan-billing/how-billing-works";
import { OldPlanLink } from "@/components/settings/plan-billing/old-plan-link";
import { SarohInvoices } from "@/components/settings/plan-billing/saroh-invoices";
import { PLANS_HREF } from "@/components/settings/plan-billing/styles";
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
import { readPlanBasics, readPlanCards } from "@/lib/saroh-billing/plan-reads";
import { planMessage } from "@/lib/saroh-billing/plan-status";
import { addonRows, yourPlan } from "@/lib/saroh-billing/plan-view";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import {
    getBillingProfileView,
    getPlanUsage,
    listAddons,
    listSarohInvoices,
} from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings → Plan and billing (plans catalogue U14; laid out as the owner
 * asked on 13 and 14 Oct 2026): one status line (the plan this business is
 * on and what happens next) with at most one message under it, then ONLY
 * the plan it is on, as one card with a button to the next screen where
 * every plan is (`./plans`, "Change plan"). Then "How billing works" for
 * what is true and asks nothing, add-ons, and Saroh's invoices to it. The
 * coupon is used when a plan is changed, so it is on the next screen.
 *
 * Opened by whoever the API reads it to (`billing:read`: Owner and Admin
 * by default), and changed by the Owner alone (`billing:manage`, DEC-131
 * amended 2026-10-11). The tab (`SETTINGS_PAGES`), this page and every plan
 * prompt ask the same two (`lib/billing/plan-access.ts`), so none sends a
 * person to a page that turns them away. Someone who may read but not
 * change (an Admin) sees the plan and the invoices with no button to press,
 * that only the owner can, and a link to read Saroh's plans.
 *
 * Who Saroh bills (DEC-167, U5) is the owner's alone: its row is read and
 * drawn only for whoever may change the plan, and an Admin sees nothing of
 * a billing profile (R2, AE6).
 *
 * Reads degrade per source: the plan and access are the page (a failure is
 * the section's boundary); the price list, invoices, add-ons and checkouts
 * each say when they couldn't be read, and the rest still shows.
 *
 * A link to a plan's change made before the plans had their own screen
 * (`?plan=&cycle=`, `#change-plan`) is sent on to it.
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

export default async function PlanBillingPage({
    searchParams,
}: {
    searchParams?: Promise<{
        plan?: string | string[];
        cycle?: string | string[];
    }>;
} = {}) {
    if (!plansShown()) notFound();
    await requireSession();
    // Where every "Upgrade" used to land: the plan's change opens on the
    // next screen now. Not kept by a browser: it is the address that moved.
    const query = (await searchParams) ?? {};
    if (typeof query.plan === "string" && query.plan) {
        const on = new URLSearchParams({ plan: query.plan });
        if (typeof query.cycle === "string") on.set("cycle", query.cycle);
        redirect(`${PLANS_HREF}?${on.toString()}`);
    }
    const org = await resolveActiveOrganization();
    // Unknown (no business resolved) opens, and the API decides.
    const mayOpen = org === null || mayOpenPlan(org);
    const canChange = org === null || mayChangePlan(org);

    const header = <SettingsPanelHeader title="Plan and billing" />;
    if (!mayOpen) {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const [basics, invoices, addons, usage, billedTo] = await Promise.all([
        readPlanBasics(),
        settle(listSarohInvoices()),
        settle(listAddons()),
        getPlanUsage(),
        canChange
            ? settle(getBillingProfileView())
            : Promise.resolve(undefined),
    ]);
    if (basics === null) {
        return <SettingsPanel header={header}>{DENIED}</SettingsPanel>;
    }

    const { subscription, access, catalog } = basics;
    const businessName = org?.name ?? "this business";
    // No summary exists yet: the line is left out rather than promised
    // (UX-080).
    const footnote =
        usage.status === "ok" ? usageLine(usage.usage, businessName) : "";

    const addonsView = addons?.status === "ok" ? addons.data : null;

    const onCatalogue =
        access?.source === "catalogue"
            ? yourPlan({
                  access,
                  subscription,
                  catalog,
                  liveVersion: basics.liveVersion,
                  checkouts: basics.checkouts,
                  addonsHeld: (addonsView?.heldPaise ?? 0) > 0,
              })
            : null;
    // The plan's one line is on its card: under the status, only the
    // pricing version it is held on is left to say.
    const plan: YourPlanProps = onCatalogue
        ? { ...onCatalogue, includes: onCatalogue.versionNote, footnote }
        : planSummary(
              subscription,
              businessName,
              usage.status === "ok" ? usage.usage : null,
          );

    // Only the plan it's on is drawn here, so no other plan is quoted.
    const cards = await readPlanCards(basics, { quotes: false });
    const current = cards.rows
        ? (cards.rows[cards.cycle].find((r) => r.current) ?? null)
        : null;
    const comingName = cards.waiting
        ? cards.rows?.month.find((r) => r.planId === cards.waiting?.planId)
              ?.name
        : undefined;
    const coming =
        cards.waiting && comingName
            ? { name: comingName, iso: cards.waiting.iso }
            : null;

    const addonList = addonsView ? addonRows(addonsView) : [];
    const missing = [
        addons === null ? "your add-ons" : null,
        basics.checkoutsRead ? null : "any plan change waiting for payment",
    ].filter((m): m is string => m !== null);
    const partial = missing.length === 0 ? null : missing.join(" and ");
    // What "Your plan" doesn't say as its one message is kept, closed,
    // under the plan.
    const { rest } = planMessage({
        notes: plan.notes ?? [],
        warning: plan.warning,
        pending: Boolean(plan.pending && canChange),
    });

    return (
        <SettingsPanel header={header}>
            <OldPlanLink />
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
                {onCatalogue && (current || cards.rows === null) ? (
                    <CurrentPlanCard
                        row={current}
                        coming={coming}
                        canChange={canChange}
                    />
                ) : canChange ? (
                    // A plan from before the catalogue has no card of its
                    // own: the way to the plans is still here.
                    <p>
                        <Button asChild variant="outline">
                            <Link href={PLANS_HREF}>{planLabel()}</Link>
                        </Button>
                    </p>
                ) : null}
                {billedTo === null ? (
                    <BillingProfilePanel view={null} />
                ) : billedTo?.status === "ok" && billedTo.data ? (
                    <BillingProfilePanel view={billedTo.data} />
                ) : null}
                <HowBillingWorks
                    notes={rest}
                    yearly={cards.yearly.on}
                    charges={autopayCharges(catalog)}
                    canChange={canChange}
                />
                {addonList.length > 0 ? (
                    <AddonsCard
                        rows={addonList}
                        sum={
                            addonsView && addonsView.heldPaise > 0
                                ? `${formatInr(addonsView.heldPaise)} a month in add-ons`
                                : ""
                        }
                        canChange={canChange && (addonsView?.canBuy ?? false)}
                    />
                ) : null}
                <SarohInvoices
                    invoices={invoices?.status === "ok" ? invoices.data : null}
                />
            </div>
        </SettingsPanel>
    );
}
