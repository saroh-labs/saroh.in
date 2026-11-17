"use client";

import type {
    AskAiConversation,
    AskAiConversationSummary,
    AskAiState,
} from "@saroh/api-contract";

import { AskAiPanel } from "./ask-ai-panel";
import { useAskAi } from "./use-ask-ai";

/** Ask AI as a full page, `/ask` (board AI 9): its own conversation, no sheet. */
export function AskAiFullPage({
    state,
    businessName,
    zone,
    conversation,
    conversations,
}: {
    state: AskAiState | null;
    businessName: string;
    zone: string;
    conversation: AskAiConversation | null;
    conversations: AskAiConversationSummary[] | null;
}) {
    const ai = useAskAi({ state, page: true, conversation, conversations });
    return (
        <AskAiPanel
            ai={ai}
            layout="page"
            businessName={businessName}
            zone={zone}
            phone={false}
        />
    );
}
