// An app's overlays come from @saroh/ui (`Sheet`, `Dialog`, `FormSheet`,
// `Popover`), never a hand-built dialog: a `role="dialog"` or `aria-modal`
// in an app's components or routes means its own focus trap, Esc and focus
// return, which drift from the shared ones (Ask AI's desk panel, 17 Nov
// 2026; DEV_LEARNINGS "Ask AI built its own dialog"). Tests and test kits
// query `[role="dialog"]` and are left out. packages/site-blocks and
// packages/marketing draw merchant sites and saroh.in on their own layers
// and are out of scope.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP = /(^|\/)(node_modules|\.next|\.open-next|out|dist|\.turbo)(\/|$)/;
const TESTS = /(\.test\.tsx|test-kit\.tsx)$/;
const HAND_BUILT = /role=\{?["'`]dialog["'`]\}?|aria-modal/;

/** Files that had it before this check: each leaves the list when moved. */
const ALLOWED = new Map([
    [
        "apps/app.saroh.in/components/sites/editor/editor-sheet.tsx",
        // Portalled into the editor's body so its scrim covers only the page
        // under the top bar; the shared SheetContent has no portal container.
        "needs a portal container the shared Sheet does not take (17 Nov 2026)",
    ],
]);

const apps = readdirSync(join(root, "apps"));
const seen = new Set();
let checked = 0;
for (const app of apps) {
    for (const sub of ["components", "app"]) {
        const dir = join("apps", app, sub);
        if (!existsSync(join(root, dir))) continue;
        for (const f of readdirSync(join(root, dir), { recursive: true })) {
            const file = join(dir, String(f)).split("\\").join("/");
            if (SKIP.test(file) || !file.endsWith(".tsx") || TESTS.test(file))
                continue;
            checked += 1;
            const lines = readFileSync(join(root, file), "utf8").split("\n");
            lines.forEach((line, i) => {
                if (!HAND_BUILT.test(line)) return;
                seen.add(file);
                if (ALLOWED.has(file)) return;
                console.error(
                    `${file}:${i + 1}: a hand-built dialog. Use Sheet, Dialog or FormSheet from @saroh/ui as they are (frontend-design-system.md, "Overlays come in fixed sizes").`,
                );
                process.exitCode = 1;
            });
        }
    }
}
// A moved folder must not pass by scanning nothing.
if (checked === 0) {
    console.error("overlays: nothing to check under apps/*/components or app");
    process.exitCode = 1;
}
// A file that moved to the shared overlays leaves the list.
for (const file of ALLOWED.keys()) {
    if (!seen.has(file)) {
        console.error(
            `overlays: ${file} no longer builds its own dialog; take it off ALLOWED in scripts/check-overlays.mjs`,
        );
        process.exitCode = 1;
    }
}
if (!process.exitCode)
    console.log(
        `overlays: ${checked} files, no new hand-built dialog (${ALLOWED.size} allowed, existing)`,
    );
