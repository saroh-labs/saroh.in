// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAddress } from "@/lib/page-address";

import LibraryPreviewPage, { generateStaticParams } from "./page";

/**
 * The website library's block preview (KD11): the block in the address's
 * look, colourway and component styles, as a merchant's bare page: its
 * group's root layout loads no Saroh tokens, fonts or tags, and says
 * noindex.
 */
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_WEBSITE_LIBRARY: "on" } }));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    resetAddress();
    window.history.replaceState(null, "", "/");
});

async function preview(type: string, search: string) {
    window.history.replaceState(null, "", `/library-preview/${type}${search}`);
    return render(
        await LibraryPreviewPage({ params: Promise.resolve({ type }) }),
    );
}

describe("/library-preview/[type]", () => {
    it("is built once per section type", () => {
        expect(generateStaticParams().map((p) => p.type)).toContain("visitUs");
    });

    it("draws the block in the chosen look, colourway and component styles", async () => {
        const cssOf = async (search: string) => {
            const { container } = await preview("cta", search);
            expect(
                container.querySelector("[data-library-preview]"),
            ).toBeTruthy();
            expect(container.querySelector("a, button")).toBeTruthy();
            const css = Array.from(container.querySelectorAll("style"))
                .map((s) => s.textContent)
                .join("\n");
            cleanup();
            return css;
        };
        const live = await cssOf("?look=live&palette=mauve");
        const pill = await cssOf("?look=live&palette=mauve&buttons=square");
        const kesar = await cssOf("?look=live&palette=kesar");
        const classic = await cssOf("?palette=mauve");
        // Each choice changes what the page is drawn with, and nothing else.
        expect(pill).not.toBe(live);
        expect(kesar).not.toBe(live);
        expect(classic).not.toBe(live);
        // An unknown choice is the default, never written into CSS.
        expect(await cssOf("?look=live&palette=mauve&buttons=<script>")).toBe(
            live,
        );
    });

    it("is a bare page: no Saroh tokens, fonts, tags or recorder, and noindex", () => {
        const layout = readFileSync(
            path.join(__dirname, "../../layout.tsx"),
            "utf8",
        );
        for (const saroh of [
            "tokens.css",
            "globals.css",
            "next/font",
            "SiteTags",
            "ReferralKeeper",
            "saroh-document",
        ]) {
            expect(layout).not.toContain(saroh);
        }
        expect(layout).toContain("robots: { index: false, follow: false }");
    });
});
