import { describe, expect, it } from "vitest";

import {
    dropUnsafeImages,
    isSafeImageSrc,
    parseSectionContent,
} from "./section-contract";

// 06 L1: a photo's src must not carry a script scheme.
describe("image src", () => {
    it.each([
        "https://cdn.example.com/a.jpg",
        "http://example.com/a.png",
        "/templates/starter/hero.jpg",
        "data:image/png;base64,iVBORw0KGgo=",
        "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='8' height='6' fill='%23d9cbb5'/%3E%3C/svg%3E",
    ])("accepts %s", (src) => {
        expect(isSafeImageSrc(src)).toBe(true);
    });

    it.each([
        "javascript:window.__pwn=9",
        "JaVaScRiPt:alert(1)",
        " javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "data:image/svg+xml,<svg onload=alert(1)>",
        "data:image/svg+xml,%3Csvg%3E%3Cscript%3Ealert(1)%3C/script%3E",
        "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
        "//evil.example/a.jpg",
        "/\\evil.example/a.jpg",
        "vbscript:x",
    ])("refuses %s", (src) => {
        expect(isSafeImageSrc(src)).toBe(false);
    });

    it("refuses a javascript: photo in the gallery, projects and person blocks", () => {
        const bad = { src: "javascript:window.__pwn=9", alt: "" };
        expect(
            parseSectionContent("gallery", 1, { images: [bad] }).success,
        ).toBe(false);
        expect(
            parseSectionContent("person", 1, { name: "Anika", image: bad })
                .success,
        ).toBe(false);
        expect(
            parseSectionContent("person", 1, {
                name: "Anika",
                image: { src: "https://x/a.jpg" },
            }).success,
        ).toBe(true);
    });

    it("drops stored unsafe photos and keeps the safe ones", () => {
        const content = {
            name: "Anika",
            image: { src: "javascript:x" },
            images: [{ src: "javascript:y" }, { src: "/a.jpg" }],
        };
        expect(dropUnsafeImages(content)).toEqual({
            name: "Anika",
            images: [{ src: "/a.jpg" }],
        });
        expect(
            parseSectionContent(
                "person",
                1,
                dropUnsafeImages({
                    name: "Anika",
                    image: { src: "javascript:x" },
                }),
            ).success,
        ).toBe(true);
    });
});
