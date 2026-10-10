"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { browserTracking } from "@/lib/error-tracking-browser";
import { isPreviewPath } from "@/lib/pricing-preview";
import { isTeamBrowser } from "@/lib/team-browser";

import { useAnalyticsConsent } from "./google-analytics";

/** The team cookie is set by a page load, never while a page is open. */
const NO_CHANGES = () => () => undefined;
const teamBrowser = () => isTeamBrowser(document.cookie);

/**
 * Session replay on saroh.in (DEC-125, owner 10 Oct): how visitors use the
 * site, so we can see what is unclear. Draws nothing.
 *
 * It records only when every one of these holds:
 *
 *  - it is switched on for this deployment (`on`: a PostHog key and
 *    `NEXT_PUBLIC_POSTHOG_REPLAY=on`, which only production sets);
 *  - the visitor accepted the cookie notice, and the notice they accepted
 *    said it records (`useAnalyticsConsent`): the same answer Google
 *    Analytics waits for. Before an answer, after "Refuse", and after
 *    "Cookie choices" forgets it, nothing is loaded; taking the answer
 *    back stops the recorder at once;
 *  - it is not a Saroh team browser (`saroh_team=1`);
 *  - the browser sends neither Do Not Track nor Global Privacy Control
 *    (checked by the tracker itself, `siteReplayDecision`);
 *  - it is not a pricing draft preview: a staff check is not a visit.
 *
 * What a recording holds is set in `@saroh/error-tracking/browser`
 * (`siteReplayConfig`): the page's own text and pictures, every input
 * masked, no network, no console, nobody identified, nothing stored in the
 * browser. The recorder is part of this app's bundle and is fetched only
 * when a recording is allowed to start.
 */
export function SiteReplay({ on }: { on: boolean }) {
    const pathname = usePathname();
    const choice = useAnalyticsConsent(on);
    const team = useSyncExternalStore(NO_CHANGES, teamBrowser, () => true);
    const preview = isPreviewPath(pathname);
    const allowed = on && !preview && !team && choice === "granted";

    useEffect(() => {
        const tracking = browserTracking;
        if (!tracking) return;
        if (!allowed) {
            // Refused, forgotten, or a page that is never recorded.
            tracking.stopReplay();
            return;
        }
        void tracking.startSiteReplay({
            consent: "granted",
            teamBrowser: false,
        });
        return () => {
            tracking.stopReplay();
        };
    }, [allowed]);

    return null;
}
