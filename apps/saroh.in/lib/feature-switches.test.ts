import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
    countWord,
    RELEASE_SWITCHES,
    shownFeatures,
    switchedOffSet,
    switchOn,
} from "@saroh/marketing/feature-switches";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The release switches (plan 2026-11-13-002, U1 and U2): one reader, one
 * set, and every list of feature pages follows it.
 */

const NAMES = Object.values(RELEASE_SWITCHES);

describe("switchedOffSet", () => {
    it("each switch set to on is not in the set; off is", () => {
        for (const [key, name] of Object.entries(RELEASE_SWITCHES)) {
            expect(
                switchedOffSet({ [name]: "on", NODE_ENV: "production" }),
            ).not.toContain(key);
            expect(
                switchedOffSet({ [name]: "off", NODE_ENV: "development" }),
            ).toContain(key);
        }
    });

    it("unset is on under next dev, off in a built site", () => {
        expect(switchedOffSet({ NODE_ENV: "development" })).toEqual([]);
        expect(switchedOffSet({ NODE_ENV: "production" })).toEqual(
            Object.keys(RELEASE_SWITCHES),
        );
        expect(switchedOffSet({})).toHaveLength(NAMES.length);
    });

    it("only on is on: a misspelled value hides the feature", () => {
        expect(switchOn("yes", "development")).toBe(false);
        expect(switchOn("ON", "production")).toBe(false);
    });
});

describe("shownFeatures and the count word", () => {
    it("drops the switched-off features, keeping the menu's order", () => {
        expect(shownFeatures(["ai-apps", "ask-ai", "social"])).toHaveLength(9);
        expect(shownFeatures([]).slice(-3)).toEqual([
            "ai-apps",
            "ask-ai",
            "social",
        ]);
        expect(shownFeatures([])[8]).toBe("insights");
    });

    it("says the count in words", () => {
        expect(countWord(9)).toBe("Nine");
        expect(countWord(10)).toBe("Ten");
        expect(countWord(12)).toBe("Twelve");
        expect(countWord(13)).toBe("13");
    });
});

describe("the env", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("refuses a value that isn't on or off at build", async () => {
        vi.stubEnv("SKIP_ENV_VALIDATION", "");
        vi.stubEnv("NEXT_PUBLIC_AI_APPS", "yes");
        vi.resetModules();
        await expect(import("@/env")).rejects.toThrow();
    });
});

/**
 * The lists a built site draws, with `on` for the switches named and the
 * rest unset. NODE_ENV stays the test's ("test"), which reads unset as a
 * production build does: anything but `next dev` is off.
 */
async function builtWith(on: readonly string[]) {
    vi.stubEnv("SKIP_ENV_VALIDATION", "");
    for (const name of NAMES) vi.stubEnv(name, on.includes(name) ? "on" : "");
    vi.resetModules();
    const { featureList } = await import("@/content/features");
    const { FEATURE_ITEMS } = await import("@/components/shared/nav/nav-items");
    const { home } = await import("@/content/home");
    const { featuresOff } = await import("./feature-switches");
    const { resourcesContext } = await import("./resources-context");
    return {
        slugs: featureList.map((f) => f.slug),
        nav: FEATURE_ITEMS.map((i) => i.href),
        title: home.featuresTitle,
        off: featuresOff(),
        contextOff: resourcesContext().off,
    };
}

describe("every list follows the switches", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("all off: today's nine, and Nine parts", async () => {
        const built = await builtWith([]);
        expect(built.slugs).toHaveLength(9);
        expect(built.slugs).not.toContain("ai-apps");
        expect(built.nav).toEqual(built.slugs.map((s) => `/features/${s}`));
        expect(built.title).toBe("Nine parts, one workspace.");
        expect(built.contextOff).toEqual(built.off);
        expect(built.off).toContain("templates");
    });

    it("AI apps on only: ten", async () => {
        const built = await builtWith(["NEXT_PUBLIC_AI_APPS"]);
        expect(built.slugs).toHaveLength(10);
        expect(built.slugs.at(-1)).toBe("ai-apps");
        expect(built.title).toBe("Ten parts, one workspace.");
    });

    it("all on: twelve", async () => {
        const built = await builtWith(NAMES);
        expect(built.slugs).toHaveLength(12);
        expect(built.nav).toHaveLength(12);
        expect(built.title).toBe("Twelve parts, one workspace.");
        expect(built.off).toEqual([]);
    });
});

describe("FEATURE_SLUGS is read only through shownFeatures", () => {
    const root = join(__dirname, "../../..");
    /** The reader, the type that declares it, and the app's re-export of the types. */
    const ALLOWED = new Set([
        "packages/marketing/src/content/feature-switches.ts",
        "packages/marketing/src/content/types.ts",
        "apps/saroh.in/content/types.ts",
    ]);
    const SKIP = new Set(["node_modules", "out", "dist"]);

    function sources(dir: string): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            // Build output and tool folders (.next, .open-next, .turbo) too.
            if (SKIP.has(e.name) || e.name.startsWith(".")) return [];
            const path = join(dir, e.name);
            if (e.isDirectory()) return sources(path);
            return /\.(ts|tsx|mjs|js)$/.test(e.name) &&
                !/\.test\.(ts|tsx|mjs)$/.test(e.name)
                ? [path]
                : [];
        });
    }

    it("no other module names it", () => {
        const offenders = ["apps/saroh.in", "apps/saroh.tech", "packages"]
            .flatMap((d) => sources(join(root, d)))
            .map((f) => relative(root, f))
            .filter(
                (f) =>
                    !ALLOWED.has(f) &&
                    /\bFEATURE_SLUGS\b/.test(
                        readFileSync(join(root, f), "utf8"),
                    ),
            );
        expect(offenders).toEqual([]);
    });
});
