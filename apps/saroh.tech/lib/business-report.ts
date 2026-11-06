/**
 * A customer's report about a business (/customers). saroh.tech is static, so
 * the browser posts straight to the API's public `POST /public/business-reports`,
 * which answers any origin without credentials, limits by the caller's address,
 * and checks every field again. The answer never says whether the address is a
 * Saroh site.
 */
export type ReportField = "site" | "message" | "email" | "phone";
export type ReportBody = Record<ReportField, string>;
export type ReportResult = "sent" | "rate-limited" | "unavailable" | "site";

export const REPORT_LIMITS: Record<ReportField, number> = {
    site: 2048,
    message: 2000,
    email: 320,
    phone: 24,
};

const MESSAGE_MIN = 10;
const ADDRESS =
    /^(?:https?:\/\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.?(?::\d+)?(?:[/?#]\S*)?$/i;
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** With its country code: the API reads a number with no + as an Indian one. */
export const phoneOk = (phone: string) =>
    /^\+[\d\s()-]{6,23}$/.test(phone) && phone.replace(/\D/g, "").length >= 6;

/** The first field at fault, in the form's order, or null when it can go. */
export function reportProblems(input: ReportBody): ReportField[] {
    const bad: ReportField[] = [];
    if (!ADDRESS.test(input.site) || input.site.length > REPORT_LIMITS.site) {
        bad.push("site");
    }
    if (
        input.message.length < MESSAGE_MIN ||
        input.message.length > REPORT_LIMITS.message
    ) {
        bad.push("message");
    }
    if (!EMAIL.test(input.email) || input.email.length > REPORT_LIMITS.email) {
        bad.push("email");
    }
    if (!phoneOk(input.phone)) bad.push("phone");
    return bad;
}

/** The `?site=` a merchant site's "Report" link carries. */
export function prefilledSite(search: string): string {
    const site = new URLSearchParams(search).get("site")?.trim() ?? "";
    return site.length <= 253 ? site : "";
}

/** What the page checks first, the API still may refuse: only the address. */
export async function sendReport(
    apiUrl: string,
    body: ReportBody,
): Promise<ReportResult> {
    try {
        const res = await fetch(`${apiUrl}/public/business-reports`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (res.ok) return "sent";
        if (res.status === 429) return "rate-limited";
        return res.status === 400 ? "site" : "unavailable";
    } catch {
        return "unavailable";
    }
}
