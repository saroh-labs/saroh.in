/**
 * Times Ask AI's summary and list tools on the load data, in-process and
 * as the owner, through the same tool bridge a turn uses (card included),
 * with no provider: five runs each, p50/p95, the result's size, and the
 * EXPLAIN ANALYZE of the slowest query of the two slowest tools. Writes
 * `time.json` and `time.md` into `--out`.
 *
 * Free: no model is called.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type * as ToolBridgeFile from "../../../src/modules/ai/tools/tool-bridge";
import type { ToolBridge } from "../../../src/modules/ai/tools/tool-bridge";
import type * as OrganizationContextServiceFile from "../../../src/modules/organizations/organization-context.service";
import type { OrganizationContextService } from "../../../src/modules/organizations/organization-context.service";
import { boot, fromDist, fromWhereRun } from "../local";
import { idOf, ZONE } from "../plan";
import { orgIdOf, userIdOf } from "../seed";
import { assertLoadDatabase } from "./seed";

const TAG = "[load time]";
const RUNS = 5;

/** The tools timed, with what a turn would send them. */
export function toolCalls(
    now: Date,
): { name: string; input: Record<string, unknown> }[] {
    const today = DateTime.fromJSDate(now, { zone: ZONE }).startOf("day");
    return [
        { name: "summarise_orders", input: { period: "last_3_months" } },
        { name: "get_whats_selling", input: { period: "last_3_months" } },
        { name: "summarise_stock", input: {} },
        { name: "summarise_invoices", input: { period: "last_3_months" } },
        { name: "find_lapsed_customers", input: { days: 60 } },
        { name: "get_business_summary", input: { period: "this_month" } },
        {
            name: "list_orders",
            input: {
                from: today.minus({ months: 3 }).plus({ days: 1 }).toISO(),
                to: today.plus({ days: 1 }).toISO(),
            },
        },
        { name: "list_customers", input: {} },
        {
            name: "get_product",
            input: { product_id: idOf("clothing", "product", "kurta") },
        },
    ];
}

/** The nearest-rank percentile of `ms`. */
export function percentile(ms: readonly number[], p: number): number {
    const sorted = [...ms].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

interface Query {
    text: string;
    values: unknown[];
    ms: number;
}

type QueryFn = (...args: unknown[]) => unknown;

/**
 * Every query the API runs while `fn` does, with its time: `pg`'s
 * Pool.query (Prisma's adapter outside a transaction) and Client.query
 * (inside one) wrapped, from the `pg` that `@saroh/database` connects with.
 * Pool.query calls Client.query with a callback, so nothing counts twice.
 */
function queryRecorder() {
    const pg = createRequire(require.resolve("@saroh/database"))("pg") as {
        Pool: { prototype: { query: QueryFn } };
        Client: { prototype: { query: QueryFn } };
    };
    const targets = [pg.Pool.prototype, pg.Client.prototype];
    const originals = targets.map((t) => t.query);
    let into: Query[] | null = null;
    targets.forEach((target, i) => {
        const original = originals[i];
        target.query = function (this: unknown, ...args: unknown[]) {
            const t0 = performance.now();
            const result = original.apply(this, args);
            const [config, values] = args as [
                { text?: string; values?: unknown[] } | string,
                unknown[] | undefined,
            ];
            const text = typeof config === "string" ? config : config.text;
            if (into && text && result instanceof Promise) {
                const list = into;
                void result.then(
                    () =>
                        list.push({
                            text,
                            values:
                                (typeof config === "string"
                                    ? values
                                    : config.values) ?? [],
                            ms: performance.now() - t0,
                        }),
                    () => undefined,
                );
            }
            return result;
        };
    });
    return {
        async during<T>(
            fn: () => Promise<T>,
        ): Promise<{ value: T; queries: Query[] }> {
            const queries: Query[] = [];
            into = queries;
            try {
                return { value: await fn(), queries };
            } finally {
                into = null;
            }
        },
        restore: () => {
            targets.forEach((t, i) => {
                t.query = originals[i];
            });
        },
    };
}

export interface ToolTiming {
    tool: string;
    ms: number[];
    p50: number;
    p95: number;
    chars: number;
    tokens: number;
    cardRows: number | null;
    error: string | null;
    /** The text the model reads, cut. */
    output: string;
    slowest: { sql: string; ms: number; plan?: string } | null;
}

export async function main(argv: readonly string[]): Promise<number> {
    const outAt = argv.indexOf("--out");
    if (outAt < 0 || !argv[outAt + 1]) {
        console.error(`${TAG} usage: time --out <dir>`);
        return 2;
    }
    const out = fromWhereRun(argv[outAt + 1]);
    mkdirSync(out, { recursive: true });
    assertLoadDatabase();
    const recorder = queryRecorder();
    const app = await boot();
    try {
        const { ToolBridge: Bridge } = fromDist<typeof ToolBridgeFile>(
            "modules/ai/tools/tool-bridge",
        );
        const { OrganizationContextService: Contexts } = fromDist<
            typeof OrganizationContextServiceFile
        >("modules/organizations/organization-context.service");
        const bridge: ToolBridge = app.get(Bridge);
        const contexts: OrganizationContextService = app.get(Contexts);
        const ctx = await contexts.resolve(
            userIdOf("clothing", "owner"),
            orgIdOf("clothing"),
        );
        const timings: ToolTiming[] = [];
        const slowestOf = new Map<string, Query>();
        for (const call of toolCalls(new Date())) {
            const ms: number[] = [];
            let output = "";
            let card: unknown = null;
            let error: string | null = null;
            let slowest: Query | null = null;
            // One warm-up, not counted: the first call pays for Nest's and Postgres' caches.
            await bridge.run(
                ctx,
                { id: randomUUID(), name: call.name, input: call.input },
                new AbortController().signal,
            );
            for (let i = 0; i < RUNS; i++) {
                const t0 = performance.now();
                const { value: run, queries } = await recorder.during(() =>
                    bridge.run(
                        ctx,
                        {
                            id: randomUUID(),
                            name: call.name,
                            input: call.input,
                        },
                        new AbortController().signal,
                    ),
                );
                ms.push(Math.round(performance.now() - t0));
                output = run.output;
                card = run.card ?? null;
                if (run.isError) error = run.output.slice(0, 200);
                for (const q of queries)
                    if (!slowest || q.ms > slowest.ms) slowest = q;
            }
            const rows = (
                card as {
                    data?: { rows?: unknown[]; items?: unknown[] };
                } | null
            )?.data;
            const t: ToolTiming = {
                tool: call.name,
                ms,
                p50: percentile(ms, 50),
                p95: percentile(ms, 95),
                chars: output.length + (card ? JSON.stringify(card).length : 0),
                tokens: Math.round(
                    (output.length + (card ? JSON.stringify(card).length : 0)) /
                        4,
                ),
                cardRows: rows ? (rows.rows ?? rows.items ?? []).length : null,
                error,
                output: output.slice(0, 600),
                slowest: slowest
                    ? { sql: slowest.text, ms: Math.round(slowest.ms) }
                    : null,
            };
            timings.push(t);
            if (slowest) slowestOf.set(call.name, slowest);
            console.info(
                `${TAG} ${t.tool}: p50 ${t.p50} ms, p95 ${t.p95} ms, ${t.chars} chars${error ? `, ERROR ${error}` : ""}`,
            );
        }
        // The two slowest tools: their slowest query, explained.
        for (const t of [...timings]
            .sort((a, b) => b.p50 - a.p50)
            .slice(0, 2)) {
            const q = slowestOf.get(t.tool);
            if (!q || !t.slowest) continue;
            const plan = await prisma.$queryRawUnsafe<
                { "QUERY PLAN": string }[]
            >(`EXPLAIN (ANALYZE, BUFFERS) ${q.text}`, ...q.values);
            t.slowest.plan = plan.map((row) => row["QUERY PLAN"]).join("\n");
        }
        writeFileSync(join(out, "time.json"), JSON.stringify(timings, null, 2));
        writeFileSync(join(out, "time.md"), timeReport(timings));
        console.info(`${TAG} written to ${out}`);
        return 0;
    } finally {
        recorder.restore();
        await app.close();
    }
}

export function timeReport(timings: readonly ToolTiming[]): string {
    const rows = timings.map(
        (t) =>
            `| ${t.tool} | ${t.p50} | ${t.p95} | ${t.ms.join(", ")} | ${t.chars} | ~${t.tokens} | ${t.cardRows ?? "-"} | ${t.slowest ? `${t.slowest.ms} ms` : "-"} |${t.error ? ` ERROR: ${t.error}` : ""}`,
    );
    const plans = timings
        .filter((t) => t.slowest?.plan)
        .map(
            (t) =>
                `### ${t.tool}: its slowest query (${t.slowest?.ms} ms)\n\n\`\`\`sql\n${t.slowest?.sql}\n\`\`\`\n\n\`\`\`\n${t.slowest?.plan}\n\`\`\``,
        );
    return [
        "| Tool | p50 ms | p95 ms | runs ms | result chars | tokens (chars/4) | card rows | slowest query |",
        "| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |",
        ...rows,
        "",
        ...plans,
        "",
    ].join("\n");
}
