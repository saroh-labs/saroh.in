import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { getMetadataStorage } from "class-validator";

/**
 * Every whole number a DTO (a `*dto.ts` file) takes has an upper bound (`@Max`, `@IsIn` or
 * `@IsEnum`) as well as a lower one. Without it, a value past what the
 * column holds passes validation and fails in the database as a 500
 * (DEV_LEARNINGS, 26 Nov 2026). Quantities follow the invoice line, stock
 * counts the stock screens, and an amount in minor units with no bound of
 * its own takes `INT_COLUMN_MAX` (`common/validation.ts`).
 */

const MODULES = join(__dirname, "..", "modules");

function dtoFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return dtoFiles(path);
        return /dto\.ts$/i.test(entry.name) && !entry.name.endsWith(".spec.ts")
            ? [path]
            : [];
    });
}

function unbounded(): string[] {
    const owners = new Map<unknown, string>();
    for (const path of dtoFiles(MODULES)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(path) as Record<string, unknown>;
        for (const [name, value] of Object.entries(mod)) {
            if (typeof value === "function") {
                owners.set(value, `${relative(MODULES, path)} ${name}`);
            }
        }
    }
    const storage = getMetadataStorage() as unknown as {
        validationMetadatas: Map<
            unknown,
            { propertyName: string; name?: string; type: string }[]
        >;
    };
    const found: string[] = [];
    for (const [target, metas] of storage.validationMetadatas) {
        const owner = owners.get(target);
        if (!owner) continue;
        const byProp = new Map<string, Set<string>>();
        for (const m of metas) {
            const kinds = byProp.get(m.propertyName) ?? new Set();
            kinds.add(m.name ?? m.type);
            byProp.set(m.propertyName, kinds);
        }
        for (const [prop, kinds] of byProp) {
            const numeric = ["isInt", "isNumber", "min", "isPositive"].some(
                (k) => kinds.has(k),
            );
            const capped = ["max", "isIn", "isEnum"].some((k) => kinds.has(k));
            if (numeric && !capped) found.push(`${owner}.${prop}`);
        }
    }
    return found.sort();
}

describe("DTO whole numbers", () => {
    it("each has an upper bound", () => {
        expect(unbounded()).toEqual([]);
    });
});
