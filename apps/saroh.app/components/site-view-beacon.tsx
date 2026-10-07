"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { siteViewBody, siteViewUrl } from "@/lib/site-view";

/**
 * Tells the API a visitor opened a page of a live site (UX-032), once per
 * page, including pages reached without a full reload. The rules — what is
 * sent, and when nothing is — are `lib/site-view.ts`.
 *
 * Mounted only on a live host: never on a draft preview, a test release or
 * the review page, whose visits are not the business's.
 *
 * The request goes without credentials (no cookie is sent or set) and with
 * `keepalive`, so a view counted just before the visitor leaves still lands.
 * A failure is never the visitor's problem: it is dropped silently.
 */
export function SiteViewBeacon({
    siteId,
    apiUrl,
}: {
    siteId: string;
    apiUrl: string;
}) {
    const pathname = usePathname();

    useEffect(() => {
        const nav = navigator as Navigator & {
            globalPrivacyControl?: boolean;
        };
        const body = siteViewBody({
            path: pathname,
            referrer: document.referrer,
            ownHost: window.location.host,
            signals: {
                doNotTrack: nav.doNotTrack,
                globalPrivacyControl: nav.globalPrivacyControl,
            },
        });
        if (!body) return;
        void fetch(siteViewUrl(apiUrl, siteId), {
            method: "POST",
            mode: "cors",
            credentials: "omit",
            keepalive: true,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }).catch(() => {
            // A view that could not be counted changes nothing for the visitor.
        });
    }, [pathname, siteId, apiUrl]);

    return null;
}
