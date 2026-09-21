import type { InvitationState, ProductRating } from "./service";

/**
 * One catalogue row's rating. A row can be one product sold in several
 * storefronts (merged by SKU), so its reviews are the sum of theirs — a
 * weighted average, not an average of averages.
 */
export function rowRating(
    productIds: string[],
    ratings: Map<string, ProductRating>,
): { average: number; count: number } | null {
    let count = 0;
    let total = 0;
    for (const id of productIds) {
        const r = ratings.get(id);
        if (!r) continue;
        count += r.count;
        total += r.average * r.count;
    }
    return count === 0
        ? null
        : { average: Math.round((total / count) * 10) / 10, count };
}

/** "4.6 · 12", or "—" for a product nobody has reviewed. */
export function ratingLabel(
    r: { average: number; count: number } | null,
): string {
    return r ? `${r.average.toFixed(1)} · ${r.count}` : "—";
}

/** Where an order's invitation stands, as one sentence. */
export function invitationSentence(s: InvitationState): string {
    switch (s.state) {
        case "none":
            return "No one has been asked to review this order yet.";
        case "completed":
            return `Every item has been reviewed (${s.lines} of ${s.lines}).`;
        case "expired":
            return `The invitation expired with ${s.reviewed} of ${s.lines} reviewed.`;
        case "sent":
            return `Invitation sent — ${s.reviewed} of ${s.lines} reviewed so far.`;
    }
}

/** "★★★★☆" — the stars as text, with the number beside it for screen readers. */
export function stars(rating: number): string {
    return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}
