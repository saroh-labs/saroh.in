import { describe, expect, it, vi } from "vitest";

// Only the page reads are under test: the console's session and API reads stay out.
vi.mock("@/env", () => ({ env: {} }));
vi.mock("./console", () => ({ can: vi.fn(), requireStaff: vi.fn() }));
vi.mock("./control-plane", () => ({ getJson: vi.fn() }));
vi.mock("./team-member", () => ({ marketingSiteUrl: vi.fn() }));

const { loadPage } = await import("./search-pages");

describe("loadPage (plan 2026-10-31-002, U3)", () => {
    it.each([
        ["salons", "for"],
        ["gst-calculator", "tools"],
        ["salon-and-beauty-services", "gst"],
        ["reduce-no-shows", "guides"],
        ["customer-list-template", "downloads"],
    ])("%s opens as its own kind (%s), drafts too", (slug, kind) => {
        const page = loadPage(slug);
        expect(page?.kind).toBe(kind);
        expect(page?.page.slug).toBe(slug);
        expect(page?.page.path).toBe(`/${kind}/${slug}`);
    });

    it("a slug no page has opens nothing", () => {
        expect(loadPage("not-a-page")).toBeNull();
    });
});
