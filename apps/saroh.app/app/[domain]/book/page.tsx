import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignedInCustomer, SignInOptions } from "@saroh/site-blocks";
import {
    BookingFlow,
    BookingUnavailable,
    initialDateOf,
    initialTimeOf,
} from "@saroh/site-blocks";

import { publicApiUrl } from "@/lib/api-url";
import { getBookingPage, getBookingVisit } from "@/lib/booking-page";
import { getSignedInCustomer } from "@/lib/customer-session";
import { getSiteForHost } from "@/lib/publication";
import { getSignInOptions } from "@/lib/sign-in";

import {
    requestSignInCode,
    signOut,
    verifySignInCode,
} from "../account/actions";
import { bookSignedIn } from "./actions";

/**
 * The customer's booking page on a merchant's site (U19): `/<domain>/book`,
 * inside the site's own header, footer and palette. Every service the
 * business offers, two weeks of times, pay now or at the desk — drawn by
 * `BookingFlow` in `@saroh/site-blocks`, from `--site-*` only.
 *
 * `?service=<id>` opens on one service; the services list and the booking
 * block link here with it. With `&date=YYYY-MM-DD&start=HH:MM` (On today on
 * the home page, G18) it opens on that day with that time chosen, or says the
 * time has just gone.
 *
 * Sign-in is always on (round-2 A9, ADR-011): the last step asks for a code
 * by email, and the booking is made through this app's server with the
 * session (`./actions.ts`). The page reads who is signed in on this host and
 * what the sheet needs (the business's phone, the challenge) as it renders.
 * Neither read can take the page down: without them the visitor is simply
 * not signed in, and the sheet goes without the phone line. The header's
 * place, hours and phone (E6) are the site's public visit read, the one
 * Visit us shows; without it the header names the business only.
 *
 * A static segment, so it wins over `[slug]`: a merchant page at `/book`
 * would be shadowed by this one (none of the templates has one).
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved) return null;
    const name = resolved.snapshot.site.name;
    return {
        title: `Book · ${name}`,
        openGraph: { title: `Book · ${name}`, siteName: name, url: "/book" },
        metadataBase: new URL(`https://${domain}`),
    };
}

export default async function BookPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string }>;
    searchParams: Promise<{
        service?: string | string[];
        date?: string | string[];
        start?: string | string[];
    }>;
}) {
    const { domain } = await params;
    const { service, date, start } = await searchParams;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    const [lookup, visit, customer, options] = await Promise.all([
        getBookingPage(resolved.siteId),
        // The header's place, hours and phone (E6); null never blocks booking.
        getBookingVisit(resolved.siteId),
        getSignedInCustomer().catch((): SignedInCustomer | null => null),
        getSignInOptions().catch((): SignInOptions | null => null),
    ]);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        return <BookingUnavailable business={resolved.snapshot.site.name} />;
    }
    return (
        <BookingFlow
            page={lookup.page}
            visit={visit}
            account={{
                customer,
                options: options ?? {
                    businessName: lookup.page.businessName,
                    phone: null,
                    challenge: { required: false, siteKey: null },
                },
                signIn: {
                    requestCode: requestSignInCode,
                    verifyCode: verifySignInCode,
                },
                book: bookSignedIn,
                signOut,
            }}
            apiUrl={publicApiUrl()}
            initialServiceId={typeof service === "string" ? service : null}
            initialDate={initialDateOf(date)}
            initialStart={initialTimeOf(start)}
        />
    );
}
