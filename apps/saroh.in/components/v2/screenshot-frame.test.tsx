// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScreenshotFrame } from "./screenshot-frame";

/** The lightbox (plan U18): opens on click, closes on Esc, focus returns. */
afterEach(cleanup);

describe("ScreenshotFrame with zoom", () => {
    it("opens the lightbox on click and closes it on Esc, returning focus", () => {
        render(<ScreenshotFrame shot="s-billing" zoomable />);
        const trigger = screen.getByTitle("Click to enlarge");
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = screen.getByRole("dialog", {
            name: "Screenshot, enlarged",
        });
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.contains(document.activeElement)).toBe(true);

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it("closes on a click anywhere", () => {
        render(<ScreenshotFrame shot="s-billing" zoomable />);
        fireEvent.click(screen.getByTitle("Click to enlarge"));
        fireEvent.click(screen.getByRole("dialog"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Tab inside while open", () => {
        render(<ScreenshotFrame shot="s-billing" zoomable />);
        fireEvent.click(screen.getByTitle("Click to enlarge"));
        const close = screen.getByRole("button", {
            name: "Click anywhere or press Esc to close",
        });
        expect(document.activeElement).toBe(close);
        fireEvent.keyDown(document, { key: "Tab" });
        expect(document.activeElement).toBe(close);
    });

    it("uses this place's caption, else the manifest's", () => {
        render(<ScreenshotFrame shot="g-billing" alt="Four overdue" />);
        expect(screen.getByRole("img", { name: "Four overdue" })).toBeTruthy();
        cleanup();
        render(<ScreenshotFrame shot="g-billing" />);
        expect(
            screen.getByRole("img", {
                name: "Pulse Fitness's invoices with four overdue",
            }),
        ).toBeTruthy();
    });
});
