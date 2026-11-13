/**
 * `ask`: put one real question to Ask AI from a terminal, as a real person
 * of a real business, against a developer's OWN database (DEC-220).
 *
 *     pnpm --filter @saroh/api build
 *     pnpm --filter @saroh/api exec node dist/cli/ask.cli.js \
 *         --business <slug> --as <email> [--conversation <id>] "question"
 *
 *     pnpm --filter @saroh/api exec node dist/cli/ask.cli.js \
 *         --setup-settings <file.json> --as <email> [--business <slug>]
 *
 * From the build, not `tsx`: tsx doesn't emit the decorator metadata Nest
 * injects by, so the app's modules don't resolve under it.
 *
 * - It refuses unless NODE_ENV isn't production and DATABASE_URL is on this
 *   machine. It names the host it refused, never the connection string.
 * - The person's context is resolved as a request's would be (their real
 *   role and actions); someone who isn't a member of the business is
 *   refused. The turn runs through `TurnRunner` with the real provider and
 *   tools; write tools are refused by the bridge, so it only reads.
 * - It prints each status line, the answer as it streams, a card's kind and
 *   fields, then the outcome, tokens and cost. Ctrl-C is Stop (once; twice
 *   quits). The question and answer go to this terminal only, never to
 *   the app's logger.
 * - With `ANTHROPIC_API_KEY` set it costs real money per question.
 *
 * `--setup-settings` writes the AI settings a turn needs (they have no
 * defaults) through `AiSettingsService.set`, reason "local dev settings",
 * as the `--as` person. Every value is checked before any is written. With
 * `--business` it also turns the ASK_AI flag on for that business. The file
 * lives outside the repository; its shape, with placeholders:
 *
 *     {
 *       "ai.halt": false,
 *       "askAi.questions.model": "<model id>",
 *       "askAi.questions.effort": "low | medium | high",
 *       "askAi.drafts.model": "<model id>",
 *       "askAi.drafts.effort": "low | medium | high",
 *       "askAi.maxRounds": <number>,
 *       "askAi.maxPromptTokens": <number>,
 *       "askAi.maxHistoryTokens": <number>,
 *       "askAi.maxToolResultChars": <number>,
 *       "askAi.maxOutputTokens": <number>,
 *       "askAi.turnTokenCap": <number>,
 *       "askAi.stuckTurnMinutes": <number>,
 *       "askAi.turnCostCapMicroUsd": <micro-USD>,
 *       "askAi.businessDayCostCapMicroUsd": <micro-USD>,
 *       "ai.sarohDayCostCapMicroUsd": <micro-USD>,
 *       "ai.prices": { "<model id>": { "input": <micro-USD per million tokens>,
 *           "output": <…>, "cacheRead": <…>, "cacheWrite5m": <…>, "cacheWrite1h": <…> } },
 *       "cli.rupeesPerUsd": <number>
 *     }
 *
 * `cli.rupeesPerUsd` is this command's own: the rate for the rupee estimate
 * it prints, read at every ask from `--settings <file>` (default
 * `~/.saroh-ai-dev-settings.json`). Any other key that isn't a setting is
 * skipped and named.
 *
 * Booted as a Nest testing module so the job worker never starts here (it
 * would claim the local API's jobs).
 */
// MUST stay the first import, bare: `@saroh/database` reads DATABASE_URL
// when it loads (src/main.ts says why).
import "../env";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { HttpException, Logger } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../common/types/organization-context";
import { AiModule } from "../modules/ai/ai.module";
import { AI_SETTING_KEYS } from "../modules/ai/settings/ai-setting-keys";
import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../modules/ai/settings/ai-settings.service";
import { TurnRegistry } from "../modules/ai/turn/turn-registry";
import { TurnRunner } from "../modules/ai/turn/turn-runner";
import { FeatureFlagService } from "../modules/feature-flags/feature-flags.service";
import { JobWorkerService } from "../modules/jobs/job-worker.service";
import { OrganizationContextService } from "../modules/organizations/organization-context.service";
import type { AskArgs } from "./ask";
import {
    assertLocalDev,
    parseArgs,
    parseSettingsFile,
    RATE_KEY,
    summariseCard,
} from "./ask";

const TAG = "[ask]";
const AGENT = "ask-ai";
const DEFAULT_SETTINGS = resolve(homedir(), ".saroh-ai-dev-settings.json");

/** The rupee rate from a settings file, or undefined when there is none to read. */
function rupeeRate(path: string): number | undefined {
    try {
        const parsed = parseSettingsFile(readFileSync(path, "utf8"));
        return parsed.ok ? parsed.file.rupeesPerUsd : undefined;
    } catch {
        return undefined;
    }
}

const fromWhereRun = (path: string) =>
    resolve(globalThis.process.env.INIT_CWD ?? process.cwd(), path);

async function boot(): Promise<TestingModule> {
    // Ids and counts only, but the terminal is for the answer.
    Logger.overrideLogger(["warn", "error"]);
    const app = await Test.createTestingModule({ imports: [AiModule] })
        .overrideProvider(JobWorkerService)
        .useValue({})
        .compile();
    await app.init();
    return app;
}

async function person(email: string): Promise<{ id: string } | null> {
    return prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
    });
}

async function setup(app: TestingModule, args: AskArgs): Promise<number> {
    let text: string;
    try {
        text = readFileSync(fromWhereRun(args.setupSettings ?? ""), "utf8");
    } catch {
        console.error(`${TAG} can't read that settings file`);
        return 2;
    }
    const parsed = parseSettingsFile(text);
    if (!parsed.ok) {
        for (const e of parsed.errors) console.error(`${TAG} ${e}`);
        return 2;
    }
    const user = await person(args.as ?? "");
    if (!user) {
        console.error(`${TAG} nobody signs in with that email here`);
        return 2;
    }
    const settings = app.get(AiSettingsService);
    for (const [key, value] of parsed.file.settings) {
        await settings.set(key, value, "local dev settings", {
            userId: user.id,
        });
    }
    console.info(`${TAG} wrote ${parsed.file.settings.length} settings`);
    for (const key of parsed.file.skipped) {
        console.info(`${TAG} skipped ${key}: not an AI setting`);
    }
    const missing = AI_SETTING_KEYS.filter(
        (k) => !parsed.file.settings.some(([key]) => key === k),
    );
    if (missing.length) {
        console.info(`${TAG} not in the file: ${missing.join(", ")}`);
    }
    if (args.business) {
        const org = await business(args.business);
        if (!org) return 2;
        await app
            .get(FeatureFlagService)
            .setOverride("ASK_AI", org.id, true, user.id, "local dev settings");
        console.info(`${TAG} ASK_AI on for ${args.business}`);
    }
    return 0;
}

async function business(slug: string): Promise<{ id: string } | null> {
    const org = await prisma.organization.findFirst({
        where: { OR: [{ id: slug }, { slug }] },
        select: { id: true },
    });
    if (!org) console.error(`${TAG} no business with that slug`);
    return org;
}

/** Why a turn can't run here, in a line per reason; empty when it can. */
async function whyUnavailable(
    app: TestingModule,
    organizationId: string,
): Promise<string[]> {
    const settings = app.get(AiSettingsService);
    const why: string[] = [];
    if ((await settings.halt()).halted) why.push("ai.halt is on");
    const flag = await app
        .get(FeatureFlagService)
        .explain("ASK_AI", organizationId);
    if (!flag.value) {
        why.push(
            `the ASK_AI flag is off for this business (${flag.source}); --setup-settings with --business turns it on`,
        );
    }
    for (const key of AI_SETTING_KEYS) {
        if (key === "ai.halt") continue;
        try {
            await settings.get(key, organizationId);
        } catch (error) {
            if (!(error instanceof AiSettingNotConfiguredError)) throw error;
            why.push(error.message);
        }
    }
    return why;
}

const asBusiness = <T>(organizationId: string, fn: () => Promise<T>) =>
    outsideOrgContext(() => runInOrgContext(organizationId, fn));

async function ask(app: TestingModule, args: AskArgs): Promise<number> {
    const org = await business(args.business ?? "");
    if (!org) return 2;
    const user = await person(args.as ?? "");
    if (!user) {
        console.error(`${TAG} nobody signs in with that email here`);
        return 2;
    }
    let ctx: OrganizationContext;
    try {
        ctx = await app
            .get(OrganizationContextService)
            .resolve(user.id, org.id);
    } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        console.error(`${TAG} refused: ${error.message}`);
        return 2;
    }
    console.info(`${TAG} as ${args.as} (${ctx.roleKey ?? ctx.role})`);
    const why = await whyUnavailable(app, org.id);
    if (why.length) {
        for (const line of why) console.error(`${TAG} unavailable: ${line}`);
        return 1;
    }

    const runner = app.get(TurnRunner);
    const registry = app.get(TurnRegistry);
    const conversationId =
        args.conversation ?? (await runner.openConversation(ctx, AGENT)).id;
    console.info(`${TAG} conversation ${conversationId}`);
    console.info(`\n> ${args.question}\n`);

    const turnId = randomUUID();
    const signal = registry.begin(ctx, turnId);
    let stopping = false;
    const onStop = () => {
        if (stopping) process.exit(130);
        stopping = true;
        registry.stop(ctx, turnId);
        process.stdout.write(`\n${TAG} stopping…\n`);
    };
    process.on("SIGINT", onStop);
    try {
        for await (const event of runner.run({
            ctx,
            conversationId,
            question: args.question ?? "",
            turnId,
            signal,
        })) {
            if (event.type === "text-delta") process.stdout.write(event.text);
            else if (event.type === "status") {
                process.stdout.write(`\n· ${event.words} (${event.tool})\n`);
            } else if (event.type === "card") {
                process.stdout.write(
                    `\n${summariseCard(event.kind, event.data)}\n`,
                );
            } else if (event.type === "error") {
                process.stdout.write(`\n${TAG} error: ${event.reason}\n`);
            } else if (event.type === "refused") {
                process.stdout.write(
                    `\n${TAG} not asked: ${JSON.stringify(event.refusal)}\n`,
                );
            } else {
                process.stdout.write(
                    `\n\n${TAG} outcome ${event.outcome}, counted ${event.counted}, rounds ${event.usage.rounds}\n`,
                );
            }
        }
    } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        console.error(`${TAG} refused: ${error.message}`);
        return 2;
    } finally {
        registry.end(turnId);
        process.off("SIGINT", onStop);
    }

    const usage = await asBusiness(org.id, () =>
        prisma.aiUsage.findUnique({ where: { turnId } }),
    );
    if (usage) {
        console.info(
            `${TAG} tokens: in ${usage.inputTokens}, cache read ${usage.cacheReadTokens}, cache write ${usage.cacheWrite5mTokens + usage.cacheWrite1hTokens} (5m ${usage.cacheWrite5mTokens}, 1h ${usage.cacheWrite1hTokens}), out ${usage.outputTokens}, thinking ${usage.thinkingTokens}`,
        );
        const rate = rupeeRate(
            args.settings ? fromWhereRun(args.settings) : DEFAULT_SETTINGS,
        );
        const rupees =
            rate === undefined
                ? `no ${RATE_KEY} in the settings file`
                : `about ${((usage.costMicroUsd / 1_000_000) * rate).toFixed(4)} rupees`;
        console.info(
            `${TAG} cost: ${usage.costMicroUsd} micro-USD (${rupees})${usage.failureReason ? `; failure ${usage.failureReason}` : ""}`,
        );
    }
    console.info(`${TAG} continue with --conversation ${conversationId}`);
    return 0;
}

export async function main(argv: readonly string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args) {
        console.error(
            `${TAG} usage: ask --business <slug> --as <email> [--conversation <id>] [--settings <file>] "question"\n` +
                `${TAG}        ask --setup-settings <file.json> --as <email> [--business <slug>]`,
        );
        return 2;
    }
    try {
        const target = assertLocalDev();
        console.info(`${TAG} database: ${target.database} on ${target.host}`);
    } catch (error) {
        console.error(
            `${TAG} ${error instanceof Error ? error.message : "refused"}`,
        );
        return 2;
    }
    const app = await boot();
    try {
        return args.setupSettings
            ? await setup(app, args)
            : await ask(app, args);
    } finally {
        await app.close();
    }
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            // The kind of failure, never its message: a database or SDK
            // error can quote a row or the request.
            console.error(
                `${TAG} failed: ${error instanceof Error ? error.name : "error"}`,
            );
            process.exitCode = 1;
        })
        .finally(() => {
            void prisma.$disconnect();
        });
}
