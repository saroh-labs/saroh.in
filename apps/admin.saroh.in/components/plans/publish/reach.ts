import type { Impact } from "@/lib/pricing-types";

/**
 * "Who it reaches" on Review and publish (admin redesign U13, R24): how
 * many businesses come out better off, worse off, and paying a new price,
 * from the API's impact items (`GET /admin/pricing/impact`). A business is
 * counted once in each, however many items name it.
 *
 * - Better off: an item that gives more (`ok`): a module added, more room,
 *   a lower price.
 * - Worse off: an item that takes away (`danger`): a module taken off, or a
 *   business over a new, lower limit.
 * - A new price: the item whose title is a price change in the draft
 *   (`priceTitles`, the change log's own words, which the API's impact
 *   shares), up or down.
 */
export interface ReachCounts {
    better: number;
    worse: number;
    price: number;
}

export function reachCounts(
    impact: Impact,
    priceTitles: ReadonlySet<string>,
): ReachCounts {
    const better = new Set<string>();
    const worse = new Set<string>();
    const price = new Set<string>();
    for (const item of impact.items) {
        const ids = item.businesses.map((b) => b.id);
        if (item.tone === "ok") ids.forEach((id) => better.add(id));
        if (item.tone === "danger") ids.forEach((id) => worse.add(id));
        if (priceTitles.has(item.title)) ids.forEach((id) => price.add(id));
    }
    return { better: better.size, worse: worse.size, price: price.size };
}

export function businessesWord(n: number): string {
    if (n === 0) return "None";
    return n === 1 ? "1 business" : `${n} businesses`;
}
