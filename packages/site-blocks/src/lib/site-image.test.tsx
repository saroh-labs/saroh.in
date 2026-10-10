import type { RenderedGallery, RenderedHero } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PageSections } from "../section-renderer";
import { siteImage } from "./site-image";

/** One rule for how every picture on a merchant's page is loaded. */
describe("siteImage", () => {
    it("fetches the photo the page opens on first, ahead of everything else", () => {
        expect(siteImage("first-hero")).toEqual({
            loading: "eager",
            decoding: "async",
            fetchPriority: "high",
        });
    });

    it("fetches a picture on the first screen at once, and waits for the rest", () => {
        expect(siteImage("above")).toEqual({
            loading: "eager",
            decoding: "async",
        });
        expect(siteImage("below")).toEqual({
            loading: "lazy",
            decoding: "async",
        });
        expect(siteImage()).toEqual(siteImage("below"));
    });
});

const split = BLOCK_META.hero.fixtures.split as RenderedHero;
const gallery = BLOCK_META.gallery.fixtures.masonry as RenderedGallery;

describe("pictures on a page", () => {
    it("gives the first section's hero photo priority, and no other", () => {
        const { container } = render(
            <PageSections
                sections={[
                    { type: "hero", content: split },
                    { type: "hero", content: split },
                    { type: "gallery", content: gallery },
                ]}
            />,
        );
        const images = Array.from(container.querySelectorAll("img"));
        expect(images.length).toBeGreaterThan(2);
        const [first, second, ...rest] = images;
        expect(first).toHaveAttribute("fetchpriority", "high");
        expect(first).toHaveAttribute("loading", "eager");
        expect(second).not.toHaveAttribute("fetchpriority");
        expect(second).toHaveAttribute("loading", "lazy");
        for (const img of rest) {
            expect(img).toHaveAttribute("loading", "lazy");
            expect(img).not.toHaveAttribute("fetchpriority");
        }
        // Decoded off the main thread, every one.
        for (const img of images) {
            expect(img).toHaveAttribute("decoding", "async");
        }
    });

    it("keeps a hero's and a gallery photo's own size where the snapshot has it, so the page doesn't jump", () => {
        const sized: RenderedGallery = {
            ...gallery,
            images: gallery.images.map((image) => ({
                ...image,
                width: 800,
                height: 600,
            })),
        };
        const { container } = render(
            <PageSections
                sections={[
                    { type: "hero", content: split },
                    { type: "gallery", content: sized },
                ]}
            />,
        );
        const images = Array.from(container.querySelectorAll("img"));
        expect(images.length).toBeGreaterThan(1);
        for (const img of images) {
            expect(img).toHaveAttribute("width");
            expect(img).toHaveAttribute("height");
        }
    });

    it("has no <img> in a block that sets its own loading by hand", () => {
        // Every picture goes through `siteImage`: a hand-written
        // `loading=` or `decoding=` is a second rule.
        const root = join(__dirname, "..");
        const files = (dir: string): string[] =>
            readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) return files(full);
                return entry.name.endsWith(".tsx") &&
                    !entry.name.endsWith(".test.tsx")
                    ? [full]
                    : [];
            });
        const strays = files(root).filter((file) => {
            const source = readFileSync(file, "utf8");
            return (
                source.includes("<img") &&
                /\b(loading|decoding|fetchPriority)=/.test(source)
            );
        });
        expect(strays.map((f) => f.slice(root.length + 1))).toEqual([]);
        // And every file that draws one uses the rule.
        const without = files(root).filter((file) => {
            const source = readFileSync(file, "utf8");
            return source.includes("<img") && !source.includes("siteImage(");
        });
        expect(without.map((f) => f.slice(root.length + 1))).toEqual([]);
    });
});
