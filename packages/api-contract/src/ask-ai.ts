import { z } from "zod";

/**
 * Ask AI's panel (DEC-220, plan 2026-11-13-001 U9): asking a question
 * (answered as server-sent events), Stop, a person's own conversations,
 * their language, and the business's on/off switch. Workspace routes under
 * `organizations/:organizationId/ask-ai`, not public, so not in the
 * OpenAPI documents. Inputs are strict; outputs are open, so a field added
 * later doesn't break a reader.
 */

/** The longest question the panel sends; a bound on one input, not a plan limit. */
export const ASK_AI_QUESTION_MAX = 2000;

/** The language a person wants answers in; MATCH answers in the question's own. */
export const askAiLanguage = z.enum(["MATCH", "ENGLISH", "HINGLISH", "HINDI"]);
export type AskAiLanguage = z.infer<typeof askAiLanguage>;

/** A question. No `conversationId` starts a new conversation. */
export const askAiTurnBody = z.strictObject({
    conversationId: z.string().min(1).max(64).optional(),
    question: z.string().trim().min(1).max(ASK_AI_QUESTION_MAX),
    /** Saved as the person's language before the question is asked. */
    language: askAiLanguage.optional(),
});
export type AskAiTurnBody = z.infer<typeof askAiTurnBody>;

/** How a turn ended (the API's `AiTurnOutcome`). */
export const askAiOutcome = z.enum([
    "RUNNING",
    "ANSWERED",
    "DRAFT",
    "STOPPED_BEFORE",
    "STOPPED_AFTER",
    "FAILED",
    "CUT_OFF",
    "DAILY_LIMIT",
    "NO_ACCESS",
]);
export type AskAiOutcome = z.infer<typeof askAiOutcome>;

/**
 * Why a question wasn't asked: `reason` plus the words' parts (`askName`,
 * `upgradeTo`, `limit`, `resetsAt`, `requestMore`, `scope`, `who`) as
 * each reason carries them. Nothing was sent and nothing counts.
 */
export const askAiRefusal = z.looseObject({
    reason: z.enum([
        "unavailable",
        "locked",
        "no-permission",
        "business-off",
        "allowance",
        "daily-limit",
        "busy",
        "rate-limit",
    ]),
});
export type AskAiRefusal = z.infer<typeof askAiRefusal>;

/**
 * One server-sent event of a turn: `event: <type>` and `data: <json>`.
 * `turn` comes first; `done` comes last, once.
 */
export const askAiEvent = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("turn"),
        turnId: z.string(),
        /** Null when a new conversation was refused before it began. */
        conversationId: z.string().nullable(),
    }),
    /** Saroh's fixed words for the tool being run, in the person's language. */
    z.object({
        type: z.literal("status"),
        tool: z.string(),
        words: z.string(),
    }),
    z.object({ type: z.literal("text-delta"), text: z.string() }),
    /** A draft to confirm: `data` is an `AskAiDraftCard`. */
    z.object({
        type: z.literal("card"),
        kind: z.string(),
        data: z.record(z.string(), z.unknown()),
    }),
    z.object({ type: z.literal("refused"), refusal: askAiRefusal }),
    z.object({
        type: z.literal("error"),
        reason: z.enum(["unavailable", "provider", "turn-limit", "no-answer"]),
    }),
    z.object({
        type: z.literal("done"),
        turnId: z.string(),
        outcome: askAiOutcome,
        counted: z.boolean(),
        usage: z.object({
            rounds: z.number(),
            inputTokens: z.number(),
            outputTokens: z.number(),
        }),
    }),
]);
export type AskAiEvent = z.infer<typeof askAiEvent>;

/** Stop's answer: false when the turn had already ended. */
export const askAiStopResult = z.object({ stopped: z.boolean() });
export type AskAiStopResult = z.infer<typeof askAiStopResult>;

export const askAiConversationsQuery = z.strictObject({
    /** The last conversation's id from the page before. */
    cursor: z.string().min(1).max(64).optional(),
});
export type AskAiConversationsQuery = z.infer<typeof askAiConversationsQuery>;

export const askAiConversationSummary = z.object({
    id: z.string(),
    agent: z.string(),
    title: z.string().nullable(),
    lastMessageAt: z.string(),
    createdAt: z.string(),
});
export type AskAiConversationSummary = z.infer<typeof askAiConversationSummary>;

export const askAiConversationList = z.object({
    /** Newest first. */
    data: z.array(askAiConversationSummary),
    nextCursor: z.string().nullable(),
});
export type AskAiConversationList = z.infer<typeof askAiConversationList>;

export const askAiMessage = z.object({
    id: z.string(),
    role: z.enum(["USER", "ASSISTANT"]),
    outcome: askAiOutcome.nullable(),
    text: z.string(),
    /** A draft's card, when the answer was one. */
    card: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string(),
});
export type AskAiMessage = z.infer<typeof askAiMessage>;

export const askAiConversation = askAiConversationSummary.extend({
    /** Oldest first. */
    messages: z.array(askAiMessage),
});
export type AskAiConversation = z.infer<typeof askAiConversation>;

export const askAiLanguageBody = z.strictObject({ language: askAiLanguage });
export type AskAiLanguageBody = z.infer<typeof askAiLanguageBody>;

export const askAiLanguageSetting = z.object({ language: askAiLanguage });
export type AskAiLanguageSetting = z.infer<typeof askAiLanguageSetting>;

/** The business's own switch: Owner and Admin (`module:manage`). */
export const askAiSettingsBody = z.strictObject({ on: z.boolean() });
export type AskAiSettingsBody = z.infer<typeof askAiSettingsBody>;

export const askAiSettings = z.object({ on: z.boolean() });
export type AskAiSettings = z.infer<typeof askAiSettings>;

/**
 * What the panel needs before a question: whether the person may ask and,
 * if not, why; this period's questions; who to ask; the switch; their
 * language. The panel decides when the meter shows.
 */
export const askAiState = z.object({
    available: z.boolean(),
    /** Why not, when not available. */
    reason: z
        .enum(["unavailable", "locked", "no-permission", "business-off"])
        .nullable(),
    /** For `locked`: the first plan with Ask AI ("" none). */
    upgradeTo: z.string().nullable(),
    /** This period's questions, when the person may ask. `limit` null: no cap. */
    usage: z
        .object({
            used: z.number(),
            limit: z.number().nullable(),
            resetsAt: z.string(),
        })
        .nullable(),
    /** Whether this person may ask Saroh for more at the limit. */
    requestMore: z.boolean(),
    /** The owner, for "ask …", to someone who can't see the plan. */
    ownerName: z.string().nullable(),
    businessOn: z.boolean(),
    /** Whether this person may turn Ask AI on or off for the business. */
    canSwitch: z.boolean(),
    language: askAiLanguage,
});
export type AskAiState = z.infer<typeof askAiState>;
