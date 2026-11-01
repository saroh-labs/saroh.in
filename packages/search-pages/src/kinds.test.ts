import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    DOC_KINDS,
    DOC_PAGE_PATH,
    DOC_PREFIXES,
    docKindOf,
    takenOffDestination,
} from "../kinds";
import { allSearchPages, allToolPages } from "./load";

/**
 * The API keeps its own copy of the groups' ids (it runs built JS, and this
 * package has no build). Read as text, as `tool-names.test.ts` reads the
 * tool names: the package imports no workspace code.
 */
const API_IDS = (() => {
    const source = readFileSync(
        path.resolve(
            __dirname,
            "../../../apps/api.saroh.in/src/modules/search-pages/search-page-rules.ts",
        ),
        "utf8",
    );
    const line = /DOC_KIND_IDS = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
    return [...line.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
})();

describe("the page groups on the shared kit", () => {
    it("are gst, guides and downloads, each with its own address, hub, sitemap and folder", () => {
        expect(DOC_KINDS.map((k) => k.id)).toEqual([
            "gst",
            "guides",
            "downloads",
        ]);
        for (const k of DOC_KINDS) {
            expect(k.prefix).toBe(`/${k.id}/`);
            expect(k.hub).toBe(`/${k.id}`);
            expect(k.hubLabel).not.toBe("");
            expect(k.listWords).toContain(k.hub);
        }
        for (const field of ["prefix", "sitemap", "content"] as const) {
            const values = DOC_KINDS.map((k) => k[field]);
            expect(new Set(values).size).toBe(values.length);
        }
        expect(DOC_PREFIXES).toEqual(["/gst/", "/guides/", "/downloads/"]);
    });

    it("are named the same in the API's copy", () => {
        expect(API_IDS).toEqual(DOC_KINDS.map((k) => k.id));
    });

    it("never take /for/ or /tools/, whose pages keep their own code", () => {
        const taken = [...allSearchPages(), ...allToolPages()].map(
            (p) => p.path,
        );
        expect(taken.length).toBeGreaterThan(0);
        expect(taken.filter((p) => docKindOf(p) !== null)).toEqual([]);
        expect(DOC_PAGE_PATH.test("/for/salons")).toBe(false);
    });

    it("know a page address of theirs, and only that", () => {
        expect(docKindOf("/gst/salon-and-beauty-services")?.id).toBe("gst");
        expect(docKindOf("/downloads/receipt-format")?.id).toBe("downloads");
        expect(docKindOf("/guidesx/a")).toBeNull();
        expect(DOC_PAGE_PATH.test("/guides/reduce-no-shows")).toBe(true);
        for (const bad of ["/gst/", "/gst/A", "/gst/a/b", "/blog/x"])
            expect(DOC_PAGE_PATH.test(bad)).toBe(false);
    });

    it("send a taken-off page to its hub while the group has a live page, else Home", () => {
        const [gst] = DOC_KINDS;
        if (!gst) throw new Error("no gst");
        expect(takenOffDestination(gst, ["/gst/a", "/for/salons"])).toBe(
            "/gst",
        );
        expect(takenOffDestination(gst, ["/guides/a", "/for/salons"])).toBe(
            "/",
        );
        expect(takenOffDestination(gst, [])).toBe("/");
    });
});
