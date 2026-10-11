import { contrastOnWhite, tooLightToScan } from "@saroh/ui/lib/qr-art";
import { describe, expect, it } from "vitest";

import {
    hslTripleToHex,
    QR_DESIGN_COLOURS,
    QR_INK,
    QR_SWATCH_COUNT,
    qrSwatches,
    scannable,
    siteColours,
    swatchesWith,
} from "./colours";

describe("scannable", () => {
    it("leaves a colour a phone can read alone", () => {
        expect(scannable("#1F4D3A")).toBe("#1f4d3a");
        expect(scannable(QR_INK)).toBe(QR_INK);
    });

    it("darkens the design's saffron along its own hue until it scans", () => {
        expect(tooLightToScan("#f0a92b")).toBe(true);
        const darker = scannable("#F0A92B");
        expect(darker).not.toBeNull();
        expect(darker).not.toBe("#f0a92b");
        expect(tooLightToScan(darker ?? "")).toBe(false);
        // Just past the line, not all the way to black.
        expect(contrastOnWhite(darker ?? "") ?? 0).toBeLessThan(5.5);
    });

    it("refuses what isn't a hex colour", () => {
        expect(scannable("saffron")).toBeNull();
        expect(scannable("#fff")).toBeNull();
    });
});

describe("qrSwatches", () => {
    it("offers ink first, then the design's set, every one scannable", () => {
        const swatches = qrSwatches(null);
        expect(swatches[0]).toBe(QR_INK);
        expect(swatches).toHaveLength(QR_SWATCH_COUNT);
        expect(swatches.slice(1, 4)).toEqual(QR_DESIGN_COLOURS.slice(0, 3));
        for (const hex of swatches) {
            expect(tooLightToScan(hex), hex).toBe(false);
        }
    });

    it("puts the site's own palette ahead of the design's", () => {
        const swatches = qrSwatches({
            style: {
                palette: {
                    bg: "#FFFFFF",
                    fg: "#101010",
                    accent: "#B0303A",
                    ctaBg: "#F7D774",
                },
            },
        });
        expect(swatches[0]).toBe(QR_INK);
        expect(swatches[1]).toBe("#b0303a");
        // The pale yellow is offered darker; the near-black is left out,
        // since it reads as ink.
        expect(swatches).not.toContain("#f7d774");
        expect(swatches).not.toContain("#101010");
        expect(new Set(swatches).size).toBe(swatches.length);
        for (const hex of swatches) {
            expect(tooLightToScan(hex), hex).toBe(false);
        }
    });

    it("reads the chosen swatch of each style row", () => {
        const look = {
            style: { colours: { accent: "teal", page: "paper" } },
            styleOptions: {
                rows: [
                    {
                        key: "accent",
                        swatches: [
                            { key: "teal", hsl: "180 60% 25%" },
                            { key: "rose", hsl: "340 70% 50%" },
                        ],
                    },
                    {
                        key: "page",
                        swatches: [{ key: "paper", hsl: "40 30% 94%" }],
                    },
                ],
            },
        };
        expect(siteColours(look)[0]).toBe(hslTripleToHex("180 60% 25%"));
        expect(qrSwatches(look)[1]).toBe("#1a6666");
    });

    it("falls back to the design's set when the look can't be read", () => {
        expect(qrSwatches({ style: null })).toEqual(qrSwatches(null));
        expect(siteColours(undefined)).toEqual([]);
        expect(hslTripleToHex("not a colour")).toBeNull();
    });

    it("keeps a saved code's own colour among the swatches", () => {
        const swatches = qrSwatches(null);
        expect(swatchesWith(swatches, "#0B5D3B")).toEqual([
            ...swatches,
            "#0b5d3b",
        ]);
        expect(swatchesWith(swatches, QR_INK)).toEqual(swatches);
    });
});
