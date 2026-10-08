import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
    SiteSearchTrackingLoading,
    SiteSearchTrackingSection,
} from "@/components/sites/site-search-tracking-section";
import { SiteSettings } from "@/components/sites/site-settings";
import { SiteSettingsRead } from "@/components/sites/site-settings-read";
import { requireSession } from "@/lib/session";
import { readPublishApproval } from "@/lib/sites/publish-approval-read";
import { getSite } from "@/lib/sites/service";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";

export const metadata = { title: "Settings · Website" };

/**
 * Website settings (#188) — where the site lives, and what other platforms show
 * about it.
 *
 * Store-level equivalents live under Commerce; this is the site's own record:
 * its address, its search appearance, and the card people see when the link is
 * forwarded. All of it is DRAFT state — it reaches the public only through the
 * next publish, exactly like a section edit — except "Search and tracking"
 * (DEC-108), whose codes and trackers are live as soon as they're saved.
 *
 * The Website header above it carries the site's name and the way into the
 * editor, so this tab is only the settings, at a form's measure.
 */
export default async function SiteSettingsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const [site, webAddress] = await Promise.all([
        getSite(siteId),
        readWebAddressLinks(),
    ]);
    if (!site) notFound();
    // Where the site is reached, its verified domain first (DEC-069, L8).
    const address = siteAddressOf(site, webAddress, RENDERER_APEX);
    // "Publishing needs approval" (DEC-071, T13), or null to leave it out.
    const approval = await readPublishApproval(site);

    return (
        <div className="max-w-2xl space-y-8">
            {site.can.manageSettings ? (
                <SiteSettings
                    site={site}
                    address={address}
                    approval={approval}
                />
            ) : (
                // The values, and none of the controls the API would refuse
                // (#275).
                <SiteSettingsRead
                    site={site}
                    address={address}
                    approval={approval}
                />
            )}
            {/* Live at once, not draft state (DEC-108, U7); its own read. */}
            <Suspense fallback={<SiteSearchTrackingLoading />}>
                <SiteSearchTrackingSection site={site} address={address} />
            </Suspense>
        </div>
    );
}
