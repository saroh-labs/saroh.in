import {
    daysUntil,
    formatRelative,
    formatWeekday,
} from "@/lib/format/datetime";
import type { ShareItem } from "@/lib/share-item/share";

import type { PickRow } from "./pick";

/**
 * Social's "Worth posting today" and the first-visit picks (boards
 * BSocialHome*, BSocialEmpty*): what is worth a post now, read only from
 * what the business has live. Never "not posted yet": Saroh doesn't record
 * a share it didn't make. Pure.
 */

export interface Suggestion {
    /** The pick row's key, opened by Make this post. */
    key: string;
    item: ShareItem;
    title: string;
    line: string;
}

/** A row that can be shared, with its item. */
type LiveRow = PickRow & { item: ShareItem };
const live = (rows: readonly PickRow[]) =>
    rows.filter((r): r is LiveRow => r.item !== null);

const DAY = 86_400_000;
const within = (iso: string, days: number, now: Date) =>
    iso !== "" && now.getTime() - new Date(iso).getTime() <= days * DAY;

/**
 * Up to three: an offer that ends within the week (soonest first), then the
 * newest product or blog post changed in the last week.
 */
export function worthPosting(
    rows: readonly PickRow[],
    timeZone: string,
    now: Date = new Date(),
): Suggestion[] {
    const out: Suggestion[] = [];
    const ending = live(rows)
        .filter((r) => r.kind === "offer")
        // An offer row's `at` is when it ends ("" with no end).
        .map((r) => ({ r, ends: r.at }))
        .filter(
            (o) =>
                o.ends !== "" &&
                new Date(o.ends).getTime() > now.getTime() &&
                daysUntil(o.ends, now) <= 7,
        )
        .sort((a, b) => a.ends.localeCompare(b.ends));
    for (const { r, ends } of ending) {
        const days = Math.max(1, daysUntil(ends, now));
        out.push({
            key: r.key,
            item: r.item,
            title: `${r.name} ends ${formatWeekday(ends, timeZone)}`,
            line: `A post today gives it ${days === 1 ? "a day" : `${days} days`}.`,
        });
    }
    for (const r of live(rows)) {
        if (out.length >= 3) break;
        if (r.kind !== "product" && r.kind !== "post") continue;
        if (!within(r.at, 7, now)) continue;
        out.push({
            key: r.key,
            item: r.item,
            title: `New: ${r.name}`,
            line:
                r.kind === "post"
                    ? `On your blog since ${formatRelative(r.at, now)}.`
                    : `Changed ${formatRelative(r.at, now)}. Let people know.`,
        });
    }
    return out.slice(0, 3);
}

export interface FirstPick {
    key: string;
    item: ShareItem;
    name: string;
    why: string;
}

/**
 * The first visit's ready posts: the newest live product (one with a photo
 * first), a live offer, and the newest of anything else, then "Your own
 * post" is drawn beside them by the page.
 */
export function firstPicks(rows: readonly PickRow[], max = 2): FirstPick[] {
    const all = live(rows);
    const products = all.filter((r) => r.kind === "product");
    const product = products.find((r) => r.item.hasPhoto) ?? products.at(0);
    const offer = all.find((r) => r.kind === "offer") ?? null;
    const picked: { r: LiveRow; why: string }[] = [];
    if (product) picked.push({ r: product, why: "From your shop" });
    if (offer) picked.push({ r: offer, why: "Your offer" });
    for (const r of all) {
        if (picked.length >= max) break;
        if (picked.some((p) => p.r.key === r.key)) continue;
        picked.push({ r, why: WHY[r.kind] });
    }
    return picked.slice(0, max).map(({ r, why }) => ({
        key: r.key,
        item: r.item,
        name: r.name,
        why,
    }));
}

const WHY: Record<PickRow["kind"], string> = {
    product: "From your shop",
    service: "From your bookings",
    post: "From your blog",
    offer: "Your offer",
    book: "Your booking page",
};
