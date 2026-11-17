import type { AskAiAbout } from "@saroh/api-contract";

/**
 * Asking and stopping, from the browser (plan 2026-11-13-001 U10). Not
 * server actions (`panel-actions.ts`): the answer streams from the app's
 * own route handler, read as it arrives, which an action can't return.
 */

export interface AskAiTurnBody {
    question: string;
    conversationId?: string;
    about?: AskAiAbout;
}

/** The answer's event stream, or null when the route refused it. */
export async function startAskAiTurn(
    body: AskAiTurnBody,
): Promise<ReadableStream<Uint8Array> | null> {
    const res = await fetch("/api/ask-ai/turns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return res.ok && res.body ? res.body : null;
}

/** Stop: best effort, the answer ends with its own `done` either way. */
export function stopAskAiTurn(turnId: string) {
    void fetch(`/api/ask-ai/turns/${encodeURIComponent(turnId)}/stop`, {
        method: "POST",
    }).catch(() => undefined);
}
