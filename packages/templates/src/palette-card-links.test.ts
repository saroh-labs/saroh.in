import { contrastRatio, PALETTE_MIN_CONTRAST } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import { listTemplates } from "./registry";

/*
 * A card's link or price is drawn in the accent on the card's surface, so
 * every template palette holds it to text contrast (website library axe,
 * 22 Nov 2026). Only template palettes: the shared palette check also runs
 * when a live site is drawn, where a new pair would drop saved colours.
 */
describe("template palettes: links on a card", () => {
    for (const template of listTemplates())
        for (const style of template.styles ?? []) {
            const palette = style.style.palette;
            if (!palette) continue;
            it(`${template.id} in ${style.id}`, () => {
                expect(
                    // A palette without a surface draws its cards on the page (palette.ts).
                    contrastRatio(
                        palette.accent,
                        palette.surface ?? palette.bg,
                    ),
                ).toBeGreaterThanOrEqual(PALETTE_MIN_CONTRAST);
            });
        }
});
