import { notFound } from "next/navigation";

import { AskAiPanel } from "@/components/ask-ai/ask-ai-panel";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import {
    getAskAiConversation,
    getAskAiState,
    listAskAiConversations,
} from "@/lib/ask-ai/service";
import { businessZone } from "@/lib/format/business-zone";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Ask AI as a full page (board AI 9): the person's own conversations
 * beside the one open (`?c=`), reached from the panel's Expand or its
 * clock. The rail stays; nothing in it is on. Not there where the panel
 * isn't: the build switch off, or a Reviewer.
 */
export const metadata = { title: "Ask AI" };

export default async function AskPage({
    searchParams,
}: {
    searchParams: Promise<{ c?: string | string[] }>;
}) {
    if (!askAiOn()) notFound();
    await requireSession();
    const organization = await resolveActiveOrganization();
    if (!organization || organization.role === "REVIEWER") notFound();

    const { c } = await searchParams;
    const id = typeof c === "string" && c ? c : null;
    const [state, list, conversation] = await Promise.all([
        getAskAiState().catch(() => null),
        listAskAiConversations().catch(() => null),
        id ? getAskAiConversation(id).catch(() => null) : null,
    ]);

    return (
        <AskAiPanel
            layout="page"
            state={state}
            businessName={organization.name}
            zone={businessZone(organization)}
            phone={false}
            conversation={conversation}
            conversations={list?.data ?? null}
        />
    );
}
