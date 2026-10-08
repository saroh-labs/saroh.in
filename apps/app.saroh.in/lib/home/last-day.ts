import { formatMoney } from "@/lib/format/money";
import { kindOf } from "@/lib/organizations/kind";

import type { HomeLastDay, HomeSinceItem } from "./service";

/**
 * Home's header (round 2, F6), in words: "Good morning, Priya", "Friday 18
 * September · Rye & Co.", and the "Last 24 hours" links. The clock and the
 * date are the business's, sent by the API (DEC-033); the name is the
 * viewer's own. Pure, so it is tested without a page.
 */

/** Titles that come before a name and aren't what anyone is called by. */
const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "shri"]);

/** "Meenakshi" from "Dr. Meenakshi Rao"; null when there is no name. */
export function firstName(name: string | null | undefined): string | null {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const word = words.find(
        (w) => !TITLES.has(w.replace(/\.$/, "").toLowerCase()),
    );
    return word ?? (words.length > 0 ? words[0] : null);
}

/**
 * "Good morning, Priya" in the business's part of the day, or "Welcome,
 * Priya" for a business that has yet to sell, book or be paid. Without the
 * header (an older API) it says hello without guessing the hour.
 */
export function greeting(
    lastDay: HomeLastDay | null,
    name: string | null | undefined,
): string {
    const first = firstName(name);
    const hello = !lastDay
        ? "Hello"
        : lastDay.fresh
          ? "Welcome"
          : `Good ${lastDay.partOfDay}`;
    return first ? `${hello}, ${first}` : hello;
}

/**
 * "Friday 18 September · Rye & Co.", the business's date; for a new
 * business, what the first job is, in its kind's words (DEC-070, UX-074):
 * a site for someone's work is got online, not ready to take money. A staff
 * member's Home narrowed to their storefronts adds them (F11): "… · Rye &
 * Co. · Hill Road only".
 */
export function dateLine(
    lastDay: HomeLastDay | null,
    businessName: string,
    only: string | null = null,
    kind: unknown = "BUSINESS",
): string {
    const where = only ? `${businessName} · ${only}` : businessName;
    if (!lastDay) return where;
    if (lastDay.fresh) return firstRunLine(businessName, kind);
    // The date is already the business's; read it as a calendar day.
    const day = new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
    })
        .format(new Date(`${lastDay.date}T00:00:00Z`))
        // en-GB writes "Friday 18 September" or, in some ICU builds,
        // "Friday, 18 September"; the design has no comma.
        .replace(",", "");
    return `${day} · ${where}`;
}

/** What a new business, person or site is getting ready for. */
function firstRunLine(name: string, kind: unknown): string {
    switch (kindOf(kind)) {
        case "WORK":
            return `Let's get ${name} online.`;
        case "SOLO":
            return `Let's get ${name} ready for clients.`;
        default:
            return `Let's get ${name} ready to take money.`;
    }
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

/** What one figure says: "3 new orders", "₹12,400 taken". */
export function sinceLabel(item: HomeSinceItem): string {
    switch (item.kind) {
        case "ORDERS":
            return plural(item.count, "new order", "new orders");
        case "BOOKINGS":
            return plural(item.count, "new booking", "new bookings");
        case "REVIEWS":
            return plural(item.count, "review", "reviews");
        case "PAYMENTS":
            return `${formatMoney(item.amountMinor, item.currency) ?? item.count} taken`;
    }
}

/**
 * The strip's links, or none: a new business has no strip, and neither
 * does a quiet day — the design draws nothing rather than a row of zeros.
 */
export function sinceLinks(
    lastDay: HomeLastDay | null,
): { key: string; label: string; href: string }[] {
    if (!lastDay || lastDay.fresh) return [];
    return lastDay.items.map((item) => ({
        key: `${item.kind}:${item.currency ?? ""}`,
        label: sinceLabel(item),
        href: item.href,
    }));
}
