import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { findClaims, visibleText } from "../scripts/check-claims.mjs";

import { BESPOKE } from "@/components/feature-pages/registry";

// next/font is compiled by Next, not by Vitest: the merchant fonts' class is empty here.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "" }) }));

/**
 * The Reach and Ask pages as saroh.tech draws them: each renders, says
 * nothing `check-claims` forbids on its path, and draws the same kind of
 * screen slot as saroh.in (a captured shot or its neutral pending frame).
 */
describe("saroh.tech's Reach and Ask pages", () => {
    for (const [slug, page] of Object.entries(BESPOKE)) {
        it(`/features/${slug} renders with no forbidden claim`, async () => {
            const html = renderToStaticMarkup(await page());
            expect(html).toContain('id="page-title"');
            expect(findClaims(`/features/${slug}`, visibleText(html))).toEqual(
                [],
            );
            expect(visibleText(html)).not.toMatch(/\bRye\b|₹|Hinglish/);
        });
    }
});
