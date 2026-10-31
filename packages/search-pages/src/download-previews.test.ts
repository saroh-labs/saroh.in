import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { previewSources } from "./components/download-page";
import { embeddedDocs } from "./docs-embedded";

/**
 * A download's preview at /downloads/<slug>/preview.webp is saroh.in's copy
 * of content/downloads/previews/<slug>/ (docs-content.config.ts), made by
 * scripts/make-download-previews.mjs. Every copy the srcset names must be
 * there, or the live page draws a broken picture.
 */
const PREVIEWS = path.join(__dirname, "../content/downloads/previews");

describe("download previews", () => {
    it.each(embeddedDocs.list("downloads").map((p) => [p.slug, p.preview]))(
        "%s has its picture and every narrower copy",
        (slug, preview) => {
            expect(preview?.src).toBe(`/downloads/${slug}/preview.webp`);
            const { srcSet = "" } = previewSources(preview?.src ?? "");
            const files = srcSet.split(", ").map((s) => s.split(" ")[0] ?? "");
            expect(files).toHaveLength(4);
            for (const f of files)
                expect(
                    existsSync(
                        path.join(PREVIEWS, f.slice("/downloads/".length)),
                    ),
                    f,
                ).toBe(true);
        },
    );

    it("draws any other picture without a srcset", () => {
        expect(previewSources("https://example.com/a.png")).toEqual({});
    });
});
