import type { LaunchMode, PlanId } from "@/lib/links";
import { cleanUrl } from "@/lib/page-address";
import { analyticsDestination } from "@/lib/tags";

/**
 * GA4 events for the marketing site (plan U18). GA itself loads from the
 * root layout (`app/site-tags.tsx`, `lib/tags.ts`); this only sends events
 * through the `gtag` that defines.
 *
 * No personal data in any parameter: never an email, a business name, a
 * phone number or free text a visitor typed. Every parameter below is one of
 * a fixed set of values, which is how that is kept true.
 */
export interface AnalyticsEvents {
    /** `template`: a gallery template's slug, a fixed set (`content/templates.ts`). */
    cta_click: {
        plan?: string;
        page: string;
        mode: LaunchMode;
        template?: string;
    };
    waitlist_join: {
        kind: string;
        src: string;
        plan?: PlanId;
        ref?: boolean;
        template?: string;
    };
    referral_copy: Record<string, never>;
    pricing_toggle: { control: "yearly" | "gst"; value: boolean };
    /** A Help article's "Did this help?": its slug, and yes or no. */
    help_vote: { article: string; helpful: "yes" | "no" };
}

/**
 * Send one event to Google Analytics. A no-op on the server, where GA has
 * not loaded, and where the visitor hasn't accepted visit counts
 * (`lib/tags.ts`). The event names its destination, so it goes to Analytics
 * alone and never to the Google Ads account that shares the tag (DEC-127).
 */
export function track<E extends keyof AnalyticsEvents>(
    name: E,
    params: AnalyticsEvents[E],
): void {
    if (typeof window === "undefined" || !window.gtag) return;
    const to = analyticsDestination();
    if (!to) return;
    // Drop undefined keys so GA does not record "(not set)" as a value.
    const clean = Object.fromEntries(
        Object.entries(params as Record<string, unknown>).filter(
            ([, v]) => v !== undefined,
        ),
    );
    window.gtag("event", name, {
        ...clean,
        send_to: to,
        page_location: cleanUrl(window.location.href),
    });
}
