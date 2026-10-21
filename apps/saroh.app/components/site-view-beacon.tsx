"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
    registerVisitSender,
    seeVisitPage,
} from "@saroh/site-blocks/visit-source";

import { siteViewBody, siteViewUrl, visitStepBody } from "@/lib/site-view";

/**
 * Tells the API a visitor opened a page of a live site (UX-032), once per
 * page, including pages reached without a full reload. The rules — what is
 * sent, and when nothing is — are `lib/site-view.ts`.
 *
 * It also keeps the visit (U15): the first page counted begins one, in
 * this tab's memory only, and sends where it came from; the product, booking
 * and checkout pages send their step through the sender registered here
 * (`@saroh/site-blocks/visit-source`). A page that sends no view (a private
 * page, a browser that asks not to be tracked) begins no visit.
 *
 * Mounted only on a live host: never on a draft preview, a test release or
 * the review page, whose visits are not the business's. With no beacon
 * there is no sender, so no step is sent either.
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
        const send = (body: Record<string, unknown>) =>
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
        registerVisitSender((step, origin) =>
            send(visitStepBody(step, origin)),
        );
        seeVisitPage(Date.now(), {
            referrer: document.referrer,
            ownHost: window.location.host,
            search: window.location.search,
        });
        send(body);
    }, [pathname, siteId, apiUrl]);

    // Gone with the layout: nothing sends a step after it.
    useEffect(() => () => registerVisitSender(null), []);

    return null;
}
