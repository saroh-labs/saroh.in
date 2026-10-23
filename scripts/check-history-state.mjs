// No `history.replaceState(window.history.state, …)` (or pushState) in an
// app. Next's router patches both and follows a write so `usePathname`,
// `useSearchParams` and its own record of the address move with it, unless
// the state passed carries Next's own marker (`__NA`), which
// `window.history.state` always does. Such a write is one the router never
// hears of: on its next commit (a Server Action's answer, a refresh) it
// writes the old address back. New invoice's draft address reverted to
// `/new` that way (DEV_LEARNINGS, 20 Oct 2026). Pass `null`; Next copies its
// own state across itself.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const files = execFileSync(
    "git",
    [
        "ls-files",
        "--",
        "apps/*.ts",
        "apps/*.tsx",
        "packages/*.ts",
        "packages/*.tsx",
    ],
    { cwd: root, encoding: "utf8" },
)
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$|\.spec\.tsx?$/.test(f));

const BAD = /history\.(replaceState|pushState)\(\s*window\.history\.state\b/g;
let found = 0;
for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(BAD)) {
        const line = text.slice(0, m.index).split("\n").length;
        console.error(
            `${file}:${line}: history.${m[1]}(window.history.state, …) — Next's router ignores it and writes the old address back; pass null`,
        );
        found += 1;
    }
}
if (found) process.exitCode = 1;
else
    console.log(
        `history-state: ${files.length} files, no write Next's router can't hear`,
    );
