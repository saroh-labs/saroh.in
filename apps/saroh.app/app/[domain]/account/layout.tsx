import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountCard, AccountEntry, AccountTabBar } from "@saroh/site-blocks";

import { accountAreaOn, getAccount } from "@/lib/account-area";
import { getSiteForHost } from "@/lib/publication";

import {
    loadSignInOptions,
    requestSignInCode,
    verifySignInCode,
} from "./actions";

/**
 * The customer's account on a merchant's site (round-2 plan A, A5; ADR-011):
 * `/account` and the pages under it, inside the site's own header and
 * palette, with the account's tab bar fixed to the foot of the screen.
 *
 * Switched off (`SITE_ACCOUNT_AREA`), every account page is a 404. Signed
 * out, the page asks the visitor to sign in, and the sheet brings them back
 * here. The API decides which tabs this business shows; a tab appears only
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
            <main className="mx-auto w-full max-w-[640px] px-[18px] pb-6 pt-4">
                {lookup.reason === "signed-out" ? (
                    <AccountCard
                        labelledBy="account-signed-out"
                        title="Your account"
                        lead={`Sign in to see your bookings, orders and receipts with ${businessName}. We'll send a one-time code to your email.`}
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
                        title="Your account"
                        lead="Your account couldn't be loaded. Refresh the page to try again."
                    />
                )}
            </main>
        );
    }

    return (
        <>
            <main className="mx-auto w-full max-w-[640px] px-[18px] pb-[96px] pt-4">
                {children}
            </main>
            <AccountTabBar tabs={lookup.account.tabs} />
        </>
    );
}
