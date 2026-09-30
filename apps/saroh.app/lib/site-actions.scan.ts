import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * The server actions on a merchant's site, read from their source, for the
 * tests that hold every one of them to a rule: `origin.test.ts` (each checks
 * `Origin` first, ADR-011) and `test-mode-actions.test.ts` (each write
 * refuses on a test release next, DEC-071 T6). One list, so an action added
 * to one rule's reach is in the other's too. Used only by tests.
 */

/** Where the site's actions live. */
export const SITE_ROUTES = path.resolve(__dirname, "../app/[domain]");

/** Every `actions.ts` under `dir`. */
export function actionFiles(dir: string = SITE_ROUTES): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return actionFiles(full);
        return entry.name === "actions.ts" ? [full] : [];
    });
}

/** Each exported action in a file: its name and its body's lines. */
export function exportedActions(
    source: string,
): { name: string; lines: string[] }[] {
    const out: { name: string; lines: string[] }[] = [];
    const exported = /export async function (\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = exported.exec(source)) !== null) {
        const bodyStart = source.indexOf("{\n", match.index);
        out.push({
            name: match[1],
            lines: source
                .slice(bodyStart + 2)
                .split("\n")
                .filter((line) => line.trim() !== ""),
        });
    }
    return out;
}

/**
 * The first statement of a body after its opening line: skips the rest of
 * a braced `if (…) {` block that line opened.
 */
export function statementAfterFirst(lines: string[]): string | undefined {
    if (lines.length === 0) return undefined;
    const first = lines[0];
    if (!first.trimEnd().endsWith("{")) return lines[1];
    const indent = first.length - first.trimStart().length;
    const close = lines.findIndex(
        (line, i) =>
            i > 0 &&
            line.trim() === "}" &&
            line.length - line.trimStart().length === indent,
    );
    return close === -1 ? undefined : lines[close + 1];
}
