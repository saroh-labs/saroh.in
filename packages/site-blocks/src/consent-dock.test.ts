import { describe, expect, it } from "vitest";

import type { ScreenBox } from "./consent-dock";
import {
    boxesOverlap,
    consentDock,
    DOCK_INSET,
    dockBox,
    heroTargets,
} from "./consent-dock";

/**
 * Where a look's cookie banner docks (DEC-172, plan U15): it never covers
 * the hero's buttons. Measured on a 390×844 phone, the size the boards
 * and the e2e check use.
 */
const PHONE = { viewport: 844, left: 12, right: 378 };
const box = (
    top: number,
    height: number,
    left = 20,
    right = 370,
): ScreenBox => ({
    top,
    bottom: top + height,
    left,
    right,
});

describe("consentDock", () => {
    it("docks at the foot when nothing is under it", () => {
        expect(
            consentDock({ ...PHONE, height: 200, targets: [box(300, 52)] }),
        ).toBe("bottom");
    });

    it("moves to the top when the foot would cover a hero button", () => {
        // Book at 700–752 on a 844 screen; a 200px banner at the foot
        // spans 632–832.
        expect(
            consentDock({ ...PHONE, height: 200, targets: [box(700, 52)] }),
        ).toBe("top");
    });

    it("never overlaps a data-site-primary button at 390×844, wherever it sits", () => {
        for (let top = 0; top <= 844 - 52; top += 4) {
            const target = box(top, 52);
            const height = 220;
            const dock = consentDock({ ...PHONE, height, targets: [target] });
            const banner = dockBox(dock, { ...PHONE, height });
            expect(boxesOverlap(banner, target)).toBe(false);
        }
    });

    it("ignores a button that is off screen", () => {
        expect(
            consentDock({ ...PHONE, height: 200, targets: [box(900, 52)] }),
        ).toBe("bottom");
        expect(
            consentDock({ ...PHONE, height: 200, targets: [box(-120, 52)] }),
        ).toBe("bottom");
    });

    it("stays at the foot when both spots cover a button (nothing better)", () => {
        expect(
            consentDock({
                ...PHONE,
                height: 200,
                targets: [box(40, 52), box(700, 52)],
            }),
        ).toBe("bottom");
    });

    it("keeps its gap from the screen's edge", () => {
        const at = dockBox("bottom", { ...PHONE, height: 100 });
        expect(at.bottom).toBe(844 - DOCK_INSET);
        expect(dockBox("top", { ...PHONE, height: 100 }).top).toBe(DOCK_INSET);
    });
});

describe("boxesOverlap", () => {
    it("counts shared area only, never touching edges", () => {
        expect(boxesOverlap(box(0, 10), box(10, 10))).toBe(false);
        expect(boxesOverlap(box(0, 11), box(10, 10))).toBe(true);
        expect(boxesOverlap(box(0, 10, 0, 10), box(0, 10, 10, 20))).toBe(false);
    });
});

describe("heroTargets", () => {
    it("takes every link and button in a look's hero", () => {
        document.body.innerHTML = `
            <header data-site-header><a href="/book" data-site-primary>Book</a></header>
            <section data-site-look-hero="quiet">
                <a href="/book">Book a visit</a>
                <button type="button">Play</button>
            </section>`;
        expect(heroTargets(document).map((e) => e.textContent)).toEqual([
            "Book a visit",
            "Play",
        ]);
    });

    it("else the page's first main action, never the chrome's or a booking bar", () => {
        document.body.innerHTML = `
            <header data-site-header><a href="/book" data-site-primary>Book</a></header>
            <div data-booking-bar><button data-site-primary>Continue</button></div>
            <main><a href="/" data-site-primary>Go to the home page</a></main>`;
        expect(heroTargets(document).map((e) => e.textContent)).toEqual([
            "Go to the home page",
        ]);
    });

    it("finds nothing on a page with no action", () => {
        document.body.innerHTML = "<main><p>Words</p></main>";
        expect(heroTargets(document)).toEqual([]);
    });
});
