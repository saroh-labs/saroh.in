// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { shots } from "@/content/shots";

import { ShotImage } from "./shot-image";

afterEach(cleanup);

/**
 * A screenshot is an `<img>` over files (12 Oct 2026): sized copies in a
 * `srcset`, its space held by `width` and `height`, the page's hero fetched
 * first and everything else when it is near the screen.
 */
describe("ShotImage", () => {
    const shot = shots["s-home"];
    const SIZES = "(min-width: 1280px) 640px, 100vw";

    it("names static WebP files, never the image optimizer", () => {
        render(<ShotImage shot={shot} alt="Home" sizes={SIZES} />);
        const img = screen.getByRole("img", { name: "Home" });
        expect(img.getAttribute("src")).toBe(shot.src);
        const srcset = img.getAttribute("srcset") ?? "";
        expect(srcset).toContain("/shots/v2/sized/s-home-640.webp 640w");
        expect(srcset).toContain(`${shot.src} ${shot.width}w`);
        expect(srcset).not.toContain("/_next/image");
        for (const candidate of srcset.split(", ")) {
            expect(candidate).toMatch(/\.webp \d+w$/);
        }
        expect(img.getAttribute("sizes")).toBe(SIZES);
    });

    it("holds its space with the capture's own width and height", () => {
        render(<ShotImage shot={shot} alt="Home" sizes={SIZES} />);
        const img = screen.getByRole("img", { name: "Home" });
        expect(img.getAttribute("width")).toBe(String(shot.width));
        expect(img.getAttribute("height")).toBe(String(shot.height));
    });

    it("waits until it is near the screen, unless it is the page's hero", () => {
        render(<ShotImage shot={shot} alt="Below" sizes={SIZES} />);
        const below = screen.getByRole("img", { name: "Below" });
        expect(below.getAttribute("loading")).toBe("lazy");
        expect(below.getAttribute("fetchpriority")).toBeNull();
        cleanup();

        render(<ShotImage shot={shot} alt="Hero" sizes={SIZES} priority />);
        const hero = screen.getByRole("img", { name: "Hero" });
        expect(hero.getAttribute("loading")).toBe("eager");
        expect(hero.getAttribute("fetchpriority")).toBe("high");
    });

    it("draws a frame of the same shape for a shot not captured yet", () => {
        render(
            <ShotImage
                shot={{ src: null, alt: "x", width: 1600, height: 1000 }}
                alt="Not yet"
                sizes={SIZES}
            />,
        );
        const frame = screen.getByRole("img", { name: "Not yet" });
        expect(frame.tagName).toBe("SPAN");
    });
});
