import type { LookId } from "@saroh/block-contract";

import type { SiteStyle, SiteStyleOptions } from "./style";
import { activeColourway } from "./style";

/**
 * Free and paid looks, typefaces and colourways in Website › Style
 * (DEC-177). The API decides which are free for this site (the
 * catalogue's free lists, plus what every site always has) and whether the
 * plan opens the rest (`themes`), and serves both with the site
 * (`styleAccess`); this module only asks them, so the panel refuses in
 * place exactly what the save would refuse.
 */

/** The site read's `styleAccess`. */
export interface SiteStyleAccess {
    free: {
        looks: LookId[];
        fontPairs: string[];
        /** The site's template's colourways, by their own id. */
        colourways: string[];
    };
    /** The plan includes "Themes, fonts and templates": all are open. */
    paidIncluded: boolean;
}

export type PaidKind = "look" | "fontPair" | "colourway";

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

const FREE_LIST: Record<PaidKind, keyof SiteStyleAccess["free"]> = {
    look: "looks",
    fontPair: "fontPairs",
    colourway: "colourways",
};

/** The id a style holds for each kind; Classic and the default pair too. */
function heldBy(
    style: SiteStyle,
    options: SiteStyleOptions,
): Record<PaidKind, string | null> {
    return {
        look: style.look ?? null,
        fontPair: style.fontPair ?? options.fontPairs?.[0]?.key ?? null,
        colourway: activeColourway(style, options.colourways)?.id ?? null,
    };
}

/**
 * The rules for one site: what it may choose for nothing, its plan, and
 * the style the server holds (so its own choices stay open to it).
 */
export function styleChoiceRules(
    access: SiteStyleAccess | null | undefined,
    saved: SiteStyle,
    options: SiteStyleOptions,
    /** The live site's look, which the draft can always go back to. */
    liveLook: LookId | null = null,
): StyleChoiceRules {
    if (!access) return ALL_FREE;
    const has = heldBy(saved, options);
    const isPaid = (kind: PaidKind, id: string) =>
        !(access.free[FREE_LIST[kind]] as string[]).includes(id);
    return {
        isPaid,
        refuses: (kind, id) =>
            !access.paidIncluded &&
            isPaid(kind, id) &&
            has[kind] !== id &&
            !(kind === "look" && id === liveLook),
    };
}

/** The one line a refused choice gets, before its "See plans" link. */
export function paidRefusalWords(name: string): string {
    return `${name} comes with a paid plan. Your site keeps what it has.`;
}
