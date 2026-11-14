/**
 * The turn runner with a scripted provider, a fake toolbox and an
 * in-memory store (DEC-220, plan U13): events in order, the outcome and
 * whether it counts, every guard, the switches checked before each round,
 * Stop, provider failures, model stamping, and logs without text. The rows
 * themselves (sealing, the RUNNING row) are `turn.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        membership: {
            findFirst: () => Promise.resolve({ user: { name: "Meera" } }),
        },
    },
    outsideOrgContext: (fn: () => unknown) => fn(),
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

import { Logger } from "@nestjs/common";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { CatalogueAccessService } from "../../billing/catalogue-access.service";
import type { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import type { AskAiRefusal } from "../access/ask-ai-access";
import { AskAiAccess } from "../access/ask-ai-access";
import type { AgentDefinition } from "../agents/agent-definition";
import { FakeAiProvider } from "../providers/fake.provider";
import type { AiEvent, AiMessage, AiUsage } from "../providers/provider.port";
import type { AiSettingsService } from "../settings/ai-settings.service";
import { AiSettingNotConfiguredError } from "../settings/ai-settings.service";
import type { AiToolbox, AiToolRun } from "../tools/toolbox.port";
import type { TurnEvent } from "./events";
import { estimateTokens } from "./guards";
import { LAST_ROUND, TurnRunner } from "./turn-runner";
import type { TurnConversation, TurnFinish, TurnStore } from "./turn-store";

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const QUESTION = "Kal kitni bookings hain, Asha ke saath?";

const agent: AgentDefinition<"list_bookings" | "draft_booking"> = {
    key: "test-agent",
    job: "Answer about bookings.",
    houseRules: "House rules.",
    businessBlock: () => Promise.resolve("Business: Test"),
    models: {
        questions: {
            model: "askAi.questions.model",
            effort: "askAi.questions.effort",
        },
        drafts: { model: "askAi.drafts.model", effort: "askAi.drafts.effort" },
    },
    tools: ["list_bookings", "draft_booking"],
    draftTools: ["draft_booking"],
    statusWords: {
        list_bookings: {
            en: "Reading your bookings…",
            hinglish: "Bookings dekh rahe hain…",
            hi: "बुकिंग देख रहे हैं…",
        },
        draft_booking: {
            en: "Drafting…",
            hinglish: "Draft bana rahe hain…",
            hi: "ड्राफ़्ट बना रहे हैं…",
        },
    },
    startWords: {
        en: "Looking at your business…",
        hinglish: "Aapka business dekh rahe hain…",
        hi: "आपका कारोबार देख रहे हैं…",
    },
    draftWords: {
        en: "Here it is to check.",
        hinglish: "Yeh check kar lijiye.",
        hi: "इसे देख लीजिए।",
    },
    usageKey: "questions",
};

// Test numbers only: a price of one micro-USD per token makes cost = tokens.
const PER_TOKEN = 1_000_000;
function baseSettings(): Record<string, unknown> {
    return {
        "askAi.questions.model": "claude-haiku-5-5",
        "askAi.questions.effort": "low",
        "askAi.maxOutputTokens": 500,
        "askAi.maxRounds": 4,
        "askAi.maxPromptTokens": 1_000_000,
        "askAi.maxToolResultChars": 100_000,
        "askAi.maxHistoryTokens": 1_000_000,
        "askAi.turnTokenCap": 1_000_000,
        "askAi.turnCostCapMicroUsd": 1_000_000,
        "askAi.businessDayCostCapMicroUsd": 10_000_000,
        "ai.sarohDayCostCapMicroUsd": 100_000_000,
        "askAi.runningTurnsPerBusiness": 3,
        "askAi.questionsPerMinutePerPerson": 5,
        "ai.prices": {
            "claude-haiku-5-5": {
                input: PER_TOKEN,
                output: PER_TOKEN,
                cacheRead: PER_TOKEN,
                cacheWrite5m: PER_TOKEN,
                cacheWrite1h: PER_TOKEN,
            },
        },
    };
}

const usage = (u: Partial<AiUsage> = {}): AiUsage => ({
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
    ...u,
});
const done = (u?: Partial<AiUsage>): AiEvent => ({
    type: "finish",
    reason: "stop",
    usage: usage(u),
});
const text = (t: string): AiEvent => ({ type: "text-delta", text: t });
const call = (name: string, id = `call_${name}`): AiEvent => ({
    type: "tool-call",
    call: { id, name, input: {} },
});
const toolRound = (name = "list_bookings") => [call(name), done()];

interface Setup {
    rounds: AiEvent[][];
    settings?: Record<string, unknown>;
    history?: AiMessage[];
    toolRun?: (name: string) => AiToolRun | Promise<AiToolRun>;
    conversation?: Partial<TurnConversation>;
    asker?: OrganizationContext;
}

function setup(s: Setup) {
    const values = s.settings ?? baseSettings();
    const switches = {
        halted: false,
        flag: true,
        businessOn: true,
        /** Ask AI's catalogue row: on (a paying plan) or locked (Free). */
        plan: "on" as "on" | "locked",
        /** What the start's checks find (`AskAiAccess.admit`, run by the store). */
        atStart: null as AskAiRefusal | null,
    };
    const settings = {
        get: jest.fn((key: string) => {
            if (!(key in values)) {
                return Promise.reject(
                    new AiSettingNotConfiguredError(key as never),
                );
            }
            return Promise.resolve(values[key]);
        }),
        halt: jest.fn(() => Promise.resolve({ halted: switches.halted })),
    };
    const flags = {
        isEnabled: jest.fn(() => Promise.resolve(switches.flag)),
    };
    const conversation: TurnConversation = {
        id: "conv_1",
        organizationId: ctx.organizationId,
        agent: agent.key,
        agentVersion: "v",
        model: "claude-haiku-5-5",
        effort: "low",
        ...s.conversation,
    };
    let created = 0;
    const store = {
        started: [] as { turnId: string; question: string }[],
        finished: [] as TurnFinish[],
        createConversation: jest.fn(
            (
                _: OrganizationContext,
                data: Omit<TurnConversation, "id" | "organizationId">,
            ) =>
                Promise.resolve({
                    id: `conv_new_${++created}`,
                    organizationId: ctx.organizationId,
                    ...data,
                }),
        ),
        load: jest.fn(() =>
            Promise.resolve({ conversation, history: s.history ?? [] }),
        ),
        businessOn: jest.fn(() => Promise.resolve(switches.businessOn)),
        language: jest.fn(() => Promise.resolve("MATCH" as const)),
        start: jest.fn(
            (_c: unknown, _v: unknown, turnId: string, question: string) => {
                if (switches.atStart) return Promise.resolve(switches.atStart);
                store.started.push({ turnId, question });
                return Promise.resolve(null);
            },
        ),
        finish: jest.fn(
            (_c: unknown, _v: unknown, _t: string, f: TurnFinish) => {
                store.finished.push(f);
                return Promise.resolve();
            },
        ),
    };
    const toolbox: AiToolbox = {
        definitions: (names) =>
            names.map((name) => ({
                name,
                description: name,
                inputSchema: { type: "object" },
            })),
        run: jest.fn((_c, c) =>
            Promise.resolve(
                s.toolRun?.(c.name) ?? { output: "3 bookings tomorrow." },
            ),
        ),
    };
    const provider = new FakeAiProvider(s.rounds);
    const catalogue = {
        resolve: jest.fn(() =>
            Promise.resolve({
                source: "catalogue",
                modules: [
                    {
                        moduleId: "ask-ai",
                        state: switches.plan,
                        limit: 3,
                        upgradeTo: switches.plan === "on" ? "" : "Plan B",
                    },
                ],
            }),
        ),
    };
    const access = new AskAiAccess(
        settings as unknown as AiSettingsService,
        flags as unknown as FeatureFlagService,
        store as unknown as TurnStore,
        catalogue as unknown as CatalogueAccessService,
    );
    const runner = new TurnRunner(
        provider,
        toolbox,
        [agent],
        settings as unknown as AiSettingsService,
        flags as unknown as FeatureFlagService,
        store as unknown as TurnStore,
        access,
    );
    const controller = new AbortController();
    const turn = () =>
        runner.run({
            ctx: s.asker ?? ctx,
            conversationId: conversation.id,
            question: QUESTION,
            turnId: "turn_1",
            signal: controller.signal,
        });
    return {
        runner,
        provider,
        store,
        settings: values,
        switches,
        controller,
        toolbox,
        turn,
    };
}

async function collect(
    gen: AsyncIterable<TurnEvent>,
    onEvent?: (e: TurnEvent) => void,
): Promise<TurnEvent[]> {
    const out: TurnEvent[] = [];
    for await (const e of gen) {
        out.push(e);
        onEvent?.(e);
    }
    return out;
}

const last = <T>(xs: T[]) => xs[xs.length - 1];

describe("TurnRunner", () => {
    it("answers: status, text, done in order; one row started and finished counted", async () => {
        const t = setup({
            rounds: [toolRound(), [text("You have "), text("3."), done()]],
        });
        const events = await collect(t.turn());
        // The question is Hinglish and the setting matches it.
        expect(events).toEqual([
            {
                type: "status",
                tool: "start",
                words: "Aapka business dekh rahe hain…",
            },
            {
                type: "status",
                tool: "list_bookings",
                words: "Bookings dekh rahe hain…",
            },
            { type: "text-delta", text: "You have " },
            { type: "text-delta", text: "3." },
            {
                type: "done",
                turnId: "turn_1",
                outcome: "ANSWERED",
                counted: true,
                usage: { rounds: 2, inputTokens: 200, outputTokens: 40 },
            },
        ]);
        expect(t.store.started).toEqual([
            { turnId: "turn_1", question: QUESTION },
        ]);
        expect(t.store.finished).toHaveLength(1);
        expect(t.store.finished[0]).toMatchObject({
            text: "You have 3.",
            outcome: "ANSWERED",
            counted: true,
            stopped: false,
            costMicroUsd: 240,
        });
        // The start is written before the first round is sent.
        expect(t.store.start.mock.invocationCallOrder[0]).toBeLessThan(
            t.store.finish.mock.invocationCallOrder[0],
        );
    });

    it("lays the request out for the cache and turns retries off", async () => {
        const t = setup({ rounds: [toolRound(), [text("Ok"), done()]] });
        await collect(t.turn());
        const [first, second] = t.provider.requests;
        expect(first.system).toEqual([
            { text: "House rules.\n\nAnswer about bookings.", cache: true },
            { text: "Business: Test" },
        ]);
        expect(first.tools.map((x) => x.name)).toEqual([
            "list_bookings",
            "draft_booking",
        ]);
        expect(first).toMatchObject({
            model: "claude-haiku-5-5",
            effort: "low",
            maxTokens: 500,
            cacheTail: true,
            maxRetries: 0,
        });
        expect(first.toolChoice).toBeUndefined();
        expect(second.messages.slice(-2)).toEqual([
            {
                role: "assistant",
                toolCalls: [
                    {
                        id: "call_list_bookings",
                        name: "list_bookings",
                        input: {},
                    },
                ],
            },
            {
                role: "tool",
                results: [
                    {
                        toolCallId: "call_list_bookings",
                        toolName: "list_bookings",
                        output: "3 bookings tomorrow.",
                    },
                ],
            },
        ]);
    });

    it("ends on a draft card, counted, without another round", async () => {
        const t = setup({
            rounds: [toolRound("draft_booking"), [text("never"), done()]],
            toolRun: () => ({
                output: "Drafted.",
                card: { kind: "booking", data: { id: "b1" } },
            }),
        });
        const events = await collect(t.turn());
        expect(events).toContainEqual({
            type: "card",
            kind: "booking",
            data: { id: "b1" },
        });
        expect(last(events)).toMatchObject({ outcome: "DRAFT", counted: true });
        expect(t.provider.requests).toHaveLength(1);
        // No words from the model: the fixed line, in the question's language, kept with the message.
        expect(events).toContainEqual({
            type: "text-delta",
            text: "Yeh check kar lijiye.",
        });
        expect(t.store.finished[0]).toMatchObject({
            text: "Yeh check kar lijiye.",
            outcome: "DRAFT",
        });
    });

    it("keeps the model's own words before a draft, with no fixed line", async () => {
        const t = setup({
            rounds: [[text("Drafting it now."), call("draft_booking"), done()]],
            toolRun: () => ({
                output: "Drafted.",
                card: { kind: "booking", data: { id: "b1" } },
            }),
        });
        await collect(t.turn());
        expect(t.store.finished[0]).toMatchObject({
            text: "Drafting it now.",
            outcome: "DRAFT",
        });
    });

    it("shows a status line at once, before the first round is sent", async () => {
        const t = setup({ rounds: [[text("Hi."), done()]] });
        const events = await collect(
            t.turn(),
            (e) =>
                e.type === "status" &&
                expect(t.provider.requests).toHaveLength(0),
        );
        expect(events[0]).toEqual({
            type: "status",
            tool: "start",
            words: "Aapka business dekh rahe hain…",
        });
    });

    it("shows a read's card whole under the answer and keeps it with the answer", async () => {
        const card = { kind: "table", data: { title: "Bookings" } };
        const t = setup({
            rounds: [toolRound(), [text("Three tomorrow."), done()]],
            toolRun: () => ({ output: "3 bookings tomorrow.", card }),
        });
        const events = await collect(t.turn());
        expect(events.map((e) => e.type)).toEqual([
            "status",
            "status",
            "text-delta",
            "card",
            "done",
        ]);
        expect(events[3]).toEqual({ type: "card", ...card });
        expect(t.store.finished[0]).toMatchObject({
            text: "Three tomorrow.",
            cards: [card],
            outcome: "ANSWERED",
        });
        expect(t.store.finished[0].card).toBeUndefined();
    });

    it("drops a read's card when the turn ends without text", async () => {
        const t = setup({
            rounds: [toolRound(), [done()]],
            toolRun: () => ({
                output: "3 bookings tomorrow.",
                card: { kind: "table", data: {} },
            }),
        });
        const events = await collect(t.turn());
        expect(events.some((e) => e.type === "card")).toBe(false);
        expect(t.store.finished[0].cards).toBeUndefined();
    });

    describe("guards", () => {
        it("round cap: the last round is answer-only and no round past it is sent", async () => {
            const t = setup({
                rounds: [
                    toolRound(),
                    toolRound(),
                    toolRound(),
                    [text("Here is what I found."), done()],
                    toolRound(),
                ],
            });
            const events = await collect(t.turn());
            expect(t.provider.requests).toHaveLength(4);
            expect(t.provider.requests[3].toolChoice).toBe("none");
            // Told at the tail to answer now (so it never ends silent); earlier rounds aren't.
            expect(last(t.provider.requests[3].messages)).toEqual({
                role: "user",
                text: LAST_ROUND,
            });
            expect(last(t.provider.requests[2].messages)).toMatchObject({
                role: "tool",
            });
            expect(
                t.provider.requests.slice(0, 3).map((r) => r.toolChoice),
            ).toEqual([undefined, undefined, undefined]);
            expect(last(events)).toMatchObject({
                outcome: "ANSWERED",
                counted: true,
            });
        });

        it("prompt cap: the request over it isn't sent; a trimmed answer-only round is", async () => {
            const settings = baseSettings();
            settings["askAi.maxPromptTokens"] = 1400;
            const t = setup({
                settings,
                history: [
                    { role: "user", text: "Old question" },
                    { role: "assistant", text: "o".repeat(3000) },
                ],
                rounds: [toolRound(), [text("Tomorrow: 3."), done()]],
                toolRun: () => ({ output: "b".repeat(1500) }),
            });
            const events = await collect(t.turn());
            expect(t.provider.requests).toHaveLength(2);
            const second = t.provider.requests[1];
            expect(second.toolChoice).toBe("none");
            expect(estimateTokens(second)).toBeLessThanOrEqual(1400);
            // The old exchange went; the question and the newest results stayed.
            expect(second.messages[0]).toEqual({
                role: "user",
                text: QUESTION,
            });
            expect(last(events)).toMatchObject({ outcome: "ANSWERED" });
        });

        it("prompt cap: nothing is sent when even the trimmed request is over", async () => {
            const settings = baseSettings();
            settings["askAi.maxPromptTokens"] = 1400;
            const t = setup({
                settings,
                rounds: [toolRound(), [text("never"), done()]],
                toolRun: () => ({ output: "b".repeat(6000) }),
            });
            const events = await collect(t.turn());
            expect(t.provider.requests).toHaveLength(1);
            expect(events.slice(-2)).toEqual([
                { type: "error", reason: "turn-limit" },
                expect.objectContaining({ outcome: "FAILED", counted: false }),
            ]);
        });

        it("cuts an oversized tool result with the narrow-it line", async () => {
            const settings = baseSettings();
            settings["askAi.maxToolResultChars"] = 100;
            const lines = Array.from(
                { length: 40 },
                (_, i) => `Booking ${i + 1}`,
            ).join("\n");
            const t = setup({
                settings,
                rounds: [toolRound(), [text("Many."), done()]],
                toolRun: () => ({ output: lines }),
            });
            await collect(t.turn());
            const tool = last(t.provider.requests[1].messages);
            const output = tool.role === "tool" ? tool.results[0].output : "";
            expect(output.startsWith("Booking 1\n")).toBe(true);
            expect(output).toMatch(
                /\n… \d+ more not shown; narrow it with a filter\.$/,
            );
            expect(output.length).toBeLessThan(160);
        });

        it("cost cap: no round starts once the turn has spent it", async () => {
            const settings = baseSettings();
            settings["askAi.turnCostCapMicroUsd"] = 150;
            const t = setup({
                settings,
                rounds: [toolRound(), toolRound(), [text("never"), done()]],
            });
            const events = await collect(t.turn());
            expect(t.provider.requests).toHaveLength(2);
            expect(last(events)).toMatchObject({
                outcome: "FAILED",
                counted: false,
            });
            expect(last(t.store.finished).costMicroUsd).toBe(240);
        });

        it("token cap: no round starts once the turn has used it", async () => {
            const settings = baseSettings();
            settings["askAi.turnTokenCap"] = 100;
            const t = setup({
                settings,
                rounds: [[text("Partly "), call("list_bookings"), done()], []],
            });
            const events = await collect(t.turn());
            expect(t.provider.requests).toHaveLength(1);
            // Finishes with what it has.
            expect(last(events)).toMatchObject({ outcome: "ANSWERED" });
        });
    });

    describe("switches", () => {
        it.each(["halt", "flag", "business"] as const)(
            "%s turned off mid-turn: the next round doesn't start, not counted",
            async (which) => {
                const t = setup({
                    rounds: [toolRound(), [text("never"), done()]],
                    toolRun: () => {
                        if (which === "halt") t.switches.halted = true;
                        if (which === "flag") t.switches.flag = false;
                        if (which === "business") t.switches.businessOn = false;
                        return { output: "3." };
                    },
                });
                const events = await collect(t.turn());
                expect(t.provider.requests).toHaveLength(1);
                expect(events.slice(-2)).toEqual([
                    { type: "error", reason: "unavailable" },
                    expect.objectContaining({
                        outcome: "FAILED",
                        counted: false,
                    }),
                ]);
                expect(last(t.store.finished)).toMatchObject({
                    outcome: "FAILED",
                    failureReason: "unavailable",
                });
            },
        );

        it("off at the start: nothing is sent or written", async () => {
            const t = setup({ rounds: [] });
            t.switches.halted = true;
            const events = await collect(t.turn());
            expect(events.map((e) => e.type)).toEqual(["refused", "done"]);
            expect(events[0]).toEqual({
                type: "refused",
                refusal: { reason: "unavailable" },
            });
            expect(t.store.start).not.toHaveBeenCalled();
            expect(t.provider.requests).toHaveLength(0);
        });

        it("a missing setting reads as unavailable", async () => {
            const settings = baseSettings();
            delete settings["askAi.turnCostCapMicroUsd"];
            const t = setup({ settings, rounds: [] });
            const events = await collect(t.turn());
            expect(events[0]).toEqual({ type: "error", reason: "unavailable" });
            expect(t.store.start).not.toHaveBeenCalled();
        });
    });

    describe("Stop and failures", () => {
        it("Stop before any text: STOPPED_BEFORE, not counted", async () => {
            const t = setup({
                rounds: [toolRound(), [text("never"), done()]],
                toolRun: () => {
                    t.controller.abort();
                    return { output: "3." };
                },
            });
            const events = await collect(t.turn());
            expect(last(events)).toMatchObject({
                outcome: "STOPPED_BEFORE",
                counted: false,
            });
            expect(t.provider.requests).toHaveLength(1);
            expect(last(t.store.finished).stopped).toBe(true);
        });

        it("Stop after text: STOPPED_AFTER, counted, the partial answer kept", async () => {
            const t = setup({
                rounds: [[text("Kal "), text("teen"), done()]],
            });
            const events = await collect(t.turn(), (e) => {
                if (e.type === "text-delta") t.controller.abort();
            });
            expect(last(events)).toMatchObject({
                outcome: "STOPPED_AFTER",
                counted: true,
            });
            expect(last(t.store.finished)).toMatchObject({
                text: "Kal ",
                stopped: true,
            });
        });

        it("provider fails after text: CUT_OFF, not counted", async () => {
            const t = setup({
                rounds: [
                    [text("Half"), { type: "failed", reason: "overloaded" }],
                ],
            });
            const events = await collect(t.turn());
            expect(events.slice(-2)).toEqual([
                { type: "error", reason: "provider" },
                expect.objectContaining({ outcome: "CUT_OFF", counted: false }),
            ]);
            expect(last(t.store.finished)).toMatchObject({
                text: "Half",
                failureReason: "overloaded",
            });
        });

        it("provider fails before text: FAILED, not counted", async () => {
            const t = setup({
                rounds: [
                    [{ type: "failed", reason: "rate-limited", status: 429 }],
                ],
            });
            const events = await collect(t.turn());
            expect(last(events)).toMatchObject({
                outcome: "FAILED",
                counted: false,
            });
        });
    });

    it("a model change applies to a new conversation, not an open one", async () => {
        const t = setup({ rounds: [[text("Ok"), done()]] });
        const open = await t.runner.openConversation(ctx, agent.key);
        expect(open.model).toBe("claude-haiku-5-5");
        expect(open.agentVersion).toMatch(/^[0-9a-f]{16}$/);
        t.settings["askAi.questions.model"] = "claude-sonnet-5-5";
        // The open conversation keeps the model it was stamped with.
        await collect(t.turn());
        expect(t.provider.requests[0].model).toBe("claude-haiku-5-5");
        const next = await t.runner.openConversation(ctx, agent.key);
        expect(next.model).toBe("claude-sonnet-5-5");
    });

    it("never logs the question, the answer or a tool's output", async () => {
        const lines: unknown[] = [];
        const spies = (["log", "warn", "error", "debug"] as const).map((m) =>
            jest
                .spyOn(Logger.prototype, m)
                .mockImplementation((...args: unknown[]) => {
                    lines.push(...args);
                }),
        );
        try {
            const ok = setup({
                rounds: [toolRound(), [text("Asha has 3 bookings."), done()]],
                toolRun: () => ({ output: "Asha Verma, 10:00" }),
            });
            await collect(ok.turn());
            const bad = setup({
                rounds: [[text("Asha"), { type: "failed", reason: "network" }]],
            });
            await collect(bad.turn());
        } finally {
            spies.forEach((s) => s.mockRestore());
        }
        expect(lines.length).toBeGreaterThan(0);
        const all = JSON.stringify(lines);
        expect(all).not.toContain("Asha");
        expect(all).not.toContain("Kal kitni");
        expect(all).toContain("turn=turn_1");
    });
});

describe("who may ask (plan U7)", () => {
    const member = (actions?: string[]): OrganizationContext => ({
        ...ctx,
        role: "MEMBER",
        ...(actions
            ? { actions: new Set(actions) as OrganizationContext["actions"] }
            : {}),
    });

    it("a plan without Ask AI is refused before any provider call", async () => {
        const t = setup({ rounds: [[text("never"), done()]] });
        t.switches.plan = "locked";
        const events = await collect(t.turn());
        expect(events[0]).toEqual({
            type: "refused",
            refusal: { reason: "locked", upgradeTo: "Plan B" },
        });
        expect(last(events)).toMatchObject({
            outcome: "FAILED",
            counted: false,
        });
        expect(t.provider.requests).toHaveLength(0);
        expect(t.store.start).not.toHaveBeenCalled();
    });

    it("a Member without ai:use is refused; one given it asks", async () => {
        const no = setup({
            rounds: [[text("never"), done()]],
            asker: member(),
        });
        expect((await collect(no.turn()))[0]).toEqual({
            type: "refused",
            refusal: { reason: "no-permission" },
        });
        expect(no.provider.requests).toHaveLength(0);

        const yes = setup({
            rounds: [[text("Teen."), done()]],
            asker: member(["ai:use"]),
        });
        expect(last(await collect(yes.turn()))).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
    });

    it("the business's switch off: refused, naming whom to ask", async () => {
        const t = setup({ rounds: [[text("never"), done()]] });
        t.switches.businessOn = false;
        expect((await collect(t.turn()))[0]).toEqual({
            type: "refused",
            refusal: { reason: "business-off", askName: "Meera" },
        });
        expect(t.provider.requests).toHaveLength(0);
    });

    it("the start's checks refusing: nothing sent, not counted; a full day is DAILY_LIMIT", async () => {
        const resetsAt = new Date("2026-12-01T00:00:00Z");
        const t = setup({ rounds: [[text("never"), done()]] });
        t.switches.atStart = {
            reason: "allowance",
            limit: 3,
            resetsAt,
            requestMore: true,
            askName: null,
        };
        const events = await collect(t.turn());
        expect(events[0]).toMatchObject({
            type: "refused",
            refusal: { reason: "allowance", resetsAt },
        });
        expect(last(events)).toMatchObject({ counted: false });
        expect(t.provider.requests).toHaveLength(0);
        expect(t.store.finish).not.toHaveBeenCalled();

        const day = setup({ rounds: [[text("never"), done()]] });
        day.switches.atStart = { reason: "daily-limit", scope: "business" };
        expect(last(await collect(day.turn()))).toMatchObject({
            outcome: "DAILY_LIMIT",
            counted: false,
        });
        expect(day.provider.requests).toHaveLength(0);
    });

    it("the halt beats everything else", async () => {
        const t = setup({ rounds: [[text("never"), done()]] });
        t.switches.halted = true;
        t.switches.plan = "locked";
        expect((await collect(t.turn()))[0]).toEqual({
            type: "refused",
            refusal: { reason: "unavailable" },
        });
    });
});
