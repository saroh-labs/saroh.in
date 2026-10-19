import type { RenderedGallery, RenderedHero } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "../section-renderer";
import { IMAGE_WIDTHS, mediaKeyOf, resizedSources } from "./image-sizes";
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

const MEDIA = "https://media.saroh.test";
const PHOTO = `${MEDIA}/org/orgnorthwind1/site-image/1b2c-hero.jpg`;
const PHOTO_KEY = "org/orgnorthwind1/site-image/1b2c-hero.jpg";

/** Sized for the screen (#1043), where the build names the media address. */
describe("siteImage with a photo", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("adds nothing without the media address: the markup it always had", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", "");
        expect(
            siteImage("below", { src: PHOTO, width: 2400, sizes: "50vw" }),
        ).toEqual({ loading: "lazy", decoding: "async" });
        expect(siteImage("first-hero", { src: PHOTO, width: 2400 })).toEqual({
            loading: "eager",
            decoding: "async",
            fetchPriority: "high",
        });
    });

    it("gives the first hero eager, high priority, every ladder step and the sizes it was given", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", MEDIA);
        const props = siteImage("first-hero", {
            src: PHOTO,
            width: 2400,
            sizes: "(min-width: 1024px) 50vw, 100vw",
        });
        expect(props).toMatchObject({
            loading: "eager",
            decoding: "async",
            fetchPriority: "high",
            src: `/_img/780/${PHOTO_KEY}`,
            sizes: "(min-width: 1024px) 50vw, 100vw",
        });
        expect(props.srcSet?.split(", ")).toEqual(
            IMAGE_WIDTHS.map((w) => `/_img/${w}/${PHOTO_KEY} ${w}w`),
        );
    });

    it("keeps lazy below the fold, and says 100vw when no sizes are given", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", MEDIA);
        const props = siteImage("below", { src: PHOTO });
        expect(props.loading).toBe("lazy");
        expect(props.fetchPriority).toBeUndefined();
        expect(props.sizes).toBe("100vw");
        // No width known: the whole ladder.
        expect(props.srcSet?.split(", ")).toHaveLength(IMAGE_WIDTHS.length);
    });

    it("offers nothing wider than the photo itself", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", MEDIA);
        const props = siteImage("below", { src: PHOTO, width: 1000 });
        expect(props.srcSet?.split(", ")).toEqual([
            `/_img/320/${PHOTO_KEY} 320w`,
            `/_img/480/${PHOTO_KEY} 480w`,
            `/_img/780/${PHOTO_KEY} 780w`,
            // Its own 1000 px, through the 1200 step (never enlarged).
            `/_img/1200/${PHOTO_KEY} 1000w`,
        ]);
        const small = siteImage("below", { src: PHOTO, width: 200 });
        expect(small.srcSet).toBe(`/_img/320/${PHOTO_KEY} 200w`);
        expect(small.src).toBe(`/_img/320/${PHOTO_KEY}`);
    });

    it("leaves a photo that isn't the business's own as it was", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", MEDIA);
        for (const src of [
            "https://images.example.com/org/x/site-image/a.jpg",
            `${MEDIA}/org/x/data-export/a.jpg`,
            `${MEDIA}/org/x/business-logo/logo.svg`,
            `${MEDIA}/org/x/site-image/a.gif`,
            `${MEDIA}/org/x/site-image/a.jpg?v=2`,
            "data:image/svg+xml;utf8,<svg/>",
            "/templates/bakery/hero.jpg",
        ]) {
            expect(siteImage("below", { src })).toEqual({
                loading: "lazy",
                decoding: "async",
            });
        }
    });
});

describe("image-sizes", () => {
    it("reads a media key only under the media address, with an image purpose", () => {
        expect(mediaKeyOf(PHOTO, MEDIA)).toEqual({
            key: PHOTO_KEY,
            organizationId: "orgnorthwind1",
            purpose: "site-image",
        });
        expect(mediaKeyOf(PHOTO, `${MEDIA}/`)).not.toBeNull();
        expect(mediaKeyOf(PHOTO, "http://media.saroh.test")).toBeNull();
        expect(mediaKeyOf(PHOTO, undefined)).toBeNull();
        expect(
            mediaKeyOf(`${MEDIA}/org/a/product-image/b.webp`, MEDIA)?.purpose,
        ).toBe("product-image");
        expect(
            mediaKeyOf(`${MEDIA}/org/a/business-logo/b.png`, MEDIA)?.purpose,
        ).toBe("business-logo");
    });

    it("names the middle width as src", () => {
        expect(resizedSources({ src: PHOTO }, MEDIA)?.src).toBe(
            `/_img/780/${PHOTO_KEY}`,
        );
        expect(resizedSources({ src: PHOTO, width: 600 }, MEDIA)?.src).toBe(
            `/_img/780/${PHOTO_KEY}`,
        );
        expect(resizedSources({ src: PHOTO, width: 400 }, MEDIA)?.src).toBe(
            `/_img/480/${PHOTO_KEY}`,
        );
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

describe("the first hero on a page (#1043)", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    // React preloads each address once per document: every test here has
    // its own photo, so one test's link is never another's.
    const heroWith = (file: string): RenderedHero => ({
        ...split,
        image: {
            src: `${MEDIA}/org/orgnorthwind1/site-image/${file}`,
            alt: "",
            width: 1600,
            height: 1000,
        },
    });
    const preloadFor = (attr: string, value: string) =>
        Array.from(
            document.head.querySelectorAll('link[rel="preload"][as="image"]'),
        ).find((link) => link.getAttribute(attr) === value);

    it("is sized for the screen and preloaded from the head with the same sources", () => {
        vi.stubEnv("NEXT_PUBLIC_SITE_MEDIA_URL", MEDIA);
        const { container } = render(
            <PageSections
                sections={[{ type: "hero", content: heroWith("3c4d-a.jpg") }]}
            />,
        );
        const img = container.querySelector("img");
        const srcset = img?.getAttribute("srcset") ?? "";
        expect(srcset).toContain(
            "/_img/1600/org/orgnorthwind1/site-image/3c4d-a.jpg 1600w",
        );
        expect(srcset).not.toContain("1920w");
        expect(img).toHaveAttribute("sizes", "(min-width: 1024px) 50vw, 100vw");
        expect(img).toHaveAttribute("width", "1600");
        expect(img).toHaveAttribute("height", "1000");
        const link = preloadFor("imagesrcset", srcset);
        expect(link).toBeDefined();
        expect(link?.getAttribute("imagesizes")).toBe(
            img?.getAttribute("sizes"),
        );
        expect(link?.getAttribute("fetchpriority")).toBe("high");
    });

    it("keeps its own src without the media address, and is still preloaded", () => {
        const hero = heroWith("4d5e-b.jpg");
        const { container } = render(
            <PageSections sections={[{ type: "hero", content: hero }]} />,
        );
        const img = container.querySelector("img");
        expect(img).toHaveAttribute("src", hero.image?.src);
        expect(img).not.toHaveAttribute("srcset");
        expect(img).not.toHaveAttribute("sizes");
        const link = preloadFor("href", hero.image?.src ?? "");
        expect(link?.getAttribute("fetchpriority")).toBe("high");
    });
});
