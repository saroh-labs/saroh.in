import { cn } from "../lib/utils";

/**
 * "Show as: List" (G16, R12): one item per row, with its photo, where it has
 * one, on the left — the Customer Site design's list pages, whose photo
 * column is `minmax(96px, 28%)` so it scales on a phone. Shared by the
 * blocks whose cards carry a photo (Product grid, Journal), so the two lists
 * look alike. Drawn from `--site-*` only (gate G2).
 */

/** A list row's card: the photo column only when there is a photo. */
export function listCard(withPhoto: boolean): string {
    return cn(
        "border-site-border bg-site-surface text-site-fg grid h-full min-w-0 overflow-hidden rounded-[calc(var(--site-radius)*1.4)] border",
        withPhoto && "[grid-template-columns:minmax(96px,28%)_minmax(0,1fr)]",
    );
}

/** The photo on a list row's left, as tall as the row. */
export const listPhoto = "h-full min-h-[120px] w-full object-cover";

/**
 * The merchant's words at the foot of a card that is itself the link, such
 * as "Read" (G16): drawn as the link's label, never a second link.
 */
export const cardLink =
    "text-site-accent mt-1 px-4 text-sm font-semibold underline-offset-4 group-hover:underline";
