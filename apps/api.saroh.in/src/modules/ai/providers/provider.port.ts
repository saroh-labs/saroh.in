/**
 * The AI layer's one door to a model provider (DEC-220, plan 2026-11-13-001
 * "Library behind a port"). Saroh types only: nothing outside
 * `modules/ai/providers/` imports `ai` or `@ai-sdk/*`, so the library or the
 * provider can change behind this file without a caller noticing.
 *
 * One `stream()` call is one provider round: the model answers with text,
 * asks for tools, or both, and the stream ends. Running the tools and the
 * next round is the turn runner's job (U13), never the adapter's.
 *
 * A provider never throws at a caller. Every failure arrives as a `failed`
 * event carrying a reason and, when there was one, the HTTP status; the
 * provider's own error (which holds the request body, so the question) never
 * leaves `providers/`.
 */

/** Effort per kind of work; the value comes from an AI setting (U3). */
export type AiEffort = "low" | "medium" | "high";

/** A part of the instructions. `cache` puts a cache breakpoint after it. */
export interface AiSystemPart {
    text: string;
    cache?: boolean;
}

/** A tool the model may ask for. The order given is the order sent. */
export interface AiToolDefinition {
    name: string;
    description: string;
    /** A JSON Schema object for the tool's input. */
    inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
    id: string;
    name: string;
    input: unknown;
}

export interface AiToolResult {
    toolCallId: string;
    toolName: string;
    /** Text, never JSON (spec §2.3). */
    output: string;
    isError?: boolean;
}

export type AiMessage =
    | { role: "user"; text: string }
    | { role: "assistant"; text?: string; toolCalls?: AiToolCall[] }
    | { role: "tool"; results: AiToolResult[] };

export interface AiStreamRequest {
    /** The provider's model id, from an AI setting (never chosen by a merchant). */
    model: string;
    system: AiSystemPart[];
    messages: AiMessage[];
    tools: AiToolDefinition[];
    effort: AiEffort;
    maxTokens: number;
    /** Automatic caching of the conversation's tail, after the last breakpoint. */
    cacheTail?: boolean;
}

/** Raw token counts as the provider reported them, for cost (U13). */
export interface AiUsage {
    inputTokens: number;
    outputTokens: number;
    /** Input read from the cache. */
    cacheReadTokens: number;
    /** Input written to the cache, all lifetimes together. */
    cacheWriteTokens: number;
    /** The cache writes split by lifetime, when the provider says (priced differently). */
    cacheWrite5mTokens?: number;
    cacheWrite1hTokens?: number;
    /** Output spent thinking, inside `outputTokens`. */
    thinkingTokens: number;
}

export type AiFinishReason =
    "stop" | "tool-calls" | "length" | "refused" | "other";

/**
 * Why a round failed, without the provider's words. `not-configured`: no
 * key. `unauthorized`: the key was refused. `rate-limited`, `overloaded`,
 * `server-error`, `network`: try again later. `invalid-request`: Saroh sent
 * something the provider refused (a bug, or a prompt over its limit).
 */
export type AiFailureReason =
    | "not-configured"
    | "unauthorized"
    | "rate-limited"
    | "overloaded"
    | "invalid-request"
    | "server-error"
    | "network"
    | "unknown";

export type AiEvent =
    | { type: "text-delta"; text: string }
    | { type: "tool-call"; call: AiToolCall }
    | { type: "finish"; reason: AiFinishReason; usage: AiUsage }
    /** The caller's signal fired; nothing follows. */
    | { type: "aborted" }
    | { type: "failed"; reason: AiFailureReason; status?: number };

export interface AiProvider {
    stream(
        request: AiStreamRequest,
        signal: AbortSignal,
    ): AsyncIterable<AiEvent>;
}

/** The Nest token the AI module binds a provider to (U3). */
export const AI_PROVIDER = Symbol("AI_PROVIDER");
