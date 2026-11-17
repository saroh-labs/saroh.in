import type { HomeModel } from "./service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** News waits while any order is more than this many days late (owner, 15 Nov). */
export const NEWS_HELD_AFTER_DAYS = 3;

/**
 * How many days the oldest late order has been waiting, by the API's own
 * count ("Late · 24 days" runs from when it was placed), or null with
 * nothing late. Its rows come late first, oldest first, so the group's
 * oldest is the oldest late one.
 */
export function oldestLateDays(
    home: Pick<HomeModel, "needGroups">,
    now: Date,
): number | null {
    const orders = home.needGroups?.find((g) => g.kind === "ORDERS");
    const at = orders && orders.late > 0 ? orders.oldest?.at : null;
    if (!at) return null;
    return Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / DAY_MS));
}

/**
 * Home's news line (a new feature) is held back while any order is more
 * than 3 days late: the work comes first (owner decision, 15 Nov).
 */
export function holdsNews(
    home: Pick<HomeModel, "needGroups">,
    now: Date,
): boolean {
    return (oldestLateDays(home, now) ?? 0) > NEWS_HELD_AFTER_DAYS;
}
