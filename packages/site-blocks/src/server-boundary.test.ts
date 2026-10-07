import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Inside this package, no module without "use client" calls a function it
 * imports from a module with one.
 *
 * Such a module may be rendered by a server page (the order confirmation
 * is), and there the client module's exports are only client references:
 * rendering a component from one is fine, calling a function throws
 * "Attempted to call formatAmount() from the server" (UX-001). The app's
 * own check (`apps/saroh.app/lib/server-imports.test.ts`) only sees what
 * the app imports from the package index, not what the package's server
 * modules import from each other; this one does.
 */

const SRC = __dirname;

const isClient = (source: string): boolean =>
    /^\s*["']use client["']/.test(
        source.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\/\*[\s\S]*?\*\//, ""),
    );

function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
            continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) files(file, out);
        else if (
            /\.(ts|tsx)$/.test(entry.name) &&
            !/\.test\.tsx?$/.test(entry.name)
        )
            out.push(file);
    }
    return out;
}

function resolve(spec: string, from: string): string | null {
    const base = path.resolve(path.dirname(from), spec);
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (existsSync(base + ext)) return base + ext;
    }
    return null;
}

describe("site-blocks' server modules call nothing from a client module", () => {
    it("imports every function a server module calls from a module with no 'use client'", () => {
        const offenders: string[] = [];
        for (const file of files(SRC)) {
            const text = readFileSync(file, "utf8");
            if (isClient(text)) continue;
            const re = /import\s+\{([^}]*)\}\s+from\s+"(\.[^"]+)"/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
                const [statement, list = "", spec = ""] = m;
                const target = resolve(spec, file);
                if (!target || !isClient(readFileSync(target, "utf8")))
                    continue;
                const rest = text.replace(statement, "");
                for (const part of list.split(",")) {
                    const name =
                        part
                            .trim()
                            .split(/\s+as\s+/)
                            .pop() ?? "";
                    // Components render fine from a client module; hooks
                    // only run in a client tree anyway.
                    if (
                        !/^[a-z]/.test(name) ||
                        /^use[A-Z]/.test(name) ||
                        part.trim().startsWith("type ")
                    )
                        continue;
                    if (new RegExp(`\\b${name}\\s*\\(`).test(rest)) {
                        offenders.push(
                            `${path.relative(SRC, file)}: ${name} (from ${spec})`,
                        );
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});
