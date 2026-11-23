import { describe, expect, it } from "vitest";

import { contrastRatio, hslTripleToHex } from "./palette";
import { defaultSiteStyle, siteStyleVariables } from "./site-style";

describe("Brand tint (DEC-256)", () => {
    it("is a soft wash of the brand colour the page's text still reads on", () => {
        const vars = siteStyleVariables(defaultSiteStyle());
        const tint = hslTripleToHex(vars["--site-tint"] ?? "");
        const fg = hslTripleToHex(vars["--site-fg"] ?? "");
        const accent = hslTripleToHex(vars["--site-accent"] ?? "");
        if (!tint || !fg || !accent) throw new Error("not colours");
        expect(tint).not.toBe(accent);
        expect(contrastRatio(fg, tint)).toBeGreaterThanOrEqual(4.5);
    });

    it("follows the brand colour when it changes", () => {
        const a = defaultSiteStyle();
        const b = defaultSiteStyle();
        b.colours.accent = "teal";
        expect(siteStyleVariables(a)["--site-tint"]).not.toBe(
            siteStyleVariables(b)["--site-tint"],
        );
    });
});
