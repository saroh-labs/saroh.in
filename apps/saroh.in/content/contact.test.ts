import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SAROH_CONTACT_EMAIL } from "./contact";

/** Every source file of the marketing site, tests and builds aside. */
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        if (name === "node_modules" || name.startsWith(".")) return [];
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.(ts|tsx|mdx|md)$/.test(name) ? [path] : [];
    });
}

describe("Saroh's contact address (DEC-101)", () => {
    it("is contact@saroh.in", () => {
        expect(SAROH_CONTACT_EMAIL).toBe("contact@saroh.in");
    });

    it("is the only address the site gives for writing to Saroh", () => {
        const root = join(import.meta.dirname, "..");
        const old = ["hello", "saroh.in"].join("@");
        const offenders = ["app", "components", "content", "lib"]
            .flatMap((dir) => sources(join(root, dir)))
            .filter((path) => readFileSync(path, "utf8").includes(old));
        expect(offenders).toEqual([]);
    });
});
