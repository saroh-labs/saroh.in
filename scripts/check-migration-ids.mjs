// Every Prisma migration folder must have its own timestamp. Two folders with
// the same 14-digit prefix replay in name order, which nobody chose: on
// 7 Oct two units landed `20261029153000_*` in one batch. Fails listing each
// clash, so the later one can be renamed before it reaches a database.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Already applied on databases before this check existed; a migration that has
// run can never be renamed, so these known pairs are allowed and no others.
const KNOWN = new Set(["20261024100000"]);

const dir = join(import.meta.dirname, "..", "packages/database/prisma/migrations");
const byStamp = new Map();
for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const stamp = name.name.match(/^(\d{14})_/)?.[1];
    if (!stamp) {
        console.error(`migration folder without a 14-digit timestamp: ${name.name}`);
        process.exitCode = 1;
        continue;
    }
    byStamp.set(stamp, [...(byStamp.get(stamp) ?? []), name.name]);
}
for (const [stamp, names] of byStamp) {
    if (names.length > 1 && !KNOWN.has(stamp)) {
        console.error(`migrations share timestamp ${stamp}: ${names.join(", ")}`);
        process.exitCode = 1;
    }
}

// A migration this branch adds must sort after every migration already on
// the base branch (review #39). Prisma replays folders in name order, and a
// database that ran the base's migrations refuses to apply one dated before
// them: the data-removal migration, written as 20261029…, sorted before
// development's December stamps and was renamed by hand to 20261220100000.
// The base is MIGRATION_BASE, else origin/development; without that ref
// (a shallow clone) the order is not checked, and it says so.
const base = process.env.MIGRATION_BASE ?? "origin/development";
let baseNames = null;
let ordered = "";
try {
    baseNames = execFileSync(
        "git",
        ["ls-tree", "--name-only", `${base}:packages/database/prisma/migrations`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
        .split("\n")
        .filter((n) => /^\d{14}_/.test(n));
} catch {
    console.log(`migration order: ${base} not found here, so the order against it is not checked`);
}
if (baseNames) {
    ordered = ` and in order after ${base}`;
    const onBase = new Set(baseNames);
    const latest = baseNames.map((n) => n.slice(0, 14)).sort().at(-1) ?? "";
    for (const names of byStamp.values()) {
        for (const name of names) {
            if (onBase.has(name) || name.slice(0, 14) > latest) continue;
            console.error(
                `migration ${name} is new on this branch but sorts before ${latest}, the latest on ${base}: give it a timestamp after that one`,
            );
            process.exitCode = 1;
        }
    }
}
if (!process.exitCode) console.log(`migration ids: ${byStamp.size} folders, all unique${ordered}`);
