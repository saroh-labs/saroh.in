import { contrastRatio, parsePalette } from "@saroh/block-contract";
import { expect, it } from "vitest";

import { instantiateTemplate } from "../instantiate";
import type { TemplateContext, TemplateManifest } from "../manifest";
import { getTemplate, listTemplates } from "../registry";

/**
 * The checks every redesigned template version shares (plan 2026-11-18-001
 * U10): new sites start on it, the version before stays registered for its
 * sites, every business profile lays it down valid, and its second
 * colourway reads at 4.5:1. For the template tests only.
 */
export function redesignChecks(
    next: TemplateManifest,
    previous: TemplateManifest,
    profiles: readonly TemplateContext[],
): void {
    it(`is what a new site starts from; v${previous.version} stays for the sites made from it`, () => {
        expect(next.version).toBe(previous.version + 1);
        expect(getTemplate(next.id)).toBe(next);
        expect(getTemplate(next.id, previous.version)).toBe(previous);
        expect(listTemplates()).toContain(next);
        expect(listTemplates()).not.toContain(previous);
    });

    it("lays down a valid site for every profile", () => {
        for (const ctx of profiles) {
            const { pages } = instantiateTemplate(next, ctx);
            expect(pages.filter((p) => p.isHome)).toHaveLength(1);
        }
    });

    it("draws its second colourway with body text at 4.5:1 or better", () => {
        const second = next.styles?.[1]?.style.palette;
        expect(second).toBeDefined();
        if (!second) return;
        expect(parsePalette(second)).toMatchObject({ ok: true });
        for (const role of ["fg", "body", "muted"] as const) {
            const text = second[role];
            if (!text) continue;
            expect(contrastRatio(text, second.bg)).toBeGreaterThanOrEqual(4.5);
        }
    });
}

/** The page's first section: what the first phone screen opens on. */
export function firstSection(
    template: TemplateManifest,
    ctx: TemplateContext,
    path = "/",
) {
    const page = instantiateTemplate(template, ctx).pages.find(
        (p) => p.path === path,
    );
    return page?.sections[0];
}

/** Every string in a value, however deep, image briefs left out. */
export function stringsIn(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(stringsIn);
    if (value && typeof value === "object") {
        return Object.entries(value)
            .filter(([k]) => k !== "imageBrief")
            .flatMap(([, v]) => stringsIn(v));
    }
    return [];
}
