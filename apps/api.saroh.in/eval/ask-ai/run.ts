/**
 * Runs the quality test's questions through the real `TurnRunner` and
 * provider, in-process, as each question's person, each run in a fresh
 * conversation (plan 2026-11-13-001 U6). Costs real money: it stops when
 * the targets file's budget would be passed. Never in CI.
 *
 * A question that `needs` a tool Ask AI hasn't got yet is skipped, said
 * so on the console and in `results.json`. A question's `before` turns are
 * asked first in the same conversation and not graded; their cost counts
 * against the budget, apart from the question's own.
 *
 * Records per run: the answer, the status lines, every tool call (name,
 * input), every card (the draft's last), the usage row (tokens, cost), the time to the
 * first status line and to the first answer text, and which business
 * tables changed (a save without Confirm). Writes `results.json` and
 * `report.md` to the out folder as it goes, so a stopped run keeps what it
 * did. `grade.ts` grades them.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { HttpException } from "@nestjs/common";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type * as AskAiAgentFile from "../../src/modules/ai/agents/ask-ai.agent";
import type * as AiSettingsServiceFile from "../../src/modules/ai/settings/ai-settings.service";
import type { AiSettingsService } from "../../src/modules/ai/settings/ai-settings.service";
import type * as TurnRegistryFile from "../../src/modules/ai/turn/turn-registry";
import type { TurnRegistry } from "../../src/modules/ai/turn/turn-registry";
import type * as TurnRunnerFile from "../../src/modules/ai/turn/turn-runner";
import type { TurnRunner } from "../../src/modules/ai/turn/turn-runner";
import type * as OrganizationContextServiceFile from "../../src/modules/organizations/organization-context.service";
import type { OrganizationContextService } from "../../src/modules/organizations/organization-context.service";
import { businessOf, fillText, resolveDeep, resolveFact } from "./facts";
import type {
    Question,
    Resolved,
    Results,
    RunRecord,
    ToolCallRecord,
} from "./lib";
import {
    loadQuestions,
    parseTargets,
    runWithinBudget,
    splitByTools,
} from "./lib";
import {
    assertEvalDatabase,
    boot,
    expandHome,
    fromDist,
    fromWhereRun,
} from "./local";
import type { BusinessPlan } from "./plan";
import {
    anchorFor,
    buildPlan,
    slugOf,
    TODAY_CUTOFF_MINUTE,
    ZONE,
} from "./plan";
import { MARKER_DAYS, orgIdOf, userIdOf } from "./seed";

const TAG = "[eval run]";
export const DEFAULT_TARGETS = join(homedir(), ".saroh-ai-eval-targets.json");
const QUESTIONS = resolve(__dirname, "questions");
/** A turn that hasn't ended by then is stopped, as Stop would. */
const TURN_TIMEOUT_MS = 120_000;

/** Business tables a turn must never change: counted and last-changed before and after each run. */
const WATCHED = [
    "product",
    "service",
    "availabilityRule",
    "booking",
    "order",
    "contact",
    "customer",
    "stockLevel",
    "invoice",
    "staffMember",
    "lead",
] as const;

interface Args {
    targets: string;
    out?: string;
    runs?: number;
    only?: string[];
}

function parseArgs(argv: readonly string[]): Args | null {
    const args: Args = { targets: DEFAULT_TARGETS };
    // Past the end is undefined at run time, whatever the index type says.
    const at = (j: number): string | undefined => argv[j];
    for (let i = 0; i < argv.length; i++) {
        const value = at(i + 1);
        if (value === undefined) return null;
        if (argv[i] === "--targets") args.targets = fromWhereRun(value);
        else if (argv[i] === "--out") args.out = fromWhereRun(value);
        else if (argv[i] === "--runs") args.runs = Number(value);
        else if (argv[i] === "--only") args.only = value.split(",");
        else return null;
        i++;
    }
    return args;
}

/** Every fact a question names, read from the plan at `now`. */
export function resolveQuestion(
    q: Question,
    biz: BusinessPlan,
    now: Date,
    draftTools: readonly string[],
): Resolved {
    const e = q.expect;
    const num = (key: string) => {
        const value = resolveFact(biz, key, now);
        if (typeof value !== "number")
            throw new Error(`${q.id}: ${key} isn't a number`);
        return { key, value };
    };
    const words = (key: string) => {
        const value = resolveFact(biz, key, now);
        return Array.isArray(value) ? value : [String(value)];
    };
    return {
        question: fillText(biz, q.question, now),
        before: (q.before ?? []).map((b) => fillText(biz, b, now)),
        period: e.period
            ? {
                  key: e.period,
                  from: String(
                      resolveFact(biz, `period:${e.period}:from`, now),
                  ),
                  to: String(resolveFact(biz, `period:${e.period}:to`, now)),
              }
            : null,
        card: e.card ?? null,
        numbers: (e.numbers ?? []).map(num),
        mentions: (e.mentions ?? []).map((key) => ({ key, value: words(key) })),
        draft: e.draft
            ? {
                  tool: e.draft.tool,
                  input: resolveDeep(biz, e.draft.input ?? {}, now),
                  inputMentions: (e.draft.inputMentions ?? []).map((m) =>
                      m
                          .split("|")
                          .map((part) => String(resolveDeep(biz, part, now))),
                  ),
              }
            : null,
        forbiddenFigures: (e.forbiddenFigures ?? []).map(num),
        forbiddenText: (e.forbiddenText ?? []).flatMap(words),
        forbiddenTools: (e.forbiddenTools ?? []).flatMap((t) =>
            t === "*draft" ? [...draftTools] : [t],
        ),
    };
}

async function fingerprint(
    organizationId: string,
): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const model of WATCHED) {
        const delegate = prisma[model] as unknown as {
            aggregate(
                args: unknown,
            ): Promise<{ _count: number; _max: { updatedAt: Date | null } }>;
        };
        const r = await delegate.aggregate({
            where: { organizationId },
            _count: true,
            _max: { updatedAt: true },
        });
        out[model] = `${r._count}@${r._max.updatedAt?.toISOString() ?? "-"}`;
    }
    return out;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

export async function main(argv: readonly string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args) {
        console.error(
            `${TAG} usage: run [--targets <file>] [--out <dir>] [--runs <n>] [--only <id,id>]`,
        );
        return 2;
    }
    const targets = parseTargets(readFileSync(args.targets, "utf8"));
    const target = assertEvalDatabase();
    console.info(`${TAG} database: ${target.database} on ${target.host}`);
    let questions = loadQuestions(QUESTIONS);
    if (args.only)
        questions = questions.filter((q) => args.only?.includes(q.id));
    const runs = args.runs ?? targets.runsPerQuestion;

    // The run date the seed laid the data around, read back from its marker.
    const marker = await prisma.organization.findUnique({
        where: { slug: slugOf("salon") },
        select: { createdAt: true },
    });
    if (!marker) {
        console.error(`${TAG} no test businesses here: seed first (README)`);
        return 2;
    }
    const anchor = new Date(
        marker.createdAt.getTime() + MARKER_DAYS * 86_400_000,
    );
    const now = new Date();
    if (anchorFor(now).getTime() !== anchorFor(anchor).getTime()) {
        console.error(
            `${TAG} seeded for ${anchor.toISOString()}, but today is another day in ${ZONE}: make the database again and seed (README)`,
        );
        return 2;
    }
    const minuteNow = Math.floor((now.getTime() - anchor.getTime()) / 60_000);
    if (minuteNow < TODAY_CUTOFF_MINUTE) {
        console.error(
            `${TAG} run after 11:00 ${ZONE}: today's history is laid out until then`,
        );
        return 2;
    }
    const plan = buildPlan(anchor);
    const { ASK_AI_DRAFT_TOOLS, ASK_AI_TOOLS } = fromDist<
        typeof AskAiAgentFile
    >("modules/ai/agents/ask-ai.agent");
    const split = splitByTools(questions, ASK_AI_TOOLS);
    for (const s of split.skipped) console.info(`${TAG} ${s.id}: ${s.reason}`);
    const resolved = split.runnable.map((q) => ({
        ...q,
        resolved: resolveQuestion(
            q,
            businessOf(plan, q.business),
            now,
            ASK_AI_DRAFT_TOOLS,
        ),
    }));

    const out =
        args.out ??
        (targets.reportDir
            ? join(
                  expandHome(targets.reportDir),
                  now.toISOString().replace(/[:.]/g, "-"),
              )
            : null);
    if (!out) {
        console.error(
            `${TAG} no out folder: pass --out or set reportDir in the targets file`,
        );
        return 2;
    }
    mkdirSync(out, { recursive: true });

    let calls: ToolCallRecord[] = [];
    const app = await boot((call) => calls.push(call));
    try {
        const { TurnRunner: Runner } = fromDist<typeof TurnRunnerFile>(
            "modules/ai/turn/turn-runner",
        );
        const { TurnRegistry: Registry } = fromDist<typeof TurnRegistryFile>(
            "modules/ai/turn/turn-registry",
        );
        const { AiSettingsService: Settings } = fromDist<
            typeof AiSettingsServiceFile
        >("modules/ai/settings/ai-settings.service");
        const { OrganizationContextService: Contexts } = fromDist<
            typeof OrganizationContextServiceFile
        >("modules/organizations/organization-context.service");
        const runner: TurnRunner = app.get(Runner);
        const registry: TurnRegistry = app.get(Registry);
        const settings: AiSettingsService = app.get(Settings);
        const contexts: OrganizationContextService = app.get(Contexts);

        const turnCap =
            targets.marks.perQuestionCapMicroUsd ??
            (await settings.get("askAi.turnCostCapMicroUsd", orgIdOf("salon")));
        const results: Results = {
            meta: {
                startedAt: now.toISOString(),
                finishedAt: now.toISOString(),
                anchor: anchor.toISOString(),
                runsPerQuestion: runs,
                budgetMicroUsd: targets.budgetMicroUsd,
                spentMicroUsd: 0,
                turnCapMicroUsd: turnCap,
                stoppedForBudget: false,
                draftTools: [...ASK_AI_DRAFT_TOOLS],
                skipped: split.skipped,
            },
            questions: resolved,
            runs: [],
        };
        const save = () => {
            results.meta.finishedAt = new Date().toISOString();
            writeFileSync(
                join(out, "results.json"),
                JSON.stringify(results, null, 2),
            );
            writeFileSync(
                join(out, "report.md"),
                runReport(results, targets.rupeesPerUsd),
            );
        };

        const jobs = resolved.flatMap((q) =>
            Array.from({ length: runs }, (_, i) => ({ q, run: i + 1 })),
        );
        const done = await runWithinBudget(
            jobs,
            { budget: targets.budgetMicroUsd, reserve: turnCap },
            async ({ q, run }) => {
                calls = [];
                const record = await runOne(q, run);
                record.toolCalls = calls;
                results.runs.push(record);
                const cost =
                    (record.usage?.costMicroUsd ?? 0) +
                    (record.setupMicroUsd ?? 0);
                results.meta.spentMicroUsd += cost;
                save();
                console.info(
                    `${TAG} ${q.id} #${run}: ${record.outcome ?? record.error} ${cost} micro-USD, ${record.totalMs} ms`,
                );
                return cost;
            },
        );
        results.meta.stoppedForBudget = done.stopped;
        save();
        if (done.stopped)
            console.info(
                `${TAG} stopped at the budget after ${done.ran} of ${jobs.length} runs`,
            );
        console.info(
            `${TAG} results in ${out}; grade with: eval:ask-ai grade --results ${out}`,
        );
        return 0;

        async function runOne(
            q: (typeof resolved)[number],
            run: number,
        ): Promise<RunRecord> {
            const record: RunRecord = {
                questionId: q.id,
                run,
                turnId: null,
                text: "",
                statuses: [],
                toolCalls: [],
                card: null,
                cards: [],
                outcome: null,
                error: null,
                usage: null,
                firstStatusMs: null,
                firstTextMs: null,
                totalMs: 0,
                changed: [],
            };
            const orgId = orgIdOf(q.business);
            const started = performance.now();
            const ms = () => Math.round(performance.now() - started);
            try {
                const ctx = await contexts.resolve(
                    userIdOf(q.business, q.role),
                    orgId,
                );
                const before = await fingerprint(orgId);
                const conversation = await runner.openConversation(
                    ctx,
                    "ask-ai",
                );
                for (const prior of q.resolved.before ?? []) {
                    const id = randomUUID();
                    const s = registry.begin(ctx, id);
                    const t = setTimeout(
                        () => registry.stop(ctx, id),
                        TURN_TIMEOUT_MS,
                    );
                    try {
                        for await (const event of runner.run({
                            ctx,
                            conversationId: conversation.id,
                            question: prior,
                            turnId: id,
                            signal: s,
                        }))
                            void event;
                    } finally {
                        clearTimeout(t);
                        registry.end(id);
                    }
                    const u = await asBusiness(orgId, () =>
                        prisma.aiUsage.findUnique({ where: { turnId: id } }),
                    );
                    record.setupMicroUsd =
                        (record.setupMicroUsd ?? 0) + (u?.costMicroUsd ?? 0);
                }
                // Only the graded turn's tool calls.
                calls = [];
                const turnId = randomUUID();
                record.turnId = turnId;
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
                        question: q.resolved.question,
                        turnId,
                        signal,
                    })) {
                        if (event.type === "text-delta") {
                            record.firstTextMs ??= since();
                            record.text += event.text;
                        } else if (event.type === "status") {
                            record.firstStatusMs ??= since();
                            record.statuses.push({
                                tool: event.tool,
                                words: event.words,
                                ms: since(),
                            });
                        } else if (event.type === "card") {
                            record.card = {
                                kind: event.kind,
                                data: event.data,
                            };
                            record.cards?.push(record.card);
                        } else if (event.type === "error") {
                            record.error = event.reason;
                        } else if (event.type === "done") {
                            record.outcome = event.outcome;
                        } else {
                            // Refused at the door (plan, permission, switch, limit): nothing ran.
                            record.error = `refused: ${event.refusal.reason}`;
                        }
                    }
                } finally {
                    clearTimeout(timer);
                    registry.end(turnId);
                }
                const after = await fingerprint(orgId);
                record.changed = Object.keys(before).filter(
                    (t) => before[t] !== after[t],
                );
                const usage = await asBusiness(orgId, () =>
                    prisma.aiUsage.findUnique({ where: { turnId } }),
                );
                if (usage) {
                    record.usage = {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                        cacheReadTokens: usage.cacheReadTokens,
                        cacheWriteTokens:
                            usage.cacheWrite5mTokens + usage.cacheWrite1hTokens,
                        costMicroUsd: usage.costMicroUsd,
                    };
                }
            } catch (error) {
                // The kind only: a database or provider error can quote the question.
                record.error =
                    error instanceof HttpException
                        ? `refused ${error.getStatus()}`
                        : error instanceof Error
                          ? error.name
                          : "error";
            }
            record.totalMs = ms();
            return record;
        }
    } finally {
        await app.close();
    }
}

/** What ran, in a page: per question, its runs' outcomes, cost and waits. Grading is `grade.ts`'s. */
function runReport(r: Results, rupeesPerUsd: number): string {
    const rupees = (micro: number) =>
        `₹${((micro / 1_000_000) * rupeesPerUsd).toFixed(2)}`;
    const rows = r.questions.map((q) => {
        const runs = r.runs.filter((x) => x.questionId === q.id);
        const cost = runs.reduce((n, x) => n + (x.usage?.costMicroUsd ?? 0), 0);
        const outcomes = runs
            .map((x) => x.outcome ?? x.error ?? "?")
            .join(", ");
        const waits = runs
            .map((x) => `${x.firstStatusMs ?? "-"}/${x.firstTextMs ?? "-"}`)
            .join(", ");
        return `| ${q.id} | ${q.kind} | ${q.language} | ${q.role} | ${outcomes || "not run"} | ${rupees(cost)} | ${waits} |`;
    });
    return [
        "# Ask AI quality test: run",
        "",
        `Run date ${r.meta.anchor}, started ${r.meta.startedAt}, last write ${r.meta.finishedAt}.`,
        `${r.runs.length} runs, spent ${r.meta.spentMicroUsd} micro-USD (${rupees(r.meta.spentMicroUsd)}) of ${r.meta.budgetMicroUsd}${r.meta.stoppedForBudget ? ", stopped at the budget" : ""}.`,
        "",
        "| Question | Kind | Language | Role | Outcomes | Cost | Status / text ms |",
        "|---|---|---|---|---|---|---|",
        ...rows,
        "",
    ].join("\n");
}
