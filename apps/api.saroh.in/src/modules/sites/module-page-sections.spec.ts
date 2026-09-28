import { pricesIntro } from "./module-page-sections";

/**
 * G20 — a Prices page's opening line names only what it offers. The
 * sections themselves are checked against real rows in
 * module-pages.db.spec.ts.
 */
describe("the Prices page's line", () => {
    it("names all three, with the design's comparison note", () => {
        expect(pricesIntro({ once: true, plans: true, packs: true })).toBe(
            "Try one class, buy a pack, or join. Price per class is shown so you can compare.",
        );
    });

    it("names two, and compares only with packs among them", () => {
        expect(pricesIntro({ once: true, plans: true, packs: false })).toBe(
            "Try one class or join.",
        );
        expect(pricesIntro({ once: false, plans: true, packs: true })).toBe(
            "Buy a pack or join. Price per class is shown so you can compare.",
        );
    });

    it("names one alone, without the comparison", () => {
        expect(pricesIntro({ once: false, plans: true, packs: false })).toBe(
            "Join.",
        );
        expect(pricesIntro({ once: false, plans: false, packs: true })).toBe(
            "Buy a pack.",
        );
    });

    it("says nothing when nothing is offered", () => {
        expect(
            pricesIntro({ once: false, plans: false, packs: false }),
        ).toBeNull();
    });
});
