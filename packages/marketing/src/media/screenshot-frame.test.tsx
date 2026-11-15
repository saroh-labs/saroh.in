// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenshotFrame } from "./screenshot-frame";
import type { ShotView } from "./shot";

const SHOT: ShotView = {
    id: "s-billing",
    image: { src: null, alt: "The manifest's", width: 1600, height: 1000 },
};

/**
 * The lightbox (plan U18): opens on click, closes on Esc, focus returns. It
 * is fetched on the first click, so each test waits for it.
 */
afterEach(cleanup);

describe("ScreenshotFrame with zoom", () => {
    it("opens the lightbox on click and closes it on Esc, returning focus", async () => {
        render(<ScreenshotFrame shot={SHOT} zoomable />);
        const trigger = screen.getByTitle("Click to enlarge");
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = await screen.findByRole("dialog", {
            name: "Screenshot, enlarged",
        });
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.contains(document.activeElement)).toBe(true);

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it("closes on a click anywhere", async () => {
        render(<ScreenshotFrame shot={SHOT} zoomable />);
        fireEvent.click(screen.getByTitle("Click to enlarge"));
        fireEvent.click(await screen.findByRole("dialog"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Tab inside while open", async () => {
        render(<ScreenshotFrame shot={SHOT} zoomable />);
        fireEvent.click(screen.getByTitle("Click to enlarge"));
        const close = await screen.findByRole("button", {
            name: "Click anywhere or press Esc to close",
        });
        expect(document.activeElement).toBe(close);
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(close);
    });

    it("carries the site's key as data-shot", () => {
        const { container } = render(<ScreenshotFrame shot={SHOT} />);
        expect(
            container.querySelector("[data-shot]")?.getAttribute("data-shot"),
        ).toBe("s-billing");
    });

    it("uses this place's caption, else the manifest's", () => {
        render(<ScreenshotFrame shot={{ ...SHOT, alt: "Four overdue" }} />);
        expect(screen.getByRole("img", { name: "Four overdue" })).toBeTruthy();
        cleanup();
        render(<ScreenshotFrame shot={SHOT} />);
        expect(
            screen.getByRole("img", { name: "The manifest's" }),
        ).toBeTruthy();
    });
});

describe("ScreenshotFrame with a phone capture", () => {
    it("draws the phone capture under 640px and the desk one above", () => {
        const { container } = render(
            <ScreenshotFrame
                shot={{
                    id: "ask-hero",
                    image: {
                        src: "/shots/v2/ask-hero.webp",
                        alt: "Desk",
                        width: 2880,
                        height: 2400,
                        phone: {
                            src: "/shots/v2/ask-hero-phone.webp",
                            alt: "Phone",
                            width: 780,
                            height: 1688,
                        },
                    },
                }}
            />,
        );
        const source = container.querySelector("picture > source");
        expect(source?.getAttribute("media")).toBe("(max-width: 639px)");
        expect(source?.getAttribute("srcset")).toBe(
            "/shots/v2/ask-hero-phone.webp",
        );
        expect(
            container.querySelector("picture > img")?.getAttribute("src"),
        ).toBe("/shots/v2/ask-hero.webp");
    });
});
