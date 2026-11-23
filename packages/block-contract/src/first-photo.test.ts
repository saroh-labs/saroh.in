import { describe, expect, it } from "vitest";

import { firstPhotoOf } from "./first-photo";

describe("firstPhotoOf", () => {
    it("takes the first photo in section order, with its stored copies", () => {
        expect(
            firstPhotoOf([
                { heading: "Hi" },
                {
                    items: [
                        { image: { src: "https://x/a.jpg", widths: [480] } },
                    ],
                },
                { src: "https://x/b.jpg" },
            ]),
        ).toEqual({ src: "https://x/a.jpg", widths: [480] });
    });
    it("is null when there is none, and ignores a frame", () => {
        expect(
            firstPhotoOf([{ heading: "Hi", frame: { src: "x" } }]),
        ).toBeNull();
        expect(firstPhotoOf([])).toBeNull();
    });
});
