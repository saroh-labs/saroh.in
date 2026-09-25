import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingFlow, BookingUnavailable } from "@saroh/site-blocks";

import { publicApiUrl } from "@/lib/api-url";
import { getBookingPage } from "@/lib/booking-page";
import { getSiteForHost } from "@/lib/publication";

/**
 * The customer's booking page on a merchant's site (U19): `/<domain>/book`,
 * inside the site's own header, footer and palette. Every service the
 * business offers, two weeks of times, pay now or at the desk — drawn by
 * `BookingFlow` in `@saroh/site-blocks`, from `--site-*` only.
 *
 * `?service=<id>` opens on one service; the services list and the booking
 * block link here with it.
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
    searchParams: Promise<{ service?: string | string[] }>;
}) {
    const { domain } = await params;
    const { service } = await searchParams;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    const lookup = await getBookingPage(resolved.siteId);
    if (!lookup.ok) {
        if (lookup.reason === "missing") notFound();
        return <BookingUnavailable business={resolved.snapshot.site.name} />;
    }
    return (
        <BookingFlow
            page={lookup.page}
            apiUrl={publicApiUrl()}
            initialServiceId={typeof service === "string" ? service : null}
        />
    );
}
