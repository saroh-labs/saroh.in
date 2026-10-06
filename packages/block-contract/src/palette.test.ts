import { describe, expect, it } from "vitest";

import {
    PALETTE_ROLES,
    contrastRatio,
    hexToHslTriple,
    normalizeHex,
    paletteVariables,
    parsePalette,
    samePalette,
} from "./palette";

/** The ceramics design's "Green" palette, as its spec gives it. */
const CERAMICS = {
    bg: "#F4F1E8",
    surface: "#EAE6DB",
    fg: "#1A1815",
    body: "#3B362E",
    muted: "#6E685E",
    border: "#DFDACD",
    accent: "#1F3D2B",
    accentFg: "#F9F7F1",
};

/** HSL triple back to `#RRGGBB`, as a browser draws `hsl(...)`. */
function hslToHex(triple: string): string {
    const [h, s, l] = triple
        .split(" ")
        .map((part) => Number.parseFloat(part)) as [number, number, number];
    const sat = s / 100;
    const light = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n: number) =>
        light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return `#${[f(0), f(8), f(4)]
        .map((c) =>
            Math.round(c * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`.toUpperCase();
}

describe("parsePalette", () => {
    it("accepts a design's palette and completes it from the page's colours", () => {
        const result = parsePalette(CERAMICS);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.palette.accent).toBe("#1F3D2B");
        // Bands not given their own sit on the page; the CTA is the accent.
        expect(result.palette.heroBg).toBe("#F4F1E8");
        expect(result.palette.footerFg).toBe("#1A1815");
        expect(result.palette.ctaBg).toBe("#1F3D2B");
        expect(result.palette.ctaFg).toBe("#F9F7F1");
        expect(Object.keys(result.palette).sort()).toEqual(
            [...PALETTE_ROLES].sort(),
        );
    });

    it("normalises hex to capitals", () => {
        const result = parsePalette({ ...CERAMICS, accent: "#1f3d2b" });
        expect(result.ok && result.palette.accent).toBe("#1F3D2B");
    });

    it("derives a hairline from text and ground when none is given", () => {
        const { border: _border, ...rest } = CERAMICS;
        const result = parsePalette(rest);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.palette.border).toMatch(/^#[0-9A-F]{6}$/);
        expect(result.palette.border).not.toBe(CERAMICS.bg);
    });

    it.each([
        ["#FFF", "a short hex"],
        ["red", "a name"],
        ["rgb(0,0,0)", "a function"],
        ["#12345G", "not hex"],
        ["#1F3D2B; color: red", "an injection"],
        [12, "a number"],
    ] as [unknown, string][])("refuses %s (%s), on the field", (value) => {
        const result = parsePalette({ ...CERAMICS, accent: value });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems.map((p) => p.field)).toContain("palette.accent");
    });

    it("names every missing required role and every unknown one", () => {
        const result = parsePalette({ bg: "#FFFFFF", link: "#000000" });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems.map((p) => p.field).sort()).toEqual([
            "palette.accent",
            "palette.accentFg",
            "palette.fg",
            "palette.link",
        ]);
    });

    it("refuses each text pairing under 4.5:1, by the text role", () => {
        const cases: [Record<string, string>, string][] = [
            [{ fg: "#9A968E" }, "palette.fg"],
            [{ body: "#A8A398" }, "palette.body"],
            // The ceramics muted on its own page passes at 4.89; lighter fails.
            [{ muted: "#8A857B" }, "palette.muted"],
            // The bakery's crust as a link on flour: 3.51:1.
            [{ bg: "#FBF7EF", accent: "#C96A3A" }, "palette.accent"],
            [{ accentFg: "#3B362E" }, "palette.accentFg"],
            [{ heroBg: "#1A1815", heroFg: "#3B362E" }, "palette.heroFg"],
            [{ ctaBg: "#6E685E", ctaFg: "#8A857B" }, "palette.ctaFg"],
            [{ footerBg: "#1A1815", footerFg: "#4A453D" }, "palette.footerFg"],
            [{ surface: "#6E685E" }, "palette.fg"],
        ];
        for (const [change, field] of cases) {
            const result = parsePalette({ ...CERAMICS, ...change });
            expect(result.ok, field).toBe(false);
            if (result.ok) continue;
            const problem = result.problems.find((p) => p.field === field);
            expect(problem?.message, field).toMatch(/needs 4\.5:1/);
        }
    });

    it("refuses something that is not an object", () => {
        for (const bad of [null, "#FFFFFF", ["#FFFFFF"]]) {
            const result = parsePalette(bad);
            expect(result.ok).toBe(false);
        }
    });
});

describe("contrastRatio", () => {
    it("is WCAG's: 21 for black on white, 1 for a colour on itself", () => {
        expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
        expect(contrastRatio("#9C2A18", "#9C2A18")).toBe(1);
        expect(contrastRatio("#6E685E", "#F4F1E8")).toBeCloseTo(4.89, 2);
    });
});

describe("hexToHslTriple and paletteVariables", () => {
    it("writes an HSL triple the renderer's guard accepts, that draws the exact colour", () => {
        const result = parsePalette(CERAMICS);
        if (!result.ok) throw new Error("palette refused");
        for (const role of PALETTE_ROLES) {
            const triple = hexToHslTriple(result.palette[role]);
            expect(triple).toMatch(/^[a-zA-Z0-9 .%]{1,64}$/);
            expect(hslToHex(triple)).toBe(result.palette[role]);
        }
        for (const hex of ["#9C2A18", "#454BAC", "#D7FF3E", "#0B0B0A"]) {
            expect(hslToHex(hexToHslTriple(hex))).toBe(hex);
        }
        expect(hexToHslTriple("#FFFFFF")).toBe("0 0% 100%");
    });

    it("sets every --site-* colour role", () => {
        const result = parsePalette(CERAMICS);
        if (!result.ok) throw new Error("palette refused");
        const vars = paletteVariables(result.palette);
        expect(Object.keys(vars)).toEqual([
            "--site-bg",
            "--site-surface",
            "--site-fg",
            "--site-body",
            "--site-muted",
            "--site-border",
            "--site-accent",
            "--site-accent-fg",
            "--site-hero-bg",
            "--site-hero-fg",
            "--site-cta-bg",
            "--site-cta-fg",
            "--site-footer-bg",
            "--site-footer-fg",
        ]);
        expect(vars["--site-accent"]).toBe(hexToHslTriple("#1F3D2B"));
    });
});

describe("normalizeHex and samePalette", () => {
    it("normalises only #RRGGBB", () => {
        expect(normalizeHex(" #abcdef ")).toBe("#ABCDEF");
        expect(normalizeHex("#abc")).toBeNull();
    });

    it("compares complete palettes by value", () => {
        const a = parsePalette(CERAMICS);
        const b = parsePalette({ ...CERAMICS, bg: "#f4f1e8" });
        const c = parsePalette({ ...CERAMICS, accent: "#4F2927" });
        if (!a.ok || !b.ok || !c.ok) throw new Error("palette refused");
        expect(samePalette(a.palette, b.palette)).toBe(true);
        expect(samePalette(a.palette, c.palette)).toBe(false);
    });
});

describe("status roles (template round 2)", () => {
    const BAKERY = {
        bg: "#FBF7EF",
        fg: "#2A1F14",
        accent: "#8A3324",
        accentFg: "#FBF7EF",
    };

    it("leaves the status unset when none is named, so the dot keeps the accent", () => {
        const result = parsePalette(BAKERY);
        if (!result.ok) throw new Error("palette refused");
        expect(result.palette.status).toBeUndefined();
        expect(result.palette.statusInverse).toBeUndefined();
        const vars = paletteVariables(result.palette);
        expect(vars["--site-status"]).toBeUndefined();
        expect(vars["--site-status-inverse"]).toBeUndefined();
    });

    it("accepts a green held to a graphic's 3:1 on the ground it is drawn on", () => {
        const result = parsePalette({
            ...BAKERY,
            status: "#4e8a36",
            statusInverse: "#9BD17B",
        });
        if (!result.ok) throw new Error("palette refused");
        expect(result.palette.status).toBe("#4E8A36");
        const vars = paletteVariables(result.palette);
        expect(hslToHex(vars["--site-status"] ?? "")).toBe("#4E8A36");
        expect(hslToHex(vars["--site-status-inverse"] ?? "")).toBe("#9BD17B");
    });

    it("refuses a dot that would vanish into its ground, by field", () => {
        // The design's pale green reads 1.7:1 on flour.
        const result = parsePalette({
            ...BAKERY,
            status: "#9BD17B",
            statusInverse: "#4E3A20",
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problems.map((p) => p.field).sort()).toEqual([
            "palette.status",
            "palette.statusInverse",
        ]);
        expect(result.problems[0]?.message).toContain("3:1");
    });

    it("refuses a status that is not #RRGGBB", () => {
        const result = parsePalette({ ...BAKERY, status: "green" });
        expect(result.ok).toBe(false);
    });

    it("tells palettes apart by their status", () => {
        const a = parsePalette({ ...BAKERY, status: "#4E8A36" });
        const b = parsePalette(BAKERY);
        if (!a.ok || !b.ok) throw new Error("palette refused");
        expect(samePalette(a.palette, b.palette)).toBe(false);
        expect(samePalette(a.palette, a.palette)).toBe(true);
    });
});
