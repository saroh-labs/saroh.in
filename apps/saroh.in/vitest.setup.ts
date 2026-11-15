/**
 * jsdom has no IntersectionObserver; the kit's StickyBar and SwipeRow watch
 * with one (DEC-221). A stand-in that never fires, so a page test renders
 * them in their first state. Node tests have no window and skip it.
 */
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
    class NoObserver {
        observe() {
            return undefined;
        }
        unobserve() {
            return undefined;
        }
        disconnect() {
            return undefined;
        }
        takeRecords() {
            return [];
        }
    }
    Object.assign(globalThis, { IntersectionObserver: NoObserver });
}

/**
 * `next/font/local` is compiled by Next, not by Vitest. A page that loads a
 * merchant's fonts (the Reach pages' site drawings) gets an empty class here.
 */
import { vi } from "vitest";

vi.mock("next/font/local", () => ({
    default: () => ({ className: "", variable: "", style: {} }),
}));

/** jsdom has no ResizeObserver either; Ask AI's hero wires watch with one. */
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
    Object.assign(globalThis, {
        ResizeObserver: class {
            observe() {
                return undefined;
            }
            unobserve() {
                return undefined;
            }
            disconnect() {
                return undefined;
            }
        },
    });
}
