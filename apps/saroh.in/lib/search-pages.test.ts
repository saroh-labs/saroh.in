import { listSearchPages } from "@saroh/search-pages";
import { describe, expect, it, vi } from "vitest";

import { llmsText } from "./llms";
import type { PublishList } from "./search-pages";
import {
    builtSearchPages,
    liveSearchPages,
    parsePublishList,
    solutionLink,
} from "./search-pages";
import { indexedPaths, lastModified } from "./site-pages";

vi.mock("@/env", () => ({ env: {} }));

const ALL = listSearchPages();
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
