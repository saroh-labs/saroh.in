// One of several, in the workspace and the admin console, comes from
// @saroh/ui (`ChipGroup`, `RadioCards`, `ChoiceGroup`, `Segmented`), never
// a hand-built radio group: a `role="radiogroup"` in a screen means its own
// tab stops and arrow keys, which drifted (16 of them had no arrow keys,
// 17 Nov 2026; DEV_LEARNINGS "Hand-built radio groups had no arrow keys").
// Tests and test kits query `[role="radiogroup"]` and are left out. Merchant
// sites, saroh.in and saroh.tech draw on their own layers and are out of
// scope.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP = /(^|\/)(node_modules|\.next|\.open-next|out|dist|\.turbo)(\/|$)/;
const TESTS = /(\.test\.tsx|test-kit\.tsx)$/;
const HAND_BUILT = /role=\{?["'`]radiogroup["'`]\}?/;
const APPS = ["app.saroh.in", "admin.saroh.in"];

const HOME_END =
    "Home and End jump to the first and last, which the shared ChoiceGroup has not got; moves when it has";
/** Files that had it before this check: each leaves the list when moved. */
const ALLOWED = new Map([
    ["apps/app.saroh.in/components/calendar/week-strip.tsx", HOME_END],
    ["apps/app.saroh.in/components/bookings/calendar/week-phone.tsx", HOME_END],
    [
        "apps/app.saroh.in/components/shared/share-item/card-picker.tsx",
        HOME_END,
    ],
]);

const seen = new Set();
let checked = 0;
for (const app of APPS) {
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
                    `${file}:${i + 1}: a hand-built radio group. Use ChipGroup, RadioCards, ChoiceGroup or Segmented from @saroh/ui (frontend-design-system.md, shared pieces).`,
                );
                process.exitCode = 1;
            });
        }
    }
}
// A moved folder must not pass by scanning nothing.
if (checked === 0) {
    console.error(
        "choices: nothing to check under the apps' components or app",
    );
    process.exitCode = 1;
}
// A file that moved to the shared pieces leaves the list.
for (const file of ALLOWED.keys()) {
    if (!seen.has(file)) {
        console.error(
            `choices: ${file} no longer builds its own radio group; take it off ALLOWED in scripts/check-choices.mjs`,
        );
        process.exitCode = 1;
    }
}
if (!process.exitCode)
    console.log(
        `choices: ${checked} files, no new hand-built radio group (${ALLOWED.size} allowed, existing)`,
    );
