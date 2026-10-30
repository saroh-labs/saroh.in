import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the browser is sent (30 Oct 2026): `@/env` brings zod and
 * `createEnv` (about 30 KB) and `nav-items.ts` every feature's and solution's
 * page copy (about 45 KB) into every page's JS. Code a client component or
 * `instrumentation-client.ts` reaches reads `lib/browser/env.ts` instead, and
 * the nav gets its items from the server.
 */
const ROOT = __dirname;
const NEVER_IN_THE_BROWSER = ["env.ts", "components/shared/nav/nav-items.ts"];

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
            ? [path]
            : [];
    });
}

function resolveImport(from: string, spec: string): string | null {
    const base = spec.startsWith("@/")
        ? join(ROOT, spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(from), spec)
          : null;
    if (!base) return null;
    for (const path of [
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
    ]) {
        if (existsSync(path)) return path;
    }
    return null;
}

/** Every module of this app's own a file loads, `import type` aside. */
function reach(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const code = readFileSync(entry, "utf8");
    const specs = [
        ...code.matchAll(/^import (?!type )[^;]*?from "([^"]+)"/gm),
        ...code.matchAll(/import\("([^"]+)"\)/g),
        ...code.matchAll(/^export (?!type )[^;]*?from "([^"]+)"/gm),
    ].map((m) => m[1]);
    for (const spec of specs) {
        const next = resolveImport(entry, spec);
        if (next) reach(next, seen);
    }
    return seen;
}

describe("saroh.in's browser JS", () => {
    it("never loads @/env or the nav's page copy", () => {
        const entries = [
            join(ROOT, "instrumentation-client.ts"),
            ...["app", "components", "lib"]
                .flatMap((dir) => sources(join(ROOT, dir)))
                .filter((path) =>
                    /^["']use client["']/.test(readFileSync(path, "utf8")),
                ),
        ];
        expect(entries.length).toBeGreaterThan(10);
        const found = entries.flatMap((entry) =>
            [...reach(entry)]
                .map((path) => relative(ROOT, path))
                .filter((path) => NEVER_IN_THE_BROWSER.includes(path))
                .map((path) => `${relative(ROOT, entry)} → ${path}`),
        );
        expect(found).toEqual([]);
    });
});
