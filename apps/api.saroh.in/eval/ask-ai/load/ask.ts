/**
 * Ten real questions to Ask AI on the load data, as the clothing shop's
 * owner, through the real `TurnRunner` and provider: the answer, its
 * cards, tokens, cost and how soon the first status and text came.
 * Writes `ask.json` and `ask.md` into `--out`.
 *
 * COSTS MONEY: stops before a question once the spend reaches
 * {@link BUDGET_MICRO_USD}.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type * as TurnRegistryFile from "../../../src/modules/ai/turn/turn-registry";
import type { TurnRegistry } from "../../../src/modules/ai/turn/turn-registry";
import type * as TurnRunnerFile from "../../../src/modules/ai/turn/turn-runner";
import type { TurnRunner } from "../../../src/modules/ai/turn/turn-runner";
import type * as OrganizationContextServiceFile from "../../../src/modules/organizations/organization-context.service";
import type { OrganizationContextService } from "../../../src/modules/organizations/organization-context.service";
import { boot, fromDist, fromWhereRun } from "../local";
import { orgIdOf, userIdOf } from "../seed";
import { assertLoadDatabase } from "./seed";

const TAG = "[load ask]";
export const BUDGET_MICRO_USD = 500_000;
const RUPEES_PER_USD = 94;
const TURN_TIMEOUT_MS = 120_000;

export const QUESTIONS = [
    {
        id: "orders-3m",
        language: "en",
        question: "Give me an order summary for the last 3 months",
    },
    {
        id: "sizes-3m",
        language: "en",
        question: "Which sizes and colours sold most in the last 3 months?",
    },
    {
        id: "stores-week",
        language: "en",
        question: "How many orders did each store take this week?",
    },
    {
        id: "low-sizes",
        language: "en",
        question: "Which sizes are low on stock?",
    },
    {
        id: "list-orders",
        language: "en",
        question: "List all orders from the last 3 months",
    },
    { id: "list-customers", language: "en", question: "Show me all customers" },
    {
        id: "month-vs-month",
        language: "en",
        question: "How is this month going compared with last month?",
    },
    {
        id: "hinglish-week",
        language: "hinglish",
        question: "Is hafte kitne orders aaye aur kitna paisa aaya?",
    },
    {
        id: "hindi-top",
        language: "hi",
        question: "पिछले महीने सबसे ज़्यादा क्या बिका?",
    },
    {
        id: "draft-product",
        language: "en",
        question: "Add a new product: Silk stole, price 899",
    },
] as const;

export interface AskRecord {
    id: string;
    question: string;
    text: string;
    tools: string[];
    cards: {
        kind: string;
        title: string | null;
        rows: number;
        more: number | null;
        link: string | null;
    }[];
    outcome: string | null;
    error: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    costMicroUsd: number | null;
    firstStatusMs: number | null;
    firstTextMs: number | null;
    totalMs: number;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

export async function main(argv: readonly string[]): Promise<number> {
    const outAt = argv.indexOf("--out");
    if (outAt < 0 || !argv[outAt + 1]) {
        console.error(`${TAG} usage: ask --out <dir>`);
        return 2;
    }
    const out = fromWhereRun(argv[outAt + 1]);
    mkdirSync(out, { recursive: true });
    assertLoadDatabase();
    const app = await boot();
    const records: AskRecord[] = [];
    try {
        const { TurnRunner: Runner } = fromDist<typeof TurnRunnerFile>(
            "modules/ai/turn/turn-runner",
        );
        const { TurnRegistry: Registry } = fromDist<typeof TurnRegistryFile>(
            "modules/ai/turn/turn-registry",
        );
        const { OrganizationContextService: Contexts } = fromDist<
            typeof OrganizationContextServiceFile
        >("modules/organizations/organization-context.service");
        const runner: TurnRunner = app.get(Runner);
        const registry: TurnRegistry = app.get(Registry);
        const contexts: OrganizationContextService = app.get(Contexts);
        const orgId = orgIdOf("clothing");
        const ctx = await contexts.resolve(
            userIdOf("clothing", "owner"),
            orgId,
        );
        let spent = 0;
        for (const q of QUESTIONS) {
            if (spent >= BUDGET_MICRO_USD) {
                console.info(`${TAG} stopped at the budget before ${q.id}`);
                break;
            }
            const r: AskRecord = {
                id: q.id,
                question: q.question,
                text: "",
                tools: [],
                cards: [],
                outcome: null,
                error: null,
                inputTokens: null,
                outputTokens: null,
                cacheReadTokens: null,
                costMicroUsd: null,
                firstStatusMs: null,
                firstTextMs: null,
                totalMs: 0,
            };
            const conversation = await runner.openConversation(ctx, "ask-ai");
            const turnId = randomUUID();
            const signal = registry.begin(ctx, turnId);
            const timer = setTimeout(
                () => registry.stop(ctx, turnId),
                TURN_TIMEOUT_MS,
            );
            const t0 = performance.now();
            const since = () => Math.round(performance.now() - t0);
            try {
                for await (const event of runner.run({
                    ctx,
                    conversationId: conversation.id,
                    question: q.question,
                    turnId,
                    signal,
                })) {
                    if (event.type === "text-delta") {
                        r.firstTextMs ??= since();
                        r.text += event.text;
                    } else if (event.type === "status") {
                        r.firstStatusMs ??= since();
                        r.tools.push(event.tool);
                    } else if (event.type === "card") {
                        const d = event.data as {
                            title?: string;
                            rows?: unknown[];
                            items?: unknown[];
                            more?: number;
                            link?: { href?: string };
                        };
                        r.cards.push({
                            kind: event.kind,
                            title: d.title ?? null,
                            rows: (d.rows ?? d.items ?? []).length,
                            more: d.more ?? null,
                            link: d.link?.href ?? null,
                        });
                    } else if (event.type === "error") r.error = event.reason;
                    else if (event.type === "done") r.outcome = event.outcome;
                    else r.error = `refused: ${event.refusal.reason}`;
                }
            } catch (error) {
                r.error = error instanceof Error ? error.name : "error";
            } finally {
                clearTimeout(timer);
                registry.end(turnId);
            }
            r.totalMs = since();
            const usage = await asBusiness(orgId, () =>
                prisma.aiUsage.findUnique({ where: { turnId } }),
            );
            if (usage) {
                r.inputTokens = usage.inputTokens;
                r.outputTokens = usage.outputTokens;
                r.cacheReadTokens = usage.cacheReadTokens;
                r.costMicroUsd = usage.costMicroUsd;
                spent += usage.costMicroUsd;
            }
            records.push(r);
            console.info(
                `${TAG} ${q.id}: ${r.outcome ?? r.error} ${r.costMicroUsd ?? "?"} micro-USD, ${r.totalMs} ms`,
            );
        }
        writeFileSync(join(out, "ask.json"), JSON.stringify(records, null, 2));
        writeFileSync(join(out, "ask.md"), askReport(records));
        console.info(`${TAG} spent ${spent} micro-USD; written to ${out}`);
        return 0;
    } finally {
        await app.close();
    }
}

const rupees = (microUsd: number | null) =>
    microUsd === null
        ? "-"
        : `₹${((microUsd / 1e6) * RUPEES_PER_USD).toFixed(2)}`;

export function askReport(records: readonly AskRecord[]): string {
    const rows = records.map((r) => {
        const excerpt = r.text
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 220)
            .replace(/\|/g, "/");
        const cards =
            r.cards
                .map(
                    (c) =>
                        `${c.kind} "${c.title ?? ""}" ${c.rows} rows${c.more ? ` +${c.more}` : ""}${c.link ? ` → ${c.link}` : ""}`,
                )
                .join("; ") || "-";
        return `| ${r.id} | ${r.question} | ${excerpt}${r.error ? ` (ERROR ${r.error})` : ""} | ${r.tools.join(", ") || "-"} | ${cards} | ${r.inputTokens ?? "-"} / ${r.outputTokens ?? "-"} (cache ${r.cacheReadTokens ?? "-"}) | ${rupees(r.costMicroUsd)} | ${r.firstStatusMs ?? "-"} / ${r.firstTextMs ?? "-"} / ${r.totalMs} |`;
    });
    const spent = records.reduce((n, r) => n + (r.costMicroUsd ?? 0), 0);
    return [
        "| Id | Question | Answer (excerpt) | Tools | Cards | Tokens in / out | Cost | First status / first text / total ms |",
        "| --- | --- | --- | --- | --- | --- | ---: | --- |",
        ...rows,
        "",
        `Spent ${rupees(spent)} (${spent} micro-USD) on ${records.length} questions, at ₹${RUPEES_PER_USD} to the dollar.`,
        "",
        "## Answers in full",
        "",
        ...records.flatMap((r) => [
            `### ${r.id}: ${r.question}`,
            "",
            r.text || "(no text)",
            "",
        ]),
    ].join("\n");
}
