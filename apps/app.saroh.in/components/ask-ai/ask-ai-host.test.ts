// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { keepTabInside } from "./open";

/** The desk panel is a dialog: Tab never leaves it (AF boards). */
describe("keepTabInside", () => {
    const panel = () => {
        document.body.innerHTML =
            '<aside tabindex="-1"><button>a</button><button disabled>x</button><textarea></textarea></aside><button>outside</button>';
        const root = document.querySelector("aside");
        const last = root?.querySelector("textarea");
        const first = root?.querySelector("button");
        if (!root || !first || !last) throw new Error("no panel");
        return { root, first, last };
    };

    it("wraps Tab from the last control to the first, and back", () => {
        const { root, first, last } = panel();
        last.focus();
        const e = { shiftKey: false, preventDefault: vi.fn() };
        keepTabInside(e, root);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(document.activeElement).toBe(first);

        const back = { shiftKey: true, preventDefault: vi.fn() };
        keepTabInside(back, root);
        expect(document.activeElement).toBe(last);
    });

    it("leaves Tab alone in the middle", () => {
        const { root, first } = panel();
        first.focus();
        const e = { shiftKey: false, preventDefault: vi.fn() };
        keepTabInside(e, root);
        expect(e.preventDefault).not.toHaveBeenCalled();
    });
});
