"use client";

import type { GuidesHubPage } from "@saroh/search-pages/pages";
import { GuidesHub } from "@saroh/search-pages/pages";

import { readAddress } from "@/lib/page-address";
import { useBrowserValue } from "@/lib/use-browser-value";

/**
 * /guides with its trade chips: the page is static, so `?for=` is read in
 * the browser (`readAddress`, which keeps it even after the address is cut
 * for the tags). The server, and the first draw, show All.
 */
export function GuidesHubFilter({
    pages,
    startFree,
    startFreeLabel,
    src,
}: {
    pages: GuidesHubPage[];
    startFree: string;
    startFreeLabel: string;
    src: string;
}) {
    const trade = useBrowserValue(
        () => new URLSearchParams(readAddress()).get("for"),
        null,
    );
    return (
        <GuidesHub
            pages={pages}
            trade={trade}
            links={{
                home: "/",
                hub: "/guides",
                page: (slug) => `/guides/${slug}`,
                startFree,
                startFreeLabel,
                src,
            }}
        />
    );
}
