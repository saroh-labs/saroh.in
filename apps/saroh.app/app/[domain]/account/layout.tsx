import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { LookId } from "@saroh/block-contract";
import type { SignInOptions } from "@saroh/site-blocks";
import {
    AccountCard,
    AccountEntry,
    AccountHeader,
    AccountLookFrame,
    ACCOUNTS_OFF_TEXT,
    AccountTabBar,
    greetingWords,
    lookOf,
    LookSignIn,
} from "@saroh/site-blocks";

import { accountAreaOn, getAccount } from "@/lib/account-area";
import { getAccountSite } from "@/lib/account-site";
import { accountMetadata } from "@/lib/account-title";
import { getBookingPage } from "@/lib/booking-page";
import { getSignInOptions } from "@/lib/sign-in";

import {
    loadSignInOptions,
    requestSignInCode,
    signOut,
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
    const { domain } = await params;
    if (!accountAreaOn()) {
        // The middleware answers `/account` with a 404 first while the
        // area is off, so this is reached only without it (a preview).
        // Classic: a 404 here too. A look says what the site does instead
        // (DEC-172, plan U12), so the page never reads as broken.
        const off = await getAccountSite(domain);
        const offLook = off ? lookOf(off.snapshot.site.look) : undefined;
        if (!off || !offLook) notFound();
        return (
            <AccountLookFrame
                look={offLook}
                businessName={off.snapshot.site.name}
                tabs={[]}
                greeting=""
                title="Your account"
            >
                <p className="max-w-[480px] text-[17px] leading-relaxed text-site-body">
                    {ACCOUNTS_OFF_TEXT}
                </p>
            </AccountLookFrame>
        );
    }
    const [site, lookup] = await Promise.all([
        getAccountSite(domain),
        getAccount(),
    ]);
    if (!site) notFound();
    const businessName = site.snapshot.site.name;

    // Folio, Quiet or Live (DEC-172, plan U12): the account inside the
    // site's own header and footer, in the look. Absent: Classic, below,
    // exactly as before.
    const look = lookOf(site.snapshot.site.look);
    if (look) {
        return (
            <LookAccount
                look={look}
                siteId={site.siteId}
                businessName={businessName}
                lookup={lookup}
            >
                {children}
            </LookAccount>
        );
    }

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

/**
 * The account under a look: signed out, its sign-in page (the code asked
 * on the page, as the booking asks it); unreadable, said so; signed in,
 * the tabs, the page's title and the page, in the site's own chrome
 * (`SiteChromeFrame` keeps the header and footer under a look).
 */
async function LookAccount({
    look,
    siteId,
    businessName,
    lookup,
    children,
}: {
    look: LookId;
    siteId: string | null | undefined;
    businessName: string;
    lookup: Awaited<ReturnType<typeof getAccount>>;
    children: React.ReactNode;
}) {
    if (!lookup.ok) {
        if (lookup.reason === "signed-out") {
            const options: SignInOptions = (await getSignInOptions().catch(
                () => null,
            )) ?? {
                businessName,
                phone: null,
                challenge: { required: false, siteKey: null },
            };
            return (
                <AccountLookFrame
                    look={look}
                    businessName={businessName}
                    tabs={[]}
                    greeting=""
                    title="Sign in"
                >
                    <LookSignIn
                        look={look}
                        options={options}
                        api={{
                            requestCode: requestSignInCode,
                            verifyCode: verifySignInCode,
                        }}
                        lead={`Sign in to see your bookings, orders, messages and receipts with ${businessName}.`}
                    />
                </AccountLookFrame>
            );
        }
        return (
            <AccountLookFrame
                look={look}
                businessName={businessName}
                tabs={[]}
                greeting=""
                title="Your account"
            >
                <AccountCard
                    labelledBy="account-unavailable"
                    title="Couldn't load your account"
                    lead={
                        <span role="status">
                            Refresh the page to try again. You're still signed
                            in.
                        </span>
                    }
                />
            </AccountLookFrame>
        );
    }
    // Home's greeting on the business's own clock (the booking page's
    // zone, read once per request with the site's layout); India without.
    const booking = siteId
        ? await getBookingPage(siteId).catch(() => null)
        : null;
    const greeting = greetingWords(
        new Date(),
        booking?.ok ? booking.page.timezone : null,
    );
    return (
        <AccountLookFrame
            look={look}
            businessName={businessName}
            tabs={lookup.account.tabs}
            name={lookup.account.name}
            unreadMessages={lookup.account.unreadMessages ?? 0}
            greeting={greeting}
            signOut={signOut}
        >
            {children}
        </AccountLookFrame>
    );
}
