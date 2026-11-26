import { Renderer } from "@takumi-rs/core";

import { drawable } from "../modules/share-posts/cards/card-renderer";
import {
    IMAGE_MAX_BYTES,
    IMAGE_MAX_PIXELS,
    imageSize,
    withinImageLimits,
} from "./image-size";

/** A PNG signature and IHDR claiming this size, and no pixels at all. */
function pngHeader(width: number, height: number): Buffer {
    const b = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write("IHDR", 12, "latin1");
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    b[24] = 8; // bit depth
    b[25] = 6; // RGBA
    return b;
}

function gifHeader(width: number, height: number): Buffer {
    const b = Buffer.alloc(13);
    b.write("GIF89a", 0, "latin1");
    b.writeUInt16LE(width, 6);
    b.writeUInt16LE(height, 8);
    return b;
}

function webpHeader(width: number, height: number): Buffer {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0, "latin1");
    b.write("WEBP", 8, "latin1");
    b.write("VP8X", 12, "latin1");
    b.writeUIntLE(width - 1, 24, 3);
    b.writeUIntLE(height - 1, 27, 3);
    return b;
}

/** SOI, an empty APP0 segment, then a baseline frame header. */
function jpegHeader(width: number, height: number): Buffer {
    const b = Buffer.alloc(27);
    b.writeUInt16BE(0xffd8, 0); // SOI
    b.writeUInt16BE(0xffe0, 2); // APP0, its 2 length bytes and 2 more
    b.writeUInt16BE(4, 4);
    b.writeUInt16BE(0xffc0, 8); // SOF0
    b.writeUInt16BE(17, 10);
    b[12] = 8;
    b.writeUInt16BE(height, 13);
    b.writeUInt16BE(width, 15);
    b[17] = 3;
    return b;
}

describe("imageSize", () => {
    it.each([
        ["PNG", pngHeader],
        ["GIF", gifHeader],
        ["WebP", webpHeader],
        ["JPEG", jpegHeader],
    ])("reads a %s header's size", (_kind, header) => {
        expect(imageSize(header(1200, 800))).toEqual({
            width: 1200,
            height: 800,
        });
    });

    it("reads real images Takumi drew", async () => {
        for (const format of ["png", "jpeg", "webp"] as const) {
            const bytes = await new Renderer().render(
                {
                    type: "container",
                    style: { width: 64, height: 48, backgroundColor: "#333" },
                    children: [],
                },
                { width: 64, height: 48, format },
            );
            expect(imageSize(bytes)).toEqual({ width: 64, height: 48 });
        }
    });

    it("knows nothing else", () => {
        expect(imageSize(Buffer.from("not an image at all"))).toBeNull();
    });
});

describe("the limits before a decode", () => {
    it("refuses a header that claims too many pixels, before any decode", () => {
        const side = Math.ceil(Math.sqrt(IMAGE_MAX_PIXELS)) + 1;
        for (const header of [pngHeader, gifHeader, webpHeader, jpegHeader]) {
            expect(withinImageLimits(header(1200, 800))).toBe(true);
            expect(withinImageLimits(header(side, side))).toBe(false);
        }
    });

    it("refuses too many bytes, and a size of nothing", () => {
        const big = Buffer.alloc(IMAGE_MAX_BYTES + 1);
        pngHeader(100, 100).copy(big, 0);
        expect(withinImageLimits(big)).toBe(false);
        expect(withinImageLimits(pngHeader(0, 100))).toBe(false);
    });

    it("a share card never draws one past the limits: it draws the tile", () => {
        expect(drawable(pngHeader(1200, 800))).toBe(true);
        expect(drawable(pngHeader(30_000, 30_000))).toBe(false);
    });
});
