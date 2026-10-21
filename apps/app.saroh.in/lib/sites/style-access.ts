import type { LookId, SiteStyleAccess, StyleKind } from "@saroh/block-contract";
import {
    heldStyleIds,
    isPaidStyle,
    needsPaidPlan,
} from "@saroh/block-contract";

import type { SiteStyle, SiteStyleOptions } from "./style";

/**
 * Free and paid looks, typefaces and colourways in Website › Style
 * (DEC-177). The API decides which are free for this site (the
 * catalogue's free lists, plus what every site always has) and whether the
 * plan opens the rest (`themes`), and serves both with the site
 * (`styleAccess`); this module only asks them, so the panel refuses in
 * place exactly what the save would refuse.
 */

/** The site read's `styleAccess`: `@saroh/block-contract`'s, as the API serves it. */
export type { SiteStyleAccess };

export type PaidKind = StyleKind;

/** What the Style panel asks of a choice before taking it. */
export interface StyleChoiceRules {
    /** Marked "Paid plans": not free for this site. */
    isPaid: (kind: PaidKind, id: string) => boolean;
    /**
     * Refused here: paid, the plan leaves it off, and it isn't what the
     * site already has (keeping or going back to that is always allowed).
     */
    refuses: (kind: PaidKind, id: string) => boolean;
}

/** Nothing is paid: an API from before DEC-177 serves no `styleAccess`. */
export const ALL_FREE: StyleChoiceRules = {
    isPaid: () => false,
    refuses: () => false,
};

/**
 * The rules for one site: what it may choose for nothing, its plan, and
 * the style the server holds (so its own choices stay open to it). The
 * rule is `@saroh/block-contract`'s, the one the API's save runs (review
 * #22): a colourway by its exact palette, no pair the system font.
 */
export function styleChoiceRules(
    access: SiteStyleAccess | null | undefined,
    saved: SiteStyle,
    options: SiteStyleOptions,
    /** The live site's look, which the draft can always go back to. */
    liveLook: LookId | null = null,
): StyleChoiceRules {
    if (!access) return ALL_FREE;
    const colourways = (options.colourways ?? []).map((c) => ({
        id: c.id,
        palette: c.style.palette,
    }));
    const ctx = {
        free: access.free,
        held: heldStyleIds(saved, colourways),
        liveLook,
        colourways,
    };
    return {
        isPaid: (kind, id) => isPaidStyle(access.free, kind, id, colourways),
        refuses: (kind, id) =>
            !access.paidIncluded && needsPaidPlan(ctx, kind, id),
    };
}

/** The one line a refused choice gets, before its "See plans" link. */
export function paidRefusalWords(name: string): string {
    return `${name} comes with a paid plan. Your site keeps what it has.`;
}
