import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignedInCustomer, SignInOptions } from "@saroh/site-blocks";
import {
    BookingFlow,
    BookingUnavailable,
    initialDateOf,
    initialTimeOf,
    ModulePageUnavailable,
    MoveClass,
} from "@saroh/site-blocks";

import { PublishedPage } from "@/components/published-page";
import { accountAreaOn, getMyBooking } from "@/lib/account-area";
import { publicApiUrl } from "@/lib/api-url";
import { getBookingPage, getBookingVisit } from "@/lib/booking-page";
import { getSignedInCustomer } from "@/lib/customer-session";
import {
    isBookingDeepLink,
    moduleLabel,
    moduleRoute,
} from "@/lib/module-pages";
import { getSiteForHost } from "@/lib/publication";
import { getSignInOptions } from "@/lib/sign-in";

import {
    requestSignInCode,
    signOut,
    verifySignInCode,
} from "../account/actions";
import { moveBooking } from "../account/bookings/actions";
import {
    bookSignedIn,
    creditFor,
    joinWaitlist,
    leaveWaitlist,
    waitlistFor,
} from "./actions";

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
 * A full class offers its waitlist (round-2 A12): joined, read and left
 * through `./actions.ts` with the session, like booking.
 *
 * `?move=<ref>` (round-2 A6, behind the account area's switch) moves one
 * of the signed-in customer's classes instead: "Moving: ‹class›", its other
 * sessions, and "Move here", through `account/bookings/actions.ts`.
 *
 * A static segment, so it wins over `[slug]`: a merchant page at `/book`
 * would be shadowed by this one (none of the templates has one).
 *
 * **The Book page dresses it** (round-2 G15). When the site has published a
 * Book page, a plain `/book` draws that page's sections (its title, intro
 * and the services list with its display options) inside the site's chrome;
 * a service there opens `/book?service=<id>`, which goes straight into the
 * flow as before. While Appointments is off (or not rolled out) the Book
 * page's address says "This isn't available right now" with a link home.
 * A site with no Book page gets today's flow, unchanged.
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
    // The Book page's own title (G15), which is also its menu name.
    const label = moduleLabel(resolved.snapshot.pages, "BOOK", "Book");
    return {
        title: `${label} · ${name}`,
        openGraph: {
            title: `${label} · ${name}`,
            siteName: name,
            url: "/book",
        },
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
        move?: string | string[];
    }>;
}) {
    const { domain } = await params;
    const { service, date, start, move } = await searchParams;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    // Moving a class from the account (A6): its sessions, "Moving: ‹class›".
    const moving =
        typeof move === "string" && move.trim() && accountAreaOn()
            ? move.trim().slice(0, 64)
            : null;
    if (moving) {
        return (
            <MoveClass
                row={await getMyBooking(moving)}
                apiUrl={publicApiUrl()}
                businessName={resolved.snapshot.site.name}
                move={moveBooking}
            />
        );
    }

    // The Book page (G15): its sections on a plain /book, or its address
    // taken off while Appointments is off. Deep links go on to the flow.
    const route = moduleRoute(
        resolved.snapshot.pages,
        resolved.modules,
        "BOOK",
        isBookingDeepLink({ service, date, start }),
    );
    if (route.draw === "unavailable") {
        return <ModulePageUnavailable business={resolved.snapshot.site.name} />;
    }
    if (route.draw === "page") {
        return (
            <PublishedPage
                page={route.page}
                snapshot={resolved.snapshot}
                siteId={resolved.siteId}
            />
        );
    }

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
                credit: creditFor,
                signOut,
                // A full class's waitlist (A12).
                waitlist: {
                    mine: waitlistFor,
                    join: joinWaitlist,
                    leave: leaveWaitlist,
                },
            }}
            apiUrl={publicApiUrl()}
            initialServiceId={typeof service === "string" ? service : null}
            initialDate={initialDateOf(date)}
            initialStart={initialTimeOf(start)}
        />
    );
}
