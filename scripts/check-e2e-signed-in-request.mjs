// A browser spec that signs its page in (`useSession(page…)`) calls the API
// as that person through `page.request`, which carries the page's cookies.
// Playwright's `request` fixture is a context of its own with no cookies:
// handed to `northwind(…)`, `makeContact(…)` or any other helper in a test
// that signs in, every call is a 401 "Invalid or expired session", and the
// test fails in ~90ms before drawing anything (invoices-new.spec, 20 Oct
// 2026; DEV_LEARNINGS). This fails a test that destructures `request` and
// also calls `useSession`, wherever it passes `request` on.
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
let found = 0;
for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const m of text.matchAll(CALLBACK)) {
        if (!/\brequest\b/.test(m[1])) continue;
        const open = (m.index ?? 0) + m[0].length - 1;
        const body = block(text, open);
        if (!/\buseSession\(\s*page\b/.test(body)) continue;
        for (const call of body.matchAll(PASSED_ON)) {
            const line = text
                .slice(0, open + (call.index ?? 0))
                .split("\n").length;
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
