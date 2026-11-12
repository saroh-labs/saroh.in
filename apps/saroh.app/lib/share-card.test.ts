import { describe, expect, it, vi } from "vitest";

import { clipLines, photoData, shareCardModel } from "./share-card";

/** The share picture's layout inputs (#1375 U1), apart from drawing them. */
describe("shareCardModel", () => {
    const input = {
        name: "Country sourdough",
        price: "₹320",
        business: "Rye & Co.",
        photo: null,
    };

    it("takes its colours and corners from the site's tokens", () => {
        const m = shareCardModel({
            ...input,
            variables: {
                "--site-bg": "40 24% 97%",
                "--site-fg": "20 14% 12%",
                "--site-accent": "16 60% 40%",
                "--site-radius": "20px",
            },
        });
        expect(m.colours.bg).toBe("hsl(40, 24%, 97%)");
        expect(m.colours.fg).toBe("hsl(20, 14%, 12%)");
        expect(m.colours.accent).toBe("hsl(16, 60%, 40%)");
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

    it("keeps a long name to two lines", () => {
        const m = shareCardModel({
            ...input,
            name: "Slow fermented country sourdough with toasted seeds and rye",
        });
        expect(m.nameLines).toHaveLength(2);
        expect(m.nameLines[1]?.endsWith("…")).toBe(true);
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

describe("photoData", () => {
    const answer = (type: string, body = new Uint8Array([1, 2, 3])) =>
        vi.fn(() =>
            Promise.resolve(
                new Response(body, { headers: { "content-type": type } }),
            ),
        ) as unknown as typeof fetch;

    it("turns a PNG or JPEG into a data address", async () => {
        expect(await photoData("https://m/x.png", answer("image/png"))).toBe(
            "data:image/png;base64,AQID",
        );
        expect(
            await photoData("https://m/x.jpg", answer("image/jpeg")),
        ).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("gives none for a format it can't draw, a failed fetch or no photo", async () => {
        expect(await photoData("https://m/x.webp", answer("image/webp"))).toBe(
            null,
        );
        const fails = vi.fn(() =>
            Promise.reject(new Error("down")),
        ) as unknown as typeof fetch;
        expect(await photoData("https://m/x.png", fails)).toBe(null);
        expect(await photoData(null)).toBe(null);
    });
});
