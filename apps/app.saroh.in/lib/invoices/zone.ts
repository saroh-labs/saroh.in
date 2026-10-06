import { DEFAULT_TIMEZONE } from "@/lib/invoices/invoice-number";

/**
 * The zone an invoice's dates are written in (#836): the business's, as the
 * paper the customer gets (the API's `paperDay`), never the viewer's or the
 * server's. No zone, an unreadable business, or a zone this runtime doesn't
 * know reads India's, as the API does.
 */
export function invoiceZone(
    business: { timeZone: string | null } | null | undefined,
): string {
    const zone = business?.timeZone;
    if (!zone) return DEFAULT_TIMEZONE;
    try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return zone;
    } catch {
        return DEFAULT_TIMEZONE;
    }
}
