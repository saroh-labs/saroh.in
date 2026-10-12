import { cn } from "../lib/utils";

/**
 * Where a product's photo would be, when it has none and its neighbours do:
 * a quiet panel in the site's own accent, with the product's name set large
 * in the heading face, the way a label stands in for a picture on a shelf.
 *
 * A customer never reads "No photo yet": that is a note for the owner, and
 * the workspace is where it is said. A shop or a section with no photos at
 * all draws no panel either: its cards are text cards (see `ShopListing`
 * and the Product grid).
 *
 * Decoration only (`aria-hidden`): the card says the name itself, in full,
 * under the panel, so the panel may cut a long one short. The caller gives
 * it the photo's own box (`aspect-square`, `aspect-[4/5]`, a height), so a
 * row of photos and panels lines up. Drawn from `--site-*` only.
 */

/** The panel's ground: the accent, thinned into the card's surface. */
export const plateTint =
    "bg-[color-mix(in_srgb,hsl(var(--site-accent))_8%,hsl(var(--site-surface)))]";

export function NamePlate({
    name,
    large = false,
    className,
}: {
    name: string;
    /** A lead card's panel: the name a step larger. */
    large?: boolean;
    className?: string;
}) {
    return (
        <span
            aria-hidden="true"
            data-name-plate=""
            className={cn(
                "relative flex min-w-0 flex-col justify-end overflow-hidden p-3.5 sm:p-4",
                plateTint,
                className,
            )}
        >
            <span className="bg-site-accent absolute left-3.5 top-3.5 block h-0.5 w-7 sm:left-4 sm:top-4" />
            <span
                className={cn(
                    "font-site-heading text-site-fg line-clamp-4 font-semibold leading-[1.12] tracking-[-0.02em] [overflow-wrap:anywhere] [text-wrap:balance]",
                    large
                        ? "text-[calc(1.75rem*var(--site-heading-scale,1))]"
                        : "text-[calc(1.25rem*var(--site-heading-scale,1))] sm:text-[calc(1.375rem*var(--site-heading-scale,1))]",
                )}
            >
                {name}
            </span>
        </span>
    );
}
