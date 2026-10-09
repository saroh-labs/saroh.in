import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { NoSiteHere, SiteNotFound } from "./site-not-found";

/**
 * The site's 404 and the root's "no website here", as markup: the words a
 * visitor reads, the ways on, and that nothing of Saroh's brand is drawn.
 */
const SAROH_BRAND =
    /\b(saroh|brand|highlight|saffron|bg-primary|text-primary|font-sans|font-display)\b/i;

describe("SiteNotFound", () => {
    it("names the site and leads home", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound siteName="Northwind" secondary={null} />,
        );
        expect(html).toContain("<h1");
        expect(html).toContain("We can’t find that page");
        expect(html).toContain("on Northwind.");
        expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to home<\/a>/);
        // One way on when the site has no shop or contact page.
        expect(html.match(/<a /g)).toHaveLength(1);
        expect(html).not.toMatch(SAROH_BRAND);
        expect(html).toContain("text-site-fg");
    });

    it("still reads without a site name", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound siteName={null} secondary={null} />,
        );
        expect(html).toContain(
            "There’s no page at this address. It may have moved",
        );
        expect(html).not.toContain(" on ");
        expect(html).not.toContain("null");
        expect(html).toContain("Back to home");
    });

    it("offers the secondary way when there is one", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound
                siteName="Northwind"
                secondary={{ href: "/shop", label: "Browse the shop" }}
            />,
        );
        expect(html).toMatch(/<a [^>]*href="\/shop"[^>]*>Browse the shop<\/a>/);
        expect(html.match(/<a /g)).toHaveLength(2);
    });

    it("escapes a site name rather than drawing it as markup", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound siteName="<b>Rye</b>" secondary={null} />,
        );
        expect(html).not.toContain("<b>Rye</b>");
        expect(html).toContain("&lt;b&gt;Rye&lt;/b&gt;");
    });
});

describe("NoSiteHere", () => {
    it("says there is no website, in neutral site tokens, with no Saroh brand", () => {
        const html = renderToStaticMarkup(<NoSiteHere />);
        expect(html).toContain("<h1");
        expect(html).toContain("There’s no website at this address");
        expect(html).not.toMatch(SAROH_BRAND);
        expect(html).toContain("bg-site-bg");
        // No home to go back to on a host with no site.
        expect(html).not.toContain("<a ");
    });
});
