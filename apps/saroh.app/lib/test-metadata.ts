import type { Metadata } from "next";

import type { SiteHostKind } from "./site-host-mode";

/**
 * A page's metadata, as its host may carry it (DEC-071, R3).
 *
 * On a test release's host there is no share card: a link pasted into a chat
 * must not unfurl looking like the real site, and it is never indexed. The
 * title stays, so a reviewer's tabs still read. On a live host the metadata
 * is returned as it was.
 */
export function shareable(
    site: { mode: SiteHostKind },
    meta: Metadata,
): Metadata {
    if (site.mode !== "test") return meta;
    return {
        title: meta.title,
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}
