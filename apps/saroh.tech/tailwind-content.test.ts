import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { marketingContent } from "../../packages/marketing/src/tailwind";
import config, { UI_FILES } from "./tailwind.config";

/**
 * Tailwind reads only the @saroh/ui files `UI_FILES` names
 * (tailwind.config.ts). A file saroh.tech reaches but the list leaves out
 * would draw with its classes missing, and nothing else would say so.
 */
const ROOT = __dirname;
const UI = resolve(ROOT, "../../packages/ui/src");
const MARKETING = resolve(ROOT, "../../packages/marketing/src");

/** Every glob of `@saroh/marketing`'s is in `content`, its exclusions too. */
const namesMarketing = (content: unknown) =>
    Array.isArray(content) &&
    marketingContent.every((glob) => content.includes(glob));

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) ? [path] : [];
    });
}

function resolveFile(base: string): string | null {
    for (const path of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        if (existsSync(path)) return path;
    }
    return null;
}

/** `@saroh/ui/x` is a component, `@saroh/ui/lib/x` a helper (package.json exports). */
const uiEntry = (spec: string) => {
    const rest = spec.slice("@saroh/ui/".length);
    return resolveFile(
        join(UI, rest.startsWith("lib/") ? rest : `components/ui/${rest}`),
    );
};

const imports = (code: string) => [
    ...[
        ...code.matchAll(/^(?:import|export) (?!type )[^;]*?from "([^"]+)"/gm),
    ].map((m) => m[1]),
    ...[...code.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]),
];

describe("saroh.tech's Tailwind content", () => {
    it("names every @saroh/ui file the site reaches", () => {
        const reached = new Set<string>();
        const todo = ["app", "components", "lib", "content"]
            .flatMap((dir) => sources(join(ROOT, dir)))
            .concat(sources(MARKETING))
            .flatMap((file) => imports(readFileSync(file, "utf8")))
            .filter((spec) => spec.startsWith("@saroh/ui/"))
            .map(uiEntry)
            .filter((path): path is string => path !== null);
        for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
            if (reached.has(file)) continue;
            reached.add(file);
            for (const spec of imports(readFileSync(file, "utf8"))) {
                const next = spec.startsWith(".")
                    ? resolveFile(resolve(dirname(file), spec))
                    : spec.startsWith("@saroh/ui/")
                      ? uiEntry(spec)
                      : null;
                if (next) todo.push(next);
            }
        }
        const missing = [...reached]
            .map((file) => relative(UI, file))
            .filter((file) => !/\.(test|stories)\.tsx?$/.test(file))
            .filter((file) => !UI_FILES.includes(file))
            .sort();
        expect(reached.size).toBeGreaterThan(5);
        expect(missing).toEqual([]);
    });

    // Left out, every class only @saroh/marketing draws (the buttons, the
    // links, the focus ring) is missing from the site's CSS.
    it("reads @saroh/marketing", () => {
        expect(namesMarketing(config.content)).toBe(true);
        expect(marketingContent[0]).toBe(
            "../../packages/marketing/src/**/*.{ts,tsx}",
        );
        expect(existsSync(join(MARKETING, "ring.ts"))).toBe(true);
        expect(
            namesMarketing(
                (config.content as string[]).filter(
                    (glob) => !glob.includes("packages/marketing"),
                ),
            ),
        ).toBe(false);
    });
});
