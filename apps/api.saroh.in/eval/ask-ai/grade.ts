/**
 * Grades a run of the quality test (`run.ts`'s `results.json`): first by
 * code (`lib.ts` `gradeRun`: exact figures, draft fields, forbidden tools
 * and figures, nothing saved, cost), then by a stronger model with a
 * written checklist (language, money words, kind refusals, asking back),
 * then against the pass marks in the targets file. Prints PASS or FAIL per
 * mark and writes `grade.json`, `grade.md` and `questions.md` (every
 * question and run in full) beside the results. Exit 0
 * only when every mark passes. Questions the run skipped (a tool Ask AI
 * hasn't got yet) are listed as SKIP and count in no mark.
 *
 * The AI grader spends from the same budget as the run; `--no-ai` grades by
 * code only (the AI marks then read n/a and fail).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type * as ProviderPortFile from "../../src/modules/ai/providers/provider.port";
import type { AiProvider } from "../../src/modules/ai/providers/provider.port";
import type * as AiSettingsServiceFile from "../../src/modules/ai/settings/ai-settings.service";
import type { AiSettingsService } from "../../src/modules/ai/settings/ai-settings.service";
import type { CodeGrade, Mark, Results, Targets, Verdict } from "./lib";
import {
    GRADER_SYSTEM,
    graderPrompt,
    gradeRun,
    parseTargets,
    parseVerdict,
    passMarks,
    questionsMarkdown,
    runProblems,
    runWithinBudget,
} from "./lib";
import { assertEvalDatabase, boot, fromDist, fromWhereRun } from "./local";
import { DEFAULT_TARGETS } from "./run";
import { orgIdOf } from "./seed";

const TAG = "[eval grade]";

interface Args {
    results?: string;
    targets: string;
    ai: boolean;
}

function parseArgs(argv: readonly string[]): Args | null {
    const args: Args = { targets: DEFAULT_TARGETS, ai: true };
    // Past the end is undefined at run time, whatever the index type says.
    const at = (j: number): string | undefined => argv[j];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--no-ai") {
            args.ai = false;
            continue;
        }
        const value = at(i + 1);
        if (value === undefined) return null;
        if (argv[i] === "--results") args.results = fromWhereRun(value);
        else if (argv[i] === "--targets") args.targets = fromWhereRun(value);
        else return null;
        i++;
    }
    return args.results ? args : null;
}

export async function main(argv: readonly string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args?.results) {
        console.error(
            `${TAG} usage: grade --results <run folder> [--targets <file>] [--no-ai]`,
        );
        return 2;
    }
    const dir = args.results;
    const results = JSON.parse(
        readFileSync(join(dir, "results.json"), "utf8"),
    ) as Results;
    const targets = parseTargets(readFileSync(args.targets, "utf8"));
    const byId = new Map(results.questions.map((q) => [q.id, q]));
    const cap =
        targets.marks.perQuestionCapMicroUsd ?? results.meta.turnCapMicroUsd;
    const grades: CodeGrade[] = results.runs.flatMap((run) => {
        const q = byId.get(run.questionId);
        return q ? [gradeRun(q, run, cap)] : [];
    });
    const verdicts = new Map<string, Verdict>();
    let graderSpent = 0;
    if (args.ai) graderSpent = await aiGrade(results, targets, verdicts);

    const marks = passMarks(results, grades, verdicts, targets);
    for (const m of marks) {
        console.info(
            `${m.pass ? "PASS" : "FAIL"}  ${m.name}: ${m.value} (target ${m.target})${m.detail ? `; ${m.detail}` : ""}`,
        );
    }
    for (const s of results.meta.skipped ?? [])
        console.info(`SKIP  ${s.id}: ${s.reason}`);
    const pass = marks.every((m) => m.pass);
    console.info(pass ? "PASS: every mark" : "FAIL: see the marks above");
    writeFileSync(
        join(dir, "grade.json"),
        JSON.stringify(
            {
                marks,
                grades,
                verdicts: Object.fromEntries(verdicts),
                graderSpent,
            },
            null,
            2,
        ),
    );
    writeFileSync(
        join(dir, "grade.md"),
        gradeReport(results, grades, verdicts, marks, graderSpent, targets),
    );
    writeFileSync(
        join(dir, "questions.md"),
        questionsMarkdown(results, grades, verdicts, targets.rupeesPerUsd),
    );
    return pass ? 0 : 1;
}

/** One verdict per run from the grader model, within what the budget has left. */
async function aiGrade(
    results: Results,
    targets: Targets,
    verdicts: Map<string, Verdict>,
): Promise<number> {
    const target = assertEvalDatabase();
    console.info(
        `${TAG} database: ${target.database} on ${target.host} (for the AI settings)`,
    );
    const app = await boot();
    try {
        const { AI_PROVIDER } = fromDist<typeof ProviderPortFile>(
            "modules/ai/providers/provider.port",
        );
        const { AiSettingsService: Settings } = fromDist<
            typeof AiSettingsServiceFile
        >("modules/ai/settings/ai-settings.service");
        const provider: AiProvider = app.get(AI_PROVIDER);
        const settings: AiSettingsService = app.get(Settings);
        const all: Partial<Record<string, { input: number; output: number }>> =
            await settings.get("ai.prices", orgIdOf("salon"));
        const prices = all[targets.graderModel];
        if (!prices) {
            throw new Error(
                `ai.prices has no prices for ${targets.graderModel}: add them with ask --setup-settings (README)`,
            );
        }
        const cost = (input: number, output: number) =>
            Math.ceil(
                (input * prices.input + output * prices.output) / 1_000_000,
            );
        // The most one grading may cost: a long answer in, the verdict out.
        const reserve = cost(4_000, 400);
        const byId = new Map(results.questions.map((q) => [q.id, q]));
        const done = await runWithinBudget(
            results.runs,
            {
                budget: targets.budgetMicroUsd,
                reserve,
                spent: results.meta.spentMicroUsd,
            },
            async (run) => {
                const q = byId.get(run.questionId);
                if (!q) return 0;
                let text = "";
                let spent = 0;
                for await (const event of provider.stream(
                    {
                        model: targets.graderModel,
                        system: [{ text: GRADER_SYSTEM }],
                        messages: [
                            { role: "user", text: graderPrompt(q, run) },
                        ],
                        tools: [],
                        effort: "low",
                        maxTokens: 400,
                        maxRetries: 2,
                    },
                    AbortSignal.timeout(60_000),
                )) {
                    if (event.type === "text-delta") text += event.text;
                    else if (event.type === "finish")
                        spent = cost(
                            event.usage.inputTokens,
                            event.usage.outputTokens,
                        );
                    else if (event.type === "failed")
                        console.error(
                            `${TAG} grader failed on ${run.questionId} #${run.run}: ${event.reason}`,
                        );
                }
                const verdict = parseVerdict(text);
                if (verdict)
                    verdicts.set(`${run.questionId}#${run.run}`, verdict);
                else
                    console.error(
                        `${TAG} no verdict for ${run.questionId} #${run.run}`,
                    );
                return spent;
            },
        );
        const graderSpent = done.spent - results.meta.spentMicroUsd;
        if (done.stopped)
            console.info(
                `${TAG} grader stopped at the budget after ${done.ran} runs`,
            );
        console.info(`${TAG} grader spent ${graderSpent} micro-USD`);
        return graderSpent;
    } finally {
        await app.close();
    }
}

function gradeReport(
    r: Results,
    grades: readonly CodeGrade[],
    verdicts: ReadonlyMap<string, Verdict>,
    marks: readonly Mark[],
    graderSpent: number,
    t: Targets,
): string {
    const rupees = (micro: number) =>
        `₹${((micro / 1_000_000) * t.rupeesPerUsd).toFixed(2)}`;
    const problems = grades.flatMap((g) => {
        const lines = runProblems(g, verdicts.get(`${g.questionId}#${g.run}`));
        return lines.length
            ? [`- **${g.questionId} #${g.run}**: ${lines.join(" · ")}`]
            : [];
    });
    return [
        "# Ask AI quality test: grade",
        "",
        `Run date ${r.meta.anchor}; ${r.runs.length} runs; turns ${rupees(r.meta.spentMicroUsd)}, grader ${rupees(graderSpent)}.`,
        "",
        "| Mark | Value | Target | |",
        "|---|---|---|---|",
        ...marks.map(
            (m) =>
                `| ${m.name} | ${m.value} | ${m.target} | ${m.pass ? "PASS" : "FAIL"} |`,
        ),
        "",
        "## Runs with a problem",
        "",
        ...(problems.length ? problems : ["None."]),
        "",
        ...(r.meta.skipped?.length
            ? [
                  "## Not run",
                  "",
                  ...r.meta.skipped.map((s) => `- **${s.id}**: ${s.reason}`),
                  "",
              ]
            : []),
    ].join("\n");
}
