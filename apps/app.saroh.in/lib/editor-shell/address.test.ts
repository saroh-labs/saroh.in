// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTypingIn } from "./address";

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
