/**
 * Merchant copy says "location" (DEC-069, plan L11).
 *
 * Storefronts are called Locations everywhere a merchant reads them, and the
 * API's refusals, audit lines, notices and permission labels are read by
 * merchants. The code keeps its names (KTD-1: `Store`, `storefrontId`, the
 * `storefront` query key, `targetType: "storefront"`), so this guard only
 * looks at prose: a string literal with a space in it. A key, a route, a
 * query parameter or an audit action has none.
 *
 * A source scan with the TypeScript parser rather than a grep, so template
 * literals, nested quotes and comments are read the way the compiler reads
 * them.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import * as ts from "typescript";

const SRC = join(__dirname, "..");

/**
 * Left to the units that own their copy: L12 rewords `sites/**` ("Your
 * online shop sells from") and L13 owns `capabilities/setup/**`. Remove an
 * entry once its unit lands.
 */
const OWNED_ELSEWHERE = ["modules/sites/", "modules/capabilities/setup/"];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!name.endsWith(".ts") || name.endsWith(".d.ts")) return [];
        if (/\.spec\.ts$|\.test\.ts$/.test(name)) return [];
        return [path];
    });
}

/** Every piece of literal text in a file, with its line. */
function literals(path: string): { line: number; text: string }[] {
    const file = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
    );
    const found: { line: number; text: string }[] = [];
    const visit = (node: ts.Node): void => {
        if (
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
                text: node.text,
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
}

/** Prose that names a storefront. */
export function saysStorefront(text: string): boolean {
    return /\s/.test(text) && /storefront/i.test(text);
}

describe("merchant copy says location (DEC-069)", () => {
    it("tells prose from keys", () => {
        expect(saysStorefront("Pick the storefront.")).toBe(true);
        expect(saysStorefront(" storefronts")).toBe(true);
        expect(saysStorefront("storefront")).toBe(false);
        expect(saysStorefront("storefront.hours.update")).toBe(false);
        expect(saysStorefront("?storefront=")).toBe(false);
        expect(saysStorefront("Pick the location.")).toBe(false);
    });

    it("no API string a merchant reads says storefront", () => {
        const offenders = sourceFiles(SRC)
            .map((path) => relative(SRC, path).split(sep).join("/"))
            .filter((rel) => !OWNED_ELSEWHERE.some((p) => rel.startsWith(p)))
            .flatMap((rel) =>
                literals(join(SRC, rel))
                    .filter(({ text }) => saysStorefront(text))
                    .map(({ line, text }) => `${rel}:${line} ${text}`),
            );
        expect(offenders).toEqual([]);
    });
});
