import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { embeddedDocs } from "./docs-embedded";

/**
 * The downloads' gate takes only a slug on the API's own list
 * (`apps/api.saroh.in/src/modules/tools/download-names.ts`) and names the
 * download in its email from there. So every download page here must be on
 * it, under the name the page shows, or its gate answers "unavailable".
 * Read as text, as `tool-names.test.ts` reads the tools' list.
 */
const API_NAMES: Record<string, string> = Object.fromEntries(
    [
        ...readFileSync(
            path.resolve(
                __dirname,
                "../../../apps/api.saroh.in/src/modules/tools/download-names.ts",
            ),
            "utf8",
        ).matchAll(/^\s*"([a-z0-9-]+)":\s*"([^"]+)",$/gm),
    ].map((m) => [m[1] ?? "", m[2] ?? ""]),
);

describe("the API's download names", () => {
    it("reads the list", () => {
        expect(Object.keys(API_NAMES).length).toBeGreaterThan(0);
    });

    it.each(embeddedDocs.list("downloads").map((p) => [p.slug, p.name]))(
        "names %s as its page does",
        (slug, name) => {
            expect(API_NAMES[slug]).toBe(name);
        },
    );

    it("names no download that has no page", () => {
        const pages = embeddedDocs.list("downloads").map((p) => p.slug);
        expect(Object.keys(API_NAMES).sort()).toEqual(pages.sort());
    });
});
