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

describe("SiteNotFound in a look (DEC-172, U15)", () => {
    const BOOK = { label: "Book", href: "/book", kind: "book" as const };

    it.each(["folio", "quiet", "live"] as const)(
        "%s: one way home, filled, and Book, in the look",
        (look) => {
            const html = renderToStaticMarkup(
                <SiteNotFound
                    siteName="Prana Yoga"
                    secondary={null}
                    look={look}
                    action={BOOK}
                />,
            );
            expect(html).toContain(`data-site-state-look="${look}"`);
            expect(html).toContain("This page isn’t here");
            expect(html).toContain("Everything Prana Yoga offers");
            expect(html).toMatch(
                /<a [^>]*href="\/"[^>]*>Go to the home page<\/a>/,
            );
            expect(html).toMatch(/<a [^>]*href="\/book"[^>]*>Book<\/a>/);
            // One filled button: home. Book is a link beside it.
            expect(html.match(/bg-site-accent/g)).toHaveLength(1);
            // The large 404 is decoration; the heading says it in words.
            expect(html).toMatch(/<p aria-hidden="true"[^>]*>404<\/p>/);
            expect(html).not.toMatch(SAROH_BRAND);
        },
    );

    it("keeps the shop or contact way when it is a different place", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound
                siteName="Rye"
                secondary={{ href: "/contact", label: "Contact us" }}
                look="quiet"
                action={BOOK}
            />,
        );
        expect(html.match(/<a /g)).toHaveLength(3);
        expect(html).toContain("Contact us");
    });

    it("never offers the same place twice", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound
                siteName="Rye"
                secondary={{ href: "/shop", label: "Browse the shop" }}
                look="live"
                action={{ label: "Order", href: "/shop", kind: "shop" }}
            />,
        );
        expect(html.match(/href="\/shop"/g)).toHaveLength(1);
    });

    it("with no main action, home alone", () => {
        const html = renderToStaticMarkup(
            <SiteNotFound siteName={null} secondary={null} look="folio" />,
        );
        expect(html.match(/<a /g)).toHaveLength(1);
        expect(html).not.toContain("null");
    });
});
