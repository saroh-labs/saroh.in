import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_WORDS, planWords } from "@/content/plan-words";

/** The words that only hold while paid plans aren't on sale (bug #45). */
const OFF_WORDS =
    /free for now|tell me when|aren't (on sale|available yet)|not available yet|come later|open soon|once paid plans open/i;

const ROOT = join(__dirname, "..");

/**
 * Files that may say "Not available yet" about something other than a
 * plan: the list of work that isn't built (`coming.ts`, drawn by the
 * changelog and Integrations) and a changelog entry that names it.
 */
const NOT_ABOUT_PLANS = new Set(["content/coming.ts", "content/changelog.ts"]);

const sources = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(join(ROOT, path)).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
            ? [path]
            : [];
    });

/** A file's code with its comments taken out (`https://` stays). */
const code = (path: string) =>
    readFileSync(join(ROOT, path), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("plan words (bug #45): one source for every paid-plans line", () => {
    it("live only in content/plan-words.ts", () => {
        const files = ["app", "components", "content", "lib"]
            .flatMap(sources)
            .filter(
                (p) => p !== "content/plan-words.ts" && !NOT_ABOUT_PLANS.has(p),
            );
        expect(files.length).toBeGreaterThan(50);
        const found = files.filter((p) => OFF_WORDS.test(code(p)));
        expect(found).toEqual([]);
    });

    it("say none of them once paid plans are on sale, and name Grow and Pro", () => {
        const on = Object.values(planWords(true)).join("\n");
        expect(on).not.toMatch(OFF_WORDS);
        expect(on).toMatch(/\bGrow\b/);
        expect(on).toMatch(/\bPro\b/);
        expect(planWords(true).compare).toBe("Compare plans");
        expect(planWords(true).paidTag).toBe("");
    });

    it("keep today's Free-only words while they aren't", () => {
        const off = planWords(false);
        expect(off.compare).toBe("Tell me when");
        expect(off.paidTag).toBe("On paid plans");
        for (const [key, pair] of Object.entries(PLAN_WORDS))
            expect(off[key as keyof typeof off]).toBe(pair.off);
    });

    it("hold to the copy rules: no em dash or semicolon", () => {
        const all = Object.values(PLAN_WORDS).flatMap((p) => [p.on, p.off]);
        expect(all.join("\n")).not.toMatch(/—|;/);
    });
});
