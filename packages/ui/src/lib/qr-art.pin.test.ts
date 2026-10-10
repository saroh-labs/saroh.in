import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { qrArt } from "./qr-art";

/**
 * The API draws the same code on its print files from a copy of this
 * geometry (`apps/api.saroh.in/src/modules/sites/qr-print-art.ts`): it
 * can't import a UI package. Both sides pin the paths drawn for one link
 * to the values below, so a change here that the copy doesn't follow fails
 * one of the two tests.
 *
 * Changing the geometry on purpose: change the copy too, then update the
 * values here and in `qr-print-art.spec.ts` together.
 */
const LINK = "https://glow.saroh.app/q/h7c";

const hash = (d: string) =>
    createHash("sha256").update(d).digest("hex").slice(0, 16);
const marks = (d: string) => d.split("M").length - 1;

describe("qrArt, pinned with the API's print copy", () => {
    it.each([
        {
            style: "plain",
            logo: false,
            dotMarks: 476,
            eyeMarks: 9,
            dots: "044e9e44e9021c9d",
            eyes: "e4698477bbc09d10",
            box: null,
        },
        {
            style: "branded",
            logo: false,
            dotMarks: 459,
            eyeMarks: 12,
            dots: "667c9bd5c7760713",
            eyes: "bd4c137bc8100bf2",
            box: null,
        },
        {
            style: "branded",
            logo: true,
            dotMarks: 424,
            eyeMarks: 12,
            dots: "ec1d28edfc27ee07",
            eyes: "bd4c137bc8100bf2",
            box: { x: 12, y: 12, size: 9 },
        },
    ] as const)("draws a $style code (logo: $logo) as pinned", (pin) => {
        const art = qrArt(LINK, { style: pin.style, logo: pin.logo });
        expect(art.n).toBe(33);
        expect(marks(art.dots)).toBe(pin.dotMarks);
        expect(marks(art.eyes)).toBe(pin.eyeMarks);
        expect(hash(art.dots)).toBe(pin.dots);
        expect(hash(art.eyes)).toBe(pin.eyes);
        expect(art.logoBox).toEqual(pin.box);
    });
});
