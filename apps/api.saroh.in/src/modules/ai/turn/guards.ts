import type { AiMessage, AiUsage } from "../providers/provider.port";
import type { AiModelId, AiSettingValue } from "../settings/ai-setting-keys";

/**
 * The money and size guards a turn runs under (DEC-220, spec §2.6). Every
 * limit comes from an AI setting; nothing here holds a number that is a
 * price or a limit.
 */

export type ModelPrices = NonNullable<AiSettingValue<"ai.prices">[AiModelId]>;

/** A turn's tokens summed over its rounds, cache writes split by lifetime. */
export interface TurnTokens {
    /** Every input token, cache reads and writes included (the AI SDK's total). */
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWrite5mTokens: number;
    cacheWrite1hTokens: number;
    thinkingTokens: number;
}

export const NO_TOKENS: TurnTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    thinkingTokens: 0,
};

export function addRound(t: TurnTokens, u: AiUsage): TurnTokens {
    // Without the provider's split, every write is priced as the short one.
    const w1h = u.cacheWrite1hTokens ?? 0;
    return {
        inputTokens: t.inputTokens + u.inputTokens,
        outputTokens: t.outputTokens + u.outputTokens,
        cacheReadTokens: t.cacheReadTokens + u.cacheReadTokens,
        cacheWrite5mTokens: t.cacheWrite5mTokens + (u.cacheWriteTokens - w1h),
        cacheWrite1hTokens: t.cacheWrite1hTokens + w1h,
        thinkingTokens: t.thinkingTokens + u.thinkingTokens,
    };
}

export const totalTokens = (t: TurnTokens) => t.inputTokens + t.outputTokens;

/** What the tokens cost, in whole micro-USD, rounded up. Prices are per million tokens. */
export function costMicroUsd(t: TurnTokens, p: ModelPrices): number {
    const writes = t.cacheWrite5mTokens + t.cacheWrite1hTokens;
    const uncached = Math.max(0, t.inputTokens - t.cacheReadTokens - writes);
    const millionths =
        uncached * p.input +
        t.cacheReadTokens * p.cacheRead +
        t.cacheWrite5mTokens * p.cacheWrite5m +
        t.cacheWrite1hTokens * p.cacheWrite1h +
        t.outputTokens * p.output;
    return Math.ceil(millionths / 1_000_000);
}

/**
 * A rough token count for text about to be sent, to check a prompt before
 * sending it. shortcut: characters ÷ 3 (Devanagari runs denser than
 * English, so this errs high); swap for the provider's count endpoint if
 * the prompt cap ever trips on real turns.
 */
export const estimateTokens = (value: unknown): number =>
    Math.ceil(JSON.stringify(value).length / 3);

/**
 * The messages trimmed to `cap` tokens: the oldest tool results go first
 * (with the call that asked for them; the newest exchange stays), then the
 * oldest question-and-answer pairs. The newest question always stays, and
 * the first message stays a question. May still be over `cap` when nothing
 * more can go; the prompt cap decides then.
 */
export function trimHistory(messages: AiMessage[], cap: number): AiMessage[] {
    const out = [...messages];
    const over = () => estimateTokens(out) > cap;
    while (over()) {
        const first = out.findIndex((m) => m.role === "tool");
        const last = out.map((m) => m.role).lastIndexOf("tool");
        if (first === -1 || first === last) break;
        // The assistant message that asked for them is just before.
        out.splice(first - 1, 2);
    }
    while (over()) {
        const nextQuestion = out.findIndex(
            (m, i) => i > 0 && m.role === "user",
        );
        if (nextQuestion === -1) break;
        out.splice(0, nextQuestion);
    }
    return out;
}

/** A tool result cut to `maxChars` on a line break, with what was left out. */
export function capToolResult(output: string, maxChars: number): string {
    if (output.length <= maxChars) return output;
    const room = output.lastIndexOf("\n", maxChars);
    const cut = room > 0 ? room : maxChars;
    const left = output
        .slice(cut)
        .split("\n")
        .filter((line) => line.trim()).length;
    return `${output.slice(0, cut)}\n… ${left} more not shown; narrow it with a filter.`;
}
