import { describe, expect, it } from "vitest";

import type { PageResults } from "@/lib/sites/page-results-read";
import type { Section } from "@/lib/sites/service";

import { pagesLine } from "./everywhere-banner";
import { resultParts } from "./page-results-line";
import {
    duplicateOf,
    resetToLook,
    styleChanges,
    toneOf,
    withFrame,
    withTone,
} from "./section-frame";

const hero = (content: Record<string, unknown>): Section => ({
    key: "k1",
    type: "hero",
    contractVersion: 1,
    content: { heading: "Hi", ...content },
});

describe("a section's frame (KTD-E5)", () => {
    it("absent is the site look; an emptied frame is left out", () => {
        const s = hero({});
        expect(styleChanges(s)).toBe(0);
        expect(toneOf(s)).toBe("page");
        const airy = withFrame(s, { spacing: "airy" });
        expect(styleChanges(airy)).toBe(1);
        expect("frame" in withFrame(airy, { spacing: undefined }).content).toBe(
            false,
        );
    });

    it("an old band reads as its tone, and a tone replaces it", () => {
        const banded = hero({ band: "inverse" });
        expect(toneOf(banded)).toBe("dark");
        expect(styleChanges(banded)).toBe(1);
        const brand = withTone(banded, "brand");
        expect(brand.content).not.toHaveProperty("band");
        expect(toneOf(brand)).toBe("brand");
        expect(toneOf(withTone(brand, "page"))).toBe("page");
    });

    it("Reset clears the ground, spacing and padding, never hide on phone", () => {
        const s = withFrame(hero({ band: "accent", padding: 40 }), {
            spacing: "compact",
            hideOn: "phone",
        });
        expect(styleChanges(s)).toBe(3);
        const reset = resetToLook(s);
        expect(styleChanges(reset)).toBe(0);
        expect(reset.content).toMatchObject({ frame: { hideOn: "phone" } });
    });

    it("a duplicate has a new key and nothing a page holds once", () => {
        const s = hero({ anchor: "visit", navLabel: "Visit", formId: "f1" });
        const copy = duplicateOf(s);
        expect(copy.key).not.toBe(s.key);
        expect(copy.content).toEqual({ heading: "Hi" });
    });
});

const RESULTS: PageResults = {
    path: "/bridal",
    from: "2026-11-13",
    to: "2026-11-20",
    visits: { count: 312, since: null },
    questions: { count: 2, since: null },
    started: { count: 6, since: null },
    paid: null,
    sells: { bookings: true, shop: false },
};

describe("this page's results (KTD-E8)", () => {
    it("only measured parts, in the board's words", () => {
        expect(resultParts(RESULTS)).toEqual([
            "312 visits",
            "6 bookings started",
            "2 questions",
        ]);
    });

    it("a part off is left out, never 0; a new page has no visits yet", () => {
        expect(
            resultParts({
                ...RESULTS,
                visits: { count: 0, since: null },
                started: null,
                questions: null,
            }),
        ).toEqual(["No visits yet"]);
    });

    it("says since when counting began in the window", () => {
        const [, started] = resultParts({
            ...RESULTS,
            started: { count: 1, since: "2026-11-18" },
            sells: { bookings: false, shop: true },
        });
        expect(started).toMatch(/^1 order started since /);
    });

    it("draws starts and questions once they count by page, 0 included, each with its own since (DEC-235)", () => {
        expect(
            resultParts({
                ...RESULTS,
                started: { count: 0, since: "2026-11-20" },
                questions: { count: 1, since: "2026-11-20" },
            }),
        ).toEqual([
            "312 visits",
            expect.stringMatching(/^0 bookings started since 20 Nov/),
            expect.stringMatching(/^1 question since 20 Nov/),
        ]);
    });
});

describe("the pages a header shows on", () => {
    it("names three, then counts the rest", () => {
        const page = (title: string) => ({ title });
        expect(pagesLine([page("Home"), page("About")])).toBe("Home and About");
        expect(
            pagesLine(
                ["Home", "Services", "Bridal", "Visit", "Journal"].map(page),
            ),
        ).toBe("Home, Services, Bridal and 2 more");
    });
});
