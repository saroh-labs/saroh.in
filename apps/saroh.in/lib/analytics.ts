import type { LaunchMode, PlanId } from "@/lib/links";

/**
 * GA4 events for the marketing site (plan U18). GA itself loads in the root
 * layout; this only sends events through the `gtag` it defines.
 *
 * No personal data in any parameter: never an email, a business name, a
 * phone number or free text a visitor typed. Every parameter below is one of
 * a fixed set of values, which is how that is kept true.
 */
export interface AnalyticsEvents {
    cta_click: { plan?: string; page: string; mode: LaunchMode };
    waitlist_join: { kind: string; src: string; plan?: PlanId; ref?: boolean };
    referral_copy: Record<string, never>;
    pricing_toggle: { control: "yearly" | "gst"; value: boolean };
}

type Gtag = (command: "event", name: string, params: object) => void;

declare global {
    interface Window {
        gtag?: Gtag;
    }
}

/** Send one event. A no-op on the server, or where GA has not loaded. */
export function track<E extends keyof AnalyticsEvents>(
    name: E,
    params: AnalyticsEvents[E],
): void {
    if (typeof window === "undefined" || !window.gtag) return;
    // Drop undefined keys so GA does not record "(not set)" as a value.
    const clean = Object.fromEntries(
        Object.entries(params as Record<string, unknown>).filter(
            ([, v]) => v !== undefined,
        ),
    );
    window.gtag("event", name, clean);
}
