import type { LookId } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";

/**
 * The shapes a look's booking frames draw with (DEC-172, U10), from
 * `--site-*` only (gate G2).
 *
 * THE RADIUS RULE (U4 "Corners"): `--site-radius` is a look's buttons and
 * inputs — a pill under Quiet — so a frame's cards, rows and fields take
 * `rounded-site-s`, and only its buttons take the pill. The steps the
 * frames share with Classic (the day strip, the times, a way to pay) round
 * themselves as `var(--site-radius)` plus a little; inside a frame that
 * variable is moved to the look's small radius less that little
 * ({@link FRAME_RADII}), so they come out as the look's small corner —
 * square under Folio — never a pill. The pill itself is kept as
 * `--site-book-pill` for the frame's own buttons.
 */

/** Set on the frame's outer box, so the pill survives the inner change. */
export const FRAME_PILL = {
    "--site-book-pill": "var(--site-radius)",
} as React.CSSProperties;

/** Set on the box inside it: the shared steps' corners, made small. */
export const FRAME_RADII = {
    "--site-radius": "calc(var(--site-radius-s, 0px) - 10px)",
} as React.CSSProperties;

/** The frame's one filled button: the step's action. */
export function lookPrimary(blocked: boolean): string {
    return cn(
        "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--site-book-pill,var(--site-radius-s))] px-6 text-[15.5px] font-semibold",
        LOOK_RING,
        LOOK_EASE,
        blocked
            ? "bg-[color-mix(in_srgb,hsl(var(--site-fg))_10%,hsl(var(--site-bg)))] text-site-body cursor-not-allowed"
            : "bg-site-accent text-site-accent-fg hover:opacity-90 active:opacity-80",
    );
}

/** An outline button beside it: Add to calendar's neighbours, Directions. */
export const lookOutline = cn(
    "border-site-fg text-site-fg inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--site-book-pill,var(--site-radius-s))] border bg-transparent px-5 text-[14.5px] font-semibold hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,transparent)]",
    LOOK_RING,
    LOOK_EASE,
);

/** A text action, 44px tall under any pointer: Change, Send a new code. */
export const lookLink = cn(
    "text-site-fg inline-flex min-h-11 cursor-pointer items-center rounded-sm text-[14px] font-semibold underline decoration-1 underline-offset-[3px] hover:decoration-2",
    LOOK_RING,
);

/** A frame's icon button: Back, Close. 44px. */
export const lookIcon = cn(
    "text-site-fg inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,transparent)]",
    LOOK_RING,
    LOOK_EASE,
);

/** A field: 17px type, so a phone never zooms into it. */
export const lookField = cn(
    "border-site-border bg-site-surface text-site-fg placeholder:text-site-muted block h-12 rounded-site-s border px-3.5 text-[17px] read-only:bg-transparent",
    LOOK_RING,
);

/** A field that holds a wrong answer: its edge says so, with the words. */
export const lookFieldBad = "border-site-fg border-2";

/** A choice row (a service, a person, a way to pay): a real radio. */
export function lookRow(on: boolean): string {
    return cn(
        "text-site-fg flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-site-s border px-4 py-3 text-left",
        LOOK_RING,
        LOOK_EASE,
        on
            ? "border-site-fg bg-site-accent-soft shadow-[inset_0_0_0_1px_hsl(var(--site-fg))]"
            : "border-site-border bg-site-surface hover:border-site-fg",
    );
}

/** The dot of a choice row: filled when chosen. */
export function lookDot(on: boolean): string {
    return cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
        on ? "border-site-fg" : "border-site-muted",
    );
}

/** The heading of a step, per look's type. */
export const STEP_HEADING: Record<LookId, string> = {
    // VA08: the display face, light, beside the sentence.
    folio: "font-site-heading text-[calc(1.5rem*var(--site-heading-scale,1))] font-light leading-tight tracking-[-0.015em]",
    // VD08: large, centred, the display face.
    quiet: "font-site-heading text-center text-[calc(2.25rem*var(--site-heading-scale,1))] font-normal leading-[1.08] tracking-[-0.02em] min-[700px]:text-[calc(3rem*var(--site-heading-scale,1))]",
    // VB08: heavy and tight.
    live: "font-site-heading text-[calc(2rem*var(--site-heading-scale,1))] font-extrabold leading-[1.04] tracking-[-0.03em]",
};
