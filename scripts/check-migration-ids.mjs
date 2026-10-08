// Every Prisma migration folder must have its own timestamp. Two folders with
// the same 14-digit prefix replay in name order, which nobody chose: on
// 7 Oct two units landed `20261029153000_*` in one batch. Fails listing each
// clash, so the later one can be renamed before it reaches a database.
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
if (!process.exitCode) console.log(`migration ids: ${byStamp.size} folders, all unique`);
