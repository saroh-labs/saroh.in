// A browser spec that signs its page in (`useSession(page…)`) calls the API
// as that person through `page.request`, which carries the page's cookies.
// Playwright's `request` fixture is a context of its own with no cookies:
// handed to `northwind(…)`, `makeContact(…)` or any other helper in a test
// that signs in, every call is a 401 "Invalid or expired session", and the
// test fails in ~90ms before drawing anything (invoices-new.spec, 20 Oct
// 2026; DEV_LEARNINGS). This fails a test that destructures `request` and
// also signs its page in (`useSession(page…)` or `openNorthwindAs(page…)`,
// which calls it), wherever it passes `request` on or calls it directly
// (`request.get(…)`, `request.post(…)`; review #37). A call that is meant
// to be signed out — a visitor on the public site — says "signed out on
// purpose" on its line or the line above.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const files = execFileSync("git", ["ls-files", "--", "e2e/tests/*.ts"], {
    cwd: root,
    encoding: "utf8",
})
    .split("\n")
    .filter(Boolean);

/** The text of the block that opens at `from` (a "{"), braces balanced. */
function block(text, from) {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") {
            depth -= 1;
            if (depth === 0) return text.slice(from, i + 1);
        }
    }
    return text.slice(from);
}

// A test's callback: `async ({ page, request }, testInfo) => {`.
const CALLBACK = /async\s*\(\s*\{([^}]*)\}[^)]*\)\s*=>\s*\{/g;
const PASSED_ON = /\b\w+\(\s*request\s*[,)]/g;
// Called directly: `request.get(`, `request.post(`, … — not `page.request`.
const CALLED = /(?<![.\w])request\.(?:get|post|put|patch|delete|fetch|head)\(/g;
// Ways a test signs its page in.
const SIGNS_IN = /\b(?:useSession|openNorthwindAs)\(\s*page\b/;
let found = 0;
for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const m of text.matchAll(CALLBACK)) {
        if (!/\brequest\b/.test(m[1])) continue;
        const open = (m.index ?? 0) + m[0].length - 1;
        const body = block(text, open);
        if (!SIGNS_IN.test(body)) continue;
        for (const call of [
            ...body.matchAll(PASSED_ON),
            ...body.matchAll(CALLED),
        ]) {
            const line = text
                .slice(0, open + (call.index ?? 0))
                .split("\n").length;
            // A call meant to be signed out (a visitor scanning a code on
            // the public site) says so on its line or the one above.
            const lines = text.split("\n");
            const said = `${lines[line - 2] ?? ""}\n${lines[line - 1] ?? ""}`;
            if (/signed out on purpose/i.test(said)) continue;
            console.error(
                `${file}:${line}: the \`request\` fixture has no session; this test signs its page in, so pass page.request`,
            );
            found += 1;
        }
    }
}
if (found) process.exitCode = 1;
else
    console.log(
        `e2e-signed-in-request: ${files.length} specs, none calls the API signed out beside a signed-in page`,
    );
