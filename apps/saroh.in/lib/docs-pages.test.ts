import { describe, expect, it } from "vitest";

import { DOC_SOURCES } from "./docs-content.gen";
import { docPages } from "./docs-pages";

describe("docPages (plan 2026-10-31-002, U3)", () => {
    it("loads exactly the pages the generated copy holds", () => {
        expect(docPages.all().map((p) => `${p.kind}/${p.slug}`)).toEqual(
            Object.entries(DOC_SOURCES).flatMap(([kind, pages]) =>
                Object.keys(pages).map((slug) => `${kind}/${slug}`),
            ),
        );
    });
});
