import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import type { SignInOptions } from "@saroh/site-blocks";
import { LookCheckout, lookOf } from "@saroh/site-blocks";

import {
    requestSignInCode,
    verifySignInCode,
} from "@/app/[domain]/account/actions";
import {
    checkoutStanding,
    quoteBag,
    savedDeliveryAddress,
    startCheckout,
} from "@/app/[domain]/shop/actions";

import { publicApiUrl } from "@/lib/api-url";
import { getSignedInCustomer } from "@/lib/customer-session";
import { dontCachePage } from "@/lib/page-cache/site-rules";
import { getSiteForHost } from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";
import { getSignInOptions } from "@/lib/sign-in";
import { getFooterFacts, soldByFor } from "@/lib/site-footer";

/**
 * `/checkout` under a look (DEC-172, plan U11, #1102): where a look's bag
 * leads. Pick-up or delivery is asked once, here; then the customer's
 * details, with the email's code inside the page; then how they'll pay.
 * The bag itself is the visit's (`bag-store.ts`), read in the browser.
 *
 * Classic never links here — its bag asks and pays in its own sheet — so a
 * site with no look, or one that isn't taking online orders now, is sent
 * to its shop. A private path: never indexed, never kept by the page
 * cache (`lib/private-paths.ts`).
 */

export const metadata: Metadata = {
    title: "Check out",
    robots: { index: false, follow: false },
};

export default async function LookCheckoutPage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();
    const look = lookOf(resolved.snapshot.site.look);
    const checkout = await getCheckoutOptions(resolved.siteId);
    if (!look || !checkout?.canOrder) redirect("/shop");
    // Per visitor: who is signed in, and what they chose.
    dontCachePage("checkout");

    const businessName = resolved.snapshot.site.name;
    const [customer, options, facts] = await Promise.all([
        getSignedInCustomer().catch(() => null),
        getSignInOptions().catch((): SignInOptions | null => null),
        getFooterFacts(resolved.siteId),
    ]);

    return (
        <main className="w-full">
            <LookCheckout
                look={look}
                site={resolved.siteId}
                businessName={businessName}
                soldBy={soldByFor(facts, businessName, true)}
                api={{
                    quote: quoteBag,
                    start: startCheckout,
                    standing: checkoutStanding,
                    savedAddress: savedDeliveryAddress,
                }}
                apiUrl={publicApiUrl()}
                account={{
                    customer,
                    options: options ?? {
                        businessName,
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    },
                    signIn: {
                        requestCode: requestSignInCode,
                        verifyCode: verifySignInCode,
                    },
                }}
            />
        </main>
    );
}
