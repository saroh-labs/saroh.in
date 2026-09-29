import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignInOptions } from "@saroh/site-blocks";
import { AccountEntry, ShopBag, SiteTheme } from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import { publicApiUrl } from "@/lib/api-url";
import { getBookingPage } from "@/lib/booking-page";
import { getCatalogue } from "@/lib/catalogue";
import { customerReader } from "@/lib/customer-reader";
import { getSignedInCustomer } from "@/lib/customer-session";
import { headerAction } from "@/lib/header-action";
import {
    getPublicationForHost,
    getSiteForHost,
    shareImages,
} from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";
import { getSignInOptions } from "@/lib/sign-in";
import { SiteFooter, SiteHeader } from "@saroh/site-blocks";

import {
    loadSignInOptions,
    requestSignInCode,
    verifySignInCode,
} from "./account/actions";
import { checkoutStanding, quoteBag, startCheckout } from "./shop/actions";

/**
 * Tenant site layout (S2-006).
 *
 * Middleware rewrites an incoming tenant hostname to `/[domain]/<path>`, so the
 * `domain` route param IS the full request hostname (e.g. `demo.saroh.app`). We
 * resolve it to a publication via the public read API; a `null` snapshot means
 * nothing is published for this host (drafts are never reachable), so we render
 * a clean 404. There is no legacy DB / font mapping here — everything the
 * renderer draws from lives in the immutable publication snapshot.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);
    if (!snapshot) {
        return null;
    }

    /*
     * Search and social, from the snapshot (#188).
     *
     * These fields have travelled into every publication since #188 shipped and
     * nothing read them: a merchant could write a search title and a share
     * image, publish, and the page still went out titled with the bare site
     * name and no description at all.
     *
     * `seoTitle` FALLS BACK to the site name rather than replacing it
     * conditionally in the settings form — an empty search title means "I have
     * not written one", not "publish an empty <title>".
     */
    const { name, seoTitle, seoDescription } = snapshot.site;
    const title = seoTitle?.trim() ? seoTitle : name;
    const description = seoDescription?.trim() ? seoDescription : undefined;
    const images = shareImages(snapshot.site);

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images,
            // og:url and og:site_name (#220): the canonical address the
            // platforms key their cache on, and the name Slack puts above the
            // card. Resolved against `metadataBase`.
            url: "/",
            siteName: name,
        },
        twitter: {
            // Without an image this degrades to a plain summary card, so the
            // card type follows the picture rather than always claiming one.
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

/*
 * No `generateStaticParams` here, not even an empty one.
 *
 * An empty list looked like a harmless placeholder and was not: it turned
 * every tenant route into an on-demand STATIC page, and the renderer reads the
 * publication `no-store` so a publish shows at once. In a production build
 * that combination is a hard error — "Page changed from static to dynamic at
 * runtime" — so a merchant's home and booking page answered 500 while
 * `next dev`, which renders everything dynamically, looked fine. Tenant pages
 * are rendered per request; pre-rendering, if it ever comes, needs a list of
 * hosts AND a cached read to go with it.
 */

export default async function SiteLayout({
    params,
    children,
}: {
    params: Promise<{ domain: string }>;
    children: React.ReactNode;
}) {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);

    if (!resolved) {
        notFound();
    }
    const { snapshot, siteId } = resolved;

    /*
     * The header's main button (G17) follows what the business offers now,
     * not what was published: a merchant who turns Appointments off loses
     * "Book" at once. `/book` reads the same page, once per request. "Order"
     * follows the shop (G11): the API serves `/shop` only while it is open
     * for the business (`SITE_SHOP`), and `/shop` reads the same list.
     * The checkout options are read beside it rather than after: whether
     * the shop is open is the API's per-business flag, known here only
     * from the catalogue's answer, and waiting for it would add a round
     * trip to every page of a site that sells.
     */
    const [booking, catalogue, checkout] = siteId
        ? await Promise.all([
              getBookingPage(siteId),
              getCatalogue(siteId),
              getCheckoutOptions(siteId),
          ])
        : [null, null, null];
    const shopServes = catalogue?.ok ?? false;
    const action = headerAction({ booking, shopServes });

    /*
     * The bag (G13), only where the site takes an online order now: the
     * shop serves, a provider can take the payment and the storefront isn't
     * paused. Elsewhere the product page offers "Ask about ordering".
     */
    const takesOrders = shopServes && checkout?.canOrder === true;
    // Who is signed in, read once per render: the bag and the account
    // entry share it. A read that fails is a visitor signed out.
    const readCustomer = customerReader(getSignedInCustomer);
    const [customer, signInOptions] = takesOrders
        ? await Promise.all([
              readCustomer(),
              getSignInOptions().catch((): SignInOptions | null => null),
          ])
        : [null, null];
    const bag =
        takesOrders && siteId ? (
            <ShopBag
                site={siteId}
                businessName={snapshot.site.name}
                api={{
                    quote: quoteBag,
                    start: startCheckout,
                    standing: checkoutStanding,
                }}
                apiUrl={publicApiUrl()}
                account={{
                    customer,
                    options: signInOptions ?? {
                        businessName: snapshot.site.name,
                        phone: null,
                        challenge: { required: false, siteKey: null },
                    },
                    signIn: {
                        requestCode: requestSignInCode,
                        verifyCode: verifySignInCode,
                    },
                }}
            />
        ) : null;

    /*
     * The header's Sign in / account entry (A5, G17's account slot), on
     * every site once the account area is switched on (SITE_ACCOUNT_AREA).
     * Who is signed in is read only when there is a session cookie; a read
     * that fails leaves the visitor signed out, never the page down.
     */
    const account = accountAreaOn() ? (
        <AccountEntry
            customer={await readCustomer()}
            businessName={snapshot.site.name}
            api={{
                requestCode: requestSignInCode,
                verifyCode: verifySignInCode,
            }}
            loadOptions={loadSignInOptions}
        />
    ) : undefined;

    return (
        <div className="min-h-screen bg-site-bg text-site-body">
            <SiteTheme variables={snapshot.site.styleVariables} />
            <SiteHeader
                name={snapshot.site.name}
                navigation={snapshot.site.navigation ?? []}
                // A module page leaves the menu while its module is off (G15).
                modules={resolved.modules}
                action={action}
                // A Shop entry in the menu while /shop serves (P4).
                shopServes={shopServes}
                account={account}
                bag={bag}
            />

            <div>{children}</div>

            <SiteFooter
                footer={snapshot.site.footer}
                name={snapshot.site.name}
            />
        </div>
    );
}
