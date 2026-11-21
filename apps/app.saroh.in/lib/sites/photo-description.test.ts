import { describe, expect, it } from "vitest";

import { photoAt, withPhotoDescription } from "./photo-description";
import type { DraftSection } from "./service";

const sections = [
    {
        type: "hero",
        contractVersion: 1,
        key: "k1",
        order: 0,
        content: { heading: "Hi" },
    },
    {
        type: "gallery",
        contractVersion: 2,
        key: "k2",
        order: 1,
        content: { images: [{ src: "/a.jpg", alt: "" }, { src: "/b.jpg" }] },
    },
] as unknown as DraftSection[];

describe("Describe it (U10)", () => {
    it("writes the description into that photo only, and drops order", () => {
        const next = withPhotoDescription(
            sections,
            1,
            "images.1",
            "  Bride in red ",
        );
        expect(next?.[1].content).toEqual({
            images: [
                { src: "/a.jpg", alt: "" },
                { src: "/b.jpg", alt: "Bride in red" },
            ],
        });
        expect(next?.[0]).toEqual({
            type: "hero",
            contractVersion: 1,
            key: "k1",
            content: { heading: "Hi" },
        });
        // The draft read is not changed in place.
        expect(sections[1].content).toEqual({
            images: [{ src: "/a.jpg", alt: "" }, { src: "/b.jpg" }],
        });
    });

    it("refuses when the photo is gone since the check", () => {
        expect(withPhotoDescription(sections, 1, "images.5", "x")).toBeNull();
        expect(withPhotoDescription(sections, 0, "image", "x")).toBeNull();
        expect(withPhotoDescription(sections, 9, "image", "x")).toBeNull();
    });

    it("finds the photo to show", () => {
        expect(photoAt(sections, 1, "images.0")).toBe("/a.jpg");
        expect(photoAt(sections, 0, "image")).toBeNull();
    });

    it("walks own fields only, so `__proto__` never reaches Object.prototype", () => {
        for (const path of [
            "__proto__",
            "constructor.prototype",
            "images.__proto__",
        ]) {
            expect(withPhotoDescription(sections, 1, path, "x")).toBeNull();
        }
        expect(({} as { alt?: unknown }).alt).toBeUndefined();
        // An inherited photo is not this section's photo.
        const inherited = [
            {
                ...sections[0],
                content: Object.create({ src: "/x.jpg" }) as object,
            },
        ] as unknown as DraftSection[];
        expect(photoAt(inherited, 0, "__proto__")).toBeNull();
    });
});
