/**
 * One path repoints the live site (DEC-071, KTD-3), pinned as a source fact.
 *
 * #279 happened because restore was a second place that wrote
 * `Site.currentPublicationId`, and it forgot the bypass record publish wrote.
 * `putLive` in `live-pointer.ts` is now the only writer in `modules/sites`,
 * and this spec fails when a write appears anywhere else there.
 *
 * What counts as a write, read from the TypeScript syntax tree rather than
 * a regex, so line breaks and nesting don't hide one:
 *   - a `currentPublicationId` key inside a `data`, `create` or `update`
 *     object (a Prisma update, create or upsert);
 *   - a `currentPublication` relation key there (`connect`, `disconnect`);
 *   - raw SQL that SETs or INSERTs "currentPublicationId".
 * A key under `where`, `select`, `include` or `orderBy` is a read and is
 * ignored.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

const SITES = __dirname;

/** The one file allowed to write the live pointer. */
const WRITER = "live-pointer.ts";

const WRITE_KEYS = new Set(["data", "create", "update"]);
const READ_KEYS = new Set(["where", "select", "include", "orderBy"]);
const POINTER_KEYS = new Set(["currentPublicationId", "currentPublication"]);
const RAW_WRITE =
    /\b(?:SET|INSERT\s+INTO\s+"?Site"?)\b[^`;]*"currentPublicationId"/i;

function keyName(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
    return null;
}

/**
 * Every live-pointer write in `source`, as the line it is on (1-based).
 * Exported for the self-test below, which proves the detector sees the
 * shapes it is meant to.
 */
export function pointerWrites(source: string): number[] {
    const file = ts.createSourceFile(
        "scan.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
    );
    const lines: number[] = [];
    const lineOf = (node: ts.Node) =>
        file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

    const visit = (node: ts.Node) => {
        if (
            (ts.isPropertyAssignment(node) ||
                ts.isShorthandPropertyAssignment(node)) &&
            POINTER_KEYS.has(keyName(node.name) ?? "") &&
            insideWrite(node)
        ) {
            lines.push(lineOf(node));
        }
        if (
            (ts.isNoSubstitutionTemplateLiteral(node) ||
                ts.isTemplateExpression(node) ||
                ts.isStringLiteral(node)) &&
            RAW_WRITE.test(node.getText(file))
        ) {
            lines.push(lineOf(node));
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return lines;
}

/** Whether the nearest enclosing Prisma key above `node` is a write. */
function insideWrite(node: ts.Node): boolean {
    let at: ts.Node | undefined = node.parent;
    while (at) {
        if (ts.isPropertyAssignment(at)) {
            const name = keyName(at.name) ?? "";
            if (READ_KEYS.has(name)) return false;
            if (WRITE_KEYS.has(name)) return true;
        }
        if (ts.isCallExpression(at) || ts.isFunctionLike(at)) return false;
        at = at.parent;
    }
    return false;
}

function sourceFiles(): string[] {
    return readdirSync(SITES).filter(
        (name) =>
            name.endsWith(".ts") &&
            !name.endsWith(".spec.ts") &&
            !name.endsWith(".d.ts"),
    );
}

describe("the live pointer has one writer (DEC-071, KTD-3)", () => {
    it("writes currentPublicationId nowhere in modules/sites but live-pointer.ts", () => {
        const offenders = sourceFiles()
            .filter((name) => name !== WRITER)
            .flatMap((name) =>
                pointerWrites(readFileSync(join(SITES, name), "utf8")).map(
                    (line) => `${name}:${line}`,
                ),
            );
        // A new place that puts something live calls putLive instead, so it
        // records the review standing and a bypass like every other (#279).
        expect(offenders).toEqual([]);
    });

    it("finds exactly one write, in putLive", () => {
        const source = readFileSync(join(SITES, WRITER), "utf8");
        expect(pointerWrites(source)).toHaveLength(1);
    });

    describe("the detector", () => {
        it.each([
            [
                "a one-line update",
                `tx.site.update({ where: { id }, data: { currentPublicationId: p.id } });`,
            ],
            [
                "an update over several lines",
                `await prisma.site.update({
                    where: { id: site.id },
                    data: {
                        name: "x",
                        currentPublicationId: publication.id,
                    },
                });`,
            ],
            [
                "a shorthand key",
                `tx.site.update({ where: { id }, data: { currentPublicationId } });`,
            ],
            [
                "a relation connect",
                `tx.site.update({ where: { id }, data: { currentPublication: { connect: { id: p } } } });`,
            ],
            [
                "an upsert",
                `tx.site.upsert({ where: { id }, create: { id }, update: { currentPublicationId: null } });`,
            ],
            [
                "an updateMany",
                `tx.site.updateMany({ where: { organizationId }, data: { currentPublicationId: null } });`,
            ],
            [
                "raw SQL",
                'tx.$executeRaw`UPDATE "Site" SET "currentPublicationId" = ${id} WHERE id = ${siteId}`;',
            ],
        ])("sees %s", (_label, source) => {
            expect(pointerWrites(source)).toHaveLength(1);
        });

        it.each([
            [
                "a where",
                `prisma.site.findMany({ where: { currentPublicationId: { not: null } } });`,
            ],
            [
                "a select",
                `prisma.site.findFirst({ select: { currentPublicationId: true } });`,
            ],
            [
                "a where inside an update",
                `prisma.site.updateMany({ where: { currentPublicationId: null }, data: { name: "x" } });`,
            ],
            [
                "a relation read",
                `prisma.site.findFirst({ select: { currentPublication: { select: { snapshot: true } } } });`,
            ],
            ["a plain object", `const view = { currentPublicationId: id };`],
        ])("ignores %s", (_label, source) => {
            expect(pointerWrites(source)).toEqual([]);
        });
    });
});
