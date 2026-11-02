/**
 * The quality gate (Programmatic board). A reviewed page that fails stops the
 * build; an unreviewed one is only reported, unless `--strict`. `--missing`
 * also lists the waves' combos that have no file yet.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { COUNTRIES } from "../content/templates";
import {
    auditAll,
    auditHubs,
    blocking,
    plannedCombos,
    staleFacts,
} from "../lib/templates/gate";
import { todayIso } from "../lib/tools/dates";

const pub = join(fileURLToPath(new URL("..", import.meta.url)), "public");
const fileExists = (p: string) => {
    const file = join(pub, p);
    return existsSync(file) && statSync(file).size > 0;
};

const strict = process.argv.includes("--strict");
const results = [...auditAll(fileExists), ...auditHubs()];
for (const r of results) {
    if (!r.problems.length) continue;
    const blocks = r.reviewed || strict;
    console[blocks ? "error" : "log"](
        `${blocks ? "FAIL" : "not ready"} ${r.path}${r.reviewed ? " (reviewed)" : ""}\n  ${r.problems.join("\n  ")}`,
    );
}
for (const c of COUNTRIES) {
    const stale = staleFacts(c.data?.facts ?? [], todayIso());
    if (stale.length) {
        console.log(
            `recheck ${c.slug}, over 6 months old: ${stale.join(", ")}`,
        );
    }
}
const planned = plannedCombos();
if (process.argv.includes("--missing")) {
    console.log(`Not written yet:\n  ${planned.join("\n  ")}`);
}
const passing = results.filter((r) => !r.problems.length).length;
console.log(
    `check-templates: ${passing} of ${results.length} pages pass, ${planned.length} planned combos not written`,
);
const stops = blocking(results, strict).length;
if (stops) {
    console.error(`check-templates: ${stops} failing page(s) block the build`);
    process.exit(1);
}
