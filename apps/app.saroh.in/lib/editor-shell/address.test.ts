// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTypingIn, leavePlace, placeWaiting, takePlace } from "./address";

/** A new record's address waits until nobody is typing (UX-080). */
describe("isTypingIn", () => {
    const make = (html: string) => {
        const host = document.createElement("div");
        host.innerHTML = html;
        return host.firstElementChild;
    };

    it("is typing in a text field or a text area", () => {
        expect(isTypingIn(make('<input type="text">'))).toBe(true);
        expect(isTypingIn(make("<input>"))).toBe(true);
        expect(isTypingIn(make('<input type="number">'))).toBe(true);
        expect(isTypingIn(make("<textarea></textarea>"))).toBe(true);
    });

    it("isn't on a button, a switch or the page", () => {
        expect(isTypingIn(make("<button>Publish</button>"))).toBe(false);
        expect(isTypingIn(make('<input type="checkbox">'))).toBe(false);
        expect(isTypingIn(make('<input type="radio">'))).toBe(false);
        expect(isTypingIn(document.body)).toBe(false);
        expect(isTypingIn(null)).toBe(false);
    });
});

/**
 * The page's place across the address move: Next mounts the edit route
 * again, and it carries on from where the /new page was (13 Nov 2026).
 */
describe("leavePlace and takePlace", () => {
    const memory = () => {
        const m = new Map<string, string>();
        return {
            setItem: (k: string, v: string) => void m.set(k, v),
            getItem: (k: string) => m.get(k) ?? null,
            removeItem: (k: string) => void m.delete(k),
        };
    };
    const HREF = "/billing/plans/p1/edit";

    it("gives the edit page the scroll and focus the new page had, once", () => {
        const store = memory();
        leavePlace(HREF, 487, "plan-sessions", store, 1000);
        expect(takePlace(HREF, store, 1500)).toMatchObject({
            y: 487,
            focus: "plan-sessions",
        });
        expect(takePlace(HREF, store, 1600)).toBeNull();
    });

    it("says a place is waiting without taking it", () => {
        const store = memory();
        leavePlace(HREF, 487, null, store, 1000);
        expect(placeWaiting(HREF, store, 1500)).toBe(true);
        expect(placeWaiting("/billing/plans/other/edit", store, 1500)).toBe(
            false,
        );
        expect(placeWaiting(HREF, store, 1000 + 6000)).toBe(false);
        expect(takePlace(HREF, store, 1500)).not.toBeNull();
        expect(placeWaiting(HREF, store, 1500)).toBe(false);
    });

    it("is not taken at another address", () => {
        const store = memory();
        leavePlace(HREF, 487, null, store, 1000);
        expect(takePlace("/billing/plans/other/edit", store, 1500)).toBeNull();
    });

    it("goes stale after a few seconds", () => {
        const store = memory();
        leavePlace(HREF, 487, null, store, 1000);
        expect(takePlace(HREF, store, 1000 + 6000)).toBeNull();
    });

    it("starts at the top when storage is blocked", () => {
        const blocked = {
            setItem: () => {
                throw new Error("blocked");
            },
            getItem: () => {
                throw new Error("blocked");
            },
            removeItem: () => undefined,
        };
        expect(() => leavePlace(HREF, 487, null, blocked)).not.toThrow();
        expect(takePlace(HREF, blocked)).toBeNull();
    });
});
