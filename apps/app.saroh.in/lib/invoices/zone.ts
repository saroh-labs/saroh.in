import { businessZone } from "@/lib/format/business-zone";

/**
 * The zone an invoice's dates are written in (#836): the business's, as the
 * paper the customer gets (the API's `paperDay`), never the viewer's or the
 * server's. The one business-zone rule every server-rendered time follows
 * (`businessZone`, UX-008).
 */
export function invoiceZone(
    business: { timeZone: string | null } | null | undefined,
): string {
    return businessZone(business);
}
