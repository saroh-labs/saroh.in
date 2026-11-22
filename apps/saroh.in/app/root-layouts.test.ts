import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * saroh.in has no `app/layout.tsx` (plan 2026-11-18-001 KD11): each route
 * group is a root layout. Every group but the library's previews draws
 * Saroh's document (fonts, tokens, the cookie notice and tags), so the
 * split leaves every other page as it was; an address with no page gets
 * `global-not-found.tsx`, which draws it too.
 */
const app = __dirname;
const groups = readdirSync(app).filter((d) => /^\(.+\)$/.test(d));

describe("saroh.in's root layouts", () => {
    it("has none above the groups", () => {
        expect(existsSync(path.join(app, "layout.tsx"))).toBe(false);
    });

    it.each(groups.filter((g) => g !== "(library-preview)"))(
        "%s draws Saroh's document",
        (group) => {
            const layout = readFileSync(
                path.join(app, group, "layout.tsx"),
                "utf8",
            );
            expect(layout).toContain("<SarohDocument>");
            expect(layout).toContain("export const metadata = sarohMetadata");
        },
    );

    it("an address with no page gets Saroh's document and chrome", () => {
        const page = readFileSync(
            path.join(app, "global-not-found.tsx"),
            "utf8",
        );
        expect(page).toContain("<SarohDocument>");
        expect(page).toContain("<SiteChrome>");
    });
});
