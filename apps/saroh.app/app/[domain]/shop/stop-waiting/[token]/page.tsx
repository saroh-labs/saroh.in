import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
    ctaClasses,
    frontButton,
    lookOf,
    SitePageMessage,
    StopWaitingPage,
} from "@saroh/site-blocks";

import { dontCachePage } from "@/lib/page-cache/site-rules";
import { getSiteForHost } from "@/lib/publication";
import { getStockWatch } from "@/lib/stock-watch";

import { stopWaiting } from "../../actions";

/**
 * "Stop waiting" for a product to be back (DEC-174, automatic notices U24,
 * #1155): `/shop/stop-waiting/<token>` on the business's site, offered on
 * the product page right after "Tell me when it's back". It says what the
 * visitor is waiting for and offers "Stop waiting", a button: opening the
 * page stops nothing, since mail scanners open links (U23). Told or
 * stopped already, it says so. A token that isn't this business's, or
 * isn't one at all, is the site's own 404.
 *
 * One visitor's watch, and the token is the way to stop it: never kept by
 * the page cache (`dontCachePage`, and `/shop/stop-waiting` is a private
 * path, so the Worker passes by it and crawlers are kept out), never
 * indexed, and no referrer leaves with it. Drawn in the site's own palette
 * and look, from `--site-*` only (`StopWaitingPage`).
 *
 * A product slugged `stop-waiting` keeps its page: this folder has no page
 * of its own, so `/shop/stop-waiting` is still `[productSlug]`.
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
        title: name ? `Stop waiting · ${name}` : "Stop waiting",
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}

export default async function StopWaitingRoute({
    params,
}: {
    params: Promise<{ domain: string; token: string }>;
}) {
    const { domain, token } = await params;
    // About one visitor's watch, and it changes when they press.
    dontCachePage("a back-in-stock watch");
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();
    const look = lookOf(resolved.snapshot.site.look);

    const lookup = await getStockWatch(resolved.siteId, token);
    if (!lookup.ok && lookup.reason === "missing") notFound();
    if (!lookup.ok) {
        return (
            <SitePageMessage
                look={look}
                eyebrow="Back in stock"
                title="We couldn't open this"
                actions={
                    <Link
                        href={`/shop/stop-waiting/${encodeURIComponent(token)}`}
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
    return (
        <StopWaitingPage
            view={lookup.view}
            token={token}
            stop={stopWaiting}
            look={look}
        />
    );
}
