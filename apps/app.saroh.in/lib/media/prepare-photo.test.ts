import { IMAGE_FULL_MAX_BYTES } from "@saroh/block-contract";
import { describe, expect, it } from "vitest";

import type { Encode } from "./prepare-photo";
import { encodeFull } from "./prepare-photo";

/** A canvas stand-in: only its size matters to the fake encoder. */
const draws = (width: number, height: number) =>
    ({ width, height }) as HTMLCanvasElement;

/**
 * A fake encoder: bytes grow with the pixels and the quality, like a real
 * one on a busy photo. `as` is the type the browser actually writes.
 */
function encoder(bytesPerPixel: number, as?: string): Encode {
    return (canvas, type, quality) =>
        Promise.resolve(
            new Blob(
                [
                    new Uint8Array(
                        Math.round(
                            canvas.width *
                                canvas.height *
                                bytesPerPixel *
                                quality,
                        ),
                    ),
                ],
                { type: as ?? type },
            ),
        );
}

const PHONE = { width: 4032, height: 3024 };

describe("the full copy (DEC-246)", () => {
    it("is WebP, its longest side 2560, at quality 0.8 when that fits", async () => {
        const seen: number[] = [];
        const encode: Encode = (c, t, q) => {
            seen.push(q);
            return encoder(0.2)(c, t, q);
        };
        const out = await encodeFull(PHONE, encode, draws);
        expect(out?.blob.type).toBe("image/webp");
        expect(out).toMatchObject({ width: 2560, height: 1920 });
        expect(seen).toEqual([0.8]);
    });

    it("always comes in under the 5 MB Ask AI takes, however busy the photo", async () => {
        for (const busy of [1, 2, 4, 8]) {
            const out = await encodeFull(PHONE, encoder(busy), draws);
            expect(out).not.toBeNull();
            expect(out?.blob.size ?? Infinity).toBeLessThanOrEqual(
                IMAGE_FULL_MAX_BYTES,
            );
            expect(IMAGE_FULL_MAX_BYTES).toBeLessThan(5 * 1024 * 1024);
        }
    });

    it("steps the quality down before the size", async () => {
        // 2560×1920 at 1.6 bytes a pixel: 6.3 MB at 0.8, 3.9 MB at 0.5.
        const tight = await encodeFull(PHONE, encoder(1.6), draws);
        expect(tight).toMatchObject({ width: 2560, height: 1920 });
        expect(tight?.blob.size ?? Infinity).toBeLessThanOrEqual(
            IMAGE_FULL_MAX_BYTES,
        );
    });

    it("writes JPEG where the browser can't write WebP", async () => {
        const encode: Encode = (c, t, q) =>
            encoder(0.2, t === "image/webp" ? "image/png" : t)(c, t, q);
        const out = await encodeFull(PHONE, encode, draws);
        expect(out?.blob.type).toBe("image/jpeg");
    });

    it("never enlarges a small photo", async () => {
        const out = await encodeFull(
            { width: 800, height: 600 },
            encoder(0.2),
            draws,
        );
        expect(out).toMatchObject({ width: 800, height: 600 });
    });
});
