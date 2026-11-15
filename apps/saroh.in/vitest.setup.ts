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
