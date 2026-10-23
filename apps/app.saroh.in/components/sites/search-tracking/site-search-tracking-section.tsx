import { LoadingState } from "@saroh/ui/data-state";

import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { readSearchTracking } from "@/lib/sites/search-tracking-read";
import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";
import { trackersLock } from "@/lib/sites/trackers-lock";
import { SearchTrackingFrame } from "./parts";
import { SiteSearchTracking } from "./site-search-tracking";
import { SiteSearchTrackingRead } from "./site-search-tracking-read";

/**
 * "Search and tracking" on the site's settings (DEC-108, U7): reads the
 * section and the plan, then draws it for whoever is looking. Rendered in
 * a Suspense boundary so the rest of the settings never wait on it; the
 * plan is an aid (null when unread, failing open) and the save still
 * refuses what it must.
 */
export async function SiteSearchTrackingSection({
    site,
    address,
}: {
    site: Pick<SiteDetail, "id" | "can">;
    address: SiteAddress | null;
}) {
    const [read, access] = await Promise.all([
        readSearchTracking(site.id),
        billingAccessOrNull(),
    ]);
    const lock = trackersLock(access);
    return site.can.manageSettings ? (
        <SiteSearchTracking
            siteId={site.id}
            read={read}
            address={address}
            lock={lock}
        />
    ) : (
        <SiteSearchTrackingRead read={read} address={address} lock={lock} />
    );
}

/** Its shape while it loads. */
export function SiteSearchTrackingLoading() {
    return (
        <SearchTrackingFrame>
            <LoadingState
                variant="list"
                rows={4}
                label="Loading search and tracking"
            />
        </SearchTrackingFrame>
    );
}
