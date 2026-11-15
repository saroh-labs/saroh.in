import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { shareCard, shareCardElement } from "./share-card";
import type { ShareCardInput } from "./share-card-model";
import {
    clipLines,
    initials,
    inkOn,
    SHARE_SIZES,
    SHARE_STYLES,
    shareCardLayout,
    shareCardModel,
    shareSizeOf,
    shareStyleOf,
} from "./share-card-model";

/** The share picture (#1375 U4): four styles in three sizes, as the SFCards board. */

const drawn = vi.hoisted(() => ({ options: [] as unknown[] }));
vi.mock("next/og", () => ({
    ImageResponse: class extends Response {
        constructor(_element: unknown, options: Record<string, unknown>) {
            drawn.options.push(options);
            super("png", { headers: { "content-type": "image/png" } });
        }
    },
}));

const input: ShareCardInput = {
    name: "Cardamom bun box",
    price: "₹360",
    unit: "box of 6",
    business: "Rye & Co.",
    photo: null,
    address: "rye-and-co.example.com",
};

const OFFER = {
    headline: "20% off",
    until: "this week only",
    was: "₹360",
    now: "₹288",
    code: "BUN20",
};

const SIZES = Object.keys(SHARE_SIZES) as (keyof typeof SHARE_SIZES)[];
const markup = (over: Partial<ShareCardInput>) =>
    renderToStaticMarkup(shareCardElement({ ...input, ...over }));

describe("styles and sizes", () => {
    it("draws every style at each size's own dimensions", () => {
        drawn.options.length = 0;
        for (const style of SHARE_STYLES) {
            for (const size of SIZES) {
                shareCard({ ...input, offer: OFFER, style, size });
            }
        }
        expect(drawn.options).toHaveLength(12);
        expect(drawn.options).toContainEqual(
            expect.objectContaining({ width: 1080, height: 1350 }),
        );
        expect(drawn.options).toContainEqual(
            expect.objectContaining({ width: 1080, height: 1080 }),
        );
        expect(drawn.options).toContainEqual(
            expect.objectContaining({ width: 1080, height: 1920 }),
        );
        for (const options of drawn.options) {
            expect(options).toMatchObject({
                headers: {
                    "cache-control": "public, max-age=300",
                    "access-control-allow-origin": "*",
                },
            });
        }
    });

    it("reads an unknown style or size as Photo and Post", () => {
        expect(shareStyleOf("price")).toBe("price");
        expect(shareStyleOf("poster")).toBe("photo");
        expect(shareStyleOf(null)).toBe("photo");
        expect(shareSizeOf("story")).toBe("story");
        expect(shareSizeOf("constructor")).toBe("post");
        expect(shareSizeOf(undefined)).toBe("post");
    });

    it("keeps a Story's top 13% and bottom 20% free of text in every style", () => {
        for (const style of SHARE_STYLES) {
            for (const name of [input.name, "A much longer name that wraps"]) {
                const layout = shareCardLayout({
                    ...input,
                    name,
                    offer: OFFER,
                    style,
                    size: "story",
                });
                expect(layout.safe).toEqual({ top: 250, bottom: 384 });
                for (const box of layout.text) {
                    expect(box.top).toBeGreaterThanOrEqual(1920 * 0.13);
                    expect(box.bottom).toBeLessThanOrEqual(1920 * 0.8);
                }
            }
        }
    });

    it("fits the centred styles inside the card at every size", () => {
        for (const style of ["offer", "simple"] as const) {
            for (const size of SIZES) {
                const layout = shareCardLayout({
                    ...input,
                    name: "Slow fermented country sourdough with seeds",
                    offer: OFFER,
                    style,
                    size,
                });
                expect(layout.circle).toBeGreaterThan(0);
                expect(layout.band.top).toBeGreaterThanOrEqual(layout.safe.top);
                expect(layout.band.bottom).toBeLessThanOrEqual(
                    layout.height - layout.safe.bottom,
                );
            }
        }
    });

    it("draws the Offer style as Photo when there is no offer", () => {
        expect(shareCardLayout({ ...input, style: "offer" }).style).toBe(
            "photo",
        );
    });
});

describe("what the card says", () => {
    it("takes its colours and corners from the site's tokens", () => {
        const m = shareCardModel({
            ...input,
            variables: {
                "--site-bg": "40 24% 97%",
                "--site-fg": "20 14% 12%",
                "--site-accent": "16 60% 40%",
                "--site-band-accent": "140 18% 30%",
                "--site-radius": "20px",
            },
        });
        expect(m.colours.bg).toBe("hsl(40, 24%, 97%)");
        expect(m.colours.fg).toBe("hsl(20, 14%, 12%)");
        expect(m.colours.accent).toBe("hsl(16, 60%, 40%)");
        expect(m.colours.bandAccent).toBe("hsl(140, 18%, 30%)");
        // No band ink of its own: the site's text colour, as its bands do.
        expect(m.colours.bandInk).toBe("hsl(20, 14%, 12%)");
        expect(m.radius).toBe(20);
    });

    it("draws plain neutrals with no look, and never takes a value that isn't a colour", () => {
        const bare = shareCardModel(input);
        const odd = shareCardModel({
            ...input,
            variables: { "--site-bg": "red;} body{x:1" },
        });
        expect(odd.colours.bg).toBe(bare.colours.bg);
        expect(bare.colours.bg).toBe("hsl(0, 0%, 100%)");
        expect(bare.radius).toBe(12);
    });

    it("sets the Price-tag band's text white on a dark band and black on a light one", () => {
        expect(inkOn("20 14% 12%")).toBe("#FFFFFF");
        expect(inkOn("40 30% 92%")).toBe("#000000");
        const light = shareCardModel({
            ...input,
            variables: { "--site-band-ink": "48 90% 70%" },
        });
        expect(light.colours.bandInkText).toBe("#000000");
        expect(markup({ style: "price" })).toContain("color:#FFFFFF");
    });

    it("keeps a long name to two lines", () => {
        for (const style of SHARE_STYLES) {
            const m = shareCardModel({
                ...input,
                style,
                offer: OFFER,
                name: "Slow fermented country sourdough with toasted seeds and rye",
            });
            expect(m.nameLines).toHaveLength(2);
            expect(m.nameLines[1]?.endsWith("…")).toBe(true);
        }
    });

    it("draws the letter tile without a photo, and the photo with one", () => {
        const html = markup({ style: "photo" });
        expect(html).not.toContain("<img");
        expect(html).toContain(">C</div>");
        const photo = markup({ photo: "data:image/png;base64,AQID" });
        expect(photo).toContain('src="data:image/png;base64,AQID"');
    });

    it("shows the offer's old price struck through beside the new one", () => {
        const html = markup({ style: "offer", offer: OFFER });
        expect(html).toContain("20% off");
        expect(html).toContain("RYE &amp; CO. · THIS WEEK ONLY");
        expect(html).toMatch(/line-through[^>]*>₹360</);
        expect(html).toContain("₹288");
        expect(html).toContain("code BUN20 · rye-and-co.example.com");
    });

    it("marks the card with the logo, else the business's initials", () => {
        expect(initials("Rye & Co.")).toBe("R&C");
        expect(initials("Studio Neel")).toBe("SN");
        expect(markup({ style: "simple" })).toContain(">R&amp;C</div>");
        expect(
            markup({ style: "simple", logo: "data:image/png;base64,AA" }),
        ).toContain('src="data:image/png;base64,AA"');
    });

    it("prints the live web address", () => {
        for (const style of SHARE_STYLES) {
            expect(markup({ style, offer: OFFER })).toContain(
                "rye-and-co.example.com",
            );
        }
    });
});

describe("clipLines", () => {
    it("keeps short text whole", () => {
        expect(clipLines("Haircut", 24, 2)).toEqual(["Haircut"]);
    });

    it("breaks at spaces and marks a cut", () => {
        expect(clipLines("one two three four", 9, 2)).toEqual([
            "one two",
            "three…",
        ]);
    });

    it("cuts a word longer than a line", () => {
        expect(clipLines("Supercalifragilistic", 10, 2)).toEqual([
            "Supercali…",
        ]);
    });
});
