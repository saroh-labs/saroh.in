import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    AccountCard,
    AccountEntry,
    AccountHeader,
    AccountTabBar,
} from "@saroh/site-blocks";

import { accountAreaOn, getAccount } from "@/lib/account-area";
import { getAccountSite } from "@/lib/account-site";
import { accountMetadata } from "@/lib/account-title";

import {
    loadSignInOptions,
    requestSignInCode,
    verifySignInCode,
} from "./actions";

/**
 * The customer's account on a merchant's site (round-2 plan A, A5; ADR-011):
 * `/account` and the pages under it, in the site's palette under the
 * design's compact header (the business's letter back to the site and the
 * tab's title; DEC-073 #10) instead of the site's header and footer.
 *
 * One layout at every width (DEC-142): the header, the account's tabs, then
 * the page. On a phone the tabs are the bar fixed to the foot of the
 * screen; from tablet width up they are a row under the header, and the
 * page has room for two columns. The order in the page is the same.
 *
 * Switched off (`SITE_ACCOUNT_AREA`), every account page is a 404. Signed
 * out, the page asks the visitor to sign in, and the sheet keeps them on
 * the page that asked (UX-052): `/account/messages` opens their messages,
 * and an email's link to one order opens that order. The API decides which
 * tabs this business shows; a tab appears only once its page exists.
 *
 * Private to the customer: never indexed, never cached, and a pasted link
 * shows the business's name alone (`accountMetadata`).
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata> {
    const { domain } = await params;
    const site = await getAccountSite(domain);
    // Titles name the business and never the customer (DEC-142).
    return accountMetadata(site?.snapshot.site.name ?? "");
}

/**
 * The page's column: a phone's width, and room for two columns beyond it.
 * Each `<main>` is marked `data-site-page`, which puts the account inside
 * the site's craft layer (`site-blocks/site-craft.ts`): the site's heading
 * face, balanced lines, its focus ring and its one curve, under the
 * account's own classes.
 */
const COLUMN =
    "mx-auto w-full max-w-[640px] px-[18px] md:max-w-[960px] md:px-6";

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
        getAccountSite(domain),
        getAccount(),
    ]);
    if (!site) notFound();
    const businessName = site.snapshot.site.name;

    if (!lookup.ok) {
        return (
            <>
                <AccountHeader
                    businessName={businessName}
                    title={
                        lookup.reason === "signed-out"
                            ? "Sign in"
                            : "Your account"
                    }
                />
                <main
                    data-site-page=""
                    className={`${COLUMN} pb-6 pt-4 md:pb-12`}
                >
                    <div className="md:max-w-[560px]">
                        {lookup.reason === "signed-out" ? (
                            <AccountCard
                                labelledBy="account-signed-out"
                                title="Sign in to your account"
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
                                lead={
                                    <span role="status">
                                        Refresh the page to try again. You're
                                        still signed in.
                                    </span>
                                }
                            />
                        )}
                    </div>
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
            {/* Before the page in the document at every width: fixed to the
                foot of a phone's screen, a row under the header beyond it. */}
            <AccountTabBar
                tabs={lookup.account.tabs}
                unreadMessages={lookup.account.unreadMessages ?? 0}
            />
            <main
                data-site-page=""
                className={`${COLUMN} pb-[96px] pt-4 md:pb-16 md:pt-6`}
            >
                {children}
            </main>
        </>
    );
}
