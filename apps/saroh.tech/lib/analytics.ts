import { site } from "@/site.config";

// A new id each visit, kept nowhere: no cookies or browser storage, no SDK,
// no autocapture (docs/architecture/ERROR_TRACKING_AND_UPTIME.md, rule 5).
// shortcut: one tab's visit counts as one person, until a consent notice exists.
const visit = typeof crypto !== "undefined" ? crypto.randomUUID() : "";

/** No key, nothing sent. PostHog being slow or down never gets in the way. */
export function track(event: string, properties: Record<string, unknown> = {}) {
    if (!site.posthogKey) return;
    navigator.sendBeacon(
        `${site.posthogHost}/i/v0/e/`,
        JSON.stringify({
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
        }),
    );
}
