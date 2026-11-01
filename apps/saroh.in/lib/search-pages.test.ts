import { listSearchPages } from "@saroh/search-pages";
import { describe, expect, it, vi } from "vitest";

import { llmsText } from "./llms";
import type { PublishList } from "./search-pages";
import {
    builtSearchPages,
    builtTools,
    liveSearchPages,
    liveTools,
    parsePublishList,
    shownToolLinks,
    solutionLink,
    tradesHubLinks,
} from "./search-pages";
import { indexedPaths, lastModified } from "./site-pages";

vi.mock("@/env", () => ({ env: {} }));

const ALL = listSearchPages({ kind: "for" });
const salons = ALL.find((p) => p.slug === "salons");
const draft = ALL.find((p) => p.slug !== "salons");
if (!salons || !draft) throw new Error("the pilot pages are missing");

const list = (
    preview: boolean,
    live: string[] = [salons.path],
): PublishList => ({
    preview,
    live,
    takenOff: [],
});

const CTX = { now: new Date(), preview: false, routes: null };

describe("parsePublishList (DEC-193)", () => {
    it("refuses a production build with no list", () => {
        expect(() => parsePublishList(undefined, "production")).toThrow(
            /never guesses/,
        );
        expect(() => parsePublishList("not json", "production")).toThrow();
    });

    it("never previews on production, whatever the list says", () => {
        expect(
            parsePublishList(JSON.stringify(list(true)), "production").preview,
        ).toBe(false);
    });

    it("is a preview with nothing live elsewhere without one (local work, tests)", () => {
        expect(parsePublishList(undefined, undefined)).toEqual({
            preview: true,
            live: [],
            takenOff: [],
        });
        expect(
            parsePublishList(JSON.stringify(list(false)), "preview"),
        ).toEqual(list(false));
    });
});

describe("which /for/ pages are built", () => {
    it("builds only live pages on production, and every page on a preview", () => {
        expect(builtSearchPages(list(false)).map((p) => p.slug)).toEqual([
            "salons",
        ]);
        expect(builtSearchPages(list(true))).toHaveLength(ALL.length);
        expect(liveSearchPages(list(true)).map((p) => p.slug)).toEqual([
            "salons",
        ]);
    });

    it("ignores a live path the code has no page for", () => {
        expect(builtSearchPages(list(false, ["/for/not-a-page"]))).toEqual([]);
    });

    it("links a solution to its /for/ page only once that is live", () => {
        expect(solutionLink("salons", list(false))).toBe("/for/salons");
        expect(solutionLink("salons", list(true, []))).toBe(
            "/solutions/salons",
        );
        expect(solutionLink("gyms", list(false))).toBe("/solutions/gyms");
    });

    it("adds See all trades to Solutions once a /for/ page is live, on a preview too only then", () => {
        expect(tradesHubLinks(list(false)).map((l) => l.href)).toEqual([
            "/for",
        ]);
        expect(tradesHubLinks(list(false, []))).toEqual([]);
        expect(tradesHubLinks(list(true, []))).toEqual([]);
    });
});

describe("the sitemap and /llms.txt", () => {
    it("list live /for/ pages and the hub, never a draft, and drop the solution that redirects", () => {
        const paths = indexedPaths("waitlist", CTX, list(true));
        expect(paths).toContain("/for/salons");
        expect(paths).toContain("/for");
        expect(paths).not.toContain("/solutions/salons");
        expect(paths).toContain("/solutions/gyms");
        expect(paths).not.toContain(draft.path);
        const none = indexedPaths("waitlist", CTX, list(true, []));
        expect(none.filter((p) => p.startsWith("/for"))).toEqual([]);
        expect(none).toContain("/solutions/salons");
    });

    it("date a /for/ page by its own updated", () => {
        expect(lastModified(salons.path)).toBe(
            `${salons.updated}T00:00:00+05:30`,
        );
    });

    it("name live trade pages in /llms.txt, drafts never", () => {
        const text = llmsText("", CTX, [], [], [], "waitlist", list(true));
        expect(text).toContain("](/for/salons)");
        expect(text).not.toContain("(/solutions/salons)");
        expect(text).not.toContain(`(${draft.path})`);
    });
});

describe("free tools (#1253)", () => {
    const NOSHOW = "/tools/no-show-cost-calculator";
    const QR = "/tools/qr-code-maker";
    const LINKS = "/tools/link-preview";
    /** A production build's context: the app tools obey `live`. */
    const prod = (live: string[]) => ({ ...CTX, live });

    it("builds only live tools on production, every tool on a preview", () => {
        expect(builtTools(list(false, [QR])).map((t) => t.path)).toEqual([QR]);
        expect(builtTools(list(true, [])).map((t) => t.path)).toEqual(
            expect.arrayContaining([NOSHOW, QR, LINKS]),
        );
        expect(liveTools(list(true, [NOSHOW])).map((t) => t.path)).toEqual([
            NOSHOW,
        ]);
        // The /for/ lists never hold a tool.
        expect(
            builtSearchPages(list(true)).some((p) =>
                p.path.startsWith("/tools"),
            ),
        ).toBe(false);
    });

    it("lists the app tools and the live package tools in the menus, drafts never", () => {
        const both = shownToolLinks(
            prod([QR, NOSHOW]),
            list(false, [QR, NOSHOW]),
        );
        expect(both.map((t) => t.href)).toEqual([QR, NOSHOW]);
        // Link preview isn't published: not linked, though its page exists.
        expect(both.map((t) => t.href)).not.toContain(LINKS);
        // A preview shows the app tools (no list) but no draft package tool.
        expect(shownToolLinks(CTX, list(true, [])).map((t) => t.href)).toEqual([
            LINKS,
            QR,
        ]);
    });

    it("puts live tools and their hub in the sitemap and /llms.txt", () => {
        const paths = indexedPaths(
            "waitlist",
            prod([LINKS, NOSHOW]),
            list(false, [LINKS, NOSHOW]),
        );
        expect(paths).toEqual(
            expect.arrayContaining(["/tools", NOSHOW, LINKS]),
        );
        expect(paths).not.toContain(QR);
        const none = indexedPaths("waitlist", prod([]), list(false, []));
        expect(none.filter((p) => p.startsWith("/tools"))).toEqual([]);
        const text = llmsText(
            "",
            prod([NOSHOW]),
            [],
            [],
            [],
            "waitlist",
            list(false, [NOSHOW]),
        );
        expect(text).toContain(`](${NOSHOW})`);
        expect(text).not.toContain(`(${QR})`);
    });

    it("dates a package tool by its own updated, the app tools by their modules", () => {
        const noshow = liveTools(list(true, [NOSHOW]))[0];
        expect(lastModified(NOSHOW)).toBe(`${noshow.updated}T00:00:00+05:30`);
        expect(lastModified(QR)).toBe("2026-10-27T00:00:00+05:30");
    });
});
