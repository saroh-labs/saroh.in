/**
 * Integration specs don't sleep to make a race happen (DEV_LEARNINGS, "race
 * tests wait on pg_locks, never sleep").
 *
 * A race test that sleeps "long enough for the other side to reach its
 * lock" passes whenever the other side is slower than that — on a loaded
 * machine the race is never run, and the test goes green with the lock it
 * pins removed. Wait on Postgres instead: `test/lock-wait.ts`
 * (`waitUntilBlockedBy`) polls `pg_locks` until the second transaction is
 * waiting on the first.
 *
 * This fails on a `setTimeout` in any `*.db.spec.ts` not listed below. The
 * list is the specs that slept before the rule; it only shrinks: a listed
 * spec that no longer sleeps fails too, so it comes off.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");

/** Specs that slept before the rule. Move them to `waitUntilBlockedBy`. */
const SLEPT_BEFORE = new Set([
    "modules/bookings/public-booking.db.spec.ts",
    "modules/collections/collections.service.db.spec.ts",
    "modules/customer-workspace/resolve-contact.db.spec.ts",
    "modules/products/products.remove.db.spec.ts",
    "modules/products/stock-tracking.db.spec.ts",
    "modules/sites/test-release-lookup.db.spec.ts",
    "modules/stock/held-stock.db.spec.ts",
    "modules/stock/reserve.db.spec.ts",
]);

function dbSpecs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return dbSpecs(path);
        return entry.name.endsWith(".db.spec.ts") ? [path] : [];
    });
}

/** Whether `source` waits on a timer. */
export function sleeps(source: string): boolean {
    return /\bsetTimeout\s*\(/.test(source);
}

describe("integration specs don't sleep (race tests wait on pg_locks)", () => {
    const sleeping = dbSpecs(SRC)
        .filter((path) => sleeps(readFileSync(path, "utf8")))
        .map((path) => relative(SRC, path).split("\\").join("/"));

    it("adds no new sleep to a *.db.spec.ts", () => {
        expect(sleeping.filter((path) => !SLEPT_BEFORE.has(path))).toEqual([]);
    });

    it("takes a spec off the list once it stops sleeping", () => {
        expect(
            [...SLEPT_BEFORE].filter((path) => !sleeping.includes(path)),
        ).toEqual([]);
    });

    it("sees a sleep in the shapes specs write it", () => {
        expect(sleeps("await new Promise((r) => setTimeout(r, 750));")).toBe(
            true,
        );
        expect(
            sleeps(
                "const sleep = (ms) => new Promise((r) => setTimeout (r, ms));",
            ),
        ).toBe(true);
        expect(sleeps("await waitUntilBlockedBy(pid);")).toBe(false);
    });
});
