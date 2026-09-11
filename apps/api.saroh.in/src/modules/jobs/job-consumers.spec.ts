/**
 * Every job someone enqueues has something that runs it — pinned.
 *
 * The queue cannot see this for itself. A producer writes a `Job` row with a
 * `type` string, a consumer registers a handler under a `type` string, and
 * nothing connects the two until a worker claims the row. When they disagree
 * the failure is silent in both directions:
 *
 *   - Enqueued with no consumer: `booking.notify` has been written on every
 *     booking and reschedule since S4-002, which left its handler to a later
 *     ticket. The registry's old no-op fallback let the worker mark every one
 *     DONE. Unhandled types now dead-letter as FAILED, which stops the queue
 *     reporting delivery — but only this spec stops the gap reopening.
 *   - Registered with no producer: S7-002 built and registered the
 *     `analytics.aggregate` handler, and nothing enqueues it.
 *
 * A source scan rather than booting the app, for the reason
 * module-annotations.spec.ts gives: the question is what the code as written
 * enqueues and registers, and importing every module to ask it would drag in
 * Prisma and every provider and fail for unrelated reasons.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Enqueued, but no handler is registered. Each entry is a known gap with its
 * consequence. Delete the entry in the commit that closes it — the last test
 * below fails until you do, so this list cannot quietly outlive the gap.
 */
const KNOWN_WITHOUT_CONSUMER: Record<string, string> = {
    "booking.notify":
        "Enqueued on every booking and reschedule since S4-002. No handler exists, so these jobs dead-letter and nobody is told a booking was made or moved.",
};

/** Registered, but nothing enqueues it. Same rules as above. */
const KNOWN_WITHOUT_PRODUCER: Record<string, string> = {
    "analytics.aggregate":
        "S7-002 built and registered the handler; nothing schedules it. AnalyticsDailyAggregate is written only by the seed, so a real Organization's Insights dashboard reads no rows and says no views were recorded.",
};

const SRC = join(__dirname, "..", "..");
const JOBS_DIR = join(SRC, "modules", "jobs");

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        const isSource =
            entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts");
        return isSource ? [path] : [];
    });
}

const files = walk(SRC).map((path) => ({
    path,
    rel: relative(SRC, path).split(sep).join("/"),
    text: readFileSync(path, "utf8"),
}));

/** `export const NAME = "value"` anywhere in src, so a type can be named by constant. */
const constants = new Map<string, string>();
for (const { text } of files) {
    for (const m of text.matchAll(
        /export const ([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g,
    )) {
        constants.set(m[1], m[2]);
    }
}

/** A string literal's value, or the value of the exported constant it names. */
function resolve(token: string): string | undefined {
    return token.startsWith('"') ? token.slice(1, -1) : constants.get(token);
}

const TYPE_TOKEN = /type:\s*("[^"]+"|[A-Z][A-Z0-9_]*)/;

/** type → files that enqueue it */
const produced = new Map<string, Set<string>>();
const consumed = new Set<string>();
const unresolved: string[] = [];

for (const { path, rel, text } of files) {
    // The queue's own implementations enqueue `input.type` on behalf of others.
    if (path.startsWith(JOBS_DIR)) continue;

    const enqueues = text.includes("JOB_QUEUE")
        ? /\bjob\.create\(|\.enqueue\(/g
        : /\bjob\.create\(/g;
    for (const m of text.matchAll(enqueues)) {
        // The first `type:` after the call belongs to that call's row.
        const window = text.slice(m.index, m.index + 600);
        const token = TYPE_TOKEN.exec(window)?.[1];
        const type = token === undefined ? undefined : resolve(token);
        if (type === undefined) {
            unresolved.push(`${rel}: job created without a resolvable type`);
            continue;
        }
        produced.set(type, (produced.get(type) ?? new Set()).add(rel));
    }

    // Only the job registry — other registries in this codebase also have a
    // `register(` method, and their keys are not job types.
    if (!text.includes("JobHandlerRegistry")) continue;
    for (const m of text.matchAll(
        /registry\.register\(\s*("[^"]+"|[A-Z][A-Z0-9_]*)/g,
    )) {
        const type = resolve(m[1]);
        if (type === undefined) {
            unresolved.push(`${rel}: registers an unresolvable type ${m[1]}`);
        } else {
            consumed.add(type);
        }
    }
}

describe("job producers and consumers agree", () => {
    it("finds the producers and consumers it exists to pin", () => {
        // A scan that silently matches nothing would pass everything below.
        expect(produced.size).toBeGreaterThan(0);
        expect(consumed.size).toBeGreaterThan(0);
    });

    it("names every job type with a string literal or an exported constant", () => {
        expect(unresolved).toEqual([]);
    });

    it("has a registered handler for every type that is enqueued", () => {
        const missing = [...produced]
            .filter(
                ([type]) =>
                    !consumed.has(type) && !(type in KNOWN_WITHOUT_CONSUMER),
            )
            .map(
                ([type, where]) =>
                    `${type} (enqueued in ${[...where].join(", ")})`,
            );
        expect(missing).toEqual([]);
    });

    it("enqueues every type that has a registered handler", () => {
        const idle = [...consumed].filter(
            (type) => !produced.has(type) && !(type in KNOWN_WITHOUT_PRODUCER),
        );
        expect(idle).toEqual([]);
    });

    it("lists only gaps that are still open", () => {
        const closed = [
            ...Object.keys(KNOWN_WITHOUT_CONSUMER).filter(
                (type) => !produced.has(type) || consumed.has(type),
            ),
            ...Object.keys(KNOWN_WITHOUT_PRODUCER).filter(
                (type) => !consumed.has(type) || produced.has(type),
            ),
        ];
        expect(closed).toEqual([]);
    });
});
