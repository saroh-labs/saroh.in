"use client";

import { showError } from "@saroh/ui/toast";

import { openTestRelease } from "@/lib/sites/test-releases-actions";

/**
 * Open a test release on its test address, in a new tab (DEC-071, T2, T11,
 * T12): mints a 12-hour OPEN link for this person, so nobody has to forward
 * a token, and goes there.
 *
 * The tab is opened before the request, so the browser treats it as the
 * press's own window rather than a pop-up, and the site it opens never gets
 * a handle back on the workspace. Resolves once the tab has its address, or
 * the failure has been said.
 */
export async function openReleaseInNewTab(
    siteId: string,
    releaseId: string,
): Promise<void> {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    const res = await openTestRelease(siteId, releaseId);
    if (!res.ok || !res.data.url) {
        tab?.close();
        showError(
            res.ok
                ? "This site has no test address, so the release can't be opened there."
                : res.error,
        );
        return;
    }
    if (tab) tab.location.href = res.data.url;
    else window.location.assign(res.data.url);
}
