import { pendingSiteChanges } from "./pending-changes";

/**
 * #282: settings, style, menu and footer travel into the snapshot, so a change
 * to any of them is something publishing would change. It must be reported as
 * one, and nothing else may be.
 */

function page(path: string, title: string, isHome = false) {
    return { path, title, isHome, sections: [] };
}

const liveSite = {
    name: "Northwind Supply",
    slug: "northwind",
    seoTitle: "Northwind Supply",
    seoDescription: "Packaging, storage and safety supplies",
    socialImageUrl: null,
    socialImage: null,
    postsPrefix: null,
    style: { palette: "clay", spacing: 1 },
    styleVariables: { "--site-bg": "0 0% 100%" },
    footer: null,
    navigation: [{ label: "About", href: "/about" }],
};

const livePages = [page("/", "Home", true), page("/about", "About")];

function snapshot(site: Record<string, unknown> = liveSite, pages = livePages) {
    return { site, pages, publishedAt: "2026-09-01T00:00:00.000Z" };
}

describe("pendingSiteChanges", () => {
    it("reports nothing when every site-level setting matches what is live", () => {
        expect(pendingSiteChanges(liveSite, livePages, snapshot())).toEqual([]);
    });

    it("does not report a change merely because JSON key order differs", () => {
        const reordered = {
            navigation: liveSite.navigation,
            style: { spacing: 1, palette: "clay" },
            ...liveSite,
        };
        expect(pendingSiteChanges(reordered, livePages, snapshot())).toEqual(
            [],
        );
    });

    it.each([
        ["search", { seoTitle: "Northwind — packaging" }],
        [
            "shareImage",
            {
                socialImageUrl: "https://img.test/card.png",
                socialImage: {
                    url: "https://img.test/card.png",
                    width: 1200,
                    height: 630,
                },
            },
        ],
        ["style", { style: { palette: "sea", spacing: 1 } }],
        ["footer", { footer: { format: "html", value: "<p>Since 1998</p>" } }],
        ["menu", { navigation: [] }],
        ["name", { name: "Northwind" }],
        ["posts", { postsPrefix: "news" }],
    ])("reports %s", (kind, change) => {
        expect(
            pendingSiteChanges(
                { ...liveSite, ...change },
                livePages,
                snapshot(),
            ),
        ).toEqual([kind]);
    });

    it("reports a renamed page, a new page and a new home page as the page list", () => {
        expect(
            pendingSiteChanges(
                liveSite,
                [page("/", "Home", true), page("/about", "About us")],
                snapshot(),
            ),
        ).toEqual(["pages"]);
        expect(
            pendingSiteChanges(
                liveSite,
                [...livePages, page("/contact", "Contact")],
                snapshot(),
            ),
        ).toEqual(["pages"]);
    });

    it("ignores resolved style variables, which are derived from the choices", () => {
        const draft = {
            ...liveSite,
            styleVariables: { "--site-bg": "30 20% 98%" },
        };
        expect(pendingSiteChanges(draft, livePages, snapshot())).toEqual([]);
    });

    it("treats a setting an older snapshot lacks as unset, so an unset draft matches it", () => {
        const { seoTitle: _t, seoDescription: _d, ...olderLive } = liveSite;
        const draft = { ...liveSite, seoTitle: null, seoDescription: null };
        expect(
            pendingSiteChanges(draft, livePages, snapshot(olderLive)),
        ).toEqual([]);
    });

    it.each([null, "snapshot", 42, {}, { site: "nope", pages: "nope" }])(
        "reads a malformed snapshot (%j) without throwing",
        (malformed) => {
            expect(() =>
                pendingSiteChanges(liveSite, livePages, malformed),
            ).not.toThrow();
        },
    );
});
