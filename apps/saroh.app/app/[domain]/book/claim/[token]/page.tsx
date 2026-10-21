import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
    ctaClasses,
    frontButton,
    lookOf,
    SitePageMessage,
    WaitlistClaimPage,
} from "@saroh/site-blocks";

import { dontCachePage } from "@/lib/page-cache/site-rules";
import { getSiteForHost } from "@/lib/publication";
import { getWaitlistClaim } from "@/lib/waitlist-claim";

/**
 * A waitlist offer's claim page (automatic notices U18, #1149):
 * `/book/claim/<token>` on the business's site, the link in the offer's
 * email. It shows the class, its time and "Book my spot until 6:30 pm",
 * which opens the booking page on that session (`/book?service=&date=&
 * start=`); booking there takes the held place, through the normal path
 * and whatever it asks (sign-in). No sign-in is needed to see the offer.
 *
 * Ended, taken or cancelled, it says so ("This offer has ended", "This
 * spot has gone"), with "Join the waitlist again" while the class still
 * runs. A link that isn't this business's, or isn't one at all, is the
 * site's own 404.
 *
 * One customer's held place, and the token is the link: never kept by the
 * page cache (`dontCachePage`, and `/book/claim` is a private path, so the
 * Worker passes by it and crawlers are kept out), never indexed, and no
 * referrer leaves with it. Drawn in the site's own palette and look, from
 * `--site-*` only (`WaitlistClaimPage`).
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata> {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    const name = resolved?.snapshot.site.name;
    return {
        title: name ? `Your place · ${name}` : "Your place",
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}

export default async function WaitlistClaimRoute({
    params,
}: {
    params: Promise<{ domain: string; token: string }>;
}) {
    const { domain, token } = await params;
    // About one customer's place, and changing by the minute.
    dontCachePage("a waitlist offer");
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();
    const look = lookOf(resolved.snapshot.site.look);

    const lookup = await getWaitlistClaim(resolved.siteId, token);
    if (!lookup.ok && lookup.reason === "missing") notFound();
    if (!lookup.ok) {
        return (
            <SitePageMessage
                look={look}
                eyebrow="Waitlist"
                title="We couldn't open this offer"
                actions={
                    <Link
                        href={`/book/claim/${encodeURIComponent(token)}`}
                        data-site-primary=""
                        className={
                            look
                                ? frontButton(look, "fill")
                                : ctaClasses("primary")
                        }
                    >
                        Try again
                    </Link>
                }
            >
                Something went wrong on our side. Try again in a moment, or get
                in touch with {resolved.snapshot.site.name}.
            </SitePageMessage>
        );
    }
    return <WaitlistClaimPage claim={lookup.claim} look={look} />;
}
