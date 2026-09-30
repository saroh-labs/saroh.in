/**
 * The workspace says "location", never "storefront" (DEC-069, plan L10).
 *
 * Storefronts are called Locations everywhere a merchant reads them. The code
 * keeps its names (KTD-1: `Store`, `storefrontId`, the `?storefront=` query
 * key, `"STOREFRONT"` enum values, `/stores/*` modules), so this guard reads
 * only what can reach a screen: JSX text, and a string or template literal
 * that is prose (it has a space) or starts a word with a capital
 * ("Storefront", as a label or column head). A lowercase key, a route or an
 * audit action has neither.
 *
 * The API's own guard is `apps/api.saroh.in/src/common/merchant-copy.spec.ts`
 * (L11); this is the app's half.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..");
const ROOTS = ["app", "components", "lib"];

/**
 * Text that names a storefront on purpose and never reaches a merchant as
 * it stands.
 */
const ALLOWED = new Set([
    // The role's stored default name, read only to show it as "Location
    // team" (`shownRoleLabel`).
    "lib/organizations/storefront-team.ts Storefront team",
    // A response header, not copy.
    "lib/constants/index.ts Saroh.io - Storefront creator",
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(name) || name.endsWith(".d.ts")) return [];
        if (/\.(test|spec)\.tsx?$/.test(name)) return [];
        return [path];
    });
}

/** Every piece of literal text in a file, with its line. */
function literals(
    path: string,
): { line: number; text: string; jsx: boolean }[] {
    const file = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const found: { line: number; text: string; jsx: boolean }[] = [];
    const visit = (node: ts.Node): void => {
        const jsx = ts.isJsxText(node);
        if (
            jsx ||
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)
        ) {
            found.push({
                line:
                    file.getLineAndCharacterOfPosition(node.getStart()).line +
                    1,
                text: node.text.trim(),
                jsx,
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
}

/** Text a merchant could read that names a storefront. */
export function saysStorefront(text: string, jsx = false): boolean {
    if (!/storefront/i.test(text)) return false;
    return jsx || /\s/.test(text) || text.includes("Storefront");
}

describe("merchant copy says location (DEC-069)", () => {
    it("tells copy from keys", () => {
        expect(saysStorefront("All storefronts")).toBe(true);
        expect(saysStorefront("Storefront")).toBe(true);
        expect(saysStorefront("storefront", true)).toBe(true);
        expect(saysStorefront("storefront")).toBe(false);
        expect(saysStorefront("STOREFRONT")).toBe(false);
        expect(saysStorefront("?storefront=")).toBe(false);
        expect(saysStorefront("storefront.hours.update")).toBe(false);
        expect(saysStorefront("@/lib/stores/storefronts")).toBe(false);
        expect(saysStorefront("All locations")).toBe(false);
    });

    it("no workspace string a merchant reads says storefront", () => {
        const offenders = ROOTS.flatMap((root) => sourceFiles(join(APP, root)))
            .map((path) => relative(APP, path).split(sep).join("/"))
            .flatMap((rel) =>
                literals(join(APP, rel))
                    .filter(({ text, jsx }) => saysStorefront(text, jsx))
                    .filter(({ text }) => !ALLOWED.has(`${rel} ${text}`))
                    .map(({ line, text }) => `${rel}:${line} ${text}`),
            );
        expect(offenders).toEqual([]);
    });
});
