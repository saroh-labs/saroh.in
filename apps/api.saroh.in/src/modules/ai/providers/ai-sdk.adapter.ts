import { createAnthropic } from "@ai-sdk/anthropic";
import type {
    FinishReason,
    JSONSchema7,
    LanguageModel,
    LanguageModelUsage,
    ModelMessage,
    SystemModelMessage,
    ToolSet,
} from "ai";
import { APICallError, jsonSchema, streamText } from "ai";

import { env } from "../../../env";
import type {
    AiEvent,
    AiFailureReason,
    AiFinishReason,
    AiMessage,
    AiProvider,
    AiStreamRequest,
    AiUsage,
} from "./provider.port";

/**
 * The provider port on the Vercel AI SDK core and Anthropic (DEC-220). The
 * only file that imports `ai` or `@ai-sdk/*`. One `stream()` is one round:
 * tools are declared without `execute`, so the SDK stops at the model's
 * tool calls and hands them back; the turn runner (U13) runs them.
 *
 * Errors: the SDK's error objects carry the request body (the question,
 * history, tool results), so they are read here for a status and a kind and
 * then dropped. Nothing of them is logged, rethrown or attached as a cause.
 */

const CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

/** The model for an id, or null when the provider isn't configured. */
export type ModelFor = (modelId: string) => LanguageModel | null;

/** Anthropic with Saroh's key, read at use (optional at boot). */
const anthropicModel: ModelFor = (modelId) => {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return createAnthropic({ apiKey })(modelId);
};

export class AiSdkAdapter implements AiProvider {
    /** `modelFor` is for specs, which pass the SDK's mock model. */
    constructor(private readonly modelFor: ModelFor = anthropicModel) {}

    async *stream(
        request: AiStreamRequest,
        signal: AbortSignal,
    ): AsyncIterable<AiEvent> {
        const model = this.modelFor(request.model);
        if (!model) {
            yield { type: "failed", reason: "not-configured" };
            return;
        }
        // A function, so the checks below read the signal as it is now.
        const aborted = () => signal.aborted;
        if (aborted()) {
            yield { type: "aborted" };
            return;
        }
        try {
            const result = streamText({
                model,
                instructions: systemOf(request),
                messages: messagesOf(request.messages),
                tools: toolsOf(request),
                maxOutputTokens: request.maxTokens,
                abortSignal: signal,
                providerOptions: {
                    anthropic: {
                        effort: request.effort,
                        ...(request.cacheTail
                            ? { cacheControl: { type: "ephemeral" } }
                            : {}),
                    },
                },
                onError: ignoreError,
            });
            for await (const part of result.fullStream) {
                if (aborted()) {
                    yield { type: "aborted" };
                    return;
                }
                switch (part.type) {
                    case "text-delta":
                        yield { type: "text-delta", text: part.text };
                        break;
                    case "tool-call":
                        yield {
                            type: "tool-call",
                            call: {
                                id: part.toolCallId,
                                name: part.toolName,
                                input: part.input,
                            },
                        };
                        break;
                    case "finish":
                        yield {
                            type: "finish",
                            reason: finishOf(part.finishReason),
                            usage: usageOf(part.totalUsage),
                        };
                        return;
                    case "abort":
                        yield { type: "aborted" };
                        return;
                    case "error":
                        yield failureOf(part.error);
                        return;
                    default:
                        break;
                }
            }
        } catch (error) {
            if (aborted()) {
                yield { type: "aborted" };
                return;
            }
            yield failureOf(error);
        }
    }
}

/** Replaces the SDK's default, which logs the error with its request body. */
function ignoreError(): void {
    // Read and reported by `failureOf` from the stream instead.
}

function systemOf(request: AiStreamRequest): SystemModelMessage[] {
    return request.system.map((part) => ({
        role: "system",
        content: part.text,
        ...(part.cache ? { providerOptions: CACHE } : {}),
    }));
}

function toolsOf(request: AiStreamRequest): ToolSet {
    const tools: ToolSet = {};
    for (const tool of request.tools) {
        tools[tool.name] = {
            description: tool.description,
            inputSchema: jsonSchema(tool.inputSchema as JSONSchema7),
        };
    }
    return tools;
}

function messagesOf(messages: AiMessage[]): ModelMessage[] {
    return messages.map((message): ModelMessage => {
        if (message.role === "user") {
            return { role: "user", content: message.text };
        }
        if (message.role === "assistant") {
            return {
                role: "assistant",
                content: [
                    ...(message.text
                        ? [{ type: "text" as const, text: message.text }]
                        : []),
                    ...(message.toolCalls ?? []).map((call) => ({
                        type: "tool-call" as const,
                        toolCallId: call.id,
                        toolName: call.name,
                        input: call.input,
                    })),
                ],
            };
        }
        return {
            role: "tool",
            content: message.results.map((result) => ({
                type: "tool-result" as const,
                toolCallId: result.toolCallId,
                toolName: result.toolName,
                output: result.isError
                    ? { type: "error-text" as const, value: result.output }
                    : { type: "text" as const, value: result.output },
            })),
        };
    });
}

function finishOf(reason: FinishReason): AiFinishReason {
    switch (reason) {
        case "stop":
        case "tool-calls":
        case "length":
            return reason;
        case "content-filter":
            return "refused";
        default:
            return "other";
    }
}

/** Raw counts; Anthropic's own usage adds the cache writes by lifetime. */
export function usageOf(usage: LanguageModelUsage): AiUsage {
    const raw = usage.raw as
        | {
              cache_creation?: {
                  ephemeral_5m_input_tokens?: number;
                  ephemeral_1h_input_tokens?: number;
              };
          }
        | undefined;
    const split = raw?.cache_creation;
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
        ...(typeof split?.ephemeral_5m_input_tokens === "number"
            ? { cacheWrite5mTokens: split.ephemeral_5m_input_tokens }
            : {}),
        ...(typeof split?.ephemeral_1h_input_tokens === "number"
            ? { cacheWrite1hTokens: split.ephemeral_1h_input_tokens }
            : {}),
        thinkingTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
    };
}

/** Anthropic's error types, as a stream's error chunk names them. */
const BY_TYPE: Record<string, AiFailureReason> = {
    authentication_error: "unauthorized",
    permission_error: "unauthorized",
    rate_limit_error: "rate-limited",
    overloaded_error: "overloaded",
    invalid_request_error: "invalid-request",
    request_too_large: "invalid-request",
    not_found_error: "invalid-request",
    api_error: "server-error",
};

/**
 * A reason and a status from whatever the SDK threw or streamed, reading
 * only those two things. The error itself goes no further.
 */
export function failureOf(error: unknown): AiEvent {
    // After its retries the SDK wraps the last call's error.
    const last =
        error && typeof error === "object" && "lastError" in error
            ? error.lastError
            : error;
    if (APICallError.isInstance(last)) {
        const status = last.statusCode;
        return status === undefined
            ? { type: "failed", reason: "network" }
            : { type: "failed", reason: reasonOfStatus(status), status };
    }
    const kind =
        last && typeof last === "object"
            ? ((last as { type?: unknown; error?: { type?: unknown } }).error
                  ?.type ?? (last as { type?: unknown }).type)
            : undefined;
    const reason = typeof kind === "string" ? BY_TYPE[kind] : undefined;
    if (reason) return { type: "failed", reason };
    if (last instanceof TypeError) return { type: "failed", reason: "network" };
    return { type: "failed", reason: "unknown" };
}

function reasonOfStatus(status: number): AiFailureReason {
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 429) return "rate-limited";
    if (status === 529) return "overloaded";
    if (status >= 500) return "server-error";
    if (status >= 400) return "invalid-request";
    return "unknown";
}
