import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every link to Developers saroh.in draws, saroh.tech draws too (owner,
 * 16 Nov 2026, #41): links are counted per source file name, so a page that
 * gains a Developers link on saroh.in fails here until saroh.tech's has it.
 */
const SITES = join(__dirname, "../..");
const DIRS = ["app", "components", "content", "lib"];
const LINK = /\b(?:href|page)\s*[:=]\s*\{?\s*"\/developers"/g;

/** saroh.in files whose link saroh.tech has elsewhere, or can't have yet. */
const ELSEWHERE: Record<string, string> = {
    "resources.ts": "saroh.tech lists Developers in lib/nav.ts",
    "changelog.ts": "saroh.tech's changelog has no API entry",
    "solutions-days.ts": "saroh.tech has no trade day yet",
};

function sources(site: string): string[] {
    const root = join(SITES, site);
    return DIRS.flatMap((d) =>
        readdirSync(join(root, d), { recursive: true, encoding: "utf8" })
            .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
            .map((f) => join(root, d, f)),
    );
}

function linksByFile(site: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const file of sources(site)) {
        const n = readFileSync(file, "utf8").match(LINK)?.length ?? 0;
        const name = basename(file);
        if (n) counts.set(name, (counts.get(name) ?? 0) + n);
    }
    return counts;
}

describe("Developers links (#41)", () => {
    const india = linksByFile("saroh.in");
    const global = linksByFile("saroh.tech");

    it("saroh.tech has every one saroh.in has", () => {
        const missing = [...india]
            .filter(([name]) => !(name in ELSEWHERE))
            .filter(([name, n]) => (global.get(name) ?? 0) < n)
            .map(([name, n]) => `${name}: ${global.get(name) ?? 0} of ${n}`);
        expect(missing).toEqual([]);
        // The check reads real links, not an empty folder.
        expect(india.size).toBeGreaterThan(2);
    });

    it("no saroh.tech page turns the shared pages' link off", () => {
        const off = sources("saroh.tech").filter((f) =>
            readFileSync(f, "utf8").includes("developersHref={null}"),
        );
        expect(off).toEqual([]);
    });
});
