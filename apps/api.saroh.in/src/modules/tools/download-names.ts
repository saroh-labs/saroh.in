/**
 * saroh.in's free downloads the gate takes, slug → name, as each download's
 * page names it (`packages/search-pages/content/downloads/<slug>.mdx`).
 *
 * The gate's email names the download and links to it from here, never
 * from the request: a slug not in this list is refused as unknown
 * (`download-gate.controller.ts`). A test in `@saroh/search-pages`
 * (`download-names.test.ts`) reads this file as text and holds every
 * download page's slug and name to it, so keep one `"slug": "Name",` per line.
 */
export const DOWNLOAD_NAMES: Readonly<Record<string, string>> = {
    "appointment-book": "Appointment book",
    "bill-of-supply-format": "Bill of supply format",
    "customer-list-template": "Customer list",
    "gst-invoice-format": "GST invoice format",
    "receipt-format": "Receipt format",
    "salon-rate-card": "Salon rate card",
};

/** The slugs the gate takes. */
export const DOWNLOAD_SLUGS = Object.keys(DOWNLOAD_NAMES);

/** The downloads on saroh.in (the canonical host). */
export const DOWNLOADS_URL = "https://www.saroh.in/downloads";

/**
 * The version of the consent line the gate shows beside the field
 * (`DownloadGate` in `@saroh/search-pages`). Change it with that line.
 */
export const DOWNLOAD_CONSENT_VERSION = "2026-10-31";
