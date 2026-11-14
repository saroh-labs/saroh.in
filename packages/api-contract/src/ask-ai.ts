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
    /**
     * A card: `kind` "draft" is a draft to confirm (`data` an
     * `AskAiDraftCard`); "products" and "table" are {@link askAiInfoCard}s
     * a tool's result showed, sent whole once the answer is done.
     */
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

/** The most items or rows a card shows; the rest are `more`. */
export const ASK_AI_CARD_ITEMS = 8;

/**
 * Products a tool read (best sellers, a product list, one product), drawn
 * as small cards. `imageUrl` is only ever the product's cover on Saroh's
 * own media host (the API drops any other); `href` is the product in the
 * app. Figures are null when the person's role doesn't show them.
 */
export const askAiProductsCard = z.object({
    title: z.string(),
    items: z
        .array(
            z.object({
                id: z.string(),
                name: z.string(),
                imageUrl: z.string().nullable(),
                price: z.string().nullable(),
                /** Units sold in the period; null outside best sellers. */
                sold: z.number().nullable(),
                /** What they brought in; null without payments. */
                amount: z.string().nullable(),
                /** Units in stock; null when not counted or not shown. */
                stock: z.number().nullable(),
                href: z.string(),
            }),
        )
        .max(ASK_AI_CARD_ITEMS),
    /** Items not shown. */
    more: z.number().optional(),
    link: z.object({ label: z.string(), href: z.string() }).optional(),
});
export type AskAiProductsCard = z.infer<typeof askAiProductsCard>;

/** One of the app's own pages ("/commerce/orders/abc"), never another site. */
export const askAiAppHref = z
    .string()
    .max(512)
    .regex(/^\/(?![/\\])[^\s\\]*$/, "an app route");

/** A small table (bills, orders, bookings, customers): every cell text. */
export const askAiTableCard = z.object({
    title: z.string(),
    columns: z.array(z.string()),
    /** Which columns hold figures, right-aligned. */
    numeric: z.array(z.number()).optional(),
    rows: z.array(z.array(z.string())).max(ASK_AI_CARD_ITEMS),
    /** Each row's own record in the app, by index; null for none. */
    hrefs: z.array(askAiAppHref.nullable()).max(ASK_AI_CARD_ITEMS).optional(),
    /** Rows not shown. */
    more: z.number().optional(),
    link: z.object({ label: z.string(), href: z.string() }).optional(),
});
export type AskAiTableCard = z.infer<typeof askAiTableCard>;

/** A card under an answer, as the `card` event and a saved message carry it. */
export const askAiInfoCard = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("products"), data: askAiProductsCard }),
    z.object({ kind: z.literal("table"), data: askAiTableCard }),
]);
export type AskAiInfoCard = z.infer<typeof askAiInfoCard>;

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
    /** A draft's card, when the answer was one: `{ kind: "draft", data }`. */
    card: z.record(z.string(), z.unknown()).optional(),
    /** The answer's cards (`{ kind, data }`, each an {@link askAiInfoCard}). */
    cards: z
        .array(
            z.object({
                kind: z.string(),
                data: z.record(z.string(), z.unknown()),
            }),
        )
        .optional(),
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

/** This period's questions for the business. `limit` null: no cap. */
export const askAiUsage = z.object({
    used: z.number(),
    limit: z.number().nullable(),
    resetsAt: z.string(),
});
export type AskAiUsage = z.infer<typeof askAiUsage>;

/**
 * The switch, and this period's total whether or not it is on or the
 * reader may ask. `usage` null only when the plan doesn't include Ask AI.
 */
export const askAiSettings = z.object({
    on: z.boolean(),
    usage: askAiUsage.nullable(),
});
export type AskAiSettings = z.infer<typeof askAiSettings>;

/**
 * Who asked this period (Owner and Admin): every member, with their count
 * and when they last asked. Counts only, never what anyone asked.
 */
export const askAiPersonUsage = z.object({
    userId: z.string(),
    name: z.string(),
    /** The role's name as the business calls it ("Owner", "Front desk"). */
    role: z.string(),
    /** "Use Ask AI" given to this person beyond their role. */
    givenAskAi: z.boolean(),
    /** Whether their permissions include "Use Ask AI". */
    canUse: z.boolean(),
    questions: z.number(),
    lastAskedAt: z.string().nullable(),
});
export type AskAiPersonUsage = z.infer<typeof askAiPersonUsage>;

export const askAiPeopleUsage = z.object({
    periodStart: z.string(),
    resetsAt: z.string(),
    people: z.array(askAiPersonUsage),
});
export type AskAiPeopleUsage = z.infer<typeof askAiPeopleUsage>;

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
    usage: askAiUsage.nullable(),
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
