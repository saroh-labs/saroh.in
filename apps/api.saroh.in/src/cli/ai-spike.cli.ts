/**
 * The AI SDK spike (DEC-220, plan 2026-11-13-001 U2): run by hand, with a
 * real `ANTHROPIC_API_KEY` in the API's environment, to prove the provider
 * port works against Anthropic before anything leans on it.
 *
 *     pnpm --filter @saroh/api exec tsx src/cli/ai-spike.cli.ts [model id]
 *
 * Three checks, through `AiSdkAdapter` exactly as the app will call it:
 *   1. cache: two identical calls with a breakpoint after a long system
 *      part; the second must report cache reads;
 *   2. tools: the model asks for a tool, gets its result, and answers;
 *   3. abort: the signal fired mid-answer ends the stream at once.
 *
 * It prints pass or fail and token counts only, never a prompt or an
 * answer. Exit 1 when a check fails. Not wired into the app or CI: it costs
 * a little money each run. The model defaults to Haiku 5.5.
 */
import { AiSdkAdapter } from "../modules/ai/providers/ai-sdk.adapter";
import type {
    AiEvent,
    AiStreamRequest,
    AiUsage,
} from "../modules/ai/providers/provider.port";

const TAG = "[ai-spike]";
const MODEL = process.argv[2] ?? "claude-haiku-5-5";
const adapter = new AiSdkAdapter();

/**
 * Made-up stock rows, long enough to pass any current model's minimum
 * cacheable prefix (up to 4,096 tokens) with room to spare.
 */
const LONG_SYSTEM = [
    "You are a test assistant for a made-up shop. Reply in one short sentence.",
    "The shop's stock list follows; it is test data only.",
    ...Array.from(
        { length: 400 },
        (_, i) =>
            `Item ${i + 1}: sample product ${i + 1}, shelf ${(i % 40) + 1}, colour ${["red", "blue", "green", "black"][i % 4]}.`,
    ),
].join("\n");

const base = (over: Partial<AiStreamRequest>): AiStreamRequest => ({
    model: MODEL,
    system: [{ text: LONG_SYSTEM, cache: true }],
    messages: [{ role: "user", text: "Which shelf is item 7 on?" }],
    tools: [],
    effort: "low",
    maxTokens: 400,
    ...over,
});

async function run(
    request: AiStreamRequest,
    signal = new AbortController().signal,
    onEvent?: (event: AiEvent) => void,
): Promise<AiEvent[]> {
    const events: AiEvent[] = [];
    for await (const event of adapter.stream(request, signal)) {
        events.push(event);
        onEvent?.(event);
    }
    return events;
}

function usageOf(events: AiEvent[]): AiUsage | undefined {
    const finish = events.find((e) => e.type === "finish");
    return finish?.type === "finish" ? finish.usage : undefined;
}

function failureOf(events: AiEvent[]): string | undefined {
    const failed = events.find((e) => e.type === "failed");
    return failed?.type === "failed"
        ? `${failed.reason}${failed.status ? ` ${failed.status}` : ""}`
        : undefined;
}

function counts(usage: AiUsage | undefined): string {
    if (!usage) return "no usage";
    return [
        `in ${usage.inputTokens}`,
        `out ${usage.outputTokens}`,
        `cache read ${usage.cacheReadTokens}`,
        `cache write ${usage.cacheWriteTokens}`,
        `(5m ${usage.cacheWrite5mTokens ?? "-"}, 1h ${usage.cacheWrite1hTokens ?? "-"})`,
        `thinking ${usage.thinkingTokens}`,
    ].join(", ");
}

async function checkCache(): Promise<boolean> {
    const first = await run(base({}));
    const second = await run(base({}));
    const failed = failureOf(first) ?? failureOf(second);
    const read = usageOf(second)?.cacheReadTokens ?? 0;
    const pass = !failed && read > 0;
    console.info(
        `${TAG} cache: ${pass ? "PASS" : "FAIL"}${failed ? ` (${failed})` : ""}`,
    );
    console.info(`${TAG}   first:  ${counts(usageOf(first))}`);
    console.info(`${TAG}   second: ${counts(usageOf(second))}`);
    return pass;
}

async function checkTools(): Promise<boolean> {
    const tools = [
        {
            name: "count_today_orders",
            description:
                "Use this when the person asks how many orders the shop had today. Takes no input.",
            inputSchema: { type: "object", properties: {} },
        },
    ];
    const ask = base({
        tools,
        messages: [
            {
                role: "user",
                text: "How many orders did the shop have today? Use the tool.",
            },
        ],
    });
    const first = await run(ask);
    const call = first.find((e) => e.type === "tool-call");
    if (call?.type !== "tool-call") {
        console.info(
            `${TAG} tools: FAIL (no tool call${failureOf(first) ? `, ${failureOf(first)}` : ""})`,
        );
        return false;
    }
    const second = await run({
        ...ask,
        messages: [
            ...ask.messages,
            { role: "assistant", toolCalls: [call.call] },
            {
                role: "tool",
                results: [
                    {
                        toolCallId: call.call.id,
                        toolName: call.call.name,
                        output: "Orders today: 12.",
                    },
                ],
            },
        ],
    });
    const finish = second.find((e) => e.type === "finish");
    const answered = second.some((e) => e.type === "text-delta");
    const pass =
        answered && finish?.type === "finish" && finish.reason === "stop";
    console.info(
        `${TAG} tools: ${pass ? "PASS" : "FAIL"}${failureOf(second) ? ` (${failureOf(second)})` : ""}`,
    );
    console.info(`${TAG}   call:   ${counts(usageOf(first))}`);
    console.info(`${TAG}   answer: ${counts(usageOf(second))}`);
    return pass;
}

async function checkAbort(): Promise<boolean> {
    const controller = new AbortController();
    let abortedAt = 0;
    const events = await run(
        base({
            maxTokens: 2000,
            messages: [
                {
                    role: "user",
                    text: "List every item in the stock list with its shelf, one per line.",
                },
            ],
        }),
        controller.signal,
        (event) => {
            if (event.type === "text-delta" && !abortedAt) {
                abortedAt = Date.now();
                controller.abort();
            }
        },
    );
    const endedIn = abortedAt ? Date.now() - abortedAt : -1;
    const last = events[events.length - 1] as AiEvent | undefined;
    const pass = abortedAt > 0 && last?.type === "aborted" && endedIn < 1000;
    console.info(
        `${TAG} abort: ${pass ? "PASS" : "FAIL"} (ended ${endedIn} ms after the signal${failureOf(events) ? `, ${failureOf(events)}` : ""})`,
    );
    return pass;
}

async function main(): Promise<void> {
    console.info(`${TAG} model ${MODEL}`);
    const results = [
        await checkCache(),
        await checkTools(),
        await checkAbort(),
    ];
    const passed = results.filter(Boolean).length;
    console.info(`${TAG} ${passed} of ${results.length} checks passed`);
    process.exit(passed === results.length ? 0 : 1);
}

void main().catch(() => {
    // Never print the error: the SDK's carry the request body.
    console.info(`${TAG} crashed`);
    process.exit(1);
});
