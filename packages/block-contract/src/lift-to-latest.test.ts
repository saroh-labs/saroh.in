import { describe, expect, it } from "vitest";

import {
    latestContractVersion,
    liftToLatest,
    parseSectionContent,
} from "./section-contract";

const IMAGE = {
    src: "https://images.unsplash.com/photo-1727867246475-270f9783d5a2",
    alt: "A woman in a sage cotton sundress by a lake",
};

describe("liftToLatest", () => {
    it("lifts a starter hero's v1 button so a Split hero with an image saves", () => {
        // The starter template's hero: v1, its button an address.
        const v1 = {
            heading: "Mulmul & Co",
            subheading: "Welcome",
            cta: { label: "About Mulmul & Co", href: "/about" },
        };
        const lifted = liftToLatest("hero", 1, {
            ...v1,
            variant: "split",
            image: IMAGE,
        });
        expect(lifted.version).toBe(latestContractVersion("hero"));
        expect(lifted.content.cta).toEqual({
            label: "About Mulmul & Co",
            action: { kind: "url", href: "/about" },
        });
        const parsed = parseSectionContent(
            "hero",
            lifted.version,
            lifted.content,
        );
        expect(parsed.success).toBe(true);
    });

    it("leaves a hero with no button, or one already v2, as it was", () => {
        const plain = { heading: "Hi" };
        expect(liftToLatest("hero", 1, plain).content).toEqual(plain);
        const v2 = {
            heading: "Hi",
            cta: { label: "Go", action: { kind: "page", pageId: "p1" } },
        };
        expect(liftToLatest("hero", 1, v2).content).toEqual(v2);
    });

    it("lifts a v1 call-to-action block", () => {
        const lifted = liftToLatest("cta", 1, {
            label: "Book now",
            href: "/book",
            style: "secondary",
        });
        expect(lifted.content).toEqual({
            label: "Book now",
            style: "secondary",
            action: { kind: "url", href: "/book" },
        });
        expect(
            parseSectionContent("cta", lifted.version, lifted.content).success,
        ).toBe(true);
    });

    it("turns a v1 gallery's layout into its variant", () => {
        const lifted = liftToLatest("gallery", 1, {
            images: [IMAGE],
            layout: "masonry",
        });
        expect(lifted.content).toEqual({ images: [IMAGE], variant: "masonry" });
        expect(
            parseSectionContent("gallery", lifted.version, lifted.content)
                .success,
        ).toBe(true);
    });

    it("returns content already at the latest version unchanged", () => {
        const content = { heading: "Hi", variant: "split", image: IMAGE };
        const latest = latestContractVersion("hero");
        expect(liftToLatest("hero", latest, content)).toEqual({
            version: latest,
            content,
        });
        expect(liftToLatest("richText", 1, { body: "x" })).toEqual({
            version: 1,
            content: { body: "x" },
        });
    });
});
