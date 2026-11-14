import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * saroh.tech's release switches (plan 2026-11-13-002, U1 and U2): the only
 * thing that hides a feature page here. Unset, as production leaves them,
 * the site is today's nine; on, the page, the menu, Home and the site map
 * all have it.
 */
const NAMES = [
    "NEXT_PUBLIC_AI_APPS",
    "NEXT_PUBLIC_ASK_AI",
    "NEXT_PUBLIC_SOCIAL",
] as const;

async function builtWith(on: readonly string[]) {
    for (const name of NAMES) vi.stubEnv(name, on.includes(name) ? "on" : "");
    vi.resetModules();
    const { featureList } = await import("@/content/features");
    const { FEATURES } = await import("./nav");
    const { home } = await import("@/content/home");
    const { PAGES } = await import("./site-map");
    const { generateStaticParams } = await import("@/app/features/[slug]/page");
    return {
        slugs: featureList.map((f) => f.slug),
        nav: FEATURES.length,
        title: home.featuresTitle,
        pages: PAGES.filter((p) => p.path.startsWith("/features/")).map(
            (p) => p.path,
        ),
        params: generateStaticParams().map((p) => p.slug),
    };
}

describe("saroh.tech's feature switches", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("unset: today's nine, and no /features/ai-apps", async () => {
        const built = await builtWith([]);
        expect(built.slugs).toHaveLength(9);
        expect(built.params).toEqual(built.slugs);
        expect(built.params).not.toContain("ai-apps");
        expect(built.nav).toBe(9);
        expect(built.pages).not.toContain("/features/ai-apps");
        expect(built.title).toBe("Nine parts, one workspace.");
    });

    it("all on: twelve everywhere", async () => {
        const built = await builtWith(NAMES);
        expect(built.params).toHaveLength(12);
        expect(built.nav).toBe(12);
        expect(built.pages).toContain("/features/social");
        expect(built.title).toBe("Twelve parts, one workspace.");
    });
});
