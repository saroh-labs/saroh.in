/**
 * The window event that reopens a site's cookie banner (DEC-108). The
 * footer's "Cookie choices" fires it; the renderer's trackers listen. A
 * plain module (no "use client"), so server and client code share it.
 */
export const SITE_CONSENT_OPEN_EVENT = "site-consent:open";

/** Set on the page while the banner shows: its height, for fixed bars. */
export const SITE_CONSENT_OFFSET = "--site-consent-offset";

/**
 * Marks an element that holds a customer's details (DEC-108): session
 * recordings mask it (Clarity reads the attribute, PostHog the class), so
 * nothing typed or shown there reaches a merchant's tracker. Put on the
 * booking flow, the enquiry form, the sign-in sheet and the shop's sheets.
 */
export const NO_CAPTURE_CLASS = "ph-no-capture";
export const NO_CAPTURE_ATTRS = { "data-clarity-mask": "true" } as const;
