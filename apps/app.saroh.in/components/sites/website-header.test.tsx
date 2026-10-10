import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SiteAddressLink, WebsiteHeader } from "./website-header";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/sites/site_1/posts",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/content/actions", () => ({
    createPostCategory: vi.fn(),
    updatePostCategory: vi.fn(),
    deletePostCategory: vi.fn(),
}));

/**
 * The Posts tab's actions: categories are managed here, in a sheet its
 * "Categories" button opens, not on a page of their own outside the tabs.
 */
describe("the Posts tab's Categories button", () => {
    const site = {
        id: "site_1",
        name: "Rehearsal Bakery",
        state: { label: "Live", tone: "live" as const },
    };
    const header = (over: Partial<Parameters<typeof WebsiteHeader>[0]> = {}) =>
        renderToStaticMarkup(
            <WebsiteHeader
                site={site}
                sites={[site]}
                address="rehearsal-bakery.saroh.app"
                canEdit
                mayCreate={false}
                pageCount={3}
                postCount={2}
                postCategories={[]}
                {...over}
            />,
        );

    it("is a button that opens a sheet, beside New post", () => {
        const html = header();
        expect(html).toMatch(
            /<button[^>]*aria-haspopup="dialog"[^>]*>Categories<\/button>/,
        );
        expect(html).not.toContain("/posts/categories");
        expect(html).toContain('href="/sites/site_1/posts/new"');
    });

    it("is still offered when the categories couldn't be read", () => {
        expect(header({ postCategories: null })).toContain(">Categories<");
    });

    it("isn't offered to someone who can't change the site", () => {
        const html = header({ canEdit: false, postCategories: undefined });
        expect(html).not.toContain(">Categories<");
        expect(html).not.toContain("New post");
    });
});

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
