import type { Metadata } from "next";

import { ACCOUNT_TAB_HREF, AccountOrderPage, lookOf } from "@saroh/site-blocks";

import { getAccount, getOrder } from "@/lib/account-area";
import { getAccountSite } from "@/lib/account-site";
import { accountPageTitle, orderPageTitle } from "@/lib/account-title";

/**
 * One order on a page of its own (DEC-142), so an email can link straight
 * to it: `/account/orders/‹ref›`. The same read and the same Track as the
 * Orders tab's sheet (`?order=‹ref›`), which still opens from its rows.
 *
 * The layout has already checked the switch and the session: signed out,
 * it asks the visitor to sign in and the sheet leaves them here, on the
 * order. Another customer's order, or one that isn't there, is said as
 * "not found" inside the account, with the way back — the API answers 404
 * for both, and never says which.
 */

/** An order's ref is an opaque id; anything else isn't asked for. */
function refOf(value: string): string | null {
    const ref = value.trim();
    return ref && ref.length <= 64 ? ref : null;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ orderRef: string }>;
}): Promise<Metadata> {
    const [{ orderRef }, lookup] = await Promise.all([params, getAccount()]);
    const ref = refOf(orderRef);
    const order = lookup.ok && ref ? await getOrder(ref) : null;
    // "Order #1019 · ‹Business›"; signed out, "Sign in".
    return {
        title: accountPageTitle(
            orderPageTitle(order?.ok ? order.order.number : null),
            lookup,
        ),
    };
}

export default async function AccountOrderRoute({
    params,
}: {
    params: Promise<{ domain: string; orderRef: string }>;
}) {
    const [{ domain, orderRef }, lookup] = await Promise.all([
        params,
        getAccount(),
    ]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    const ref = refOf(orderRef);
    const has = (key: string) => account.tabs.some((t) => t.key === key);
    return (
        <AccountOrderPage
            lookup={
                ref ? await getOrder(ref) : { ok: false, reason: "missing" }
            }
            businessName={account.businessName}
            messagesHref={has("messages") ? ACCOUNT_TAB_HREF.messages : null}
            ordersTab={has("orders")}
            // The look's words for the order's stage (DEC-172, U12).
            look={lookOf((await getAccountSite(domain))?.snapshot.site.look)}
        />
    );
}
