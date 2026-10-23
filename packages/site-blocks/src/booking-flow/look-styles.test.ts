import { describe, expect, it } from "vitest";

import { cn } from "../lib/utils";
import { LOOK_CHOICE, lookField, lookFieldBad } from "./look-styles";

describe("a wrong answer's edge under a look", () => {
    // A look's own field edge is more specific than a plain class, so the
    // wrong answer's edge has to be said per look, or the look's wins.
    const wrong = cn(lookField, lookFieldBad);

    it("is ink under Quiet, not the control edge", () => {
        expect(wrong).toContain("[[data-site-look=quiet]_&]:border-site-fg");
        expect(wrong).not.toContain(
            "[[data-site-look=quiet]_&]:border-site-rule",
        );
    });

    it("is a 2px ink edge under Live, which draws no border", () => {
        expect(wrong).toContain(
            "[[data-site-look=live]_&]:shadow-[inset_0_0_0_2px_hsl(var(--site-fg))]",
        );
    });
});

describe("Folio's picked choice", () => {
    it("carries an ink line, not only the soft fill", () => {
        expect(LOOK_CHOICE.folio.row(true)).toContain("hsl(var(--site-fg))");
        expect(LOOK_CHOICE.folio.row(false)).not.toContain(
            "hsl(var(--site-fg))",
        );
    });
});
