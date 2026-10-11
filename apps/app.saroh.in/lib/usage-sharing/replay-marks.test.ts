import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A component that draws a record's data never carries `data-ph-unmask`
 * (DEC-125, 10 Oct; frontend-design-system.md → Session recordings).
 *
 * `Button`, `Label` and the others below mark themselves as Saroh's own
 * words, so most of the workspace can be read in a recording without a
 * screen doing anything. That is only right while what is put inside them
 * is words. This reads every screen and fails where one of them is handed
 * something computed that looks like a record's data (a name, an email, an
 * address, a search, a title that came from the API), until the screen says
 * which it is, on that element:
 *
 *   - `data-ph-mask=""`     it is a record's data: masked, always;
 *   - `data-ph-unmask=""`   it is fixed words after all (a plan's name, a
 *                           label looked up from a table in the code).
 *
 * `PageHeader` is stricter, because a detail page's title is so often the
 * record's own name: a title or description that is not a literal string
 * must say `holdsData` (`true` masks both).
 *
 * A net, not a proof: it reads names, it does not follow values. Digits and
 * emails are hidden in a recording even inside readable words, whatever
 * this finds (`hideFigures`).
 */
const appDir = path.resolve(__dirname, "../..");

/** Marked `data-ph-unmask` in `@saroh/ui`: what is inside them is read. */
const READABLE = new Set([
    "Button",
    "Label",
    "FormLabel",
    "FormDescription",
    "TabsTrigger",
    "TableHead",
]);

/** The state cards: their `title`, `description` and `note` are read. */
const STATES = new Set([
    "EmptyState",
    "FailedState",
    "CapabilityOffState",
    "PermissionDeniedState",
]);
const STATE_PROPS = ["title", "description", "note"];

/** Names that say a value is a record's, or something a person typed. */
const DATA =
    /name|email|phone|mobile|customer|contact|booker|holder|person|member|staff|\bwho\b|address|host|domain|slug|query|search|\bq\b|picked|chosen|title|number|\bref\b|\bcode\b|suggestion|amount|money|total|price/i;

function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
            return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sources(full);
        if (!entry.name.endsWith(".tsx")) return [];
        if (entry.name.endsWith(".test.tsx")) return [];
        return [full];
    });
}

/** Words written in the file itself: a literal, or a choice between them. */
function fixedWords(e: ts.Expression | undefined): boolean {
    if (!e) return true;
    if (
        ts.isStringLiteral(e) ||
        ts.isNoSubstitutionTemplateLiteral(e) ||
        ts.isNumericLiteral(e)
    )
        return true;
    if (
        e.kind === ts.SyntaxKind.NullKeyword ||
        e.kind === ts.SyntaxKind.TrueKeyword ||
        e.kind === ts.SyntaxKind.FalseKeyword
    )
        return true;
    if (ts.isIdentifier(e) && e.text === "undefined") return true;
    if (ts.isParenthesizedExpression(e)) return fixedWords(e.expression);
    if (ts.isConditionalExpression(e))
        return fixedWords(e.whenTrue) && fixedWords(e.whenFalse);
    if (
        ts.isBinaryExpression(e) &&
        e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    )
        return fixedWords(e.right);
    if (ts.isJsxElement(e) || ts.isJsxFragment(e))
        return computedIn(e).length === 0;
    // An icon, or a component that draws its own (unmarked) text.
    if (ts.isJsxSelfClosingElement(e)) return true;
    return false;
}

/** Every computed thing drawn inside an element, as it is written. */
function computedIn(node: ts.JsxElement | ts.JsxFragment): ts.Expression[] {
    const found: ts.Expression[] = [];
    for (const child of node.children) {
        if (ts.isJsxExpression(child)) {
            const e = child.expression;
            if (!e || fixedWords(e)) continue;
            if (ts.isConditionalExpression(e)) {
                for (const side of [e.whenTrue, e.whenFalse])
                    if (!fixedWords(side)) found.push(side);
            } else found.push(e);
        } else if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
            // A child that marks itself is its own answer.
            if (ts.isJsxElement(child) && decided(child.openingElement))
                continue;
            found.push(...computedIn(child));
        }
    }
    return found;
}

function attribute(
    opening: ts.JsxOpeningLikeElement,
    name: string,
): ts.JsxAttribute | undefined {
    return opening.attributes.properties.find(
        (p): p is ts.JsxAttribute =>
            ts.isJsxAttribute(p) && p.name.getText() === name,
    );
}

/** The screen has said which it is, on the element itself. */
function decided(opening: ts.JsxOpeningLikeElement): boolean {
    return Boolean(
        attribute(opening, "data-ph-mask") ??
        attribute(opening, "data-ph-unmask"),
    );
}

/** A prop's value when it is computed, or undefined when it is a literal. */
function computedProp(
    opening: ts.JsxOpeningLikeElement,
    name: string,
): ts.Expression | undefined {
    const init = attribute(opening, name)?.initializer;
    if (!init || ts.isStringLiteral(init)) return undefined;
    if (ts.isJsxExpression(init))
        return fixedWords(init.expression) ? undefined : init.expression;
    return undefined;
}

interface Finding {
    where: string;
    what: string;
}

function findings(): { unmarked: Finding[]; headers: Finding[] } {
    const unmarked: Finding[] = [];
    const headers: Finding[] = [];
    for (const file of sources(appDir)) {
        const text = readFileSync(file, "utf8");
        // Cheap skip: most files use none of them.
        if (
            !/<(?:Button|Label|Form|Tabs|TableHead|PageHeader|\w+State)\b/.test(
                text,
            )
        )
            continue;
        const sf = ts.createSourceFile(
            file,
            text,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        const at = (node: ts.Node) =>
            `${path.relative(appDir, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
        const words = (e: ts.Expression) =>
            e.getText(sf).replace(/\s+/g, " ").slice(0, 80);

        const visit = (node: ts.Node): void => {
            const opening = ts.isJsxElement(node)
                ? node.openingElement
                : ts.isJsxSelfClosingElement(node)
                  ? node
                  : undefined;
            if (opening) {
                const tag = opening.tagName.getText(sf);
                if (
                    READABLE.has(tag) &&
                    ts.isJsxElement(node) &&
                    !decided(opening)
                ) {
                    for (const e of computedIn(node))
                        if (DATA.test(e.getText(sf)))
                            unmarked.push({
                                where: at(node),
                                what: `<${tag}> draws {${words(e)}}`,
                            });
                }
                if (STATES.has(tag) && !decided(opening)) {
                    for (const prop of STATE_PROPS) {
                        const e = computedProp(opening, prop);
                        if (e && DATA.test(e.getText(sf)))
                            unmarked.push({
                                where: at(node),
                                what: `<${tag} ${prop}={${words(e)}}>`,
                            });
                    }
                }
                if (tag === "PageHeader" && !attribute(opening, "holdsData")) {
                    for (const prop of ["title", "description"]) {
                        const e = computedProp(opening, prop);
                        if (e)
                            headers.push({
                                where: at(node),
                                what: `${prop}={${words(e)}}`,
                            });
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
    return { unmarked, headers };
}

describe("what a workspace recording may read (DEC-125)", () => {
    const found = findings();

    it("a readable component is never handed a record's data unmarked", () => {
        expect(
            found.unmarked.map((f) => `${f.where}  ${f.what}`),
            "Say which it is on the element: data-ph-mask (a record's data) or data-ph-unmask (fixed words).",
        ).toEqual([]);
    });

    it("a page header whose title is computed says whether it holds a record's data", () => {
        expect(
            found.headers.map((f) => `${f.where}  ${f.what}`),
            "Add holdsData (masks the title and description) or holdsData={false} (fixed words).",
        ).toEqual([]);
    });

    it("knows a record's name from fixed words", () => {
        expect(DATA.test("customer.name")).toBe(true);
        expect(DATA.test("firstName(bookerLabel(booking))")).toBe(true);
        expect(DATA.test("`Link to ${holderName}`")).toBe(true);
        expect(DATA.test("card.emailTo")).toBe(true);
        expect(DATA.test('pending ? "Saving…" : label')).toBe(false);
        expect(DATA.test("STEP_LABEL[next]")).toBe(false);
    });
});
