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

    // Steps A (#42, #51): Global has no Ask AI captures, so those steps are
    // drawn; none is an empty pending frame.
    for (const slug of ["ask-ai", "social"] as const) {
        it(`/features/${slug} draws four How it works pictures, none empty`, async () => {
            const html = renderToStaticMarkup(await BESPOKE[slug]());
            expect(how(html).split("data-step-picture=")).toHaveLength(5);
            // A pending key's neutral frame (`ShotImage` with no src).
            expect(how(html)).not.toContain("place-items-center bg-muted");
        });
    }

    // AI apps' How it works is words under Global's address (variant I,
    // 16 Nov): no picture at all, so never a pending frame either.
    it("/features/ai-apps draws Global's address and no empty frame", async () => {
        const section = how(renderToStaticMarkup(await BESPOKE["ai-apps"]()));
        expect(section).toContain(">mcp.saroh.tech/mcp</code>");
        expect(section).not.toContain("data-step-picture=");
        expect(section).not.toContain("place-items-center bg-muted");
    });
});

/** The How it works section's markup. */
function how(html: string) {
    const start = html.indexOf('id="in-the-app"');
    return html.slice(start, html.indexOf("</section>", start));
}
