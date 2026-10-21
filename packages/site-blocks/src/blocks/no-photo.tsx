import type { LookId } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { initialsOf } from "./look-front";

/**
 * What a block draws where a photo would be, when it has none (DEC-172,
 * R8, plan U6, #1094).
 *
 * A CUSTOMER NEVER SEES AN EMPTY FRAME, nor "No photo yet". A block with
 * no photo takes its no-photo layout: a type-led hero, a row without a
 * thumbnail, and a person's initials in place of a portrait. Only the
 * owner's preview (`isOwnerPreview`) says what is missing, where the photo
 * would go, so the business knows to add one.
 *
 * Drawn from `--site-*` only (gates G2 and G7).
 */

/** The initials plate's shape per look, as each board draws a person. */
const PLATE: Record<LookId, string> = {
    // VA01 / VA04: a square plate, the initials in the display face, light
    // and italic, on the card's surface with a hairline.
    folio: "rounded-site-s border border-site-border bg-site-surface font-site-heading font-light italic tracking-[-0.02em]",
    // VD01 / VD04: a circle in the accent's tint, the display face.
    quiet: "rounded-full bg-site-accent-soft font-site-heading font-medium tracking-[0.02em] [font-variant-numeric:lining-nums]",
    // VB01 / VB04: a round face in the accent's tint, heavy.
    live: "rounded-full bg-site-accent-soft font-site-heading font-extrabold tracking-[-0.02em]",
};

/**
 * A person's initials where their portrait would be (Phase 1: staff have a
 * name and a title, no photo). Decoration only: the name is always set
 * beside it as text, so the plate is `aria-hidden`. The caller gives its
 * size (`size-12`, `size-[96px]`) and the type size for it.
 */
export function InitialsPlate({
    name,
    look,
    className,
}: {
    name: string;
    look: LookId;
    className?: string;
}) {
    return (
        <span
            aria-hidden="true"
            data-initials-plate=""
            className={cn(
                "text-site-fg inline-flex shrink-0 select-none items-center justify-center leading-none",
                PLATE[look],
                className,
            )}
        >
            {initialsOf(name)}
        </span>
    );
}

/**
 * The owner's note where a photo would be: "No photo yet", in the owner's
 * preview only, never on a page a customer can reach. Anywhere else it
 * draws nothing, and the block lays itself out without the photo.
 *
 * `what` says which photo ("of the studio"), when the block knows the
 * brief the template wrote for it.
 */
export function OwnerPhotoNote({
    isOwnerPreview,
    what,
    className,
}: {
    isOwnerPreview?: boolean;
    what?: string | null;
    className?: string;
}) {
    if (!isOwnerPreview) return null;
    return (
        <p
            data-owner-photo-note=""
            className={cn(
                "border-site-rule bg-site-surface text-site-body rounded-site-photo flex min-h-11 flex-wrap items-center justify-center gap-x-2.5 gap-y-1 border border-dashed p-4 text-center text-[14px]",
                className,
            )}
        >
            <span className="bg-site-fg text-site-bg rounded-site-s inline-flex items-center px-2.5 py-1 text-[12px] font-medium tracking-[0.04em]">
                Only you see this
            </span>
            <span>
                No photo yet
                {what ? (
                    <span className="text-site-muted">: {what}</span>
                ) : null}
            </span>
        </p>
    );
}
