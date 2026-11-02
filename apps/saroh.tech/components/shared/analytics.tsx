"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { site } from "@/site.config";

// A new id each visit, kept nowhere: no cookies or browser storage, no SDK,
// no autocapture (docs/architecture/ERROR_TRACKING_AND_UPTIME.md, rule 5).
// shortcut: one tab's visit counts as one person, until a consent notice exists.
const visit = typeof crypto !== "undefined" ? crypto.randomUUID() : "";

function send(event: string, properties: Record<string, unknown>) {
    if (!site.posthogKey) return;
    const body = JSON.stringify({
        api_key: site.posthogKey,
        event,
        distinct_id: visit,
        properties: {
            $process_person_profile: false,
            app: "tech",
            $current_url: location.origin + location.pathname,
            page_type:
                document
                    .querySelector("[data-page-type]")
                    ?.getAttribute("data-page-type") ?? "other",
            ...properties,
        },
    });
    // PostHog being slow or down never gets in the way.
    navigator.sendBeacon(`${site.posthogHost}/i/v0/e/`, body);
}

/** A page view, and a click on anything marked `data-cta`. No key, nothing. */
export function Analytics() {
    const pathname = usePathname();
    useEffect(() => send("$pageview", {}), [pathname]);
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            const cta = e.target
                .closest("[data-cta]")
                ?.getAttribute("data-cta");
            if (cta) send("cta_click", { cta });
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);
    return null;
}
