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
    /** The reporter's own email and mobile number, both asked for (DEC-138). */
    email: string;
    phone: string;
}

export type ReportField = "site" | "message" | "email" | "phone";

export type ReportResult =
    | { sent: true }
    | {
          sent: false;
          failure: ReportField | "rate-limited" | "unavailable";
      };

/** The API's limits, checked here first so the form can say which field. */
export const REPORT_LIMITS = {
    site: 2048,
    message: 2000,
    email: 320,
    phone: 24,
} as const;
export const MESSAGE_MIN = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A website address someone could mean: a host with a dot, with or without
 * `https://` and a path. Loose on purpose; the API reads it properly.
 */
const ADDRESS =
    /^(?:https?:\/\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.?(?::\d+)?(?:[/?#]\S*)?$/i;

/**
 * A mobile number as people write one: digits with the spaces, brackets and
 * dashes between them, an optional leading +, and six digits at least. The
 * API's rule for a phone a customer types, word for word
 * (`common/customer-phone.ts`, which the report's DTO and service use), so
 * the page never lets through what the server then refuses. Kept as typed.
 */
export function phoneOk(value: string): boolean {
    const phone = value.trim();
    return (
        /^\+?[\d\s()-]{6,24}$/.test(phone) &&
        phone.replace(/\D/g, "").length >= 6
    );
}

/**
 * Which field is wrong, or null when the report can go: the first one in
 * the form's order, so the message and the keyboard go to the same place.
 */
export function reportProblem(input: {
    site: string;
    message: string;
    email: string;
    phone: string;
}): ReportField | null {
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
    if (!email || email.length > REPORT_LIMITS.email || !EMAIL.test(email)) {
        return "email";
    }
    if (!phoneOk(input.phone)) return "phone";
    return null;
}

const text = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

/**
 * The API body for what the page posted. Only these four fields go on, each
 * trimmed; anything else the page posts is dropped, and a field that is
 * missing or isn't text is "", which `reportProblem` then names.
 */
export function reportBody(posted: unknown): ReportBody {
    const p =
        typeof posted === "object" && posted !== null
            ? (posted as Record<string, unknown>)
            : {};
    return {
        site: text(p.site),
        message: text(p.message),
        email: text(p.email),
        phone: text(p.phone),
    };
}

/** The `?site=` a merchant site's "Report this business" link carries. */
export function prefilledSite(search: string): string {
    const site = new URLSearchParams(search).get("site")?.trim() ?? "";
    return site.length <= 253 ? site : "";
}
