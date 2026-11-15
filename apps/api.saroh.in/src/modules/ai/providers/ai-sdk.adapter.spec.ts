import { APICallError } from "ai";
import {
    convertArrayToReadableStream,
    MockLanguageModelV4,
    simulateReadableStream,
} from "ai/test";

import { AiSdkAdapter } from "./ai-sdk.adapter";
import { FakeAiProvider } from "./fake.provider";
import type { AiEvent, AiStreamRequest } from "./provider.port";

/** The model-side stream part (`@ai-sdk/provider` isn't a dependency of ours). */
type LanguageModelV4StreamPart =
    Awaited<
        ReturnType<MockLanguageModelV4["doStream"]>
    >["stream"] extends ReadableStream<infer Part>
        ? Part
        : never;

const QUESTION = "how much did Priya Sharma pay last week";

const request: AiStreamRequest = {
    model: "test-model",
    system: [
        { text: "House rules.", cache: true },
        { text: "Business block." },
    ],
    messages: [{ role: "user", text: QUESTION }],
    tools: [
        {
            name: "list_orders",
            description: "Use this when the person asks about orders.",
            inputSchema: {
                type: "object",
                properties: { status: { type: "string" } },
            },
        },
    ],
    effort: "low",
    maxTokens: 1000,
};

const usage = {
    inputTokens: { total: 1200, noCache: 200, cacheRead: 600, cacheWrite: 400 },
    outputTokens: { total: 90, text: 60, reasoning: 30 },
    raw: {
        cache_creation: {
            ephemeral_5m_input_tokens: 300,
            ephemeral_1h_input_tokens: 100,
        },
    },
};

function modelOf(parts: LanguageModelV4StreamPart[]) {
    return new MockLanguageModelV4({
        doStream: async () => ({ stream: convertArrayToReadableStream(parts) }),
    });
}

async function collect(
    adapter: AiSdkAdapter,
    signal = new AbortController().signal,
): Promise<AiEvent[]> {
    const events: AiEvent[] = [];
    for await (const event of adapter.stream(request, signal))
        events.push(event);
    return events;
}

describe("AiSdkAdapter", () => {
    it("maps the provider's stream to Saroh's events, in order", async () => {
        const model = modelOf([
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Let me " },
            { type: "text-delta", id: "t1", delta: "look." },
            { type: "text-end", id: "t1" },
            {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "list_orders",
                input: JSON.stringify({ status: "paid" }),
            },
            {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_use" },
                usage,
            },
        ]);
        const events = await collect(new AiSdkAdapter(() => model));

        expect(events).toEqual([
            { type: "text-delta", text: "Let me " },
            { type: "text-delta", text: "look." },
            {
                type: "tool-call",
                call: {
                    id: "call_1",
                    name: "list_orders",
                    input: { status: "paid" },
                },
            },
            {
                type: "finish",
                reason: "tool-calls",
                usage: {
                    inputTokens: 1200,
                    outputTokens: 90,
                    cacheReadTokens: 600,
                    cacheWriteTokens: 400,
                    cacheWrite5mTokens: 300,
                    cacheWrite1hTokens: 100,
                    thinkingTokens: 30,
                },
            },
        ]);
        // The breakpoint after the cached system part reaches the provider.
        const sent = model.doStreamCalls[0]!;
        expect(sent.prompt[0]).toMatchObject({
            role: "system",
            providerOptions: {
                anthropic: { cacheControl: { type: "ephemeral" } },
            },
        });
        expect(sent.prompt[1]?.providerOptions).toBeUndefined();
        expect(sent.maxOutputTokens).toBe(1000);
        expect(sent.providerOptions).toMatchObject({
            anthropic: { effort: "low" },
        });
        expect(sent.tools?.map((tool) => tool.name)).toEqual(["list_orders"]);
    });

    it("ends at once when the signal fires", async () => {
        const model = new MockLanguageModelV4({
            doStream: async () => ({
                stream: simulateReadableStream<LanguageModelV4StreamPart>({
                    chunkDelayInMs: 20,
                    chunks: [
                        { type: "text-start", id: "t1" },
                        ...Array.from({ length: 50 }, () => ({
                            type: "text-delta" as const,
                            id: "t1",
                            delta: "word ",
                        })),
                        { type: "text-end", id: "t1" },
                        {
                            type: "finish",
                            finishReason: { unified: "stop", raw: "end_turn" },
                            usage,
                        },
                    ],
                }),
            }),
        });
        const controller = new AbortController();
        const events: AiEvent[] = [];
        const started = Date.now();
        for await (const event of new AiSdkAdapter(() => model).stream(
            request,
            controller.signal,
        )) {
            events.push(event);
            if (events.length === 2) controller.abort();
        }

        expect(events.at(-1)).toEqual({ type: "aborted" });
        expect(events.filter((e) => e.type === "text-delta")).toHaveLength(2);
        expect(events.some((e) => e.type === "finish")).toBe(false);
        // Far less than the 50 chunks' second the full answer would take.
        expect(Date.now() - started).toBeLessThan(500);
    });

    it("says not configured, without calling anyone, when there is no key", async () => {
        await expect(collect(new AiSdkAdapter(() => null))).resolves.toEqual([
            { type: "failed", reason: "not-configured" },
        ]);
    });

    describe("a provider error never carries the question out", () => {
        const consoleSpies: jest.SpyInstance[] = [];
        beforeEach(() => {
            for (const level of ["error", "warn", "log", "info"] as const) {
                consoleSpies.push(
                    jest.spyOn(console, level).mockImplementation(() => {}),
                );
            }
        });
        afterEach(() => {
            for (const spy of consoleSpies.splice(0)) spy.mockRestore();
        });

        function expectNoQuestion(events: AiEvent[]) {
            expect(JSON.stringify(events)).not.toContain("Priya");
            for (const spy of consoleSpies) {
                expect(JSON.stringify(spy.mock.calls)).not.toContain("Priya");
            }
        }

        it("a refused call becomes a reason and a status", async () => {
            const model = new MockLanguageModelV4({
                doStream: async () => {
                    throw new APICallError({
                        message: `overloaded while answering: ${QUESTION}`,
                        url: "https://provider.example/v1/messages",
                        requestBodyValues: {
                            messages: [{ content: QUESTION }],
                        },
                        statusCode: 529,
                        responseBody: JSON.stringify({ echo: QUESTION }),
                        isRetryable: false,
                    });
                },
            });
            const events = await collect(new AiSdkAdapter(() => model));

            expect(events).toEqual([
                { type: "failed", reason: "overloaded", status: 529 },
            ]);
            expectNoQuestion(events);
        });

        it("an error in the middle of the stream ends it the same way", async () => {
            const model = modelOf([
                { type: "text-start", id: "t1" },
                { type: "text-delta", id: "t1", delta: "Working" },
                {
                    type: "error",
                    error: {
                        type: "error",
                        error: {
                            type: "api_error",
                            message: `failed on ${QUESTION}`,
                        },
                    },
                },
            ]);
            const events = await collect(new AiSdkAdapter(() => model));

            expect(events).toEqual([
                { type: "text-delta", text: "Working" },
                { type: "failed", reason: "server-error" },
            ]);
            expectNoQuestion(events);
        });

        it("an error thrown with a cause still leaves nothing behind", async () => {
            const model = new MockLanguageModelV4({
                doStream: async () => {
                    throw new Error(QUESTION, { cause: new Error(QUESTION) });
                },
            });
            const events = await collect(new AiSdkAdapter(() => model));

            expect(events).toEqual([{ type: "failed", reason: "unknown" }]);
            expectNoQuestion(events);
        });
    });
});

describe("FakeAiProvider", () => {
    it("plays its rounds in order and records what it was asked", async () => {
        const fake = new FakeAiProvider([
            [{ type: "text-delta", text: "One" }],
            [{ type: "text-delta", text: "Two" }],
        ]);
        const signal = new AbortController().signal;
        const first: AiEvent[] = [];
        for await (const event of fake.stream(request, signal))
            first.push(event);
        const second: AiEvent[] = [];
        for await (const event of fake.stream(request, signal))
            second.push(event);

        expect(first).toEqual([{ type: "text-delta", text: "One" }]);
        expect(second).toEqual([{ type: "text-delta", text: "Two" }]);
        expect(fake.requests).toHaveLength(2);
    });

    it("stops when the signal fires", async () => {
        const fake = new FakeAiProvider([
            [
                { type: "text-delta", text: "a" },
                { type: "text-delta", text: "b" },
            ],
        ]);
        const controller = new AbortController();
        const events: AiEvent[] = [];
        for await (const event of fake.stream(request, controller.signal)) {
            events.push(event);
            controller.abort();
        }
        expect(events).toEqual([
            { type: "text-delta", text: "a" },
            { type: "aborted" },
        ]);
    });
});
