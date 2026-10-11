/**
 * A customer's report about a business (/customers, Terms rev 46): what the
 * form sends to `/api/business-reports`, and what that route answers. The
 * route forwards to api.saroh.in's `POST /public/business-reports`, which
 * validates again and decides whether the address is a Saroh site — never
 * this page, and the answer never says.
 */

export interface ReportBody {
    site: string;
    message: string;
    email?: string;
}

export type ReportResult =
    | { sent: true }
    | {
          sent: false;
          failure:
              "site" | "message" | "email" | "rate-limited" | "unavailable";
      };

/** The API's limits, checked here first so the form can say which field. */
export const REPORT_LIMITS = { site: 2048, message: 2000, email: 320 } as const;
export const MESSAGE_MIN = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A website address someone could mean: a host with a dot, with or without
 * `https://` and a path. Loose on purpose; the API reads it properly.
 */
const ADDRESS =
    /^(?:https?:\/\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.?(?::\d+)?(?:[/?#]\S*)?$/i;

/** Which field is wrong, or null when the report can go. */
export function reportProblem(input: {
    site: string;
    message: string;
    email: string;
}): "site" | "message" | "email" | null {
    const site = input.site.trim();
    if (!site || site.length > REPORT_LIMITS.site || !ADDRESS.test(site)) {
        return "site";
    }
    const message = input.message.trim();
    if (
        message.length < MESSAGE_MIN ||
        message.length > REPORT_LIMITS.message
    ) {
        return "message";
    }
    const email = input.email.trim();
    if (email && (email.length > REPORT_LIMITS.email || !EMAIL.test(email))) {
        return "email";
    }
    return null;
}

const text = (value: unknown, max: number): string | undefined =>
    typeof value === "string" && value.trim() !== ""
        ? value.trim().slice(0, max)
        : undefined;

/**
 * The API body for what the page posted, or null when it isn't a report.
 * Only these three fields go on; anything else the page posts is dropped.
 */
export function reportBody(posted: unknown): ReportBody | null {
    if (typeof posted !== "object" || posted === null) return null;
    const p = posted as Record<string, unknown>;
    const site = text(p.site, REPORT_LIMITS.site);
    const message = text(p.message, REPORT_LIMITS.message);
    if (!site || !message) return null;
    const email = text(p.email, REPORT_LIMITS.email);
    return email ? { site, message, email } : { site, message };
}

/** The `?site=` a merchant site's "Report this business" link carries. */
export function prefilledSite(search: string): string {
    const site = new URLSearchParams(search).get("site")?.trim() ?? "";
    return site.length <= 253 ? site : "";
}
