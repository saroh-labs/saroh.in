import { localDateKey } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";

import type { HomeBooking, HomeNeed, HomeUnavailable } from "./service";

/**
 * Needs you's words (round 2, F3), kept out of the component so they can be
 * tested: where a row's money goes, how many rows show before "See all",
 * and which of the three states the list is in. The ranking itself is the
 * API's (`home-needs.ts`); nothing here re-orders a row.
 *
 * Pure display: no server imports, safe in server and client components.
 */

/** Rows shown before "See all N" (default 121). */
export const NEEDS_SHOWN = 12;

/** "₹4,800 overdue from Farah Khan": the title, with its money when it leads. */
export function needTitle(need: HomeNeed): string {
    const money =
        need.amountIn === "title"
            ? formatMoney(need.amountMinor, need.currency)
            : null;
    return money ? `${money} ${need.title}` : capitalise(need.title);
}

/** "₹1,500 · The charge was declined.": the line, with its money first. */
export function needLine(need: HomeNeed): string | null {
    const money =
        need.amountIn === "sub"
            ? formatMoney(need.amountMinor, need.currency)
            : null;
    const parts = [money, need.sub].filter(
        (p): p is string => typeof p === "string" && p.length > 0,
    );
    return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * A title that lost the money it was written to follow still starts a
 * sentence: "overdue from Farah Khan" reads "Overdue from Farah Khan".
 */
function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 thing", "4 things"; nothing for none, as the design leaves it blank. */
export function thingsLabel(n: number): string {
    if (n <= 0) return "";
    return n === 1 ? "1 thing" : `${n} things`;
}

/** The rows to draw: the first twelve, or every one once asked for. */
export function shownNeeds(
    needs: readonly HomeNeed[],
    expanded: boolean,
): { rows: readonly HomeNeed[]; more: boolean } {
    if (expanded || needs.length <= NEEDS_SHOWN) {
        return { rows: needs, more: false };
    }
    return { rows: needs.slice(0, NEEDS_SHOWN), more: true };
}

/**
 * Which state Needs you is in.
 *
 * - `list`: there is something to do.
 * - `clear`: nothing, and every source was read — the only time "Nothing
 *   needs you" may be said.
 * - `unknown`: nothing from the parts that answered, but a part didn't, so
 *   all Home can say is what it couldn't check (saroh-product-states).
 */
export function needsState(
    needs: readonly HomeNeed[],
    unavailable: readonly HomeUnavailable[],
): "list" | "clear" | "unknown" {
    if (needs.length > 0) return "list";
    return unavailable.length > 0 ? "unknown" : "clear";
}

/** "Open orders", "Open orders and Stock", "A, B and C". */
export function formatList(labels: readonly string[]): string {
    if (labels.length <= 1) return labels[0] ?? "";
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The line after "Nothing needs you.": the next booking today, in its own
 * zone, or the design's "Enjoy the quiet." when there is none.
 */
export function nextLine(upcoming: readonly HomeBooking[], now: Date): string {
    const next = upcoming.find(
        (b) =>
            new Date(b.startAt) >= now &&
            localDateKey(b.startAt, b.timezone) ===
                localDateKey(now, b.timezone),
    );
    if (!next) return "Enjoy the quiet.";
    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: next.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(next.startAt));
    return `Next: ${time} ${next.serviceName}.`;
}
