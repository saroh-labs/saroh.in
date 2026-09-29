import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nothing this app's server calls comes from a "use client" module of
 * `@saroh/site-blocks`.
 *
 * On the server an export of a client module is only a client reference: it
 * can be rendered as a component, but calling it throws ("Attempted to call
 * productGridQuery() from the server…"). A check or a query builder that
 * lives in a block's own file therefore breaks the server page that calls
 * it: every page holding a Product grid failed to load, and the booking
 * page's header silently lost its address (E6). The fix is a module with no
 * directive (`site-blocks/src/lib/*`); this test finds the next one.
 *
 * It reads the package's index to learn which module each export comes
 * from, then every server file here (no "use client" of its own) for the
 * lower-case values it imports and calls: functions, not components.
 */

const APP = path.resolve(__dirname, "..");
const BLOCKS = path.resolve(APP, "../../packages/site-blocks/src");

function sourceOf(rel: string): string | null {
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const file = path.join(BLOCKS, rel + ext);
        if (existsSync(file)) return readFileSync(file, "utf8");
    }
    return null;
}

const isClient = (source: string) =>
    /^\s*["']use client["']/.test(source.replace(/^\s*\/\/.*$/gm, ""));

/** Each value the index exports, and the module it comes from. */
function exportsOfIndex(): Map<string, string> {
    const index = readFileSync(path.join(BLOCKS, "index.ts"), "utf8");
    const out = new Map<string, string>();
    for (const m of index.matchAll(
        /export\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g,
    )) {
        for (const part of (m[1] ?? "").split(",")) {
            const name = part.trim();
            if (!name || name.startsWith("type ")) continue;
            out.set(
                name
                    .split(/\s+as\s+/)
                    .pop()!
                    .trim(),
                m[2]!,
            );
        }
    }
    return out;
}

function serverFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
            continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) serverFiles(file, out);
        else if (
            /\.(ts|tsx)$/.test(entry.name) &&
            !/\.test\.tsx?$/.test(entry.name)
        ) {
            if (!isClient(readFileSync(file, "utf8"))) out.push(file);
        }
    }
    return out;
}

describe("the site's server calls nothing from a client module", () => {
    it("imports every function it calls from a module with no 'use client'", () => {
        const exported = exportsOfIndex();
        const offenders: string[] = [];
        for (const dir of ["app", "lib", "components"]) {
            for (const file of serverFiles(path.join(APP, dir))) {
                const text = readFileSync(file, "utf8");
                for (const m of text.matchAll(
                    /import\s+\{([^}]*)\}\s+from\s+"@saroh\/site-blocks"/g,
                )) {
                    const rest = text.replace(m[0], "");
                    for (const part of (m[1] ?? "").split(",")) {
                        const name = part.trim();
                        if (!/^[a-z]/.test(name)) continue; // components, constants
                        if (!new RegExp(`\\b${name}\\s*\\(`).test(rest))
                            continue;
                        const from = exported.get(name);
                        const source = from ? sourceOf(from) : null;
                        if (source && isClient(source)) {
                            offenders.push(
                                `${path.relative(APP, file)}: ${name} (from ${from})`,
                            );
                        }
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
