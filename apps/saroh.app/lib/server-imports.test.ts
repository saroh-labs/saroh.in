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

const isClient = (source: string): boolean =>
    /^\s*["']use client["']/.test(source.replace(/^\s*\/\/.*$/gm, ""));

/** Every match of a global pattern: its capture groups, as strings. */
function groupsOf(pattern: RegExp, text: string): string[][] {
    const out: string[][] = [];
    const re = new RegExp(pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push(Array.from(m, (g: string | undefined) => g ?? ""));
    }
    return out;
}

/** The names in an `{ a, b as c, type D }` list, as they are imported. */
function namesIn(list: string): string[] {
    return list
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "" && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/).pop() ?? part);
}

/** Each value the index exports, and the module it comes from. */
function exportsOfIndex(): Map<string, string> {
    const index = readFileSync(path.join(BLOCKS, "index.ts"), "utf8");
    const out = new Map<string, string>();
    for (const [, list = "", from = ""] of groupsOf(
        /export\s+\{([^}]*)\}\s+from\s+"([^"]+)"/,
        index,
    )) {
        for (const name of namesIn(list)) out.set(name, from);
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
            !/\.test\.tsx?$/.test(entry.name) &&
            !isClient(readFileSync(file, "utf8"))
        ) {
            out.push(file);
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
                for (const [statement = "", list = ""] of groupsOf(
                    /import\s+\{([^}]*)\}\s+from\s+"@saroh\/site-blocks"/,
                    text,
                )) {
                    const rest = text.replace(statement, "");
                    // Lower-case values are functions; components and
                    // constants are fine to import on the server.
                    for (const name of namesIn(list)) {
                        if (!/^[a-z]/.test(name)) continue;
                        if (!new RegExp(`\\b${name}\\s*\\(`).test(rest))
                            continue;
                        const from = exported.get(name);
                        const source = from ? sourceOf(from) : null;
                        if (source !== null && isClient(source)) {
                            offenders.push(
                                `${path.relative(APP, file)}: ${name} (from ${from ?? "?"})`,
                            );
                        }
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
