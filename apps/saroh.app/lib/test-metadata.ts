import type { Metadata } from "next";

import type { SiteHostKind } from "./site-host-mode";

/**
 * A page's metadata, as its host may carry it (DEC-071, R3).
 *
 * On a test release's host there is no share card: a link pasted into a chat
 * must not unfurl looking like the real site, and it is never indexed. The
 * title and the site's icon stay, so a reviewer's tabs still read (an icon
 * is not a share card; DEC-121). On a live host the metadata is returned as
 * it was.
 */
export function shareable(
    site: { mode: SiteHostKind },
    meta: Metadata,
): Metadata {
    if (site.mode !== "test") return meta;
    return {
        title: meta.title,
        ...(meta.icons ? { icons: meta.icons } : {}),
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}
