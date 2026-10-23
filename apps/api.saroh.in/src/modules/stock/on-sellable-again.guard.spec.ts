import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every way a product can become sellable again calls the one hook
 * (DEC-174 U23, #1154): `onSellableAgain`, `onSellableAgainAll` or
 * `onSellableAgainForBusiness` (`on-sellable-again.ts`), so the people
 * waiting for it are told, whichever screen or job put the stock back.
 *
 * This reads the API's sources and finds every write that can make a
 * product sellable:
 *  - a stock entry written (`stockEntry.create…`), which is how units are
 *    added: a delivery, a count, a return, a move in, an undo;
 *  - a promise given back (`promised: { decrement`): an order cancelled or
 *    a line refunded frees units;
 *  - a hand-marked Sold out cleared (`soldOutAt: null, soldOutByUserId:
 *    null`, and every call to `clearSoldOut(`).
 *
 * The function each one is written in must call the hook. A new writer that
 * doesn't fails here, with its file and line.
 */

const SRC = join(__dirname, "..", "..");

const WRITES: { what: string; pattern: RegExp }[] = [
    {
        what: "a stock entry written",
        pattern: /\.stockEntry\.create(Many|ManyAndReturn)?\(/g,
    },
    { what: "a promise given back", pattern: /promised:\s*\{\s*decrement/g },
    {
        what: "a hand-marked Sold out cleared",
        pattern: /soldOutAt:\s*null,\s*soldOutByUserId:\s*null/g,
    },
    { what: "clearSoldOut called", pattern: /await clearSoldOut\(/g },
];

/** Where a write needs no hook of its own, and why. */
const EXEMPT: Record<string, string> = {
    // `clearSoldOut` is the helper; each caller is checked instead.
    "modules/stock/sold-out.ts": "the clearSoldOut helper itself",
};

const HOOK = /\bonSellableAgain(All|ForBusiness)?\(/;

/** A function or method declaration, at the top level or in a class. */
const DECLARATION =
    /^(?:export\s+)?(?:async\s+)?function\s+\w+|^\s{4}(?:(?:private|public|protected|static|readonly)\s+)*(?:async\s+)?(?!if\b|for\b|while\b|switch\b|return\b|await\b|catch\b)\w+\s*(?:<[^>]*>)?\(/;

function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (name === "node_modules") continue;
            out.push(...sources(path));
        } else if (
            name.endsWith(".ts") &&
            !name.endsWith(".spec.ts") &&
            !name.endsWith(".d.ts")
        ) {
            out.push(path);
        }
    }
    return out;
}

/** The lines of the function the given line is in. */
function enclosing(lines: string[], at: number): string {
    let start = at;
    while (start > 0 && !DECLARATION.test(lines[start])) start -= 1;
    let end = at + 1;
    while (end < lines.length && !DECLARATION.test(lines[end])) end += 1;
    return lines.slice(start, end).join("\n");
}

interface Found {
    file: string;
    line: number;
    what: string;
    hooked: boolean;
}

function writes(): Found[] {
    const found: Found[] = [];
    for (const path of sources(SRC)) {
        const file = relative(SRC, path).split("\\").join("/");
        if (EXEMPT[file]) continue;
        const text = readFileSync(path, "utf8");
        const lines = text.split("\n");
        for (const { what, pattern } of WRITES) {
            for (const m of text.matchAll(pattern)) {
                const line = text.slice(0, m.index).split("\n").length - 1;
                found.push({
                    file,
                    line: line + 1,
                    what,
                    hooked: HOOK.test(enclosing(lines, line)),
                });
            }
        }
    }
    return found;
}

describe("every way stock comes back tells who is waiting (U23)", () => {
    const all = writes();

    it("finds the writers it is meant to check", () => {
        const files = new Set(all.map((f) => f.file));
        for (const file of [
            "modules/stock/stock.service.ts",
            "modules/stock/reserve.ts",
            "modules/stock/tracking.ts",
            "modules/products/sold-out.service.ts",
        ]) {
            expect(files).toContain(file);
        }
    });

    it("each one calls onSellableAgain in the same function", () => {
        const missing = all
            .filter((f) => !f.hooked)
            .map((f) => `${f.file}:${f.line} (${f.what})`);
        expect(missing).toEqual([]);
    });

    it("the scan sees a writer without the hook", () => {
        const lines = [
            "export async function sneaky(tx: Tx) {",
            "    await tx.stockEntry.create({ data });",
            "}",
            "export async function fine(tx: Tx) {",
            "    await tx.stockEntry.create({ data });",
            "    await onSellableAgain(tx, org, productId);",
            "}",
        ];
        expect(HOOK.test(enclosing(lines, 1))).toBe(false);
        expect(HOOK.test(enclosing(lines, 4))).toBe(true);
    });
});
