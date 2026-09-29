import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountCard, PlanTab } from "@saroh/site-blocks";

import { getAccount, getPacksOnSale, getPlanTab } from "@/lib/account-area";

import {
    buyPack,
    cancelPlan,
    packPayment,
    pausePlan,
    payPlanNow,
    resumePlan,
} from "./actions";

/**
 * The account's Plan tab (round-2 plan A, A8): the member's plan and packs,
 * and pause, resume, cancel and "Pay now"; and "Buy a pack" when packs are
 * on sale online (A11). The layout has already checked
 * the switch and the session. A business that shows no Plan tab has no
 * page here either.
 */
export const metadata: Metadata = { title: "Plan" };

export default async function AccountPlanPage() {
    const [lookup, tab, onSale] = await Promise.all([
        getAccount(),
        getPlanTab(),
        getPacksOnSale(),
    ]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    if (!lookup.account.tabs.some((t) => t.key === "plan")) notFound();
    if (!tab) {
        return (
            <AccountCard
                labelledBy="account-plan-unavailable"
                title="Plan"
                lead="Your plan couldn't be loaded. Refresh the page to try again."
            />
        );
    }
    return (
        <PlanTab
            account={lookup.account}
            tab={tab}
            api={{
                pause: pausePlan,
                resume: resumePlan,
                cancel: cancelPlan,
                payNow: payPlanNow,
            }}
            packs={
                onSale
                    ? {
                          onSale,
                          api: { buy: buyPack, standing: packPayment },
                      }
                    : null
            }
        />
    );
}
