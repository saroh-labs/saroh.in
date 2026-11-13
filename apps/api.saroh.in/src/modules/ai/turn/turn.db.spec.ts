/**
 * A turn's rows against a real Postgres (DEC-220, plan U13): the usage row
 * is RUNNING while the turn runs and finished, counted, at its end; the
 * question and answer are ciphertext at rest and open for their owner; a
 * model change reaches new conversations only; and the stuck-turn sweep
 * fails old RUNNING rows, keeping their cost, without counting them.
 *
 * Runs in the integration project (TEST_DATABASE_URL). The settings are
 * this business's overrides, so other specs' Saroh-wide rows don't matter;
 * the numbers are test values, not Saroh's.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { env } from "../../../env";
import type { CatalogueAccessService } from "../../billing/catalogue-access.service";
import type { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { AskAiAccess } from "../access/ask-ai-access";
import { ASK_AI_AGENT } from "../agents/ask-ai.agent";
import { ConversationsService } from "../conversations.service";
import { FakeAiProvider } from "../providers/fake.provider";
import { AiSettingsService } from "../settings/ai-settings.service";
import { NO_TOOLS } from "../tools/toolbox.port";
import { StuckTurnSweep } from "../usage/stuck-turns";
import type { TurnEvent } from "./events";
import { TurnRunner } from "./turn-runner";
import { TurnStore } from "./turn-store";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const before = mutableEnv.AI_TEXT_ENC_KEY;

const settings = new AiSettingsService();
const conversations = new ConversationsService();
const store = new TurnStore(conversations);
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const actor = { userId: "user_test_settings" };
// Ask AI on the plan with no cap: the plan's part is `ask-ai-access.db.spec.ts`.
const access = new AskAiAccess(settings, flags, store, {
    resolve: () =>
        Promise.resolve({
            source: "catalogue",
            modules: [{ moduleId: "ask-ai", state: "on", limit: null }],
        }),
} as unknown as CatalogueAccessService);

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;

async function owner(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("turn-org") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("turn-user")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

async function configure(org: string, model = "claude-haiku-5-5") {
    const values: Record<string, unknown> = {
        "askAi.questions.model": model,
        "askAi.questions.effort": "low",
        "askAi.maxOutputTokens": 500,
        "askAi.maxRounds": 4,
        "askAi.maxPromptTokens": 1_000_000,
        "askAi.maxToolResultChars": 100_000,
        "askAi.maxHistoryTokens": 1_000_000,
        "askAi.turnTokenCap": 1_000_000,
        "askAi.turnCostCapMicroUsd": 1_000_000,
        "askAi.businessDayCostCapMicroUsd": 1_000_000_000,
        "askAi.runningTurnsPerBusiness": 5,
        "askAi.questionsPerMinutePerPerson": 100,
        "ai.prices": {
            [model]: {
                input: 1_000_000,
                output: 1_000_000,
                cacheRead: 1_000_000,
                cacheWrite5m: 1_000_000,
                cacheWrite1h: 1_000_000,
            },
        },
    };
    for (const [key, value] of Object.entries(values)) {
        await settings.setOverride(org, key, value, "turn spec", actor, {
            effectiveFrom: new Date(Date.now() - 1000),
        });
    }
    // Saroh-wide only; a test value far above anything these turns spend.
    await settings.set(
        "ai.sarohDayCostCapMicroUsd",
        1_000_000_000_000,
        "turn spec",
        actor,
        new Date(Date.now() - 1000),
    );
}

function runner(rounds: ConstructorParameters<typeof FakeAiProvider>[0]) {
    return new TurnRunner(
        new FakeAiProvider(rounds),
        NO_TOOLS,
        [ASK_AI_AGENT],
        settings,
        flags,
        store,
        access,
    );
}

beforeAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = before;
});

describe("a turn's rows", () => {
    it("is RUNNING while it runs, then ANSWERED and counted, with the text sealed", async () => {
        const ctx = await owner();
        await configure(ctx.organizationId);
        const r = runner([
            [
                { type: "text-delta", text: "Kal teen bookings hain." },
                {
                    type: "finish",
                    reason: "stop",
                    usage: {
                        inputTokens: 100,
                        outputTokens: 20,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        thinkingTokens: 0,
                    },
                },
            ],
        ]);
        const conversation = await r.openConversation(ctx, "ask-ai");
        const turnId = randomUUID();
        const question = `Kal kitni bookings hain? ${uniq("q")}`;
        const events: TurnEvent[] = [];
        let whileRunning: string | undefined;
        for await (const e of r.run({
            ctx,
            conversationId: conversation.id,
            question,
            turnId,
            signal: new AbortController().signal,
        })) {
            events.push(e);
            if (e.type === "text-delta") {
                whileRunning = (
                    await prisma.aiUsage.findUniqueOrThrow({
                        where: { turnId },
                    })
                ).outcome;
            }
        }
        expect(whileRunning).toBe("RUNNING");
        expect(events[events.length - 1]).toMatchObject({
            type: "done",
            outcome: "ANSWERED",
            counted: true,
        });

        const row = await prisma.aiUsage.findUniqueOrThrow({
            where: { turnId },
        });
        expect(row).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
            inputTokens: 100,
            outputTokens: 20,
            costMicroUsd: 120,
            agent: "ask-ai",
            model: "claude-haiku-5-5",
            conversationId: conversation.id,
        });
        expect(row.finishedAt).not.toBeNull();

        const raw = JSON.stringify(
            await prisma.aiMessage.findMany({
                where: { conversationId: conversation.id },
            }),
        );
        expect(raw).not.toContain("bookings");
        const view = await conversations.get(ctx, conversation.id);
        expect(view.messages.map((m) => [m.role, m.text, m.outcome])).toEqual([
            ["USER", question, null],
            ["ASSISTANT", "Kal teen bookings hain.", "ANSWERED"],
        ]);
    });

    it("stamps the model on a conversation when it starts", async () => {
        const ctx = await owner();
        await configure(ctx.organizationId, "claude-haiku-5-5");
        const r = runner([]);
        const open = await r.openConversation(ctx, "ask-ai");
        await configure(ctx.organizationId, "claude-sonnet-5-5");
        const next = await r.openConversation(ctx, "ask-ai");
        const rows = await prisma.aiConversation.findMany({
            where: { id: { in: [open.id, next.id] } },
            select: { id: true, model: true },
        });
        expect(Object.fromEntries(rows.map((c) => [c.id, c.model]))).toEqual({
            [open.id]: "claude-haiku-5-5",
            [next.id]: "claude-sonnet-5-5",
        });
    });
});

describe("stuck-turn sweep", () => {
    it("fails RUNNING rows past the window, keeping cost, not counted", async () => {
        const ctx = await owner();
        await settings.set(
            "askAi.stuckTurnMinutes",
            30,
            "turn spec",
            actor,
            new Date(Date.now() - 1000),
        );
        const row = (startedAt: Date) =>
            prisma.aiUsage.create({
                data: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                    turnId: randomUUID(),
                    agent: "ask-ai",
                    agentVersion: "test",
                    model: "claude-haiku-5-5",
                    effort: "low",
                    windowStart: new Date(),
                    windowKey: "2026-11",
                    costMicroUsd: 7,
                    startedAt,
                },
            });
        const old = await row(new Date(Date.now() - 31 * 60_000));
        const recent = await row(new Date(Date.now() - 60_000));

        expect(
            await new StuckTurnSweep(settings).sweep(),
        ).toBeGreaterThanOrEqual(1);

        const after = await prisma.aiUsage.findMany({
            where: { id: { in: [old.id, recent.id] } },
        });
        const byId = Object.fromEntries(after.map((u) => [u.id, u]));
        expect(byId[old.id]).toMatchObject({
            outcome: "FAILED",
            counted: false,
            costMicroUsd: 7,
            failureReason: "stuck",
        });
        expect(byId[recent.id].outcome).toBe("RUNNING");
    });
});
