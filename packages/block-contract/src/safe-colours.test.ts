import { describe, expect, it } from "vitest";

import { LOOK_IDS } from "./looks";
import type { SitePalette, SitePaletteInput } from "./palette";
import {
    contrastRatio,
    PALETTE_GRAPHIC_CONTRAST,
    PALETTE_MIN_CONTRAST,
    parsePalette,
} from "./palette";
import { deriveSafeColours } from "./safe-colours";
import {
    defaultSiteStyle,
    siteStyleSafeColours,
    siteStyleVariables,
    STYLE_ROW_KEYS,
    STYLE_ROWS,
} from "./site-style";

/** A palette as a template writes it, completed by `parsePalette`. */
function complete(input: SitePaletteInput): SitePalette {
    const parsed = parsePalette(input);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
    return parsed.palette;
}

/** The same, without the contrast check: a merchant's colours, as given. */
function given(input: Partial<SitePalette>): SitePalette {
    return {
        surface: input.bg,
        body: input.fg,
        muted: input.fg,
        border: "#E5E5E5",
        heroBg: input.bg,
        heroFg: input.fg,
        ctaBg: input.accent,
        ctaFg: input.accentFg,
        footerBg: input.bg,
        footerFg: input.fg,
        ...input,
    } as SitePalette;
}

const WHITE_PAGE = { bg: "#FFFFFF", fg: "#1C1917" };

describe("deriveSafeColours", () => {
    it.each(LOOK_IDS)(
        "darkens a bright yellow on white to 3:1, with ink on it (%s)",
        (look) => {
            const safe = deriveSafeColours(
                given({
                    ...WHITE_PAGE,
                    accent: "#FFE600",
                    accentFg: "#FFFFFF",
                }),
                look,
            );
            const { accent, accentFg, accentText, bg, surface } = safe.palette;
            expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(
                PALETTE_GRAPHIC_CONTRAST,
            );
            expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(
                PALETTE_GRAPHIC_CONTRAST,
            );
            // Not darker than it needs to be: still well short of the ink.
            expect(contrastRatio(accent, bg)).toBeLessThan(4.5);
            expect(accentFg).toBe("#1C1917");
            expect(contrastRatio(accentFg, accent)).toBeGreaterThanOrEqual(
                PALETTE_MIN_CONTRAST,
            );
            expect(contrastRatio(accentText, bg)).toBeGreaterThanOrEqual(
                PALETTE_MIN_CONTRAST,
            );
            expect(safe.accentTreatment).toBe("fill");
            expect(parsePalette(safe.palette).ok).toBe(true);
        },
    );

    it("keeps a dark green as it is, with white on it", () => {
        const safe = deriveSafeColours(
            given({ ...WHITE_PAGE, accent: "#1F5A3D", accentFg: "#FFFFFF" }),
            "quiet",
        );
        expect(safe.palette.accent).toBe("#1F5A3D");
        expect(safe.palette.accentFg).toBe("#FFFFFF");
        expect(safe.palette.accentText).toBe("#1F5A3D");
        expect(safe.accentTreatment).toBe("fill");
    });

    it("chooses white on a dark accent whose given text does not read", () => {
        const safe = deriveSafeColours(
            given({ ...WHITE_PAGE, accent: "#1F5A3D", accentFg: "#103020" }),
            "quiet",
        );
        expect(safe.palette.accent).toBe("#1F5A3D");
        expect(safe.palette.accentFg).toBe("#FFFFFF");
    });

    it("falls back to the ink, drawn as an outline, for an ink accent", () => {
        const safe = deriveSafeColours(
            given({ ...WHITE_PAGE, accent: "#1C1917", accentFg: "#FFFFFF" }),
            "folio",
        );
        expect(safe.palette.accent).toBe("#1C1917");
        expect(safe.palette.accentText).toBe("#1C1917");
        expect(safe.accentTreatment).toBe("outline");
        expect(parsePalette(safe.palette).ok).toBe(true);
    });

    it("keeps a designed lime fill under Live when the palette names its own accent text (board VB)", () => {
        const board = given({
            bg: "#EDEEEA",
            surface: "#FFFFFF",
            fg: "#121410",
            body: "#121410",
            muted: "#55584F",
            border: "#DEE0D8",
            accent: "#C6F432",
            accentFg: "#121410",
            accentText: "#4C6300",
        });
        const live = deriveSafeColours(board, "live").palette;
        expect(live.accent).toBe("#C6F432");
        expect(live.accentText).toBe("#4C6300");
        expect(
            contrastRatio(live.accentFg, live.accent),
        ).toBeGreaterThanOrEqual(PALETTE_MIN_CONTRAST);
        expect(parsePalette(live, { accentFillContrast: 1 }).ok).toBe(true);
        // Another look still holds the fill to a graphic's 3:1.
        const quiet = deriveSafeColours(board, "quiet").palette;
        expect(contrastRatio(quiet.accent, quiet.bg)).toBeGreaterThanOrEqual(
            PALETTE_GRAPHIC_CONTRAST,
        );
        // A business's own lime (no accent text) is still moved under Live.
        const { accentText: _none, ...business } = board;
        const moved = deriveSafeColours(business, "live").palette;
        expect(contrastRatio(moved.accent, moved.bg)).toBeGreaterThanOrEqual(
            PALETTE_GRAPHIC_CONTRAST,
        );
    });

    it("lifts the rule to 3:1 on the page and on a card", () => {
        const safe = deriveSafeColours(
            given({
                ...WHITE_PAGE,
                surface: "#F7F5F1",
                accent: "#1F5A3D",
                accentFg: "#FFFFFF",
                border: "#F0F0F0",
            }),
            "quiet",
        );
        const { rule, bg, surface, border } = safe.palette;
        expect(contrastRatio(rule, bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(rule, surface)).toBeGreaterThanOrEqual(3);
        // The hairline itself is left as it was: decoration.
        expect(border).toBe("#F0F0F0");
    });

    it("moves a bright accent toward the light text on a dark page", () => {
        const safe = deriveSafeColours(
            given({
                bg: "#0B0B0A",
                fg: "#F2F2EE",
                accent: "#202A10",
                accentFg: "#FFFFFF",
            }),
            "live",
        );
        const { accent, bg, surface } = safe.palette;
        expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(3);
        expect(parsePalette(safe.palette).ok).toBe(true);
    });

    it("tints Live's page a step off its white cards, and no other look's", () => {
        const palette = given({
            ...WHITE_PAGE,
            accent: "#1F5A3D",
            accentFg: "#FFFFFF",
        });
        const live = deriveSafeColours(palette, "live").palette;
        // Board VB: white cards on a grey ground.
        expect(live.surface).toBe("#FFFFFF");
        expect(live.bg).not.toBe("#FFFFFF");
        expect(live.heroBg).toBe(live.bg);
        expect(deriveSafeColours(palette, "quiet").palette.bg).toBe("#FFFFFF");
        // A palette's own surface is kept.
        expect(
            deriveSafeColours({ ...palette, surface: "#FAFAFA" }, "live")
                .palette.surface,
        ).toBe("#FAFAFA");
    });

    it("never changes the palette it is given", () => {
        const palette = given({
            ...WHITE_PAGE,
            accent: "#FFE600",
            accentFg: "#FFFFFF",
        });
        const before = { ...palette };
        deriveSafeColours(palette, "quiet");
        expect(palette).toEqual(before);
    });
});

/**
 * The boards' sample colourways (Website v2 canvas, VA00Summary for Folio
 * and VD00Summary for Quiet): drawn to pass, so nothing in them moves.
 */
const BOARD_COLOURWAYS: {
    look: "folio" | "quiet";
    palette: SitePaletteInput;
}[] = [
    {
        look: "folio",
        palette: {
            bg: "#E9ECE6",
            surface: "#F4F5F1",
            fg: "#1E2420",
            body: "#323A34",
            muted: "#5A625B",
            border: "#C3C9C0",
            accent: "#3F5A45",
            accentFg: "#F4F5F1",
            footerBg: "#1E2420",
            footerFg: "#E3E7E0",
        },
    },
    {
        look: "folio",
        palette: {
            bg: "#EDEBE6",
            surface: "#F8F6F1",
            fg: "#1D1B19",
            body: "#3A3530",
            muted: "#5E574F",
            border: "#CEC8BE",
            accent: "#7A5414",
            accentFg: "#FBF8F2",
            footerBg: "#2A211A",
            footerFg: "#EDEBE6",
        },
    },
    ...(
        [
            [
                "#F2EAE5",
                "#FAF5F2",
                "#2A1D1A",
                "#46352F",
                "#6A5850",
                "#DCCDC5",
                "#6B2D3C",
            ],
            [
                "#E7ECEE",
                "#F5F7F8",
                "#16212A",
                "#2F3D47",
                "#53616B",
                "#C6D0D5",
                "#1F4E6B",
            ],
            [
                "#EDEBE6",
                "#F8F6F2",
                "#141414",
                "#2E2C29",
                "#5C5852",
                "#CFCAC2",
                "#A33A16",
            ],
            [
                "#EFEEEB",
                "#FAF9F7",
                "#181818",
                "#333333",
                "#5E5D5A",
                "#D3D1CC",
                "#34337E",
            ],
            [
                "#E8E7E2",
                "#F6F5F1",
                "#1B1F24",
                "#323840",
                "#575E66",
                "#CACBC6",
                "#2D4A68",
            ],
        ] as const
    ).map(([bg, surface, fg, body, muted, border, accent]) => ({
        look: "folio" as const,
        palette: {
            bg,
            surface,
            fg,
            body,
            muted,
            border,
            accent,
            accentFg: surface,
        },
    })),
    {
        look: "quiet",
        palette: {
            bg: "#F7F5F1",
            surface: "#FFFFFF",
            fg: "#23221F",
            body: "#45423D",
            muted: "#69655E",
            border: "#E2DDD5",
            accent: "#4D6455",
            accentFg: "#FFFFFF",
            footerBg: "#EFECE6",
            footerFg: "#23221F",
        },
    },
    ...(
        [
            ["#F8F5F0", "#24201C", "#47403A", "#6B635A", "#E5DED4", "#85521F"],
            ["#F8F4F2", "#2A1F1E", "#4A3B39", "#6D5F5C", "#E8DEDB", "#7A3346"],
            ["#F4F6F7", "#1B2328", "#3A454C", "#5B666D", "#DCE3E6", "#2C5872"],
            ["#F6F4F1", "#1A1918", "#3B3936", "#625E59", "#E2DDD6", "#A03A18"],
            ["#F6F6F4", "#1C1C1C", "#3D3D3B", "#62625E", "#E1E0DC", "#3A3982"],
            ["#F4F4F1", "#1C2026", "#3A4048", "#5E646B", "#DEDFDA", "#2C4B69"],
        ] as const
    ).map(([bg, fg, body, muted, border, accent]) => ({
        look: "quiet" as const,
        palette: {
            bg,
            surface: "#FFFFFF",
            fg,
            body,
            muted,
            border,
            accent,
            accentFg: "#FFFFFF",
        },
    })),
];

describe("the boards' sample colourways", () => {
    it.each(BOARD_COLOURWAYS.map((c, i) => [i, c] as const))(
        "colourway %i passes and keeps its accent",
        (_, { look, palette }) => {
            const input = complete(palette);
            const safe = deriveSafeColours(input, look);
            expect(parsePalette(safe.palette).ok).toBe(true);
            expect(safe.palette.accent).toBe(input.accent);
            expect(safe.palette.accentFg).toBe(input.accentFg);
            expect(safe.palette.fg).toBe(input.fg);
            expect(safe.palette.body).toBe(input.body);
            expect(safe.palette.muted).toBe(input.muted);
            expect(safe.accentTreatment).toBe("fill");
        },
    );
});

describe("every colour Website › Style can produce reads in every look", () => {
    // Ground, text and accent in every combination, the bands at their
    // first and last swatch: what a merchant can choose in the panel.
    const combos: Record<string, string>[] = [];
    for (const pageGround of STYLE_ROWS.pageGround) {
        for (const text of STYLE_ROWS.text) {
            for (const accent of STYLE_ROWS.accent) {
                for (const end of [0, 4] as const) {
                    const colours = Object.fromEntries(
                        STYLE_ROW_KEYS.map((row) => [
                            row,
                            STYLE_ROWS[row][end].key,
                        ]),
                    );
                    combos.push({
                        ...colours,
                        pageGround: pageGround.key,
                        text: text.key,
                        accent: accent.key,
                    });
                }
            }
        }
    }

    it.each(LOOK_IDS)("%s", (look) => {
        for (const colours of combos) {
            const style = { ...defaultSiteStyle(), colours, look };
            const safe = siteStyleSafeColours(style);
            expect(safe, JSON.stringify(colours)).not.toBeNull();
            const parsed = parsePalette(safe?.palette);
            expect(parsed.ok, JSON.stringify({ colours, parsed })).toBe(true);
            const vars = siteStyleVariables(style);
            expect(vars["--site-accent-text"]).toBeTruthy();
            expect(vars["--site-rule"]).toBeTruthy();
        }
    });
});
