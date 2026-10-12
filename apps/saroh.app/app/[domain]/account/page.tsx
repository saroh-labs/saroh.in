import type { Metadata } from "next";

import { AccountCard, AccountHome } from "@saroh/site-blocks";

import { getAccount, getAccountHome } from "@/lib/account-area";
import { accountDoors, getAccountSite } from "@/lib/account-site";
import { ACCOUNT_PAGE_TITLES, accountPageTitle } from "@/lib/account-title";
import { titled } from "@/lib/site-meta";

import { leaveLine } from "./bookings/actions";
import { payInvoiceNow } from "./me/actions";

/**
 * The account's Home (round-2 plan A, A5; ordered by DEC-142): what changed
 * since the customer was last here, then what they have in progress, what
 * is recent, and last what else they can do — only for what this business
 * offers. The layout has already checked the switch and the session; each
 * block here was read on its own, and one that failed says so on its own
 * card.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata> {
    const [{ domain }, lookup] = await Promise.all([params, getAccount()]);
    const site = await getAccountSite(domain);
    // The layout's template reaches the pages under it, not this one, so
    // Home sets its whole title: "Your account · ‹Business›".
    return {
        title: titled(
            accountPageTitle(ACCOUNT_PAGE_TITLES.home, lookup),
            site?.snapshot.site.name ?? "",
        ),
    };
}

export default async function AccountHomePage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    // Never kept by the page cache: `/account` is a private path
    // (`lib/private-paths.ts`), and the request carries a session.
    const [{ domain }, lookup, home] = await Promise.all([
        params,
        getAccount(),
        getAccountHome(),
    ]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    if (!home) {
        return (
            <AccountCard
                labelledBy="account-home-unavailable"
                title="Couldn't load your account"
                lead={
                    <span role="status">
                        Refresh the page to try again. Nothing has changed.
                    </span>
                }
            />
        );
    }
    const site = await getAccountSite(domain);
    return (
        <AccountHome
            account={lookup.account}
            home={home}
            doors={await accountDoors(site?.siteId)}
            api={{ payInvoice: payInvoiceNow, leaveLine }}
            now={new Date().toISOString()}
        />
    );
}
