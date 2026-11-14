import type { RunMarks } from "../../../common/test-run";
import { isTestRun } from "../../../common/test-run";
import type {
    AiEvent,
    AiProvider,
    AiStreamRequest,
    AiUsage,
} from "./provider.port";

/**
 * The test-only switch that answers Ask AI from a script instead of a
 * model (`e2e/tests/ask-ai.spec.ts`): `AI_PROVIDER_FAKE=1` binds
 * {@link ScriptedAiProvider} in `ai.module.ts`, so the browser-test stack
 * asks, streams, stops and drafts without calling Anthropic.
 *
 * Two locks, as `STRIPE_FAKE` has: the API refuses to boot with it under
 * NODE_ENV=production (`env.ts`), and it is honoured only in a test run
 * (`common/test-run.ts`).
 */
export function aiProviderFakeAllowed(
    value: string | undefined,
    run: RunMarks,
): boolean {
    return value === "1" && isTestRun(run);
}

/** One scripted answer: an optional tool first, then text. */
interface Line {
    match: RegExp;
    tool?: (m: RegExpMatchArray) => { name: string; input: unknown };
    text: string;
    /** Wait before the first word, so Stop can be pressed before any. */
    waitMs?: number;
}

/** Keyed by the question as the spec types it; anything else gets {@link OTHERWISE}. */
export const FAKE_SCRIPT: readonly Line[] = [
    {
        match: /^How many bookings this week\?$/i,
        tool: () => ({
            name: "get_business_summary",
            input: { period: "this_week" },
        }),
        text: "Here are your bookings this week, from the business summary.",
    },
    { match: /^Stop test$/i, waitMs: 60_000, text: "Too late to stop." },
    {
        // "in <location id>": a business with several locations must name one
        // (`ProductAccess.storefrontFor`), as seeded Northwind has.
        match: /^Add a product called (.+) at (\d+)(?: in (\S+))?$/i,
        tool: (m) => ({
            name: "create_product",
            input: {
                name: m[1],
                price: Number(m[2]),
                ...(m[3] ? { storefront_id: m[3] } : {}),
            },
        }),
        // Not reached: a draft ends the turn with its card.
        text: "The draft is above.",
    },
    {
        match: /^Show me a picture$/i,
        text: "Here: ![a picture](https://example.com/p.png) and [a link](https://example.com).",
    },
];

const OTHERWISE = "This is a test answer.";

/** How the turn runner starts a note of its own (`withLanguageTail`, `LAST_ROUND`). */
const NOTE = "(From Saroh, not the person:";

/** After a tool's result: long enough for the status line to be seen. */
const AFTER_TOOL_MS = 1_500;
const WORD_MS = 40;

const USAGE: AiUsage = {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    thinkingTokens: 0,
};

/** Resolves after `ms`, or at once when the signal fires. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((done) => {
        // Stop can land before the wait starts (between the runner's checks).
        if (signal.aborted) return done();
        const timer = setTimeout(done, ms);
        signal.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                done();
            },
            { once: true },
        );
    });
}

export class ScriptedAiProvider implements AiProvider {
    async *stream(
        request: AiStreamRequest,
        signal: AbortSignal,
    ): AsyncIterable<AiEvent> {
        // The person's words: Saroh's own notes (the language tail on the
        // question, the last-round message) are not part of what the spec typed.
        const said = [...request.messages]
            .reverse()
            .flatMap((m) => (m.role === "user" ? [m.text] : []))
            .find((text) => !text.startsWith(NOTE));
        const question = (said?.split(NOTE)[0] ?? "").trim();
        let line: Line | undefined;
        let m: RegExpMatchArray | null = null;
        for (const l of FAKE_SCRIPT) {
            m = question.match(l.match);
            if (m) {
                line = l;
                break;
            }
        }
        const afterTool = request.messages
            .slice(-1)
            .some((m) => m.role === "tool");

        if (line?.tool && m && !afterTool && request.toolChoice !== "none") {
            const { name, input } = line.tool(m);
            yield {
                type: "tool-call",
                call: { id: `fake-${Date.now()}`, name, input },
            };
            yield { type: "finish", reason: "tool-calls", usage: USAGE };
            return;
        }

        await wait(afterTool ? AFTER_TOOL_MS : (line?.waitMs ?? 0), signal);
        const text = line?.text ?? OTHERWISE;
        for (const word of text.split(/(?<= )/)) {
            if (signal.aborted) {
                yield { type: "aborted" };
                return;
            }
            yield { type: "text-delta", text: word };
            await wait(WORD_MS, signal);
        }
        if (signal.aborted) {
            yield { type: "aborted" };
            return;
        }
        yield { type: "finish", reason: "stop", usage: USAGE };
    }
}
