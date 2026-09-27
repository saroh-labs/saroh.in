import { describe, expect, it } from "vitest";

import { ZOOMS } from "@/components/sites/editor-constants";
import {
    CANVAS_PADDING,
    editorColumns,
    fitScaleFor,
    zoomScaleFor,
} from "@/components/sites/editor/use-editor-viewport";

/*
 * The zoom and Fit maths, as `site-editor.tsx` did them before the split
 * (#260): Fit is (canvas width − 48px of padding) ÷ the device's frame width,
 * capped at 1; a fixed step is its percentage.
 */
describe("fitScaleFor", () => {
    it("never scales Desktop, which has no fixed width", () => {
        expect(fitScaleFor("desktop", 320)).toBe(1);
        expect(fitScaleFor("desktop", 4000)).toBe(1);
    });

    it("fits a phone frame (375px) into a narrow canvas", () => {
        expect(fitScaleFor("phone", 300)).toBe(252 / 375);
        expect(fitScaleFor("phone", 375 + CANVAS_PADDING)).toBe(1);
    });

    it("fits a tablet frame (768px) into a canvas narrower than it", () => {
        expect(fitScaleFor("tablet", 600)).toBe(552 / 768);
    });

    it("reports more than 1 for a canvas wider than the frame", () => {
        // Capping is the zoom's job, so the raw measure is kept.
        expect(fitScaleFor("phone", 1000)).toBe(952 / 375);
    });
});

describe("zoomScaleFor", () => {
    it("reads a fixed step as its percentage, whatever the canvas", () => {
        expect(zoomScaleFor(50, 0.3)).toBe(0.5);
        expect(zoomScaleFor(75, 2)).toBe(0.75);
        expect(zoomScaleFor(100, 0.3)).toBe(1);
    });

    it("follows the canvas on Fit, and never scales a frame up", () => {
        expect(zoomScaleFor("fit", 252 / 375)).toBe(252 / 375);
        expect(zoomScaleFor("fit", 952 / 375)).toBe(1);
    });

    it("offers the same four steps as before", () => {
        expect(ZOOMS).toEqual([50, 75, 100, "fit"]);
    });
});

describe("editorColumns", () => {
    it("gives each side column its width or its share of the room left", () => {
        expect(editorColumns(232, 320)).toBe(
            "min(232px, calc((100vw - 20rem - 2px) * 0.4203)) 1px minmax(20rem,1fr) 1px min(320px, calc((100vw - 20rem - 2px) * 0.5797))",
        );
    });
});
