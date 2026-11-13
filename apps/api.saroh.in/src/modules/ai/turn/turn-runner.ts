import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AiTurnOutcome } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import type { AgentDefinition } from "../agents/agent-definition";
import {
    agentVersion,
    sharedInstructions,
    statusWordsFor,
} from "../agents/agent-definition";
import type {
    AiMessage,
    AiProvider,
    AiStreamRequest,
    AiSystemPart,
    AiToolCall,
    AiToolDefinition,
    AiToolResult,
} from "../providers/provider.port";
import { AI_PROVIDER } from "../providers/provider.port";
import type { AiModelId } from "../settings/ai-setting-keys";
import {
    AiSettingNotConfiguredError,
    AiSettingsService,
} from "../settings/ai-settings.service";
import type { AiToolbox } from "../tools/toolbox.port";
import { AI_TOOLBOX } from "../tools/toolbox.port";
import type { TurnErrorReason, TurnEvent } from "./events";
import type { ModelPrices, TurnTokens } from "./guards";
import {
    addRound,
    capToolResult,
    costMicroUsd,
    estimateTokens,
    NO_TOKENS,
    totalTokens,
    trimHistory,
} from "./guards";
import { isCounted } from "./outcome";
import type { TurnConversation } from "./turn-store";
import { TurnStore } from "./turn-store";

/** The agents a conversation may name, bound in `ai.module.ts`. */
export const AI_AGENTS = Symbol("AI_AGENTS");

/** A round whose prompt passes this is priced higher by some models; flagged on the row. */
const LONG_PROMPT_TOKENS = 100_000;

export interface TurnInput {
    ctx: OrganizationContext;
    conversationId: string;
    question: string;
    turnId: string;
    /** From {@link TurnRegistry.begin}: Stop. */
    signal: AbortSignal;
}

interface TurnLimits {
    maxOutputTokens: number;
    maxRounds: number;
    maxPromptTokens: number;
    maxToolResultChars: number;
    maxHistoryTokens: number;
    turnTokenCap: number;
    turnCostCapMicroUsd: number;
    prices: ModelPrices;
}

interface Prepared {
    conversation: TurnConversation;
    agent: AgentDefinition;
    limits: TurnLimits;
    language: Awaited<ReturnType<TurnStore["language"]>>;
    system: AiSystemPart[];
    tools: AiToolDefinition[];
    messages: AiMessage[];
}

/** How the turn is going; `outcome` is set once it has ended. */
interface TurnState {
    text: string;
    card?: { kind: string; data: Record<string, unknown> };
    tokens: TurnTokens;
    rounds: number;
    over100k: boolean;
    outcome?: AiTurnOutcome;
    reason?: TurnErrorReason;
    failureReason?: string;
}

class Unavailable extends Error {}

/**
 * One Ask AI turn (DEC-220, plan U13): provider rounds until the model
 * answers, asks for a draft, or a guard ends it. Every limit is read from
 * the AI settings when the turn starts; the model and effort were stamped
 * on the conversation when it began, so a change applies to new
 * conversations only. The halt, the rollout flag and the business's switch
 * are checked before the first round and again before every round after.
 *
 * Logs carry ids, the outcome, token counts and cost; never a question,
 * an answer or a tool's output.
 */
@Injectable()
export class TurnRunner {
    private readonly logger = new Logger(TurnRunner.name);

    constructor(
        @Inject(AI_PROVIDER) private readonly provider: AiProvider,
        @Inject(AI_TOOLBOX) private readonly toolbox: AiToolbox,
        @Inject(AI_AGENTS) private readonly agents: readonly AgentDefinition[],
        private readonly settings: AiSettingsService,
        private readonly flags: FeatureFlagService,
        private readonly store: TurnStore,
    ) {}

    /** A new conversation, with the model and effort in effect now stamped on it. */
    async openConversation(
        ctx: OrganizationContext,
        agentKey: string,
    ): Promise<TurnConversation> {
        const agent = this.agent(agentKey);
        const keys = agent.models.questions;
        const [model, effort] = await Promise.all([
            this.settings.get(keys.model, ctx.organizationId),
            this.settings.get(keys.effort, ctx.organizationId),
        ]);
        return this.store.createConversation(ctx, {
            agent: agent.key,
            agentVersion: agentVersion(agent),
            model,
            effort,
        });
    }

    /** Whether a turn may run now: not halted, rolled out here, the business's switch on. */
    available(organizationId: string): Promise<boolean> {
        return askAiAvailable(
            this.settings,
            this.flags,
            this.store,
            organizationId,
        );
    }

    async *run(input: TurnInput): AsyncGenerator<TurnEvent> {
        const { ctx, turnId } = input;
        const now = new Date();
        let prepared: Prepared;
        try {
            prepared = await this.prepare(input, now);
        } catch (error) {
            if (
                !(error instanceof Unavailable) &&
                !(error instanceof AiSettingNotConfiguredError)
            ) {
                throw error;
            }
            this.logger.warn(
                `ai_turn unavailable turn=${turnId} org=${ctx.organizationId}`,
            );
            yield { type: "error", reason: "unavailable" };
            yield {
                type: "done",
                turnId,
                outcome: "FAILED",
                counted: false,
                usage: { rounds: 0, inputTokens: 0, outputTokens: 0 },
            };
            return;
        }
        const { conversation } = prepared;
        await this.store.start(ctx, conversation, turnId, input.question, now);
        const state: TurnState = {
            text: "",
            tokens: NO_TOKENS,
            rounds: 0,
            over100k: false,
        };
        try {
            yield* this.rounds(input, prepared, state);
        } catch (error) {
            end(state, state.text ? "CUT_OFF" : "FAILED", "provider");
            state.failureReason = "internal";
            this.logger.error(
                `ai_turn_error turn=${turnId} error=${error instanceof Error ? error.name : "unknown"}`,
            );
        } finally {
            // The reader left without Stop (the stream's owner should drain it): as a stop.
            if (!state.outcome) {
                end(state, state.text ? "STOPPED_AFTER" : "STOPPED_BEFORE");
            }
            await this.finish(input, prepared, state);
        }
        const outcome = state.outcome ?? "FAILED";
        if (state.reason) yield { type: "error", reason: state.reason };
        yield {
            type: "done",
            turnId,
            outcome,
            counted: isCounted(outcome),
            usage: {
                rounds: state.rounds,
                inputTokens: state.tokens.inputTokens,
                outputTokens: state.tokens.outputTokens,
            },
        };
    }

    private agent(key: string): AgentDefinition {
        const agent = this.agents.find((a) => a.key === key);
        if (!agent) throw new Unavailable();
        return agent;
    }

    private async prepare(input: TurnInput, now: Date): Promise<Prepared> {
        const { ctx } = input;
        if (!(await this.available(ctx.organizationId)))
            throw new Unavailable();
        const { conversation, history } = await this.store.load(
            ctx,
            input.conversationId,
        );
        const agent = this.agent(conversation.agent);
        const [limits, language] = await Promise.all([
            this.limits(ctx.organizationId, conversation.model),
            this.store.language(ctx),
        ]);
        const block = await agent.businessBlock(ctx, language, now);
        return {
            conversation,
            agent,
            limits,
            language,
            // House rules and job are the same for every business: cached
            // with the tools before them. The business block follows.
            system: [
                { text: sharedInstructions(agent), cache: true },
                { text: block },
            ],
            tools: this.toolbox.definitions(agent.tools),
            messages: [...history, { role: "user", text: input.question }],
        };
    }

    private async limits(org: string, model: string): Promise<TurnLimits> {
        const get = this.settings.get.bind(this.settings);
        const [
            maxOutputTokens,
            maxRounds,
            maxPromptTokens,
            maxToolResultChars,
            maxHistoryTokens,
            turnTokenCap,
            turnCostCapMicroUsd,
            table,
        ] = await Promise.all([
            get("askAi.maxOutputTokens", org),
            get("askAi.maxRounds", org),
            get("askAi.maxPromptTokens", org),
            get("askAi.maxToolResultChars", org),
            get("askAi.maxHistoryTokens", org),
            get("askAi.turnTokenCap", org),
            get("askAi.turnCostCapMicroUsd", org),
            get("ai.prices", org),
        ]);
        const prices = table[model as AiModelId];
        if (!prices) throw new AiSettingNotConfiguredError("ai.prices");
        return {
            maxOutputTokens,
            maxRounds,
            maxPromptTokens,
            maxToolResultChars,
            maxHistoryTokens,
            turnTokenCap,
            turnCostCapMicroUsd,
            prices,
        };
    }

    private request(
        p: Prepared,
        messages: AiMessage[],
        answerOnly: boolean,
    ): AiStreamRequest {
        return {
            model: p.conversation.model,
            effort: p.conversation.effort as AiStreamRequest["effort"],
            maxTokens: p.limits.maxOutputTokens,
            system: p.system,
            tools: p.tools,
            messages,
            cacheTail: true,
            maxRetries: 0,
            ...(answerOnly ? { toolChoice: "none" as const } : {}),
        };
    }

    private async *rounds(
        input: TurnInput,
        p: Prepared,
        state: TurnState,
    ): AsyncGenerator<TurnEvent> {
        const { ctx, signal } = input;
        const { limits } = p;
        let messages = p.messages;
        let answerOnly = p.tools.length === 0;
        // A function, so each check reads the signal as it is now.
        const aborted = () => signal.aborted;
        for (;;) {
            if (aborted()) return stopped(state);
            if (!(await this.available(ctx.organizationId))) {
                end(state, "FAILED", "unavailable");
                state.failureReason = "unavailable";
                return;
            }
            const spent = costMicroUsd(state.tokens, limits.prices);
            if (
                state.rounds >= limits.maxRounds ||
                totalTokens(state.tokens) >= limits.turnTokenCap ||
                spent >= limits.turnCostCapMicroUsd
            ) {
                return withWhatItHas(state);
            }
            if (state.rounds + 1 >= limits.maxRounds) answerOnly = true;
            messages = trimHistory(messages, limits.maxHistoryTokens);
            let request = this.request(p, messages, answerOnly);
            if (estimateTokens(request) > limits.maxPromptTokens) {
                // Too long to send: keep what fits and make it answer now.
                const room =
                    limits.maxPromptTokens -
                    estimateTokens(this.request(p, [], true));
                messages = trimHistory(messages, room);
                answerOnly = true;
                request = this.request(p, messages, true);
                if (estimateTokens(request) > limits.maxPromptTokens) {
                    return withWhatItHas(state);
                }
            }

            state.rounds++;
            let roundText = "";
            const calls: AiToolCall[] = [];
            let finished = false;
            for await (const event of this.provider.stream(request, signal)) {
                if (event.type === "text-delta") {
                    state.text += event.text;
                    roundText += event.text;
                    yield { type: "text-delta", text: event.text };
                } else if (event.type === "tool-call") {
                    calls.push(event.call);
                } else if (event.type === "finish") {
                    state.tokens = addRound(state.tokens, event.usage);
                    if (event.usage.inputTokens > LONG_PROMPT_TOKENS) {
                        state.over100k = true;
                    }
                    finished = true;
                } else if (event.type === "aborted") {
                    return stopped(state);
                } else {
                    end(state, state.text ? "CUT_OFF" : "FAILED", "provider");
                    state.failureReason = event.reason;
                    return;
                }
            }
            if (aborted()) return stopped(state);
            if (!finished) {
                end(state, state.text ? "CUT_OFF" : "FAILED", "provider");
                state.failureReason = "unknown";
                return;
            }
            if (answerOnly || calls.length === 0) {
                return withWhatItHas(state, "no-answer");
            }

            const results: AiToolResult[] = [];
            for (const call of calls) {
                if (aborted()) return stopped(state);
                yield {
                    type: "status",
                    tool: call.name,
                    words: statusWordsFor(p.agent, call.name, p.language),
                };
                const run = await this.toolbox.run(ctx, call, signal, {
                    conversationId: p.conversation.id,
                    turnId: input.turnId,
                });
                if (run.card && p.agent.draftTools.includes(call.name)) {
                    state.card = run.card;
                    yield { type: "card", ...run.card };
                    end(state, "DRAFT");
                    return;
                }
                results.push({
                    toolCallId: call.id,
                    toolName: call.name,
                    output: capToolResult(
                        run.output,
                        limits.maxToolResultChars,
                    ),
                    ...(run.isError ? { isError: true } : {}),
                });
            }
            messages = [
                ...messages,
                {
                    role: "assistant",
                    ...(roundText ? { text: roundText } : {}),
                    toolCalls: calls,
                },
                { role: "tool", results },
            ];
        }
    }

    private async finish(
        input: TurnInput,
        p: Prepared,
        state: TurnState,
    ): Promise<void> {
        const outcome = state.outcome ?? "FAILED";
        const counted = isCounted(outcome);
        const cost = costMicroUsd(state.tokens, p.limits.prices);
        const t = state.tokens;
        this.logger.log(
            `ai_turn turn=${input.turnId} org=${input.ctx.organizationId} conversation=${p.conversation.id} outcome=${outcome} counted=${counted} rounds=${state.rounds} in=${t.inputTokens} cache_read=${t.cacheReadTokens} cache_write=${t.cacheWrite5mTokens + t.cacheWrite1hTokens} out=${t.outputTokens} cost_micro_usd=${cost}${state.failureReason ? ` failure=${state.failureReason}` : ""}`,
        );
        try {
            await this.store.finish(input.ctx, p.conversation, input.turnId, {
                text: state.text,
                ...(state.card ? { card: state.card } : {}),
                outcome,
                counted,
                stopped:
                    outcome === "STOPPED_BEFORE" || outcome === "STOPPED_AFTER",
                ...(state.failureReason
                    ? { failureReason: state.failureReason }
                    : {}),
                tokens: t,
                costMicroUsd: cost,
                over100k: state.over100k,
            });
        } catch (error) {
            // The row stays RUNNING; the stuck-turn sweep fails it later.
            this.logger.error(
                `ai_turn_save_failed turn=${input.turnId} error=${error instanceof Error ? error.name : "unknown"}`,
            );
        }
    }
}

/**
 * Whether Ask AI may act in a business now: not halted, rolled out there
 * (`ASK_AI`), and the business's own switch on. A turn asks before every
 * round; a draft's Confirm and Undo ask again (U5).
 */
export async function askAiAvailable(
    settings: Pick<AiSettingsService, "halt">,
    flags: Pick<FeatureFlagService, "isEnabled">,
    store: Pick<TurnStore, "businessOn">,
    organizationId: string,
): Promise<boolean> {
    if ((await settings.halt()).halted) return false;
    if (!(await flags.isEnabled("ASK_AI", organizationId))) return false;
    return store.businessOn(organizationId);
}

function end(
    state: TurnState,
    outcome: AiTurnOutcome,
    reason?: TurnErrorReason,
): void {
    state.outcome = outcome;
    if (reason) state.reason = reason;
}

function stopped(state: TurnState): void {
    end(state, state.text ? "STOPPED_AFTER" : "STOPPED_BEFORE");
}

/** Ends on the text so far: an answer when there is some. */
function withWhatItHas(
    state: TurnState,
    reason: TurnErrorReason = "turn-limit",
): void {
    if (state.text) end(state, "ANSWERED");
    else end(state, "FAILED", reason);
}
