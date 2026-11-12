// The share picture drawn for real with Takumi (#1375): a PNG at each
// size, Indian scripts set in their Noto faces, a WebP photo drawn and one
// the renderer can't read (AVIF) left as the tile. No network: no site
// font is asked for.
import { Renderer } from "@takumi-rs/core";

import { fontStack, scriptFamilies } from "./card-fonts";
import { SHARE_SIZES, SHARE_STYLES } from "./card-model";
import type { CardRender } from "./card-renderer";
import { drawable, renderCard } from "./card-renderer";
import * as tree from "./card-tree";

const base: CardRender = {
    name: "Cardamom bun box",
    price: "₹360",
    unit: "box of 6",
    business: "Rye & Co.",
    address: "rye.saroh.app",
    photo: null,
    fonts: { heading: null, body: null },
};

/** A PNG's width and height, from its header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
    expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** A small solid photo in `format`, drawn by Takumi itself. */
async function photo(format: "webp" | "jpeg"): Promise<Buffer> {
    return new Renderer().render(
        {
            type: "container",
            style: { width: 64, height: 64, backgroundColor: "#c98a4b" },
            children: [],
        },
        { width: 64, height: 64, format },
    );
}

afterEach(() => jest.restoreAllMocks());

describe("renderCard", () => {
    it("draws a PNG at each size, in every style", async () => {
        for (const size of Object.keys(
            SHARE_SIZES,
        ) as (keyof typeof SHARE_SIZES)[]) {
            for (const style of SHARE_STYLES) {
                const png = await renderCard({
                    ...base,
                    style,
                    size,
                    offer: { headline: "20% off", was: "₹360", now: "₹288" },
                });
                expect(pngSize(png)).toEqual(SHARE_SIZES[size]);
            }
        }
    }, 60_000);

    it("sets Devanagari text in Noto Sans Devanagari, and draws it", async () => {
        const drawn = jest.spyOn(tree, "cardTree");
        const png = await renderCard({
            ...base,
            name: "दिवाली पर बंद",
            price: null,
            style: "simple",
        });
        expect(pngSize(png)).toEqual(SHARE_SIZES.post);
        const fonts = drawn.mock.calls[0]?.[1];
        expect(fonts?.heading).toBe("'Noto Sans Devanagari', 'Noto Sans'");
        expect(fonts?.body).toBe("'Noto Sans Devanagari', 'Noto Sans'");
    }, 30_000);

    it("draws a WebP or JPEG photo, and leaves one it can't read as the tile", async () => {
        const drawn = jest.spyOn(tree, "cardTree");
        for (const format of ["webp", "jpeg"] as const) {
            await renderCard({ ...base, photo: await photo(format) });
        }
        // An AVIF's first bytes: an ISO-BMFF box with the `avif` brand.
        const avif = Buffer.from("0000001c667479706176696600000000", "hex");
        await renderCard({ ...base, photo: avif });
        expect(drawn.mock.calls.map(([input]) => input.photo)).toEqual([
            "photo",
            "photo",
            null,
        ]);
    }, 30_000);
});

describe("drawable", () => {
    it("knows PNG, JPEG, WebP and GIF by their first bytes, and nothing else", async () => {
        expect(drawable(await photo("webp"))).toBe(true);
        expect(drawable(await photo("jpeg"))).toBe(true);
        expect(drawable(Buffer.from("GIF89a000000", "latin1"))).toBe(true);
        expect(drawable(Buffer.from("<svg onload=x>", "latin1"))).toBe(false);
        expect(drawable(null)).toBe(false);
    });
});

describe("font stacks", () => {
    it("names only the scripts the text uses, before Noto Sans", () => {
        expect(scriptFamilies("Rye & Co. ₹288")).toEqual([]);
        expect(scriptFamilies("দীপাবলির · தீபாவளி")).toEqual([
            "Noto Sans Bengali",
            "Noto Sans Tamil",
        ]);
        expect(fontStack("Mukta", "नई टाइमिंग")).toBe(
            "'Mukta', 'Noto Sans Devanagari', 'Noto Sans'",
        );
        expect(fontStack(null, "Haircut")).toBe("'Noto Sans'");
    });
});
