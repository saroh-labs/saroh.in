import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the browser is sent (30 Oct 2026). zod is about 30 KB and, once a
 * schema is built, evaluates code from a string, which the page's CSP
 * blocks; it came in through `@/env` (every page) and `content/help.ts`
 * (Help). `nav-items.ts` brought every feature's and solution's page copy
 * (about 45 KB). Code a client component or `instrumentation-client.ts`
 * reaches reads `lib/browser/env.ts` instead, the nav gets its items from
 * the server, and Help's schema is `content/help-frontmatter.ts`.
 */
const ROOT = __dirname;
const PACKAGE = resolve(ROOT, "../../packages/search-pages");
const EXPORTS = (
    JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as {
        exports: Record<string, string | undefined>;
    }
).exports;
/**
 * Every page's words (plan 2026-10-31-002, R3): the /for/ and tool pages',
 * every GST page's, guide's and download's (admin's), and this build's
 * live ones. A client component that reaches one ships them.
 */
const CONTENT_MAPS = [
    join(PACKAGE, "src/content.gen.ts"),
    join(PACKAGE, "src/docs-content.gen.ts"),
    join(ROOT, "lib/docs-content.gen.ts"),
    join(ROOT, "lib/search-content.gen.ts"),
];
const NEVER_IN_THE_BROWSER = ["components/shared/nav/nav-items.ts"];
/** The waitlist form checks its fields with zod in the browser, by design. */
const ZOD_ON_PURPOSE = new Set(["lib/waitlist-schema.ts"]);
// An auth library too (1 Nov): the header's session check is a plain fetch
// (`lib/browser/session.ts`), never Better Auth's client.
const SERVER_ONLY_PACKAGES =
    /^import (?!type )[^;]*?from "(zod|@t3-oss\/[^"]+|better-auth[^"]*|@saroh\/auth[^"]*)"/m;

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
    const sub = /^@saroh\/search-pages(\/.*|)$/.exec(spec);
    if (sub) {
        const target = EXPORTS[`.${sub[1]}`];
        return target && /\.(ts|tsx|js|mjs)$/.test(target)
            ? join(PACKAGE, target)
            : null;
    }
    const base = spec.startsWith("@/")
        ? join(ROOT, spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(from), spec)
          : null;
    if (!base) return null;
    // A generated module is reached even before it's written (`.d.ts` in its place).
    if (CONTENT_MAPS.includes(`${base}.ts`)) return `${base}.ts`;
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

/** The names `import { a, b as c }` takes; null for a default, namespace or bare import. */
function namesOf(clause: string): string[] | null {
    const m = /^\{([^}]*)\}$/.exec(clause.trim());
    if (!m) return null;
    return m[1]
        .split(",")
        .map(
            (n) =>
                n
                    .trim()
                    .replace(/^type /, "")
                    .split(/\s+as\s+/)[0],
        )
        .filter(Boolean);
}

/**
 * Every module of this app's own, and of `@saroh/search-pages`, a file
 * loads, `import type` aside. Reached through named imports, a module's
 * `export { … } from` lines are followed only for the names asked for, as
 * the bundler's tree-shaking does (the package has no side effects), so a
 * client component importing `EmailGate` from the package's index isn't
 * counted as loading the index's page loaders.
 */
function reach(
    entry: string,
    names: string[] | null = null,
    seen = new Map<string, Set<string> | "all">(),
): Set<string> {
    const had = seen.get(entry);
    const wanted =
        names === null
            ? null
            : names.filter((n) => had !== "all" && !had?.has(n));
    if (had === "all" || (had && wanted?.length === 0))
        return new Set(seen.keys());
    seen.set(
        entry,
        names === null ? "all" : new Set([...(had ?? []), ...names]),
    );
    if (!existsSync(entry)) return new Set(seen.keys());
    const code = readFileSync(entry, "utf8");
    for (const m of code.matchAll(
        /^(import|export) (?!type )([^;]*?) from "([^"]+)"/gm,
    )) {
        const [, verb, clause, spec] = m;
        const next = resolveImport(entry, spec);
        if (!next) continue;
        if (verb === "export" && wanted) {
            const exported = clause.trim() === "*" ? wanted : namesOf(clause);
            const hit = exported?.filter((n) => wanted.includes(n)) ?? wanted;
            if (clause.trim() !== "*" && hit.length === 0) continue;
            reach(next, clause.trim() === "*" ? wanted : hit, seen);
        } else reach(next, namesOf(clause), seen);
    }
    for (const m of code.matchAll(/import\("([^"]+)"\)/g)) {
        const next = resolveImport(entry, m[1]);
        if (next) reach(next, null, seen);
    }
    for (const m of code.matchAll(/^import "([^"]+)"/gm)) {
        const next = resolveImport(entry, m[1]);
        if (next) reach(next, null, seen);
    }
    return new Set(seen.keys());
}

/** saroh.in's and the package's client components, and the browser's own entry. */
function clientEntries(): string[] {
    const isClient = (path: string) =>
        /^["']use client["']/.test(readFileSync(path, "utf8"));
    return [
        join(ROOT, "instrumentation-client.ts"),
        ...["app", "components", "lib"]
            .flatMap((dir) => sources(join(ROOT, dir)))
            .filter(isClient),
        ...sources(join(PACKAGE, "src")).filter(isClient),
    ];
}

describe("saroh.in's browser JS", () => {
    it("never loads zod, createEnv, an auth library or the nav's page copy", () => {
        const entries = clientEntries();
        expect(entries.length).toBeGreaterThan(10);
        const found = entries.flatMap((entry) =>
            [...reach(entry)]
                .map((path) => relative(ROOT, path))
                .filter(
                    (path) =>
                        // The package's own zod use isn't this test's: it's this app's code it holds.
                        !path.startsWith("..") &&
                        (NEVER_IN_THE_BROWSER.includes(path) ||
                            (!ZOD_ON_PURPOSE.has(path) &&
                                SERVER_ONLY_PACKAGES.test(
                                    readFileSync(join(ROOT, path), "utf8"),
                                ))),
                )
                .map((path) => `${relative(ROOT, entry)} → ${path}`),
        );
        expect(found).toEqual([]);
    });

    it("never loads a page's words (plan 2026-10-31-002, R3)", () => {
        const found = clientEntries().flatMap((entry) =>
            [...reach(entry)]
                .filter((path) => CONTENT_MAPS.includes(path))
                .map(
                    (path) =>
                        `${relative(ROOT, entry)} → ${relative(ROOT, path)}`,
                ),
        );
        expect(found).toEqual([]);
    });

    it("follows the package: a client file importing a loader is caught", () => {
        const dir = mkdtempSync(join(tmpdir(), "client-bundle-"));
        try {
            const bad = join(dir, "bad.tsx");
            writeFileSync(
                bad,
                `"use client";\nimport { listSearchPages } from "@saroh/search-pages/embedded";\nimport { docPages } from "@/lib/docs-pages";\nimport { searchPages } from "@/lib/search-pages";\n`,
            );
            const reached = [...reach(bad)].filter((p) =>
                CONTENT_MAPS.includes(p),
            );
            expect(reached.map((p) => relative(ROOT, p)).sort()).toEqual([
                "../../packages/search-pages/src/content.gen.ts",
                "lib/docs-content.gen.ts",
                "lib/search-content.gen.ts",
            ]);
            const fine = join(dir, "fine.tsx");
            writeFileSync(
                fine,
                `"use client";\nimport { EmailGate } from "@saroh/search-pages";\n`,
            );
            expect(
                [...reach(fine)].filter((p) => CONTENT_MAPS.includes(p)),
            ).toEqual([]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("saroh.in carries only its build's pages (plan 2026-11-01-001)", () => {
    it("the package's index reaches no page's words", () => {
        const reached = [...reach(join(PACKAGE, "src/index.ts"))];
        expect(reached.filter((p) => CONTENT_MAPS.includes(p))).toEqual([]);
    });
});

describe("@saroh/search-pages/docs-embedded and ./embedded", () => {
    it("are admin's: no saroh.in file imports them (every draft's words)", () => {
        // docs-content.config.ts reads it at build time, in Node, to pick the live pages: never bundled.
        const files = [
            ...["app", "components", "lib", "content"].flatMap((dir) =>
                sources(join(ROOT, dir)),
            ),
            ...readdirSync(ROOT)
                .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
                .filter((f) => f !== "docs-content.config.ts")
                .filter((f) => !/\.test\.tsx?$/.test(f))
                .map((f) => join(ROOT, f)),
        ];
        const importers = files.filter((f) =>
            /["']@saroh\/search-pages\/(docs-embedded|embedded)["']/.test(
                readFileSync(f, "utf8"),
            ),
        );
        expect(importers.map((f) => relative(ROOT, f))).toEqual([]);
    });
});
