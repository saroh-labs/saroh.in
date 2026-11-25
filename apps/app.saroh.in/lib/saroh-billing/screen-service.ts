import "server-only";

import { autopayCharges } from "@saroh/pricing-catalog";

import type { YourPlanProps } from "@/components/settings/plan-billing/your-plan";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { getAskAiState } from "@/lib/ask-ai/service";
import type {
    BusinessBillingProfile,
    CurrentBillingProfile,
    OwnBillingProfile,
} from "@/lib/billing-profiles/view";
import { mayChangePlan, mayOpenPlan } from "@/lib/billing/plan-access";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { planMoney } from "@/lib/saroh-billing/money";
import { planSummary, usageLine } from "@/lib/saroh-billing/plan";
import { readPlanBasics, readPlanCards } from "@/lib/saroh-billing/plan-reads";
import { planMessage } from "@/lib/saroh-billing/plan-status";
import { addonRows, yourPlan } from "@/lib/saroh-billing/plan-view";
import {
    getBillingProfileView,
    getPlanUsage,
    listAddons,
    listSarohInvoices,
    plansOpen,
} from "@/lib/saroh-billing/service";

import type { BillingScreen } from "./queries";
import { billingRead } from "./queries";

/**
 * Plan and billing: whoever may open the plan (`billing:read`), and on an
 * edition Saroh doesn't bill, anyone (the Free note).
 */
export async function mayReadBilling(): Promise<boolean> {
    const org = await activeOrganizationOnce();
    if (!org) return false;
    if (!(await plansOpen())) return freeNoteShown();
    return mayOpenPlan(org);
}

/** A side read: its value, or null when it couldn't be had (said on the page). */
async function settle<T>(p: Promise<T>): Promise<T | null> {
    try {
        return await p;
    } catch {
        return null;
    }
}

function ownFacts(p: OwnBillingProfile): OwnBillingProfile {
    return {
        id: p.id,
        legalName: p.legalName,
        gstin: p.gstin,
        gstState: p.gstState,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        postalCode: p.postalCode,
        billingEmail: p.billingEmail,
        phone: p.phone,
        businesses: p.businesses,
    };
}

/** Who Saroh bills, as the row and its sheets draw it, and nothing else the API sends. */
export function billingProfileFacts(
    v: BusinessBillingProfile,
): BusinessBillingProfile {
    const current: CurrentBillingProfile | null = v.current
        ? v.current.mine
            ? { ...ownFacts(v.current), mine: true }
            : { legalName: v.current.legalName, mine: false }
        : null;
    return {
        current,
        mine: v.mine.map(ownFacts),
        businessesOnCurrent: v.businessesOnCurrent,
        pendingSwitch: v.pendingSwitch
            ? {
                  legalName: v.pendingSwitch.legalName,
                  at: v.pendingSwitch.at,
                  authorised: v.pendingSwitch.authorised,
              }
            : v.pendingSwitch,
    };
}

export const billingServer: ServerRead<
    Parameters<typeof billingRead.options>[1],
    BillingScreen
> = {
    read: billingRead,
    service: async () => {
        if (!(await plansOpen())) return { kind: "free" };
        const org = await activeOrganizationOnce();
        const canChange = org === null || mayChangePlan(org);
        const [basics, invoices, addons, usage, billedTo, askAi] =
            await Promise.all([
                readPlanBasics(),
                settle(listSarohInvoices()),
                settle(listAddons()),
                getPlanUsage(),
                // Who Saroh bills is the owner's alone (DEC-167, R2).
                canChange
                    ? settle(getBillingProfileView())
                    : Promise.resolve(undefined),
                // Ask AI's questions this period, when its screens are on (U11).
                askAiOn() ? settle(getAskAiState()) : Promise.resolve(null),
            ]);
        if (basics === null) return { kind: "denied" };

        const { subscription, access, catalog } = basics;
        const businessName = org?.name ?? "this business";
        // No summary exists yet: the line is left out (UX-080).
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
        const missing = [
            addons === null ? "your add-ons" : null,
            basics.checkoutsRead ? null : "any plan change waiting for payment",
        ].filter((m): m is string => m !== null);
        const { rest } = planMessage({
            notes: plan.notes ?? [],
            warning: plan.warning,
            pending: Boolean(plan.pending && canChange),
        });
        const addonList = addonsView ? addonRows(addonsView) : [];
        return {
            kind: "plan",
            canChange,
            canOpenAskAi: org?.actions?.includes("module:manage") ?? false,
            // A waiting payment's window (its order and the owner's prefill)
            // and the cancel are the owner's: never sent to a reader.
            plan: canChange ? plan : { ...plan, pending: null, cancel: null },
            card:
                onCatalogue && (current || cards.rows === null)
                    ? { row: current }
                    : null,
            coming:
                cards.waiting && comingName
                    ? { name: comingName, iso: cards.waiting.iso }
                    : null,
            askAi: askAi?.usage
                ? { used: askAi.usage.used, limit: askAi.usage.limit }
                : null,
            billedTo:
                billedTo === undefined
                    ? undefined
                    : billedTo === null
                      ? null
                      : billedTo.status === "ok" && billedTo.data
                        ? billingProfileFacts(billedTo.data)
                        : undefined,
            notes: rest,
            yearly: cards.yearly.on,
            charges: autopayCharges(catalog),
            addons:
                addonList.length > 0
                    ? {
                          rows: addonList,
                          sum:
                              addonsView && addonsView.heldPaise > 0
                                  ? `${planMoney(addonsView.heldPaise)} a month in add-ons`
                                  : "",
                          canChange: canChange && (addonsView?.canBuy ?? false),
                      }
                    : null,
            invoices: invoices?.status === "ok" ? invoices.data : null,
            partial: missing.length === 0 ? null : missing.join(" and "),
        };
    },
};
