import type { Metadata } from "next";

import { AccountCard, AccountHome } from "@saroh/site-blocks";

import { getAccount, getAccountHome } from "@/lib/account-area";

/**
 * The account's Home (round-2 plan A, A5): the next booking, classes left,
 * the latest orders and the plan. The layout has already checked the
 * switch and the session; each block here was read on its own, and one
 * that failed says so on its own card.
 */
export const metadata: Metadata = { title: "My account" };

export default async function AccountHomePage() {
    const [lookup, home] = await Promise.all([getAccount(), getAccountHome()]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    if (!home) {
        return (
            <AccountCard
                labelledBy="account-home-unavailable"
                title="Home"
                lead="Your account couldn't be loaded. Refresh the page to try again."
            />
        );
    }
    return <AccountHome account={lookup.account} home={home} />;
}
