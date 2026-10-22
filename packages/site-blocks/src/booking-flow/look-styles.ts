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

/**
 * The frame's one filled button: the step's action. Each look's board
 * sizes it (VD08 `.btn`, VA08 `.btn`, VB08 `.btn-l`); the frames call this
 * without the look, so the sizes ride the page root's `data-site-look`.
 */
export function lookPrimary(blocked: boolean): string {
    return cn(
        "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--site-book-pill,var(--site-radius-s))] px-6 text-[15.5px] font-semibold",
        "[[data-site-look=quiet]_&]:min-h-[52px] [[data-site-look=quiet]_&]:px-[30px] [[data-site-look=quiet]_&]:text-[15px] [[data-site-look=quiet]_&]:font-medium [[data-site-look=quiet]_&]:tracking-[0.02em]",
        "[[data-site-look=folio]_&]:min-h-[52px] [[data-site-look=folio]_&]:px-[26px] [[data-site-look=folio]_&]:text-[15px] [[data-site-look=folio]_&]:tracking-[0.02em]",
        "[[data-site-look=live]_&]:min-h-[58px] [[data-site-look=live]_&]:px-[26px] [[data-site-look=live]_&]:text-[17px] [[data-site-look=live]_&]:font-bold",
        LOOK_RING,
        LOOK_EASE,
        blocked
            ? "bg-[color-mix(in_srgb,hsl(var(--site-fg))_10%,hsl(var(--site-bg)))] text-site-body cursor-not-allowed [[data-site-look=folio]_&]:bg-site-border [[data-site-look=folio]_&]:text-site-muted"
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

/**
 * A field: 17px type, so a phone never zooms into it. Sized per board
 * (VD08 `.inp` 54px on the control edge, VA08 52px on an ink line over the
 * page, VB08 54px with a 1.5px inset edge), by the page root's look.
 */
export const lookField = cn(
    "border-site-border bg-site-surface text-site-fg placeholder:text-site-muted block h-12 rounded-site-s border px-3.5 text-[17px] read-only:bg-transparent",
    "[[data-site-look=quiet]_&]:border-site-rule [[data-site-look=quiet]_&]:h-[54px] [[data-site-look=quiet]_&]:px-[18px]",
    "[[data-site-look=folio]_&]:border-site-fg [[data-site-look=folio]_&]:bg-site-bg [[data-site-look=folio]_&]:h-[52px] [[data-site-look=folio]_&]:px-4",
    "[[data-site-look=live]_&]:h-[54px] [[data-site-look=live]_&]:border-0 [[data-site-look=live]_&]:px-4 [[data-site-look=live]_&]:shadow-[inset_0_0_0_1.5px_hsl(var(--site-border))]",
    LOOK_RING,
);

/** A field that holds a wrong answer: its edge says so, with the words. */
export const lookFieldBad = "border-site-fg border-2";

/**
 * A step's choices (a service, a person, a way to pay) as each look's board
 * draws them: real radios in a radiogroup, 44px or more.
 *
 * - Quiet (VD08 `.li`): hairline rows, the display face's name, the radio
 *   last, after the price; chosen fills ink inside a ring.
 * - Folio (VA08 `.li`): hairline rows, a light display name, the price and
 *   an arrow; no radio, the chosen row is the soft accent.
 * - Live (VB08 `.radio`): cards with a 1.5px inset edge, the radio first;
 *   chosen draws a 2px ink edge, never a fill.
 */
export interface LookChoice {
    /** The gap between rows. */
    list: string;
    /** A group's label: Classes, One to one. */
    label: string;
    row: (on: boolean) => string;
    name: string;
    meta: string;
    price: string;
    /** Where the chosen mark sits: a radio first or last, or an arrow. */
    mark: "start" | "end" | "arrow";
    dot: (on: boolean) => string;
}

const HAIRLINE_ROW =
    "text-site-fg flex min-h-14 w-full cursor-pointer items-center gap-x-6 border-b border-site-border text-left";

export const LOOK_CHOICE: Record<LookId, LookChoice> = {
    quiet: {
        list: "grid",
        label: "text-site-muted pb-2 pt-7 text-xs font-medium uppercase tracking-[0.22em] first:pt-0",
        row: (on) =>
            cn(
                HAIRLINE_ROW,
                "py-5 min-[700px]:py-6",
                LOOK_RING,
                LOOK_EASE,
                on &&
                    "bg-site-accent-soft border-b-transparent shadow-[-24px_0_0_hsl(var(--site-accent-soft)),24px_0_0_hsl(var(--site-accent-soft))]",
            ),
        name: "font-site-heading block text-[23px] font-normal leading-[1.2] min-[700px]:text-[28px]",
        meta: "text-site-muted mt-0.5 block text-[14.5px]",
        price: "whitespace-nowrap font-medium tabular-nums",
        mark: "end",
        dot: (on) =>
            cn(
                "size-6 shrink-0 rounded-full border",
                on
                    ? "border-site-fg bg-site-fg shadow-[inset_0_0_0_6px_hsl(var(--site-bg))]"
                    : "border-site-rule",
            ),
    },
    folio: {
        list: "grid",
        label: "text-site-muted pb-1.5 text-xs font-semibold uppercase tracking-[0.18em]",
        row: (on) =>
            cn(
                HAIRLINE_ROW,
                "py-5",
                LOOK_RING,
                LOOK_EASE,
                on &&
                    "bg-site-accent-soft shadow-[-20px_0_0_hsl(var(--site-accent-soft)),20px_0_0_hsl(var(--site-accent-soft))]",
            ),
        name: "font-site-heading block text-[20px] font-light leading-[1.2] tracking-[-0.01em] min-[700px]:text-[24px]",
        meta: "text-site-muted mt-0.5 block text-[14px]",
        price: "whitespace-nowrap font-semibold tabular-nums",
        mark: "arrow",
        dot: () => "",
    },
    live: {
        list: "grid gap-2",
        label: "text-site-muted text-[13px] font-bold tracking-[0.02em]",
        row: (on) =>
            cn(
                "text-site-fg bg-site-surface flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-[18px] p-4 text-left",
                LOOK_RING,
                LOOK_EASE,
                on
                    ? "shadow-[inset_0_0_0_2px_hsl(var(--site-fg))]"
                    : "shadow-[inset_0_0_0_1.5px_hsl(var(--site-border))]",
            ),
        name: "block text-base font-bold",
        meta: "text-site-muted mt-0.5 block text-[14px]",
        price: "whitespace-nowrap font-bold tabular-nums",
        mark: "start",
        dot: (on) =>
            cn(
                "size-[22px] shrink-0 rounded-full",
                on
                    ? "shadow-[inset_0_0_0_7px_hsl(var(--site-fg))]"
                    : "shadow-[inset_0_0_0_2px_hsl(var(--site-muted))]",
            ),
    },
};

/** The heading of a step, per look's type. */
export const STEP_HEADING: Record<LookId, string> = {
    // VA08: the display face, light, beside the sentence.
    folio: "font-site-heading text-[calc(1.5rem*var(--site-heading-scale,1))] font-light leading-tight tracking-[-0.015em]",
    // VD08: large, centred, the display face.
    quiet: "font-site-heading text-center text-[calc(2.25rem*var(--site-heading-scale,1))] font-normal leading-[1.08] tracking-[-0.02em] min-[700px]:text-[calc(3.5rem*var(--site-heading-scale,1))] min-[700px]:font-light min-[700px]:leading-[1.05] min-[700px]:tracking-[-0.01em]",
    // VB08: heavy and tight, 40px on a phone (`.d3`), 56 on a desk (`.d2`).
    live: "font-site-heading text-[calc(2.5rem*var(--site-heading-scale,1))] font-extrabold leading-[0.95] tracking-[-0.035em] [font-stretch:80%] min-[700px]:text-[calc(3.5rem*var(--site-heading-scale,1))] min-[700px]:leading-[0.9] min-[700px]:tracking-[-0.04em]",
};
