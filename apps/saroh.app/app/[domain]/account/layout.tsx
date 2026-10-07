import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    AccountCard,
    AccountEntry,
    AccountHeader,
    AccountTabBar,
} from "@saroh/site-blocks";

import { accountAreaOn, getAccount } from "@/lib/account-area";
import { getSiteForHost } from "@/lib/publication";

import {
    loadSignInOptions,
    requestSignInCode,
    verifySignInCode,
} from "./actions";

/**
 * The customer's account on a merchant's site (round-2 plan A, A5; ADR-011):
 * `/account` and the pages under it, in the site's palette under the
 * design's compact header (the business's letter back to the site and the
 * tab's title; DEC-073 #10) instead of the site's header and footer, with
 * the account's tab bar fixed to the foot of the screen.
 *
 * Switched off (`SITE_ACCOUNT_AREA`), every account page is a 404. Signed
 * out, the page asks the visitor to sign in, and the sheet keeps them on
 * the page that asked (UX-052): `/account/messages` opens their messages. The API decides which tabs this business shows; a tab appears only
 * once its page exists.
 *
 * Private to the customer: never indexed, never cached.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function AccountLayout({
    params,
    children,
}: {
    params: Promise<{ domain: string }>;
    children: React.ReactNode;
}) {
    if (!accountAreaOn()) notFound();
    const { domain } = await params;
    const [site, lookup] = await Promise.all([
        getSiteForHost(domain),
        getAccount(),
    ]);
    if (!site) notFound();
    const businessName = site.snapshot.site.name;

    if (!lookup.ok) {
        return (
            <>
                <AccountHeader
                    businessName={businessName}
                    title="Your account"
                />
                <main className="mx-auto w-full max-w-[640px] px-[18px] pb-6 pt-4">
                    {lookup.reason === "signed-out" ? (
                        <AccountCard
                            labelledBy="account-signed-out"
                            title="Sign in"
                            lead={`Sign in to see your bookings, orders, messages and receipts with ${businessName}. We'll send a one-time code to your email.`}
                            actions={
                                <AccountEntry
                                    variant="page"
                                    customer={null}
                                    businessName={businessName}
                                    api={{
                                        requestCode: requestSignInCode,
                                        verifyCode: verifySignInCode,
                                    }}
                                    loadOptions={loadSignInOptions}
                                />
                            }
                        />
                    ) : (
                        <AccountCard
                            labelledBy="account-unavailable"
                            title="Couldn't load your account"
                            lead="Refresh the page to try again."
                        />
                    )}
                </main>
            </>
        );
    }

    return (
        <>
            <AccountHeader
                businessName={businessName}
                tabs={lookup.account.tabs}
                name={lookup.account.name}
            />
            <main className="mx-auto w-full max-w-[640px] px-[18px] pb-[96px] pt-4">
                {children}
            </main>
            <AccountTabBar
                tabs={lookup.account.tabs}
                unreadMessages={lookup.account.unreadMessages ?? 0}
            />
        </>
    );
}
