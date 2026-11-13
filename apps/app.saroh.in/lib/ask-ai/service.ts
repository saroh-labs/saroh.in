import type {
    AskAiConversation,
    AskAiConversationList,
    AskAiLanguage,
    AskAiLanguageSetting,
    AskAiSettings,
    AskAiState,
} from "@saroh/api-contract";

import type { CrmResult } from "@/lib/api/http";
import { getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * Ask AI's reads and settings (plan 2026-11-13-001 U9):
 * `organizations/:org/ask-ai`. Server-only. The question and Stop go
 * through the route handlers in `app/api/ask-ai/` (a stream); everything
 * else is an ordinary read or write here.
 */

async function read<T>(path: string): Promise<T | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<T>(`${base}/ask-ai${path}`);
}

/** What the panel shows before a question; null when no business is open. */
export function getAskAiState(): Promise<AskAiState | null> {
    return read<AskAiState>("/state");
}

/** The person's own conversations, newest first, a page at a time. */
export function listAskAiConversations(
    cursor?: string,
): Promise<AskAiConversationList | null> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return read<AskAiConversationList>(`/conversations${query}`);
}

/** One of the person's own conversations; null when it isn't theirs or isn't there. */
export function getAskAiConversation(
    id: string,
): Promise<AskAiConversation | null> {
    return read<AskAiConversation>(`/conversations/${encodeURIComponent(id)}`);
}

export function setAskAiLanguage(
    language: AskAiLanguage,
): Promise<CrmResult<AskAiLanguageSetting>> {
    return mutate(
        "/ask-ai/me/language",
        "PUT",
        { language },
        "We couldn't change the language. Try again.",
    );
}

/** The business's switch (Owner and Admin). */
export function getAskAiSettings(): Promise<AskAiSettings | null> {
    return read<AskAiSettings>("/settings");
}

export function setAskAiOn(on: boolean): Promise<CrmResult<AskAiSettings>> {
    return mutate(
        "/ask-ai/settings",
        "PUT",
        { on },
        on
            ? "We couldn't turn Ask AI on. Try again."
            : "We couldn't turn Ask AI off. Try again.",
    );
}
