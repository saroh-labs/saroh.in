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

    it("lists every /for/ page and tool in the code, drafts too (plan 2026-11-01-001)", async () => {
        const { listSearchPages } =
            await import("@saroh/search-pages/embedded");
        expect(listSearchPages({ kind: "for" })).toHaveLength(34);
        expect(listSearchPages({ kind: "tools" })).toHaveLength(27);
    });

    it("a slug no page has opens nothing", () => {
        expect(loadPage("not-a-page")).toBeNull();
    });
});

describe("docEntries (plan 2026-10-31-002, U6)", () => {
    it("lists the 19 GST pages, each grouped, with its failing checks", async () => {
        const { docEntries } = await import("./search-pages");
        const gst = docEntries().filter((e) => e.kind === "gst");
        expect(gst).toHaveLength(19);
        const salon = gst.find((e) => e.slug === "salon-and-beauty-services");
        expect(salon?.group).toBe("By trade");
        // Unconfirmed facts hold it back.
        expect(salon?.blocked).toContain("Every fact is confirmed");
        // The same checks in a few words, each with its count (U14).
        expect(salon?.why).toHaveLength(salon?.blocked.length ?? -1);
        expect(
            salon?.why[salon.blocked.indexOf("Every fact is confirmed")],
        ).toMatch(/^\d+ facts? to confirm$/);
        expect(gst.find((e) => e.slug === "composition-scheme")?.group).toBe(
            "The basics",
        );
    });
});

describe("every link in the code goes to a page (U12)", () => {
    it("the no-shows guide needs the cancellation policy generator, and no page has a dead link", async () => {
        const { listSearchPages } =
            await import("@saroh/search-pages/embedded");
        const { docEntries } = await import("./search-pages");
        const { mergePages } = await import("./search-page-words");
        const rows = mergePages([...listSearchPages(), ...docEntries()], {
            pages: [],
            rebuild: { running: false },
        });
        expect(
            rows.find((r) => r.path === "/guides/reduce-no-shows")?.links,
        ).toEqual(["/tools/cancellation-policy-generator"]);
        expect(rows.filter((r) => r.deadLinks.length)).toEqual([]);
    });
});

describe("docWordBlocks", () => {
    it("lists a GST page's words in the template's order", async () => {
        const { docWordBlocks } = await import("./search-page-content");
        const page = loadPage("salon-and-beauty-services");
        if (page?.kind !== "gst") throw new Error("no GST page");
        const blocks = docWordBlocks(page.page);
        expect(blocks.map((b) => b.label)).toEqual([
            "Top of the page",
            "The facts",
            "A sample invoice",
            "The text",
            "Common mistakes",
            "Questions",
            "On the hub and in lists",
            "Bottom of the page",
        ]);
        expect(JSON.stringify(blocks.at(-1))).toContain("not tax advice");
    });
});
