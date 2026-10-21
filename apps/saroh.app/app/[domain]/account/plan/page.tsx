import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountCard, lookOf, PlanTab } from "@saroh/site-blocks";

import { getAccount, getPacksOnSale, getPlanTab } from "@/lib/account-area";
import { accountTitle, getAccountSite } from "@/lib/account-site";
import { ACCOUNT_PAGE_TITLES } from "@/lib/account-title";
import { publicApiUrl } from "@/lib/api-url";
import { pricesPageHref } from "@/lib/module-pages";

import {
    buyPack,
    cancelPlan,
    packPayment,
    pausePlan,
    payPlanNow,
    resumePlan,
    startPlanAutopay,
} from "./actions";

/**
 * The account's Plan tab (round-2 plan A, A8): the member's plan and packs,
 * and pause, resume, cancel and "Pay now"; and "Buy a pack" when packs are
 * on sale online (A11). With no plan, "See plans" goes to the site's Prices
 * page (G20), while it has one to show. The layout has already checked
 * the switch and the session. A business that shows no Plan tab has no
 * page here either.
 */
export function generateMetadata(): Promise<Metadata> {
    return accountTitle(ACCOUNT_PAGE_TITLES.plan);
}

export default async function AccountPlanPage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    const [lookup, tab, onSale, site] = await Promise.all([
        getAccount(),
        getPlanTab(),
        getPacksOnSale(),
        getAccountSite(domain),
    ]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    if (!lookup.account.tabs.some((t) => t.key === "plan")) notFound();
    if (!tab) {
        return (
            <AccountCard
                labelledBy="account-plan-unavailable"
                title="Couldn't load your plan"
                lead={
                    <span role="status">
                        Refresh the page to try again. Nothing has changed.
                    </span>
                }
            />
        );
    }
    return (
        <PlanTab
            account={lookup.account}
            tab={tab}
            apiUrl={publicApiUrl()}
            // Her plan first, in the look (DEC-172, U12).
            look={lookOf(site?.snapshot.site.look)}
            plansHref={
                site ? pricesPageHref(site.snapshot.pages, site.modules) : null
            }
            api={{
                pause: pausePlan,
                resume: resumePlan,
                cancel: cancelPlan,
                payNow: payPlanNow,
                startAutopay: startPlanAutopay,
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
