import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteAddressLink } from "./website-header";

/**
 * The Website header's address (owner, 9 Oct): a link to the live site in
 * a new tab once it's published; before that the address opens nothing, so
 * it stays text and "Preview" opens the draft in the workspace.
 */
describe("the header's site address", () => {
    it("links a published site's address to the live site, in a new tab", () => {
        const html = renderToStaticMarkup(
            <SiteAddressLink
                address="rehearsal-bakery.saroh.app"
                liveUrl="https://rehearsal-bakery.saroh.app"
                previewHref="/sites/site_1"
                siteName="Rehearsal Bakery"
            />,
        );
        expect(html).toContain('href="https://rehearsal-bakery.saroh.app"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain(
            'aria-label="View Rehearsal Bakery&#x27;s website (opens in a new tab)"',
        );
        // The cue is drawn, and hidden from a screen reader.
        expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
        expect(html).not.toContain("Preview");
    });

    it("keeps a never-published address as text, with a Preview link", () => {
        const html = renderToStaticMarkup(
            <SiteAddressLink
                address="rehearsal-bakery.saroh.app"
                liveUrl={null}
                previewHref="/sites/site_1"
                siteName="Rehearsal Bakery"
            />,
        );
        expect(html).not.toContain("https://rehearsal-bakery.saroh.app");
        expect(html).toContain('href="/sites/site_1"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain(">Preview<");
        expect(html).toContain("not published yet (opens in a new tab)");
    });
});
