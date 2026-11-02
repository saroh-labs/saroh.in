import { describe, expect, it } from "vitest";

import { CHANGELOG, changelogPath } from "@/content/changelog";
import { GUIDE_CONTENT, guideSteps } from "@/content/guides";

import { pageAt, PAGES } from "./site-map";

const words = (o: unknown) => JSON.stringify(o);

describe("guides", () => {
    it("every guide page in the site map has words, and the reverse", () => {
        const pages = PAGES.filter((p) => p.type === "guide").map(
            (p) => p.path,
        );
        expect(GUIDE_CONTENT.map((g) => `/guides/${g.slug}`).sort()).toEqual(
            pages.sort(),
        );
    });

    it("every internal link is a page in the site map", () => {
        for (const g of GUIDE_CONTENT) {
            expect(pageAt(g.tool.href), g.tool.href).toBeTruthy();
            for (const slug of g.next) {
                expect(pageAt(`/guides/${slug}`), slug).toBeTruthy();
            }
        }
    });

    it("sends no one but https to an outside page", () => {
        const hrefs = GUIDE_CONTENT.flatMap((g) =>
            g.sections.flatMap((s) =>
                s.blocks.flatMap((b) =>
                    b.kind === "sources" ? b.items.map((i) => i.href) : [],
                ),
            ),
        );
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
    });

    it("has no em dashes, and step guides have steps for HowTo", () => {
        expect(words(GUIDE_CONTENT)).not.toContain("—");
        const steps = GUIDE_CONTENT.filter(
            (g) => g.slug === "how-to-write-an-invoice",
        ).flatMap(guideSteps);
        expect(steps).toHaveLength(8);
    });
});

describe("the changelog", () => {
    it("is newest first, and every entry has its page in the site map", () => {
        const dates = CHANGELOG.map((e) => e.date);
        expect(dates).toEqual([...dates].sort().reverse());
        for (const e of CHANGELOG) {
            expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(pageAt(changelogPath(e))?.unreviewed).toBe(true);
            if (e.try) expect(pageAt(e.try.href), e.try.href).toBeTruthy();
        }
    });
});

describe("content pages are held back until someone reads them", () => {
    it("guides, comparisons and the changelog are all unreviewed", () => {
        for (const p of PAGES.filter((p) =>
            ["guide", "guides", "alternative", "compare", "changelog"].includes(
                p.type,
            ),
        )) {
            expect(p.unreviewed, p.path).toBe(true);
            expect(p.title.length, p.path).toBeLessThanOrEqual(60);
        }
    });
});
