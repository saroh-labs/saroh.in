import { configure } from "@testing-library/react";

/**
 * A screen's width, for tests. jsdom loads no Tailwind, so the two classes
 * that show one of a pair by width (`min-[700px]:hidden` for what only a
 * phone shows, `max-[699px]:hidden` for what only a desk does) hide nothing
 * there, and a test would find both. This applies the one rule each width
 * does: a stylesheet for queries by role, and the same class left out of
 * queries by text, so a test sees what a visitor at that width sees.
 *
 * The suite runs as a desk (`vitest.setup.ts`); a test of the phone's
 * layout calls `viewport("phone")`. Tests only: nothing ships this.
 */
const ID = "saroh-test-viewport";

/** The class that hides at each width. */
const HIDDEN = {
    desk: ".min-\\[700px\\]\\:hidden",
    phone: ".max-\\[699px\\]\\:hidden",
} as const;

export function viewport(kind: keyof typeof HIDDEN): void {
    if (typeof document === "undefined") return;
    let style = document.getElementById(ID);
    if (!style) {
        style = document.createElement("style");
        style.id = ID;
        document.head.appendChild(style);
    }
    const hidden = HIDDEN[kind];
    style.textContent = `${hidden}{display:none}`;
    configure({ defaultIgnore: `script, style, ${hidden}, ${hidden} *` });
}
