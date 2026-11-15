/**
 * Ask AI's panel routes against a real Postgres (plan 2026-11-13-001 U9):
 * a question's server-sent events in order with the fake provider; Stop
 * before and after text; a reader that goes away doesn't stop the turn;
 * a provider failure mid-answer is cut off; everything is the asker's own
 * (404 otherwise); the person's language reaches the status words; a
 * support session is refused; a Free business is refused before anything
 * is sent.
 *
 * Runs in the integration project (TEST_DATABASE_URL). The settings are
 * this business's overrides; the numbers are test values, not Saroh's.
 * The controller is called directly with a stand-in response, so what it
 * writes, and when, is what's checked.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import type { Response } from "express";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import { meterWindow } from "../billing/metering";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { AskAiAccess } from "./access/ask-ai-access";
import { statusWordsFor } from "./agents/agent-definition";
import { ASK_AI_AGENT } from "./agents/ask-ai.agent";
import { AskAiController } from "./ask-ai.controller";
import { AskAiService } from "./ask-ai.service";
import { ConversationsService } from "./conversations.service";
import { FakeAiProvider } from "./providers/fake.provider";
import type { AiEvent } from "./providers/provider.port";
import { AiSettingsService } from "./settings/ai-settings.service";
import type { AiToolbox } from "./tools/toolbox.port";
import { TurnRegistry } from "./turn/turn-registry";
import { TurnRunner } from "./turn/turn-runner";
import { TurnStore } from "./turn/turn-store";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const keyBefore = mutableEnv.AI_TEXT_ENC_KEY;

const settings = new AiSettingsService();
const conversations = new ConversationsService();
const store = new TurnStore(conversations);
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const actor = { userId: "user_test_settings" };
let planState: "on" | "off" = "on";
const access = new AskAiAccess(settings, flags, store, {
    resolve: () =>
        Promise.resolve({
            source: "catalogue",
            modules: [
                {
                    moduleId: "ask-ai",
                    state: planState,
                    limit: null,
                    upgradeTo: "grow",
                },
            ],
        }),
} as unknown as CatalogueAccessService);

const TOOL = "get_business_summary";
/** One read tool that always answers, so a turn shows its status words. */
const toolbox: AiToolbox = {
    definitions: (names) =>
        names
            .filter((n) => n === TOOL)
            .map((name) => ({ name, description: "test", inputSchema: {} })),
    run: () => Promise.resolve({ output: "Three bookings tomorrow." }),
};

let seq = 0;
const uniq = (label: string) => `${label}-${process.pid}-${++seq}`;
const usage = {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
};
const finish: AiEvent = { type: "finish", reason: "stop", usage };
const text = (t: string): AiEvent => ({ type: "text-delta", text: t });

function build(rounds: AiEvent[][]) {
    const provider = new FakeAiProvider(rounds);
    const runner = new TurnRunner(
        provider,
        toolbox,
        [ASK_AI_AGENT],
        settings,
        flags,
        store,
        access,
    );
    const service = new AskAiService(
        runner,
        new TurnRegistry(),
        access,
        store,
        conversations,
    );
    return { provider, controller: new AskAiController(service) };
}

interface Frame {
    event: string;
    data: Record<string, unknown>;
}

/** A stand-in for Express's response: records headers and frames, and can go away. */
class FakeResponse extends EventEmitter {
    headers: Record<string, string> = {};
    statusCode = 0;
    flushed = false;
    writableEnded = false;
    chunks: string[] = [];
    /** Called with each frame as it is written. */
    onFrame?: (frame: Frame) => void | Promise<void>;
    status(code: number) {
        this.statusCode = code;
        return this;
    }
    setHeader(name: string, value: string) {
        this.headers[name] = value;
    }
    flushHeaders() {
        this.flushed = true;
    }
    write(chunk: string) {
        this.chunks.push(chunk);
        const frame = parse(chunk)[0];
        if (frame) void this.onFrame?.(frame);
        return true;
    }
    end() {
        this.writableEnded = true;
    }
    /** The browser went away. */
    leave() {
        this.emit("close");
    }
    frames(): Frame[] {
        return parse(this.chunks.join(""));
    }
}

function parse(raw: string): Frame[] {
    return raw
        .split("\n\n")
        .filter((block) => block.startsWith("event:"))
        .map((block) => {
            const [eventLine = "", dataLine = ""] = block.split("\n");
            return {
                event: eventLine.slice("event: ".length),
                data: JSON.parse(dataLine.slice("data: ".length)) as Record<
                    string,
                    unknown
                >,
            };
        });
}

async function ask(
    controller: AskAiController,
    ctx: OrganizationContext,
    question: string,
    opts: {
        conversationId?: string;
        session?: string;
        res?: FakeResponse;
    } = {},
) {
    const res = opts.res ?? new FakeResponse();
    await controller.turn(
        ctx,
        opts.session,
        {
            question,
            ...(opts.conversationId
                ? { conversationId: opts.conversationId }
                : {}),
        },
        res as unknown as Response,
    );
    return res;
}

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("ask-org") },
    });
    const person = async (role: "OWNER" | "ADMIN") => {
        const user = await prisma.user.create({
            data: { email: `${uniq("ask-user")}@example.test`, name: role },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: user.id, role },
        });
        return { organizationId: org.id, userId: user.id, role } as const;
    };
    const owner: OrganizationContext = await person("OWNER");
    const admin: OrganizationContext = await person("ADMIN");
    await configure(org.id);
    return { org: org.id, owner, admin };
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
                input: 1,
                output: 1,
                cacheRead: 1,
                cacheWrite5m: 1,
                cacheWrite1h: 1,
            },
        },
    };
    for (const [key, value] of Object.entries(values)) {
        await settings.setOverride(org, key, value, "ask-ai spec", actor, {
            effectiveFrom: new Date(Date.now() - 1000),
        });
    }
    await settings.set(
        "ai.sarohDayCostCapMicroUsd",
        1_000_000_000_000,
        "ask-ai spec",
        actor,
        new Date(Date.now() - 1000),
    );
}

const turnOf = (res: FakeResponse) =>
    res.frames()[0]?.data as { turnId: string; conversationId: string | null };

const usageRow = (turnId: string) =>
    prisma.aiUsage.findUniqueOrThrow({ where: { turnId } });

/** Waits for the runner's save after the stream ended (the save is awaited before `done`). */
const answerOf = async (ctx: OrganizationContext, conversationId: string) => {
    const view = await conversations.get(ctx, conversationId);
    return view.messages.filter((m) => m.role === "ASSISTANT");
};

beforeAll(() => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.AI_TEXT_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = keyBefore;
});
beforeEach(() => {
    planState = "on";
});

describe("a question's stream", () => {
    it("sends turn, the text, then done, as server-sent events", async () => {
        const b = await business();
        const { controller } = build([[text("Kal "), text("teen."), finish]]);
        const res = await ask(controller, b.owner, "Kal kitni bookings?");

        expect(res.statusCode).toBe(200);
        expect(res.flushed).toBe(true);
        expect(res.headers).toMatchObject({
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            "x-accel-buffering": "no",
        });
        expect(res.writableEnded).toBe(true);
        const frames = res.frames();
        // The "start" status goes out at once, before the first round.
        expect(frames.map((f) => f.event)).toEqual([
            "turn",
            "status",
            "text-delta",
            "text-delta",
            "done",
        ]);
        expect(frames[0]?.data.conversationId).toEqual(expect.any(String));
        expect(frames[4]?.data).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
            turnId: turnOf(res).turnId,
        });
    });

    it("Stop before any text: stopped, not counted", async () => {
        const b = await business();
        const { controller } = build([[text("never"), finish]]);
        const res = new FakeResponse();
        let stopped: unknown;
        res.onFrame = async (f) => {
            if (f.event === "turn") {
                stopped = await controller.stop(
                    b.owner,
                    undefined,
                    f.data.turnId as string,
                );
            }
        };
        await ask(controller, b.owner, "Kuch bhi?", { res });

        expect(stopped).toEqual({ stopped: true });
        const row = await usageRow(turnOf(res).turnId);
        expect(row).toMatchObject({
            outcome: "STOPPED_BEFORE",
            counted: false,
            stopped: true,
        });
        expect(res.frames().some((f) => f.event === "text-delta")).toBe(false);
    });

    it("Stop after text: counted, with the text so far saved", async () => {
        const b = await business();
        const { controller } = build([
            [text("Pehla hissa. "), text("Doosra hissa."), finish],
        ]);
        const res = new FakeResponse();
        res.onFrame = (f) => {
            if (f.event === "text-delta") {
                void controller.stop(b.owner, undefined, turnOf(res).turnId);
            }
        };
        await ask(controller, b.owner, "Batao?", { res });

        const { turnId, conversationId } = turnOf(res);
        expect(await usageRow(turnId)).toMatchObject({
            outcome: "STOPPED_AFTER",
            counted: true,
        });
        const [answer] = await answerOf(b.owner, conversationId as string);
        expect(answer?.text).toBe("Pehla hissa. ");
    });

    it("a reader that goes away doesn't stop the turn: it is answered and saved", async () => {
        const b = await business();
        const { controller } = build([
            [text("Ek. "), text("Do. "), text("Teen."), finish],
        ]);
        const res = new FakeResponse();
        res.onFrame = (f) => {
            if (f.event === "text-delta") res.leave();
        };
        await ask(controller, b.owner, "Gino?", { res });

        // Nothing written after the reader left.
        expect(res.frames().map((f) => f.event)).toEqual([
            "turn",
            "status",
            "text-delta",
        ]);
        const { turnId, conversationId } = turnOf(res);
        expect(await usageRow(turnId)).toMatchObject({
            outcome: "ANSWERED",
            counted: true,
        });
        const [answer] = await answerOf(b.owner, conversationId as string);
        expect(answer?.text).toBe("Ek. Do. Teen.");
    });

    it("a provider failure mid-answer is cut off, not counted", async () => {
        const b = await business();
        const { controller } = build([
            [text("Aadha "), { type: "failed", reason: "overloaded" }],
        ]);
        const res = await ask(controller, b.owner, "Sab batao");

        const frames = res.frames();
        expect(frames.slice(-2)).toEqual([
            { event: "error", data: { type: "error", reason: "provider" } },
            expect.objectContaining({
                event: "done",
                data: expect.objectContaining({
                    outcome: "CUT_OFF",
                    counted: false,
                }),
            }),
        ]);
        expect(await usageRow(turnOf(res).turnId)).toMatchObject({
            outcome: "CUT_OFF",
            counted: false,
        });
    });

    it("says the status words in the person's language", async () => {
        const b = await business();
        await build([]).controller.setLanguage(b.owner, undefined, {
            language: "HINDI",
        });
        const { controller } = build([
            [
                {
                    type: "tool-call",
                    call: { id: "c1", name: TOOL, input: {} },
                },
                finish,
            ],
            [text("Teen bookings."), finish],
        ]);
        const res = await ask(controller, b.owner, "Kaisa chal raha hai?");

        // The first status is the "start" line; the tool's own words follow it.
        const status = res
            .frames()
            .find((f) => f.event === "status" && f.data.tool === TOOL);
        const hindi = statusWordsFor(ASK_AI_AGENT, TOOL, "HINDI");
        expect(hindi).not.toBe(statusWordsFor(ASK_AI_AGENT, TOOL, "ENGLISH"));
        expect(status?.data).toEqual({
            type: "status",
            tool: TOOL,
            words: hindi,
        });
        expect(await controller.language(b.owner)).toEqual({
            language: "HINDI",
        });
    });

    it("refuses a Free business before anything is sent or opened", async () => {
        const b = await business();
        planState = "off";
        const { controller, provider } = build([[text("no"), finish]]);
        const res = await ask(controller, b.owner, "Kuch?");

        expect(res.frames()).toEqual([
            {
                event: "turn",
                data: {
                    type: "turn",
                    turnId: expect.any(String),
                    conversationId: null,
                },
            },
            {
                event: "refused",
                data: {
                    type: "refused",
                    refusal: { reason: "locked", upgradeTo: "grow" },
                },
            },
            expect.objectContaining({
                event: "done",
                data: expect.objectContaining({ counted: false }),
            }),
        ]);
        expect(provider.requests).toHaveLength(0);
        expect(
            await prisma.aiConversation.count({
                where: { organizationId: b.org },
            }),
        ).toBe(0);
        // History and the panel's state still answer.
        expect(
            (await controller.conversations(b.owner, undefined, {})).data,
        ).toEqual([]);
        expect(await controller.state(b.owner, undefined)).toMatchObject({
            available: false,
            reason: "locked",
            upgradeTo: "grow",
        });
    });
});

describe("the asker's own only", () => {
    it("another member's conversation is a 404, to read or to continue", async () => {
        const b = await business();
        const { controller } = build([[text("Haan."), finish]]);
        const res = await ask(controller, b.owner, "Mera sawaal");
        const { conversationId } = turnOf(res);

        await expect(
            controller.conversation(
                b.admin,
                undefined,
                conversationId as string,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            ask(controller, b.admin, "Uska?", {
                conversationId: conversationId as string,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            (await controller.conversations(b.admin, undefined, {})).data,
        ).toEqual([]);
        const own = await controller.conversations(b.owner, undefined, {});
        expect(own.data.map((c) => c.id)).toEqual([conversationId]);
        expect(own.nextCursor).toBeNull();
        const read = await controller.conversation(
            b.owner,
            undefined,
            conversationId as string,
        );
        expect(read.messages.map((m) => [m.role, m.text])).toEqual([
            ["USER", "Mera sawaal"],
            ["ASSISTANT", "Haan."],
        ]);
    });

    it("continuing a conversation under another business is a 404", async () => {
        const a = await business();
        const other = await prisma.organization.create({
            data: { name: "Other", slug: uniq("ask-other") },
        });
        await prisma.membership.create({
            data: {
                organizationId: other.id,
                userId: a.owner.userId,
                role: "OWNER",
            },
        });
        const { controller } = build([[text("Haan."), finish]]);
        const res = await ask(controller, a.owner, "Pehla");
        const elsewhere: OrganizationContext = {
            ...a.owner,
            organizationId: other.id,
        };
        await expect(
            ask(controller, elsewhere, "Doosra", {
                conversationId: turnOf(res).conversationId as string,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("Stop on another member's turn is a 404, and the turn runs on", async () => {
        const b = await business();
        const { controller } = build([[text("Ek. "), text("Do."), finish]]);
        const res = new FakeResponse();
        let refused: unknown;
        res.onFrame = async (f) => {
            if (f.event === "turn") {
                refused = await controller
                    .stop(b.admin, undefined, f.data.turnId as string)
                    .catch((e: unknown) => e);
            }
        };
        await ask(controller, b.owner, "Gino", { res });

        expect(refused).toBeInstanceOf(NotFoundException);
        expect(await usageRow(turnOf(res).turnId)).toMatchObject({
            outcome: "ANSWERED",
        });
        // Their own, already ended: nothing to stop, not a 404.
        expect(
            await controller.stop(b.owner, undefined, turnOf(res).turnId),
        ).toEqual({ stopped: false });
    });

    it("refuses a staff support session: no question, no history", async () => {
        const b = await business();
        const { controller, provider } = build([[text("no"), finish]]);
        await expect(
            ask(controller, b.owner, "Kuch?", { session: "access-session-id" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(() =>
            controller.conversations(b.owner, "access-session-id", {}),
        ).toThrow(ForbiddenException);
        expect(provider.requests).toHaveLength(0);
    });
});

describe("the business's switch", () => {
    it("Owner turns it off; questions are refused, history still reads", async () => {
        const b = await business();
        const { controller } = build([[text("Haan."), finish]]);
        await ask(controller, b.owner, "Pehle");

        expect(
            await controller.setSettings(b.owner, undefined, { on: false }),
        ).toEqual({
            on: false,
            usage: { used: 1, limit: null, resetsAt: expect.any(String) },
        });
        // The total stays with the switch off.
        expect(await controller.settings(b.owner)).toEqual({
            on: false,
            usage: { used: 1, limit: null, resetsAt: expect.any(String) },
        });
        const res = await ask(controller, b.owner, "Ab?");
        expect(res.frames()[1]?.data).toMatchObject({
            type: "refused",
            refusal: { reason: "business-off" },
        });
        expect(
            (await controller.conversations(b.owner, undefined, {})).data,
        ).toHaveLength(1);
    });

    it("a Member can't turn it", async () => {
        const b = await business();
        const member: OrganizationContext = { ...b.admin, role: "MEMBER" };
        const { controller } = build([]);
        await expect(
            controller.setSettings(member, undefined, { on: false }),
        ).rejects.toThrow();
    });
});

describe("who asked this period", () => {
    /** A usage row for `ctx`, as the access spec writes them. */
    async function asked(
        ctx: OrganizationContext,
        over: { counted?: boolean; running?: boolean; startedAt?: Date } = {},
    ) {
        const startedAt = over.startedAt ?? new Date(Date.now() - 60_000);
        const window = await meterWindow(prisma, ctx.organizationId, startedAt);
        const running = over.running ?? false;
        await prisma.aiUsage.create({
            data: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                turnId: randomUUID(),
                agent: "ask-ai",
                agentVersion: "v",
                model: "claude-haiku-5-5",
                effort: "low",
                windowStart: window.start,
                windowKey: window.key,
                startedAt,
                outcome: running ? "RUNNING" : "ANSWERED",
                finishedAt: running ? null : startedAt,
                counted: running ? false : (over.counted ?? true),
            },
        });
        return startedAt;
    }

    it("counts each person's questions in the period, every member listed, no text", async () => {
        const b = await business();
        const memberUser = await prisma.user.create({
            data: { email: `${uniq("ask-user")}@example.test`, name: "Neha" },
        });
        await prisma.membership.create({
            data: {
                organizationId: b.org,
                userId: memberUser.id,
                role: "MEMBER",
            },
        });
        const window = await meterWindow(prisma, b.org, new Date());

        await asked(b.owner);
        const latest = await asked(b.owner);
        await asked(b.owner, {
            running: true,
            startedAt: new Date(latest.getTime() - 1),
        });
        await asked(b.owner, { counted: false }); // a refusal: not counted
        // Before the period: not counted.
        await asked(b.owner, {
            startedAt: new Date(window.start.getTime() - 60_000),
        });
        await asked(b.admin);
        // Another business's question: not here.
        const other = await business();
        await asked(other.owner);

        const { controller } = build([]);
        const out = await controller.peopleUsage(b.owner, undefined);
        expect(out.resetsAt).toBe(window.end.toISOString());
        expect(out.periodStart).toBe(window.start.toISOString());
        const byUser = new Map(out.people.map((p) => [p.userId, p]));
        expect(out.people).toHaveLength(3);
        expect(byUser.get(b.owner.userId)).toEqual({
            userId: b.owner.userId,
            name: "OWNER",
            role: "Owner",
            givenAskAi: false,
            canUse: true,
            questions: 3,
            lastAskedAt: latest.toISOString(),
        });
        expect(byUser.get(b.admin.userId)).toMatchObject({ questions: 1 });
        expect(byUser.get(memberUser.id)).toMatchObject({
            role: "Member",
            canUse: false,
            questions: 0,
            lastAskedAt: null,
        });
        expect(byUser.has(other.owner.userId)).toBe(false);
        // Counts only: no question, answer or title anywhere in it.
        expect(Object.keys(out).sort()).toEqual([
            "people",
            "periodStart",
            "resetsAt",
        ]);
        for (const p of out.people) {
            expect(Object.keys(p).sort()).toEqual([
                "canUse",
                "givenAskAi",
                "lastAskedAt",
                "name",
                "questions",
                "role",
                "userId",
            ]);
        }
    });

    it("a Member can't read it", async () => {
        const b = await business();
        const member: OrganizationContext = { ...b.admin, role: "MEMBER" };
        const { controller } = build([]);
        await expect(
            controller.peopleUsage(member, undefined),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("refuses a staff support session", async () => {
        const b = await business();
        const { controller } = build([]);
        expect(() =>
            controller.peopleUsage(b.owner, "access-session-id"),
        ).toThrow(ForbiddenException);
    });

    it("keeps no total when the plan doesn't include Ask AI", async () => {
        const b = await business();
        planState = "off";
        const { controller } = build([]);
        expect(await controller.settings(b.owner)).toEqual({
            on: true,
            usage: null,
        });
    });
});
