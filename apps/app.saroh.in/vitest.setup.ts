/*
 * jsdom has no top layer, and its selector engine (nwsapi) resolves `:modal`
 * and `:popover-open` by calling `Element.matches`, which is nwsapi again:
 * each check recurses to a stack overflow before it answers false.
 * floating-ui asks both of every positioned tooltip, menu and popover, so
 * one open tooltip cost a test seconds and timed it out (DEV_LEARNINGS, and
 * `packages/ui/vitest.setup.ts`, which this mirrors). Nothing is ever in the
 * top layer here, so the answer is false at once. A no-op under `node`.
 */
if (typeof Element !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its element below
    const matches = Element.prototype.matches;
    Element.prototype.matches = function (this: Element, selector: string) {
        if (selector === ":modal" || selector === ":popover-open") return false;
        return matches.call(this, selector);
    };
}

/*
 * jsdom has no ResizeObserver, and the shared `Checkbox` and `Switch`
 * (Radix) measure themselves with one. Nothing is laid out here, so an
 * observer that never reports is the truth. A test that needs sizes brings
 * its own.
 */
if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.ResizeObserver === "undefined"
) {
    globalThis.ResizeObserver = class {
        observe() {
            return undefined;
        }
        unobserve() {
            return undefined;
        }
        disconnect() {
            return undefined;
        }
    };
}
