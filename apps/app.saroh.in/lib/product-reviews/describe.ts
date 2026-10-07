import type { EmailNote } from "@/lib/communications/email-setup";
import { emailRefusalNote } from "@/lib/communications/email-setup";

import type {
    InvitationState,
    ProductRating,
    ReviewEmailSetup,
} from "./service";

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
        case "sending":
            return "Invitation sending — it shows as sent once your email provider accepts it.";
        case "failed":
            return "The last invitation couldn't be sent, so it didn't use one of the three. You can send it again.";
        case "sent":
            return `Invitation sent — ${s.reviewed} of ${s.lines} reviewed so far.`;
    }
}

/** "★★★★☆" — the stars as text, with the number beside it for screen readers. */
export function stars(rating: number): string {
    return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

/** The API's words for "no email provider" (`product-reviews.service.ts`). */
export const NO_PROVIDER_NOTE =
    "Review invitations go from your own email. Connect an email provider in Settings › Providers to send them.";
export const NO_PROVIDER_PLAN_NOTE =
    "Review invitations go from your own email, and connecting your own email needs a paid plan.";

export type ReviewEmailNote = EmailNote;

/**
 * What to lead with when invitations can't go (D11): connect the business's
 * own email, or, where the plan can't (Free, DEC-091), see the plans. Null
 * when they can go, or when it couldn't be read. The same note as every
 * refused send (`emailRefusalNote`), in review invitations' words.
 */
export function reviewEmailNote(
    setup: ReviewEmailSetup | null | undefined,
    may: { connect: boolean; plans: boolean },
): ReviewEmailNote | null {
    return emailRefusalNote(setup, may, {
        connect: NO_PROVIDER_NOTE,
        plans: NO_PROVIDER_PLAN_NOTE,
    });
}
