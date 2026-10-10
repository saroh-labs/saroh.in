import { DEFAULT_TIMEZONE } from "@/lib/invoices/invoice-number";
import { isTimeZone } from "./datetime";

/**
 * The zone a business's times are written in (UX-008, #836): its own, never
 * the viewer's or the server's. Server and browser both know it, so a time
 * rendered on the server reads the same after hydration — the server's UTC
 * never reaches the page.
 *
 * No zone, an unreadable business, or a zone this runtime doesn't know
 * reads India's, as the API does.
 */
export function businessZone(
    business: { timeZone?: string | null } | null | undefined,
): string {
    const zone = business?.timeZone?.trim();
    return zone && isTimeZone(zone) ? zone : DEFAULT_TIMEZONE;
}

export { DEFAULT_TIMEZONE as DEFAULT_BUSINESS_ZONE };
