import type {
    AskAiConversation,
    AskAiConversationSummary,
    AskAiEvent,
} from "@saroh/api-contract";
import { askAiDraftCard, askAiInfoCard } from "@saroh/api-contract";

import type { Turn } from "./thread";

/**
 * Ask AI's conversation as data (DEC-183): saved conversations as turns,
 * each streamed event folded into its turn, and how a turn that lost its
 * connection ends. No React here; `use-ask-ai.ts` holds the state.
 */

/** The answer cards Saroh knows, each checked; any other is left out. */
export function infoCardsOf(cards: readonly unknown[] | undefined) {
    return (cards ?? []).flatMap((c) => {
        const card = askAiInfoCard.safeParse(c);
        return card.success ? [card.data] : [];
    });
}

/** A saved conversation as turns: each question with the answer after it. */
export function turnsOf(conversation: AskAiConversation): Turn[] {
    const turns: Turn[] = [];
    for (const m of conversation.messages) {
        if (m.role === "USER") {
            turns.push({
                key: m.id,
                question: m.text,
                text: "",
                cards: [],
                running: false,
                outcome: "FAILED",
            });
            continue;
        }
        const turn = turns.at(-1);
        if (!turn) continue;
        // Kept as the event carried it, `{ kind: "draft", data }`.
        const draft = (m.card as { data?: unknown } | undefined)?.data;
        const card = askAiDraftCard.safeParse(draft ?? m.card);
        Object.assign(turn, {
            text: m.text,
            cards: card.success ? [card.data] : [],
            infoCards: infoCardsOf(m.cards),
            next: m.next,
            outcome: m.outcome ?? "ANSWERED",
            messageId: m.id,
        });
    }
    return turns;
}

/**
 * The saved turn for a question just asked, once the API has written its
 * answer: the last time it was asked in the conversation. Null while the
 * answer isn't saved yet.
 */
export function savedTurn(
    conversation: AskAiConversation,
    question: string,
): Turn | null {
    const turns = turnsOf(conversation);
    const turn = turns.findLast((t) => t.question === question) ?? turns.at(-1);
    return turn?.messageId ? turn : null;
}

/** The full page, `/ask` (board AI 9): the list beside the conversation. */
export const ASK_PAGE = "/ask";
export const askPageHref = (conversationId: string | null) =>
    conversationId
        ? `${ASK_PAGE}?c=${encodeURIComponent(conversationId)}`
        : ASK_PAGE;

/** One streamed event folded into the turn it belongs to. */
export function applyEvent(turn: Turn, event: AskAiEvent): Turn {
    switch (event.type) {
        case "turn":
            return { ...turn, turnId: event.turnId };
        case "status":
            return {
                ...turn,
                status: event.words,
                tools:
                    event.tool === "start"
                        ? turn.tools
                        : [...(turn.tools ?? []), event.tool],
            };
        case "text-delta":
            return { ...turn, text: turn.text + event.text };
        case "card": {
            if (
                event.kind === "products" ||
                event.kind === "table" ||
                event.kind === "slots"
            ) {
                const info = infoCardsOf([event]);
                if (!info.length) return turn;
                return {
                    ...turn,
                    infoCards: [...(turn.infoCards ?? []), ...info],
                };
            }
            const card = askAiDraftCard.safeParse(event.data);
            if (!card.success) return turn;
            return { ...turn, cards: [...turn.cards, card.data] };
        }
        case "refused":
            return { ...turn, refusal: event.refusal };
        case "next":
            return { ...turn, next: event.items };
        case "error":
            return { ...turn, error: event.reason };
        case "done":
            return {
                ...turn,
                outcome: event.outcome,
                counted: event.counted,
                running: false,
            };
    }
    return turn;
}

/**
 * A turn the stream ended without `done`: what arrived stays, said as
 * lost. The API may still have answered (it reads a turn to its end), so
 * this never says whether a question was used.
 */
export function endLost(turn: Turn): Turn {
    if (!turn.running) return turn;
    return {
        ...turn,
        running: false,
        outcome: turn.text ? "CUT_OFF" : "FAILED",
        lost: true,
    };
}

/** Whether the saved conversation is worth reading again after a turn. */
export function readsSaved(outcome: Turn["outcome"]): boolean {
    return (
        outcome === "ANSWERED" || outcome === "DRAFT" || outcome === undefined
    );
}

/** The person's conversations whose title holds what they typed. */
export function matching(
    conversations: AskAiConversationSummary[],
    query: string,
): AskAiConversationSummary[] {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) =>
        (c.title ?? "").toLowerCase().includes(q),
    );
}
