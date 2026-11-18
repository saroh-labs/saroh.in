import type { PageHealthPage } from "./page-health";
import { pageHealth } from "./page-health";

function page(over: Partial<PageHealthPage> = {}): PageHealthPage {
    return {
        id: "p_home",
        title: "Home",
        path: "/",
        hidden: false,
        noindex: false,
        seoDescription: "Bridal makeup in Rohtak.",
        shareImageUrl: "https://example.com/share.jpg",
        shareImageMediaId: null,
        sections: [],
        ...over,
    };
}

const cta = (href: string) => ({
    type: "cta",
    hidden: false,
    content: { label: "Book now", href },
});

describe("pageHealth", () => {
    it("says nothing about a page that has everything", () => {
        expect(pageHealth([page()], { socialImageUrl: null })).toEqual([]);
    });

    it("names a page with no text for Google", () => {
        expect(
            pageHealth(
                [page({ id: "p_b", title: "Bridal", seoDescription: "  " })],
                { socialImageUrl: null },
            ),
        ).toEqual([
            {
                pageId: "p_b",
                title: "Bridal",
                path: "/",
                issues: ["googleText"],
            },
        ]);
    });

    it("asks no Google text of a page kept off Google", () => {
        expect(
            pageHealth([page({ seoDescription: null, noindex: true })], {
                socialImageUrl: null,
            }),
        ).toEqual([]);
    });

    it("lets the site's share image stand in for a page's own", () => {
        const bare = page({ shareImageUrl: null });
        expect(
            pageHealth([bare], { socialImageUrl: "https://x/y.jpg" }),
        ).toEqual([]);
        expect(pageHealth([bare], { socialImageUrl: null })[0]?.issues).toEqual(
            ["shareImage"],
        );
        expect(
            pageHealth(
                [page({ shareImageUrl: null, shareImageMediaId: "m1" })],
                {
                    socialImageUrl: null,
                },
            ),
        ).toEqual([]);
    });

    it("finds a link to a page that isn't on the site", () => {
        const health = pageHealth(
            [
                page({ sections: [cta("/gone")] }),
                page({ id: "p_a", path: "/about", sections: [cta("/")] }),
            ],
            { socialImageUrl: null },
        );
        expect(health).toEqual([
            expect.objectContaining({
                pageId: "p_home",
                issues: ["brokenLink"],
            }),
        ]);
    });

    it("leaves a hidden page out", () => {
        expect(
            pageHealth([page({ hidden: true, seoDescription: null })], {
                socialImageUrl: null,
            }),
        ).toEqual([]);
    });
});
