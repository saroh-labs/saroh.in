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
 * This fails on a sleep in any `*.db.spec.ts` beyond what is listed below:
 * `setTimeout(` (the global, or `timers/promises`'s, whose import counts
 * too), `setInterval(`, `pg_sleep` and `Atomics.wait`. The list is the
 * specs that slept before the rule, with how many sleeps each had; it only
 * shrinks: a new sleep in a listed spec fails, and so does a listed count
 * higher than the spec's, so a sleep removed comes off the list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..");

/**
 * Specs that slept before the rule, and how many sleeps each has. Move
 * them to `waitUntilBlockedBy`.
 */
const SLEPT_BEFORE = new Map<string, number>([
    ["modules/bookings/public-booking.db.spec.ts", 2],
    ["modules/collections/collections.service.db.spec.ts", 1],
    ["modules/customer-workspace/resolve-contact.db.spec.ts", 1],
    ["modules/products/products.remove.db.spec.ts", 1],
    ["modules/products/stock-tracking.db.spec.ts", 1],
    ["modules/sites/test-release-lookup.db.spec.ts", 1],
    ["modules/stock/held-stock.db.spec.ts", 1],
    ["modules/stock/reserve.db.spec.ts", 1],
]);

function dbSpecs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return dbSpecs(path);
        return entry.name.endsWith(".db.spec.ts") ? [path] : [];
    });
}

/** Every way a spec can wait on the clock instead of on Postgres. */
const SLEEP_SHAPES = [
    // The global, or `timers/promises`'s under its own name.
    /\bsetTimeout\s*\(/g,
    /\bsetInterval\s*\(/g,
    // `timers/promises` imported or required at all: its setTimeout may be
    // renamed (`setTimeout as sleep`), so the import is what's counted.
    /["'](?:node:)?timers\/promises["']/g,
    /\bpg_sleep(?:_for|_until)?\b/g,
    /\bAtomics\.wait(?:Async)?\b/g,
];

/** How many sleeps `source` has, of every shape. */
export function sleepCount(source: string): number {
    return SLEEP_SHAPES.reduce(
        (n, shape) => n + (source.match(shape)?.length ?? 0),
        0,
    );
}

/** Whether `source` waits on a timer. */
export function sleeps(source: string): boolean {
    return sleepCount(source) > 0;
}

describe("integration specs don't sleep (race tests wait on pg_locks)", () => {
    const counts = new Map(
        dbSpecs(SRC)
            .map(
                (path) =>
                    [
                        relative(SRC, path).split("\\").join("/"),
                        sleepCount(readFileSync(path, "utf8")),
                    ] as const,
            )
            .filter(([, n]) => n > 0),
    );

    it("adds no new sleep to a *.db.spec.ts, listed or not", () => {
        const over = [...counts]
            .filter(([path, n]) => n > (SLEPT_BEFORE.get(path) ?? 0))
            .map(([path, n]) => `${path}: ${n}`);
        expect(over).toEqual([]);
    });

    it("lowers a spec's count, or takes it off the list, once it sleeps less", () => {
        const stale = [...SLEPT_BEFORE]
            .filter(([path, n]) => (counts.get(path) ?? 0) < n)
            .map(
                ([path, n]) =>
                    `${path}: listed ${n}, has ${counts.get(path) ?? 0}`,
            );
        expect(stale).toEqual([]);
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
        expect(
            sleeps(
                'import { setTimeout as sleep } from "node:timers/promises";',
            ),
        ).toBe(true);
        expect(
            sleeps("const { setTimeout: wait } = require('timers/promises');"),
        ).toBe(true);
        expect(sleeps("const t = setInterval(poll, 50);")).toBe(true);
        expect(sleeps("await prisma.$executeRaw`SELECT pg_sleep(0.5)`;")).toBe(
            true,
        );
        expect(sleeps("SELECT pg_sleep_for('1 second')")).toBe(true);
        expect(
            sleeps(
                "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);",
            ),
        ).toBe(true);
        expect(sleeps('await waitUntilBlockedBy(pid, "Site");')).toBe(false);
        expect(sleeps("const timeoutMs = 10_000;")).toBe(false);
    });

    it("counts each sleep, so a second one in a listed spec is seen", () => {
        expect(
            sleepCount("await new Promise((r) => setTimeout(r, 750));"),
        ).toBe(1);
        expect(
            sleepCount(
                [
                    "await new Promise((r) => setTimeout(r, 750));",
                    "await new Promise((r) => setTimeout(r, 750));",
                ].join("\n"),
            ),
        ).toBe(2);
        expect(
            sleepCount(
                'import { setTimeout } from "timers/promises";\nawait setTimeout(10);',
            ),
        ).toBe(2);
    });
});
