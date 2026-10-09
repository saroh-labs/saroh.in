import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { SiteError } from "./site-error";

/**
 * A merchant site's error page, as markup: the words a visitor reads, the
 * ways on, and that nothing of Saroh's brand is drawn.
 */
const SAROH_BRAND =
    /\b(saroh|brand|highlight|saffron|bg-primary|text-primary|font-sans|font-display)\b/i;

describe("SiteError", () => {
    it("says the page isn't loading, offers Try again and home, in site tokens", () => {
        const html = renderToStaticMarkup(
            <SiteError onRetry={() => undefined} digest="12345" />,
        );
        expect(html).toContain("<h1");
        expect(html).toContain("This page isn’t loading");
        expect(html).toMatch(/<button [^>]*>Try again<\/button>/);
        expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to home<\/a>/);
        expect(html).toContain("Reference: 12345");
        expect(html).toContain("text-site-fg");
        expect(html).not.toMatch(SAROH_BRAND);
    });

    it("drops home where the home page is what failed, and fills the screen at the root", () => {
        const html = renderToStaticMarkup(
            <SiteError onRetry={() => undefined} home={false} ground />,
        );
        expect(html).not.toContain("Back to home");
        expect(html).not.toContain("Reference");
        expect(html).toContain("bg-site-bg");
        expect(html).toContain("min-h-screen");
        expect(html).not.toMatch(SAROH_BRAND);
    });
});
