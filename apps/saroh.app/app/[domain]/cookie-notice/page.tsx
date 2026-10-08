import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CookieNotice } from "@saroh/site-blocks";

import { getSiteForHost } from "@/lib/publication";
import { getSiteHead } from "@/lib/site-head";
import { needsConsent, TRACKER_NAMES, TRACKER_PURPOSES } from "@/lib/trackers";

/**
 * The site's own cookie notice (DEC-108): the tools that run on it now and
 * what each does. The banner links here when the merchant has no privacy
 * page of their own. Live hosts only; never indexed.
 */
export const metadata: Metadata = {
    title: "Cookies and visitor counting",
    robots: { index: false, follow: false },
};

export default async function CookieNoticePage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (resolved?.mode !== "live" || !resolved.siteId) notFound();
    const head = await getSiteHead(resolved.siteId);
    return (
        <CookieNotice
            siteName={resolved.snapshot.site.name}
            tools={head.trackers.map((t) => ({
                name: TRACKER_NAMES[t.kind],
                purpose: TRACKER_PURPOSES[t.kind],
                asks: needsConsent(t.kind),
            }))}
        />
    );
}
