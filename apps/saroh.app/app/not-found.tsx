import { SiteTheme } from "@saroh/site-blocks";

import { NoSiteHere } from "@/components/site-not-found";

/**
 * The root 404: no website at this address.
 *
 * Reached when `[domain]/layout.tsx` finds no live site for the host (an
 * unknown address, or a site unpublished or paused) and for any path the
 * renderer itself doesn't serve. A 404 on a live site never lands here: it
 * stays inside the site (`[domain]/not-found.tsx`, `[domain]/[...missing]`).
 *
 * Like the root error boundary, it mounts `SiteTheme` with no variables, the
 * neutral defaults, and nothing of Saroh's brand: there is no merchant
 * palette to borrow, and a visitor who typed a business's address has no
 * reason to be shown ours.
 */
export default function NotFound() {
    return (
        <>
            <SiteTheme />
            <NoSiteHere />
        </>
    );
}
