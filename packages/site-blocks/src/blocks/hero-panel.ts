import type { HeroPanelKind, RenderedHero } from "@saroh/block-contract";
import { HERO_PANEL_KINDS } from "@saroh/block-contract";

import { said } from "./look-front";

/**
 * The Answer panel's kind and whether it has words to draw (KD14), kept out
 * of the `"use client"` panel so the server's `hero.tsx` can call them
 * (`server-boundary.test.ts`).
 */

const KINDS: ReadonlySet<string> = new Set(HERO_PANEL_KINDS);

/** Kinds drawn from the owner's words alone, which need some. */
const WORDS_ONLY: Partial<Record<HeroPanelKind, true>> = { pickup: true };

/** The panel's kind; one this build does not know reads as Today. */
export function panelKind(content: RenderedHero): HeroPanelKind {
    const kind = content.panel?.kind;
    return kind && KINDS.has(kind) ? (kind as HeroPanelKind) : "today";
}

/**
 * Whether the panel can be drawn from the content alone: a pick-up panel
 * needs its order-by or where line. The live kinds decide in the browser.
 */
export function panelHasWords(content: RenderedHero): boolean {
    if (!WORDS_ONLY[panelKind(content)]) return true;
    return (
        said(content.panel?.orderBy) !== null ||
        said(content.panel?.where) !== null
    );
}
