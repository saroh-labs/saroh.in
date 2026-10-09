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
 * Website settings (#188), grouped after the Website › Settings audit:
 * what's left before the site is worth sharing, then Address, Search and
 * sharing, Menu and footer, Shop, Tracking and Advanced.
 *
 * Most rows are draft state and reach the public with the next publish,
 * like a section edit; they carry "Next publish". The address, the domain,
 * where the shop sells from, the codes and trackers (DEC-108) and
 * publishing approval apply as soon as they're saved.
 *
 * The Website header above it carries the site's name, its address and
 * whether it is published, and the way into the editor.
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
    // Change the web address: the owner's, while it is rolled out for the
    // business (`WEB_ADDRESS_CHANGE`), and only for the site at it.
    const canChangeAddress =
        webAddress?.canChange === true && webAddress.address === site.subdomain;

    // Live at once, not draft state (DEC-108, U7); its own read.
    const tracking = (
        <Suspense fallback={<SiteSearchTrackingLoading />}>
            <SiteSearchTrackingSection site={site} address={address} />
        </Suspense>
    );

    return site.can.manageSettings ? (
        <SiteSettings
            site={site}
            address={address}
            approval={approval}
            canChangeAddress={canChangeAddress}
            tracking={tracking}
        />
    ) : (
        // The values, and none of the controls the API would refuse (#275).
        <SiteSettingsRead
            site={site}
            address={address}
            approval={approval}
            tracking={tracking}
        />
    );
}
