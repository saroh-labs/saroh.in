import { z } from "zod";

/**
 * Every AI setting there is, with the schema its value must pass (DEC-220,
 * plan 2026-11-13-001 "A typed AiSetting store"). The bounds are code and
 * only stop a typing slip; the values are data, set by the platform owner
 * in the console with a reason, and none is ever written here: a setting
 * nobody has set is refused, never guessed.
 */

/** The models Saroh may run. A model not here can't be set. */
export const AI_MODEL_IDS = [
    "claude-haiku-5-5",
    "claude-sonnet-5-5",
    "claude-opus-5-5",
] as const;
export type AiModelId = (typeof AI_MODEL_IDS)[number];

const model = z.enum(AI_MODEL_IDS);
// The port's efforts (`providers/provider.port.ts`, `AiEffort`).
const effort = z.enum(["low", "medium", "high"]);
const count = (max: number) => z.number().int().min(1).max(max);
/** Millionths of a US dollar, the provider's currency. A bound, not a price. */
const microUsd = z.number().int().min(0).max(1_000_000_000_000);
/** A share above zero, at most `max`. */
const ratio = (max: number) => z.number().gt(0).max(max);

/** What one million tokens of each kind cost on one model, in micro-USD. */
const modelPrices = z
    .object({
        input: microUsd,
        output: microUsd,
        cacheRead: microUsd,
        cacheWrite5m: microUsd,
        cacheWrite1h: microUsd,
    })
    .strict();

export const AI_SETTING_SCHEMAS = {
    /** Saroh-wide halt: true stops every agent. Ignores overrides. */
    "ai.halt": z.boolean(),
    /** Model and effort per kind of work, read when a conversation starts. */
    "askAi.questions.model": model,
    "askAi.questions.effort": effort,
    "askAi.drafts.model": model,
    "askAi.drafts.effort": effort,
    /** A provider call's `maxTokens`. */
    "askAi.maxOutputTokens": count(128_000),
    /** Provider rounds in one turn. */
    "askAi.maxRounds": count(50),
    /** The largest prompt one round may send, in tokens. */
    "askAi.maxPromptTokens": count(1_000_000),
    /** The longest tool result passed to the model, in characters. */
    "askAi.maxToolResultChars": count(1_000_000),
    /** The conversation kept in a round's prompt, in tokens; older parts are trimmed. */
    "askAi.maxHistoryTokens": count(1_000_000),
    /** All tokens one turn may use over its rounds (input, cache and output). */
    "askAi.turnTokenCap": count(100_000_000),
    /** Draft again (U5): free re-drafts one conversation may ask for. */
    "askAi.redraftsPerConversation": count(1_000),
    /** A turn still running after this many minutes is failed by the sweep. */
    "askAi.stuckTurnMinutes": count(24 * 60),
    /** Turns running at once in one business (a person runs one at a time). */
    "askAi.runningTurnsPerBusiness": count(1_000),
    /** Questions one person may start in a minute. */
    "askAi.questionsPerMinutePerPerson": count(1_000),
    /** Cost guards: one turn, one business's day, Saroh's day. */
    "askAi.turnCostCapMicroUsd": microUsd,
    "askAi.businessDayCostCapMicroUsd": microUsd,
    "ai.sarohDayCostCapMicroUsd": microUsd,
    /** The price table cost is worked out from, per model. */
    "ai.prices": z.partialRecord(model, modelPrices),
    /**
     * The spend alarm (U8): what Saroh expects AI to cost in a UTC month,
     * and the shares of it at which the owner is warned and every agent
     * halted (1 = the forecast itself).
     */
    "ai.spendForecastMicroUsdPerMonth": microUsd,
    "ai.spendAlarmWarnRatio": ratio(10),
    "ai.spendAlarmHaltRatio": ratio(10),
    /**
     * The failure watch (U8): the share of the last hour's finished turns
     * that failed or were cut off at which the owner is emailed, once at
     * least this many turns finished.
     */
    "ai.failureAlarmRatio": ratio(1),
    "ai.failureAlarmMinTurns": count(1_000_000),
} as const;

export type AiSettingKey = keyof typeof AI_SETTING_SCHEMAS;
export type AiSettingValue<K extends AiSettingKey> = z.infer<
    (typeof AI_SETTING_SCHEMAS)[K]
>;

/** Keys a business may not override: the halt is Saroh-wide. */
export const NOT_OVERRIDABLE: ReadonlySet<AiSettingKey> = new Set([
    "ai.halt",
    "ai.sarohDayCostCapMicroUsd",
    "ai.spendForecastMicroUsdPerMonth",
    "ai.spendAlarmWarnRatio",
    "ai.spendAlarmHaltRatio",
    "ai.failureAlarmRatio",
    "ai.failureAlarmMinTurns",
]);

/** The alarms' keys (U8): Saroh's watch, never read by a turn. */
export const ALARM_SETTING_KEYS: ReadonlySet<AiSettingKey> = new Set([
    "ai.spendForecastMicroUsdPerMonth",
    "ai.spendAlarmWarnRatio",
    "ai.spendAlarmHaltRatio",
    "ai.failureAlarmRatio",
    "ai.failureAlarmMinTurns",
]);

export const AI_SETTING_KEYS = Object.keys(
    AI_SETTING_SCHEMAS,
) as AiSettingKey[];

export function isAiSettingKey(key: string): key is AiSettingKey {
    return key in AI_SETTING_SCHEMAS;
}
