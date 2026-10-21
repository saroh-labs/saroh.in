import type { LookId } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";

/**
 * The shapes the shop draws with under a look (DEC-172, plan U11, #1102),
 * from `--site-*` only (gate G2). Classic never reads this file.
 *
 * THE RADIUS RULE (U4 "Corners"): `rounded-site` is a look's buttons and
 * fields — a pill under Quiet, square under Folio — while cards, photos and
 * rows take `rounded-site-s` / `rounded-site-photo`, so nothing but a
 * button is ever a capsule.
 *
 * ONE FILLED BUTTON PER VIEW (U5): the grid's Add to bag and its steppers
 * are outlines (a 3:1 edge from `--site-edge`, never the accent's fill), so
 * the filled colour is left for Check out, Add to bag on a product page and
 * paying. `sticky-actions.tsx` counts `button.bg-site-accent` as the page's
 * own action, which is why the outlines never wear it.
 */

/** The view's one filled button: Check out, Add to bag, Place order. */
export function shopPrimary(off = false): string {
    return cn(
        "rounded-site inline-flex min-h-12 items-center justify-center gap-3 px-6 text-[15.5px] font-semibold tabular-nums",
        LOOK_RING,
        LOOK_EASE,
        off
            ? "text-site-body cursor-not-allowed bg-[color-mix(in_srgb,hsl(var(--site-fg))_10%,hsl(var(--site-bg)))]"
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90 active:opacity-80",
    );
}

/** An outline button: the grid's Add to bag, Keep shopping, Directions. */
export const shopOutline = cn(
    "rounded-site text-site-fg inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap border-site-rule border bg-transparent px-5 text-[14.5px] font-semibold hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,transparent)] active:opacity-80",
    LOOK_RING,
    LOOK_EASE,
);

/** A text action, 44px tall under any pointer: Remove, Edit bag, Not you?. */
export const shopLink = cn(
    "text-site-fg inline-flex min-h-11 cursor-pointer items-center rounded-sm text-[14px] font-semibold underline decoration-1 underline-offset-[3px] hover:decoration-2",
    LOOK_RING,
);

/** The look's page title on the shop, its product and its checkout. */
export const SHOP_TITLE: Record<LookId, string> = {
    // VA12: the display face, light and large, set left.
    folio: "font-site-heading text-site-fg font-light leading-[1.02] tracking-[-0.03em] text-[calc(clamp(2.5rem,7vw,4.5rem)*var(--site-heading-scale,1))] [text-wrap:balance]",
    // VD12: the display face, centred from the tablet width.
    quiet: "font-site-heading text-site-fg font-normal leading-[1.06] tracking-[-0.02em] text-[calc(clamp(2.25rem,6vw,4rem)*var(--site-heading-scale,1))] [text-wrap:balance] min-[700px]:text-center",
    // VB12: heavy and tight.
    live: "font-site-heading text-site-fg font-extrabold leading-[1.02] tracking-[-0.035em] text-[calc(clamp(2.25rem,6vw,4.25rem)*var(--site-heading-scale,1))] [text-wrap:balance]",
};

/** A section's small heading inside a sheet or the checkout. */
export const SHOP_LABEL =
    "text-site-muted text-[12px] font-semibold uppercase tracking-[0.12em]";

/** A card or panel: the look's small corner, never a pill. */
export const shopPanel = (look: LookId) =>
    cn(
        "rounded-site-s",
        look === "live"
            ? "bg-site-surface"
            : look === "folio"
              ? "border-site-border bg-site-surface border"
              : "border-site-border border-t",
    );

/** A field: 17px type, so a phone never zooms into it. */
export const shopField = cn(
    "border-site-border bg-site-surface text-site-fg placeholder:text-site-muted rounded-site-s block h-12 w-full border px-3.5 text-[17px]",
    LOOK_RING,
);

/** A choice row (a way to receive it, a way to pay): a real radio. */
export function shopChoice(on: boolean): string {
    return cn(
        "text-site-fg rounded-site-s flex min-h-14 w-full cursor-pointer items-start gap-3 border px-4 py-3 text-left",
        LOOK_RING,
        LOOK_EASE,
        on
            ? "border-site-fg shadow-[inset_0_0_0_1px_hsl(var(--site-fg))]"
            : "border-site-border bg-site-surface hover:border-site-fg",
    );
}

/** The dot of a choice row: filled when chosen. */
export function shopDot(on: boolean): string {
    return cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
        on ? "border-site-fg" : "border-site-muted",
    );
}
