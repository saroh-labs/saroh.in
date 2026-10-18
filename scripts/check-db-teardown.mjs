// No API integration spec queries the database in its top-level afterAll.
// The integration setup's own afterAll (apps/api.saroh.in/test/
// integration-setup.ts: truncate every table, then end the pool) is
// registered first and runs first, so a spec's clean-up there meets a
// closed pool: "Test suite failed to run: Cannot use a pool after calling
// end on the pool", with every test passed (admin-billing.db.spec.ts, 17 Oct
// 2026). The truncate already clears every row; `prisma.$disconnect()` and
// closing the app are fine.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const src = join(root, "apps/api.saroh.in/src");
const specs = readdirSync(src, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".db.spec.ts"));

let checked = 0;
for (const file of specs) {
    const lines = readFileSync(join(src, file), "utf8").split("\n");
    let inside = false;
    lines.forEach((line, i) => {
        if (/^afterAll\(/.test(line)) {
            inside = true;
            checked += 1;
            return;
        }
        if (!inside) return;
        if (/^\}\);/.test(line)) {
            inside = false;
            return;
        }
        if (/\bprisma\.(?!\$disconnect)\w+/.test(line)) {
            console.error(
                `apps/api.saroh.in/src/${file}:${i + 1}: a query in the top-level afterAll runs after the setup ended the pool; leave the rows to its truncate`,
            );
            process.exitCode = 1;
        }
    });
}
if (!process.exitCode) {
    console.log(
        `db-teardown: ${checked} top-level afterAll in ${specs.length} db specs, none querying`,
    );
}
