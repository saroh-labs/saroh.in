import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignedInCustomer, SignInOptions } from "@saroh/site-blocks";
import {
    BookingFlow,
    BookingUnavailable,
    initialDateOf,
    initialTimeOf,
    lookOf,
    modulePageTopOf,
    ModulePageUnavailable,
    MoveClass,
    parseStepUrl,
    reachOf,
} from "@saroh/site-blocks";

import { PublishedPage } from "@/components/published-page";
import { VisitStep } from "@/components/visit-step";
import { accountAreaOn, getBooking, getMyBooking } from "@/lib/account-area";
import { publicApiUrl } from "@/lib/api-url";
import { getBookingPage, getBookingVisit } from "@/lib/booking-page";
import { getCatalogue } from "@/lib/catalogue";
import { getSignedInCustomer } from "@/lib/customer-session";
import {
    findModulePage,
    isBookingDeepLink,
    moduleLabel,
    moduleRoute,
    NOT_FOR_SEARCH,
    routeHasNothing,
} from "@/lib/module-pages";
import { dontCachePage } from "@/lib/page-cache/site-rules";
import { getSiteForHost, siteOriginFor } from "@/lib/publication";
import { serviceJsonLdScript } from "@/lib/service-json-ld";
import { getSignInOptions } from "@/lib/sign-in";
import { getSiteContact } from "@/lib/site-contact";
import { getFooterFacts, soldByFor } from "@/lib/site-footer";
import { bookDescription, canonical } from "@/lib/site-meta";
import { shareable } from "@/lib/test-metadata";

import {
    requestSignInCode,
    signOut,
    verifySignInCode,
} from "../account/actions";
import { moveBooking } from "../account/bookings/actions";
import {
    bookSignedIn,
    creditFor,
    findMyBooking,
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
 * **The step is in the address** (site templates v2 U9): `?step=` with the
 * person asked for (`?staff=`) and, once booked, its reference (`?ref=`).
 * The flow moves it with the History API, so a step change makes no
 * request here; this page reads it on a reload or a link, and the flow
 * opens on that step or the earliest one it can stand on. A booked step is
 * read again through the customer's own session (`getBooking`), and that
 * page is never kept by the page cache.
 *
 * **Under a look** (DEC-172, U10) the same steps are drawn one question
 * at a time in the look's frame — Folio's panel, Quiet's page, Live's
 * sheets — with the code asked inside Your details; Classic is today's.
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
 *
 * A booking page with nothing to book (the module is off, the read failed,
 * online booking isn't open or offers no service) is kept out of search: it
 * answers 200, and "not available" is not a page to rank. One paused at its
 * plan's monthly limit stays indexed: it opens again by itself.
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
    // What can be booked, for search: the Book page's own lead, else the
    // services the page offers (its own cached read). Nothing when neither.
    const booking = resolved.siteId
        ? await getBookingPage(resolved.siteId)
        : null;
    const description = bookDescription({
        lead: modulePageTopOf(
            findModulePage(resolved.snapshot.pages, "BOOK") ?? {},
        )?.lead,
        business: name,
        services: booking?.ok ? booking.page.services.map((s) => s.name) : [],
    });
    const route = moduleRoute(
        resolved.snapshot.pages,
        resolved.modules,
        "BOOK",
    );
    return shareable(resolved, {
        ...(routeHasNothing(
            route,
            !booking?.ok ||
                !booking.page.open ||
                booking.page.services.length === 0,
        )
            ? NOT_FOR_SEARCH
            : {}),
        title: `${label} · ${name}`,
        description,
        openGraph: {
            title: `${label} · ${name}`,
            description,
            siteName: name,
            url: "/book",
        },
        // One address for the page, however it was opened (a service, a
        // day and a time are choices on it, not pages of their own).
        ...canonical(resolved, domain, "/book"),
    });
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
        step?: string | string[];
        staff?: string | string[];
        ref?: string | string[];
    }>;
}) {
    const { domain } = await params;
    const query = await searchParams;
    const { service, date, start, move, step, staff, ref } = query;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    // Moving a class from the account (A6): its sessions, "Moving: ‹class›".
    const moving =
        typeof move === "string" && move.trim() && accountAreaOn()
            ? move.trim().slice(0, 64)
            : null;
    if (moving) {
        // One customer's own booking: never kept (#863).
        dontCachePage("moving a booking");
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
        isBookingDeepLink({ service, date, start, step, staff, ref }),
    );
    if (route.draw === "unavailable") {
        return (
            <ModulePageUnavailable
                business={resolved.snapshot.site.name}
                look={lookOf(resolved.snapshot.site.look)}
            />
        );
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

    // The step in the address (U9), each part narrowed: what the flow opens
    // on. A booked step names its booking, read with the customer's own
    // session: one visitor's ticket, so never kept by the page cache.
    const opened = parseStepUrl(
        new URLSearchParams(
            Object.entries(query).flatMap(([k, v]) =>
                typeof v === "string" ? [[k, v]] : [],
            ),
        ).toString(),
    );
    const bookedRef = opened.step === "done" ? opened.ref : null;
    if (bookedRef) dontCachePage("a booking's ticket");

    const [
        lookup,
        visit,
        customer,
        options,
        facts,
        catalogue,
        contact,
        booked,
    ] = await Promise.all([
        getBookingPage(resolved.siteId),
        // The header's place, hours and phone (E6); null never blocks booking.
        getBookingVisit(resolved.siteId),
        getSignedInCustomer().catch((): SignedInCustomer | null => null),
        getSignInOptions().catch((): SignInOptions | null => null),
        // "Sold by" or "Run by ‹legal name›" on the confirmation (DEC-121):
        // the layout's own reads, shared through `cache`.
        getFooterFacts(resolved.siteId),
        getCatalogue(resolved.siteId),
        // A call and a WhatsApp message, where the page can't find a
        // time: the layout's own read, shared through `cache`.
        getSiteContact(resolved.siteId),
        bookedRef ? getBooking(bookedRef) : null,
    ]);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        // A failed read is not kept by the page cache (#863).
        dontCachePage("booking unavailable");
        return (
            <BookingUnavailable
                business={resolved.snapshot.site.name}
                // The address as it was opened, so "Try again" lands on
                // the same service, day and time.
                retryHref={bookHref({ service, date, start, staff, step })}
                reach={reachOf(contact)}
                look={lookOf(resolved.snapshot.site.look)}
            />
        );
    }
    // What can be booked here, for search engines: only what the page
    // shows. Not on a test release, which is never indexed.
    const jsonLd =
        resolved.mode === "live" && lookup.page.open
            ? serviceJsonLdScript({
                  business: resolved.snapshot.site.name,
                  origin: siteOriginFor(resolved, domain),
                  services: lookup.page.services,
              })
            : null;
    return (
        <>
            {/* The visit looked at what can be booked (U15): once a visit. */}
            <VisitStep step="looked" />
            {jsonLd ? (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: jsonLd }}
                />
            ) : null}
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
                    // The booked step read again after Back and Forward (U9).
                    booking: findMyBooking,
                }}
                apiUrl={publicApiUrl()}
                soldBy={soldByFor(
                    facts,
                    resolved.snapshot.site.name,
                    catalogue.ok,
                )}
                reach={reachOf(contact)}
                initialServiceId={typeof service === "string" ? service : null}
                initialDate={initialDateOf(date)}
                initialStart={initialTimeOf(start)}
                initialStaff={opened.staff}
                initialStep={opened.step}
                initialRef={bookedRef}
                booked={booked}
                // The site's look frames the same steps (U10); none is
                // Classic, today's page.
                look={lookOf(resolved.snapshot.site.look)}
            />
        </>
    );
}

/** `/book` with the choices it was opened on, for "Try again". */
function bookHref(params: {
    service?: string | string[];
    date?: string | string[];
    start?: string | string[];
    staff?: string | string[];
    step?: string | string[];
}): string {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
        if (typeof value === "string" && value !== "") query.set(name, value);
    }
    const search = query.toString();
    return search ? `/book?${search}` : "/book";
}
