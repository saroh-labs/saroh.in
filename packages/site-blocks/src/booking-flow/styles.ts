import { cn } from "../lib/utils";

// ── Shapes drawn from the site layer ─────────────────────────────────────

// 22px of room at a desk; 16px on a phone, where the day strip and the
// times need the width more than the card needs air.
export const card =
    "bg-site-surface border-site-border rounded-[calc(var(--site-radius)+14px)] border p-[22px] shadow-[0_1px_2px_hsl(var(--site-fg)/0.08)] max-[699px]:p-4";
export const accentTint =
    "bg-[color-mix(in_srgb,hsl(var(--site-accent))_10%,hsl(var(--site-surface)))]";
export const quietFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-bg)))]";
export const inputFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_3%,hsl(var(--site-surface)))]";
export const onDarkMuted =
    "text-[color-mix(in_srgb,hsl(var(--site-bg))_72%,hsl(var(--site-fg)))]";
export const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/**
 * A choice row: a service, a session, a way to pay. The chosen one is told
 * by its edge, a bar down its side and its ground, never by a tint alone.
 * One not chosen answers the pointer with a firmer edge, and every row
 * gives a little under the press.
 */
export function optionClasses(on: boolean): string {
    return cn(
        "text-site-fg flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[calc(var(--site-radius)+10px)] border px-[18px] py-[15px] text-left transition-[color,background-color,border-color,transform] duration-100 ease-out active:scale-[0.995] max-[699px]:px-3.5",
        focusRing,
        on
            ? cn(
                  "border-site-accent shadow-[inset_3px_0_0_hsl(var(--site-accent))]",
                  accentTint,
              )
            : "border-site-border bg-site-surface hover:border-site-fg",
    );
}

/**
 * A quiet button on a card: Add to calendar, Pick a time again. The
 * surface with an edge, 44px, and a state for the pointer and the press.
 */
export const quietButton = cn(
    "border-site-border bg-site-surface text-site-fg hover:border-site-fg inline-flex h-11 cursor-pointer items-center rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold transition-[border-color,transform] duration-100 ease-out active:scale-[0.98]",
    focusRing,
);

/** A text action on a card: Try again, Show more classes. 44px on touch. */
export const textAction = cn(
    "text-site-fg coarse:min-h-11 inline-flex cursor-pointer items-center rounded-sm text-sm font-semibold underline underline-offset-2 hover:no-underline active:opacity-70",
    focusRing,
);

/** The confirm button: the accent when it can go, quiet when it cannot. */
export function confirmClasses(blocked: boolean): string {
    return cn(
        "h-[45px] rounded-[calc(var(--site-radius)+7px)] font-semibold transition-[color,background-color,opacity,transform] duration-100 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg",
        blocked
            ? cn(
                  "cursor-not-allowed bg-[color-mix(in_srgb,hsl(var(--site-bg))_14%,hsl(var(--site-fg)))]",
                  onDarkMuted,
              )
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90 active:scale-[0.98]",
    );
}
