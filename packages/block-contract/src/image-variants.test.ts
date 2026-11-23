import { describe, expect, it } from "vitest";

import {
    fullSizeFor,
    IMAGE_PLACEHOLDER_MAX,
    isValidPlaceholder,
    placeholderDataUrl,
    placeholderFromRgba,
    storedSrcSet,
    thumbnailSrc,
    variantKey,
    variantSrc,
    variantWidthsFor,
} from "./image-variants";

/** A w×h picture of one colour, RGBA. */
function solid(w: number, h: number, alpha = 255): Uint8Array {
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < px.length; i += 4) {
        px.set([200, 120, 60, alpha], i);
    }
    return px;
}

const OPAQUE = placeholderFromRgba(40, 30, solid(40, 30));
const SEE_THROUGH = placeholderFromRgba(40, 30, solid(40, 30, 0));

describe("the width ladder (DEC-246)", () => {
    it("never makes a copy as wide as the photo or wider", () => {
        expect(variantWidthsFor(4000)).toEqual([480, 1200, 1920]);
        expect(variantWidthsFor(1920)).toEqual([480, 1200]);
        expect(variantWidthsFor(1000)).toEqual([480]);
        expect(variantWidthsFor(480)).toEqual([]);
        expect(variantWidthsFor(300)).toEqual([]);
    });

    it("caps the full copy's longest side and never enlarges", () => {
        expect(fullSizeFor(4032, 3024)).toEqual({ width: 2560, height: 1920 });
        expect(fullSizeFor(3024, 4032)).toEqual({ width: 1920, height: 2560 });
        expect(fullSizeFor(800, 600)).toEqual({ width: 800, height: 600 });
    });

    it("keys a copy beside its photo", () => {
        expect(variantKey("org/a/site-image/u-p.webp", 480)).toBe(
            "org/a/site-image/u-p@480.webp",
        );
        expect(variantKey("org/a/site-image/u-p.jpg", 480)).toBe(
            "org/a/site-image/u-p.jpg@480.webp",
        );
        expect(variantKey("org/a/x.webp", 0)).toBeNull();
        expect(variantKey("org/a/x.webp", 1.5)).toBeNull();
    });
});

describe("the placeholder", () => {
    it("accepts a ThumbHash and refuses anything else", () => {
        expect(isValidPlaceholder(OPAQUE)).toBe(true);
        expect(OPAQUE.length).toBeLessThanOrEqual(IMAGE_PLACEHOLDER_MAX);
        expect(isValidPlaceholder("")).toBe(false);
        expect(isValidPlaceholder("not base64!")).toBe(false);
        expect(isValidPlaceholder("AAAA")).toBe(false); // too short
        expect(isValidPlaceholder("A".repeat(68))).toBe(false); // too long
        expect(isValidPlaceholder(42)).toBe(false);
    });

    it("draws an opaque one as a PNG data URL, without a canvas", () => {
        const url = placeholderDataUrl(OPAQUE);
        expect(url).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    });

    it("draws nothing for a see-through photo or a bad value", () => {
        expect(placeholderDataUrl(SEE_THROUGH)).toBeNull();
        expect(placeholderDataUrl("nope")).toBeNull();
        expect(placeholderDataUrl(null)).toBeNull();
    });
});

describe("srcSet from the stored copies", () => {
    const src = "https://media.saroh.in/org/a/site-image/u-p.webp";

    it("lists each copy, then the photo at its own width", () => {
        expect(
            storedSrcSet({ src, width: 2560, widths: [1200, 480, 1920] }),
        ).toBe(
            [
                "https://media.saroh.in/org/a/site-image/u-p@480.webp 480w",
                "https://media.saroh.in/org/a/site-image/u-p@1200.webp 1200w",
                "https://media.saroh.in/org/a/site-image/u-p@1920.webp 1920w",
                `${src} 2560w`,
            ].join(", "),
        );
    });

    it("is null without copies or a width, so the caller keeps what it did", () => {
        expect(storedSrcSet({ src, width: 2560 })).toBeNull();
        expect(storedSrcSet({ src, width: 2560, widths: [] })).toBeNull();
        expect(storedSrcSet({ src, widths: [480] })).toBeNull();
        expect(
            storedSrcSet({ src: "/local.webp", width: 900, widths: [480] }),
        ).toBeNull();
    });

    it("never derives from an address with a query", () => {
        expect(variantSrc(`${src}?v=1`, 480)).toBeNull();
    });

    it("gives the app the 480 copy as a thumbnail, or the photo", () => {
        expect(thumbnailSrc(src, [480, 1200])).toBe(
            "https://media.saroh.in/org/a/site-image/u-p@480.webp",
        );
        expect(thumbnailSrc(src, [])).toBe(src);
        expect(thumbnailSrc(src, undefined)).toBe(src);
    });
});
