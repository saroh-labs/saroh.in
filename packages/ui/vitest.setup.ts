import "@testing-library/jest-dom/vitest";

/*
 * jsdom has no top layer, and its selector engine (nwsapi 2.2.27) resolves
 * `:modal` and `:popover-open` by calling `Element.matches`, which is nwsapi
 * again: each check recurses to a stack overflow before it answers false.
 * floating-ui asks both of every positioned menu, select and popover, after
 * the test that opened it has returned, so one open menu cost the NEXT test
 * seconds on this Mac and timed it out on CI's runner (DEV_LEARNINGS).
 * Nothing is ever in the top layer here, so the answer is false at once.
 */
const matches = Element.prototype.matches;
Element.prototype.matches = function (this: Element, selector: string) {
    if (selector === ":modal" || selector === ":popover-open") return false;
    return matches.call(this, selector);
};
